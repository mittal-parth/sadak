/**
 * Walkable ground height. The street used to be one flat plane; now there
 * are raised footpaths, temple plinths, mosque courtyards and flights of
 * steps, and the player (and the crowd) should climb them rather than wade
 * through. A 0.5m grid of heights, written by whatever builds a raised
 * surface and read with bilinear filtering.
 */

import type { Pt } from "./mapData";

const RES = 0.5;

export class HeightField {
  private n: number;
  private h: Float32Array;

  constructor(private half: number) {
    this.n = Math.ceil((half * 2) / RES) + 1;
    this.h = new Float32Array(this.n * this.n);
  }

  private idx(i: number, j: number) {
    return j * this.n + i;
  }

  /** Height at (x, z), bilinear. Off the map is ground level. */
  at(x: number, z: number): number {
    const fx = (x + this.half) / RES;
    const fz = (z + this.half) / RES;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.n - 1 || j >= this.n - 1) return 0;
    const tx = fx - i;
    const tz = fz - j;
    const a = this.h[this.idx(i, j)];
    const b = this.h[this.idx(i + 1, j)];
    const c = this.h[this.idx(i, j + 1)];
    const d = this.h[this.idx(i + 1, j + 1)];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /**
   * Raise an oriented rectangle. Height runs linearly from `y0` at its local
   * -z edge to `y1` at +z (equal for a flat platform, different for a
   * flight of steps). Never lowers what is already there.
   */
  rect(x: number, z: number, hw: number, hd: number, rot: number, y0: number, y1 = y0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const r = Math.hypot(hw, hd);
    for (let gz = z - r; gz <= z + r; gz += RES) {
      for (let gx = x - r; gx <= x + r; gx += RES) {
        const dx = gx - x;
        const dz = gz - z;
        const u = dx * c - dz * s;
        const v = dx * s + dz * c;
        if (Math.abs(u) > hw || Math.abs(v) > hd) continue;
        const y = y0 + ((v + hd) / (2 * hd)) * (y1 - y0);
        this.raise(gx, gz, y);
      }
    }
  }

  /** Raise a band `width` wide along a polyline (footpaths). */
  band(pts: Pt[], o0: number, o1: number, y: number) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-3) continue;
      const dx = (bx - ax) / L;
      const dz = (bz - az) / L;
      const nx = dz;
      const nz = -dx;
      for (let t = 0; t <= L; t += RES) {
        for (let o = Math.min(o0, o1); o <= Math.max(o0, o1); o += RES) {
          this.raise(ax + dx * t + nx * o, az + dz * t + nz * o, y);
        }
      }
    }
  }

  private raise(x: number, z: number, y: number) {
    const i = Math.round((x + this.half) / RES);
    const j = Math.round((z + this.half) / RES);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return;
    const k = this.idx(i, j);
    if (this.h[k] < y) this.h[k] = y;
  }
}
