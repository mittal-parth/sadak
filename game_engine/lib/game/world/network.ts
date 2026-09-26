/**
 * The street graph as something to move along: arc-length sampling of each
 * road's polyline and the roads meeting at each node. Traffic and the crowd
 * both walk this.
 */

import type { MapData, MapRoad } from "./mapData";

export type NetRoad = { r: MapRoad; cum: number[]; len: number };

export type Sample = { x: number; z: number; dx: number; dz: number };

export class RoadNet {
  readonly roads: NetRoad[];
  private byNode = new Map<number, number[]>();

  constructor(map: MapData, include: (r: MapRoad) => boolean) {
    this.roads = map.roads.map((r) => {
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      }
      return { r, cum, len: cum[cum.length - 1] };
    });
    this.roads.forEach((road, i) => {
      if (!include(road.r) || road.len < 2) return;
      for (const n of [road.r.a, road.r.b]) {
        if (!this.byNode.has(n)) this.byNode.set(n, []);
        this.byNode.get(n)!.push(i);
      }
    });
  }

  /** Indices of the included roads meeting at `node`. */
  at(node: number): number[] {
    return this.byNode.get(node) ?? [];
  }

  /** Indices of every included road. */
  included(): number[] {
    const out = new Set<number>();
    for (const list of this.byNode.values()) list.forEach((i) => out.add(i));
    return [...out];
  }

  /** Point and unit tangent (toward b) at `s` metres from the `a` end. */
  sample(ri: number, s: number): Sample {
    const road = this.roads[ri];
    const pts = road.r.pts;
    const c = road.cum;
    const t = Math.max(0, Math.min(road.len, s));
    let i = 1;
    while (i < c.length - 1 && c[i] < t) i++;
    const seg = c[i] - c[i - 1] || 1;
    const f = (t - c[i - 1]) / seg;
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, dx: (bx - ax) / seg, dz: (bz - az) / seg };
  }

  /** Sample by distance travelled in direction `dir` (1: a->b, -1: b->a),
   *  with the tangent pointing the way of travel. */
  along(ri: number, dir: 1 | -1, p: number): Sample {
    const len = this.roads[ri].len;
    const s = this.sample(ri, dir === 1 ? p : len - p);
    return { x: s.x, z: s.z, dx: s.dx * dir, dz: s.dz * dir };
  }
}
