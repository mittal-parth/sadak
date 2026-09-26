/**
 * A temple in a tank, inside a ring of buildings: the Golden Temple. OSM maps
 * the ring as one building with a hole and the sarovar as water with the
 * island cut out, so as mapped the parikrama is sealed off from the city and
 * the Harmandir Sahib from the parikrama. This turns them into something you
 * can walk: the ring becomes a precinct (an arcade with gates, built at
 * runtime) and a causeway is cut through the water to the island.
 */

import type { Pt, Precinct } from "../../lib/game/world/mapData";
import { crossings, inRing } from "../../lib/game/world/precinct";

type Hit = ReturnType<typeof crossings>[number];

function ringLength(ring: Pt[], from: number, to: number): number {
  // Arc length walking forward from ring position `from` to `to` (edge + t).
  const n = ring.length;
  const edgeLen = (i: number) => {
    const p = ring[i % n];
    const q = ring[(i + 1) % n];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  };
  let end = to;
  if (end < from) end += n;
  let len = 0;
  let pos = from;
  while (pos < end - 1e-9) {
    const i = Math.floor(pos);
    const next = Math.min(end, i + 1);
    len += (next - pos) * edgeLen(i);
    pos = next;
  }
  return len;
}

/**
 * Cuts a channel `width` wide along a→b from the water's shore into its
 * island (the hole), joining the two: the water becomes one ring with no
 * hole, and the channel is dry land — the causeway. `a` is on the shore
 * outside the water, `b` on the island.
 */
export function keyhole(outer: Pt[], hole: Pt[], a: Pt, b: Pt, width: number): Pt[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / L;
  const nz = (b[0] - a[0]) / L;
  const side = (s: number) => {
    const A: Pt = [a[0] + (nx * s * width) / 2, a[1] + (nz * s * width) / 2];
    const B: Pt = [b[0] + (nx * s * width) / 2, b[1] + (nz * s * width) / 2];
    const shore = crossings(outer, A, B)[0];
    const island = crossings(hole, A, B)[0];
    if (!shore || !island) throw new Error(`causeway side ${s} does not cross from the shore to the island`);
    return { shore, island };
  };
  const pos = (h: Hit) => h.edge + h.t;
  let [f, g] = [side(1), side(-1)];
  if (pos(f.shore) > pos(g.shore)) [f, g] = [g, f];
  // (Shore vertices between the two sides fall inside the channel and go.)
  const out: Pt[] = [];
  for (let i = 0; i <= f.shore.edge; i++) out.push(outer[i]);
  out.push(f.shore.pt, f.island.pt);
  // Round the island the long way, from side f to side g.
  const n = hole.length;
  const pf = pos(f.island);
  const pg = pos(g.island);
  const forward = ringLength(hole, pf, pg) > ringLength(hole, pg, pf);
  if (forward) {
    let i = Math.floor(pf) + 1;
    const stop = pg < pf ? Math.floor(pg) + n : Math.floor(pg);
    for (; i <= stop; i++) out.push(hole[i % n]);
  } else {
    let i = Math.floor(pf);
    const stop = pg > pf ? Math.floor(pg) + 1 - n : Math.floor(pg) + 1;
    for (; i >= stop; i--) out.push(hole[((i % n) + n) % n]);
  }
  out.push(g.island.pt, g.shore.pt);
  for (let i = g.shore.edge + 1; i < outer.length; i++) out.push(outer[i]);
  return out;
}

const GATE_W = 7;
const MAIN_GATE_W = 9;

/**
 * The precinct from the ring building (outer + inner courtyard edge), the
 * paths that cross into it, and the causeway: a gate wherever a path
 * crosses the courtyard edge, and the main gate where the causeway's line
 * meets it (the Darshani Deori).
 */
export function precinctGates(inner: Pt[], paths: Pt[][], causeway: { a: Pt; b: Pt }): Precinct["gates"] {
  type Gate = Precinct["gates"][number];
  const gates: Gate[] = [];
  const at = (h: Hit, w: number, main: boolean): Gate => {
    const p = inner[h.edge];
    const q = inner[(h.edge + 1) % inner.length];
    // Outward: local +z away from the courtyard.
    let ox = q[1] - p[1];
    let oz = -(q[0] - p[0]);
    const L = Math.hypot(ox, oz) || 1;
    ox /= L;
    oz /= L;
    if (inRing(h.pt[0] + ox, h.pt[1] + oz, inner)) {
      ox = -ox;
      oz = -oz;
    }
    return { x: +h.pt[0].toFixed(1), z: +h.pt[1].toFixed(1), rot: +Math.atan2(ox, oz).toFixed(3), w, ...(main ? { main: true as const } : {}) };
  };
  // The causeway's line, back from the shore to the ring.
  const { a, b } = causeway;
  const L = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const far: Pt = [a[0] + ((a[0] - b[0]) / L) * 200, a[1] + ((a[1] - b[1]) / L) * 200];
  const main = crossings(inner, a, far)[0];
  if (!main) throw new Error("the causeway's line never meets the precinct's ring");
  gates.push(at(main, MAIN_GATE_W, true));
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      for (const h of crossings(inner, path[i], path[i + 1])) {
        if (gates.some((g) => Math.hypot(g.x - h.pt[0], g.z - h.pt[1]) < 14)) continue;
        gates.push(at(h, GATE_W, false));
      }
    }
  }
  return gates;
}
