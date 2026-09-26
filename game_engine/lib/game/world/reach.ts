/**
 * Can you walk from here to there? A flood fill on a half-metre grid over
 * the collision world, for a body of the player's width: used to prove every
 * monument can be walked into from the street.
 */

import type { CollisionWorld } from "./collide";
import type { MapLandmark } from "./mapData";

/** Distance (in the landmark's own frame) outside its footprint. */
export function outside(l: MapLandmark, x: number, z: number, margin: number): boolean {
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  const u = (x - l.x) * c - (z - l.z) * s;
  const v = (x - l.x) * s + (z - l.z) * c;
  return Math.abs(u) > l.w / 2 + margin || Math.abs(v) > l.d / 2 + margin;
}

/**
 * True if a body of radius `r` (the player's, by default) can walk from (x, z) to somewhere `done`
 * accepts without leaving `half` metres of (x, z). Steps half a metre.
 */
export function canWalk(
  collide: CollisionWorld,
  x: number,
  z: number,
  done: (x: number, z: number) => boolean,
  half: number,
  r = 0.55
): boolean {
  const step = 0.5;
  const n = Math.ceil(half / step);
  const seen = new Uint8Array((2 * n + 1) ** 2);
  const key = (i: number, j: number) => (j + n) * (2 * n + 1) + (i + n);
  if (collide.blocked(x, z, r)) return false;
  const queue: [number, number][] = [[0, 0]];
  seen[key(0, 0)] = 1;
  while (queue.length) {
    const [i, j] = queue.shift()!;
    const px = x + i * step;
    const pz = z + j * step;
    if (done(px, pz)) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (Math.abs(a) > n || Math.abs(b) > n || seen[key(a, b)]) continue;
      seen[key(a, b)] = 1;
      if (collide.blocked(x + a * step, z + b * step, r)) continue;
      queue.push([a, b]);
    }
  }
  return false;
}

/**
 * Can the player walk from outside a monument to within `near` metres of
 * the spot inside where its host stands? (The host may stand where a body
 * of the player's width would not fit; the player only needs to get close
 * enough to talk.)
 */
export function reachesInside(
  collide: CollisionWorld,
  l: MapLandmark,
  inner: { x: number; z: number },
  near = 2,
  search = 300
): boolean {
  const done = (x: number, z: number) => outside(l, x, z, 6);
  for (let r = 0; r <= near; r += 0.5) {
    const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 0.5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = inner.x + Math.cos(a) * r;
      const z = inner.z + Math.sin(a) * r;
      if (!collide.blocked(x, z, 0.55)) return canWalk(collide, x, z, done, Math.max(l.w, l.d) / 2 + search);
    }
  }
  return false;
}
