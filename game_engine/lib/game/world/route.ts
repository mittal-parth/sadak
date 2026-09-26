/**
 * Driving routes on the street graph, for rides: the auto that takes the
 * player to their next errand, the bus between stops. A* over the roads a
 * vehicle of the given width can use; the result is a polyline along the
 * real streets, already offset to the left-hand lane.
 */

import type { MapData, Pt } from "./mapData";
import { RoadNet } from "./network";
import { isDrivable } from "./roads";

type Hit = { road: number; s: number; x: number; z: number; d: number };

function nearestOn(net: RoadNet, roads: number[], x: number, z: number): Hit | null {
  let best: Hit | null = null;
  for (const ri of roads) {
    const road = net.roads[ri];
    const pts = road.r.pts;
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (L * L)));
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { road: ri, s: acc + L * t, x: px, z: pz, d };
      acc += L;
    }
  }
  return best;
}

/** Share of the roads a vehicle of `minWidth` can use that it can reach
 *  from the kerb at (x, z), one-way streets obeyed. A stand on a one-way
 *  stretch that runs off the map reaches almost nothing. */
export function reachShare(map: MapData, x: number, z: number, minWidth: number): number {
  const net = new RoadNet(map, (r) => isDrivable(r) && r.w >= minWidth);
  const roads = net.included();
  const from = nearestOn(net, roads, x, z);
  if (!from || !roads.length) return 0;
  return reachable(net, from.road).length / roads.length;
}

/** Roads a vehicle on road `start` can get onto, one-way streets obeyed. */
function reachable(net: RoadNet, start: number): number[] {
  const r0 = net.roads[start].r;
  const seen = new Set<number>([r0.b, ...(r0.oneway ? [] : [r0.a])]);
  const queue = [...seen];
  const out = new Set<number>([start]);
  while (queue.length) {
    const id = queue.pop()!;
    for (const ri of net.at(id)) {
      const r = net.roads[ri].r;
      if (r.oneway && r.a !== id) continue;
      out.add(ri);
      const other = r.a === id ? r.b : r.a;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return [...out];
}

/** Points of road `ri` between arc lengths s0 and s1, in travel order. */
function stretch(net: RoadNet, ri: number, s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  const step = 3;
  const dir = s1 >= s0 ? 1 : -1;
  for (let s = s0; dir * (s1 - s) > 0; s += dir * step) {
    const p = net.sample(ri, s);
    out.push([p.x, p.z]);
  }
  const e = net.sample(ri, s1);
  out.push([e.x, e.z]);
  return out;
}

/**
 * A route from (fx, fz) to (tx, tz) for a vehicle needing `minWidth` of
 * carriageway, offset `lane` metres to the left of travel. Null if the two
 * are not connected for that vehicle.
 */
export function planRoute(
  map: MapData,
  fx: number,
  fz: number,
  tx: number,
  tz: number,
  minWidth: number,
  lane: number,
  opts: { closest?: boolean } = {}
): Pt[] | null {
  const net = new RoadNet(map, (r) => isDrivable(r) && r.w >= minWidth);
  const roads = net.included();
  const from = nearestOn(net, roads, fx, fz);
  if (!from) return null;
  // With `closest`, drive as close as the streets allow: the destination
  // snaps to the nearest road reachable from the start (a gully that only
  // opens onto a pedestrian street is walked from the corner). Otherwise
  // the nearest road to the destination, and null if it can't be reached.
  const to = nearestOn(net, opts.closest ? reachable(net, from.road) : roads, tx, tz);
  if (!to) return null;

  let centre: Pt[];
  if (from.road === to.road) {
    centre = stretch(net, from.road, from.s, to.s);
  } else {
    // A* over nodes. Start from both ends of the start road, finish at
    // either end of the destination road.
    const nodePos = new Map(map.nodes.map((n) => [n.id, n]));
    const h = (id: number) => {
      const n = nodePos.get(id)!;
      return Math.hypot(n.x - to.x, n.z - to.z);
    };
    const start = net.roads[from.road];
    const goal = net.roads[to.road];
    const g = new Map<number, number>();
    const came = new Map<number, { prev: number; road: number }>();
    const open: { id: number; f: number }[] = [];
    const push = (id: number, cost: number, prev: number, road: number) => {
      if (cost >= (g.get(id) ?? Infinity)) return;
      g.set(id, cost);
      came.set(id, { prev, road });
      open.push({ id, f: cost + h(id) });
    };
    push(start.r.a, from.s, -1, from.road);
    push(start.r.b, start.len - from.s, -1, from.road);
    const goalCost = (id: number) => (id === goal.r.a ? to.s : id === goal.r.b ? goal.len - to.s : Infinity);
    let bestEnd = -1;
    let bestTotal = Infinity;
    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const { id, f } = open.shift()!;
      if (f >= bestTotal) break;
      const cost = g.get(id)!;
      const total = cost + goalCost(id);
      if (total < bestTotal) {
        bestTotal = total;
        bestEnd = id;
      }
      for (const ri of net.at(id)) {
        const r = net.roads[ri].r;
        const other = r.a === id ? r.b : r.a;
        // One-way streets only a -> b.
        if (r.oneway && r.a !== id) continue;
        push(other, cost + net.roads[ri].len, id, ri);
      }
    }
    if (bestEnd < 0) return null;

    // Walk back from the goal node to the start road.
    const chain: { road: number; from: number; to: number }[] = [];
    let id = bestEnd;
    while (true) {
      const c = came.get(id)!;
      if (c.prev < 0) break;
      chain.unshift({ road: c.road, from: c.prev, to: id });
      id = c.prev;
    }
    const firstNode = id;
    centre = stretch(net, from.road, from.s, firstNode === start.r.a ? 0 : start.len);
    for (const step of chain) {
      const r = net.roads[step.road];
      const pts = step.from === r.r.a ? stretch(net, step.road, 0, r.len) : stretch(net, step.road, r.len, 0);
      centre.push(...pts.slice(1));
    }
    const last = bestEnd === goal.r.a ? 0 : goal.len;
    centre.push(...stretch(net, to.road, last, to.s).slice(1));
  }

  // Offset into the left-hand lane.
  const out: Pt[] = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(centre.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Left of travel in a +x east, +z south frame.
    const nx = (b[1] - a[1]) / L;
    const nz = -(b[0] - a[0]) / L;
    out.push([centre[i][0] + nx * lane, centre[i][1] + nz * lane]);
  }
  return out.length >= 2 ? out : null;
}
