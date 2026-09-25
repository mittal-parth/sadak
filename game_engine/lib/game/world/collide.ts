/**
 * Static collision for the street: rotated boxes (plots, landmarks, props)
 * and polygons with holes (real OSM footprints, which are not rectangles and
 * sometimes wrap a courtyard, like the ring of buildings round the Golden
 * Temple's sarovar). Everything is bucketed in a uniform spatial hash so a
 * query touches a handful of shapes, not the city.
 */

import type { Pt } from "./mapData";

export type BoxCollider = { kind: "box"; x: number; z: number; hw: number; hd: number; rot: number };
export type PolyCollider = { kind: "poly"; outer: Pt[]; holes: Pt[][] };
export type Collider = BoxCollider | PolyCollider;

const CELL = 8;

function pointInRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToRing(x: number, z: number, ring: Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const [bx, bz] = ring[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/** True when a circle of radius `r` at (x, z) overlaps the collider. */
export function hits(c: Collider, x: number, z: number, r: number): boolean {
  if (c.kind === "box") {
    // Into the box's frame: local +x is (cos, -sin), local +z is (sin, cos).
    const dx = x - c.x;
    const dz = z - c.z;
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    const u = dx * cs - dz * sn;
    const v = dx * sn + dz * cs;
    return Math.abs(u) < c.hw + r && Math.abs(v) < c.hd + r;
  }
  const inHole = c.holes.some((h) => pointInRing(x, z, h));
  const inside = pointInRing(x, z, c.outer) && !inHole;
  if (inside) return true;
  if (distToRing(x, z, c.outer) < r) return true;
  return c.holes.some((h) => distToRing(x, z, h) < r);
}

function bounds(c: Collider): [number, number, number, number] {
  if (c.kind === "box") {
    const e = Math.hypot(c.hw, c.hd);
    return [c.x - e, c.z - e, c.x + e, c.z + e];
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of c.outer) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return [minX, minZ, maxX, maxZ];
}

export class CollisionWorld {
  private cells = new Map<number, Collider[]>();
  readonly all: Collider[] = [];

  private key(i: number, j: number) {
    return i * 100003 + j;
  }

  add(c: Collider): Collider {
    this.all.push(c);
    const [minX, minZ, maxX, maxZ] = bounds(c);
    for (let i = Math.floor(minX / CELL) - 1; i <= Math.floor(maxX / CELL) + 1; i++) {
      for (let j = Math.floor(minZ / CELL) - 1; j <= Math.floor(maxZ / CELL) + 1; j++) {
        const k = this.key(i, j);
        let cell = this.cells.get(k);
        if (!cell) {
          cell = [];
          this.cells.set(k, cell);
        }
        cell.push(c);
      }
    }
    return c;
  }

  box(x: number, z: number, hw: number, hd: number, rot = 0): Collider {
    return this.add({ kind: "box", x, z, hw, hd, rot });
  }

  /** Does a circle of radius `r` at (x, z) hit anything? `r` must be under a
   *  cell (8m), which covers people, props and vehicles. */
  blocked(x: number, z: number, r: number): boolean {
    const cell = this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!cell) return false;
    for (const c of cell) if (hits(c, x, z, r)) return true;
    return false;
  }
}
