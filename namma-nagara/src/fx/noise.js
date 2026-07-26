/**
 * CPU noise toolkit used to bake the FX texture atlases at load time.
 *
 * Everything here is seeded from `ctx.rng` so a capture is byte-identical run
 * to run. Nothing in this file runs per frame.
 */

const F = (t) => t * t * t * (t * (t * 6 - 15) + 10); // quintic fade

/** 16 evenly spread unit gradients — cheap and directionally unbiased enough. */
const GRAD = new Float32Array(32);
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2;
  GRAD[i * 2] = Math.cos(a);
  GRAD[i * 2 + 1] = Math.sin(a);
}

export class Noise {
  constructor(rng) {
    const t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) t[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const s = t[i];
      t[i] = t[j];
      t[j] = s;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = t[i & 255];

    // Jittered feature points for the Worley lattice (used for lumpy smoke and
    // for cracked-glass / chipped-concrete masks).
    this.cell = new Float32Array(256 * 2);
    for (let i = 0; i < 256; i++) {
      this.cell[i * 2] = rng.float();
      this.cell[i * 2 + 1] = rng.float();
    }
  }

  _hash(ix, iy) {
    return this.p[(this.p[ix & 255] + (iy & 255)) & 255];
  }

  /** Perlin gradient noise, roughly -1..1. */
  perlin(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = F(fx);
    const v = F(fy);
    const g = GRAD;
    const h00 = this._hash(ix, iy) & 15;
    const h10 = this._hash(ix + 1, iy) & 15;
    const h01 = this._hash(ix, iy + 1) & 15;
    const h11 = this._hash(ix + 1, iy + 1) & 15;
    const d00 = g[h00 * 2] * fx + g[h00 * 2 + 1] * fy;
    const d10 = g[h10 * 2] * (fx - 1) + g[h10 * 2 + 1] * fy;
    const d01 = g[h01 * 2] * fx + g[h01 * 2 + 1] * (fy - 1);
    const d11 = g[h11 * 2] * (fx - 1) + g[h11 * 2 + 1] * (fy - 1);
    const a = d00 + u * (d10 - d00);
    const b = d01 + u * (d11 - d01);
    return (a + v * (b - a)) * 1.42;
  }

  /** fBm in 0..1. */
  fbm(x, y, oct = 5, lac = 2.03, gain = 0.5) {
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += this.perlin(x * f, y * f) * amp;
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return sum / norm / 2 + 0.5;
  }

  /** Ridged multifractal in 0..1 — veins, cracks, filaments. */
  ridged(x, y, oct = 4, lac = 2.11, gain = 0.5) {
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(this.perlin(x * f, y * f));
      sum += n * n * amp;
      norm += amp;
      amp *= gain;
      f *= lac;
    }
    return sum / norm;
  }

  /** Domain-warped fBm — the single cheapest way to stop noise looking like noise. */
  warped(x, y, warp = 0.6, oct = 5) {
    const wx = this.perlin(x * 0.7 + 13.1, y * 0.7 - 4.2) * warp;
    const wy = this.perlin(x * 0.7 - 8.6, y * 0.7 + 21.5) * warp;
    return this.fbm(x + wx, y + wy, oct);
  }

  /** F1 Worley distance, 0..~1. */
  worley(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let best = 8;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const h = this._hash(ix + ox, iy + oy);
        const cx = ix + ox + this.cell[h * 2];
        const cy = iy + oy + this.cell[h * 2 + 1];
        const dx = cx - x;
        const dy = cy - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best));
  }

  /** F2-F1 Worley — cell walls, i.e. crack networks. */
  worleyEdge(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let b1 = 8;
    let b2 = 8;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const h = this._hash(ix + ox, iy + oy);
        const cx = ix + ox + this.cell[h * 2];
        const cy = iy + oy + this.cell[h * 2 + 1];
        const dx = cx - x;
        const dy = cy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < b1) {
          b2 = b1;
          b1 = d;
        } else if (d < b2) b2 = d;
      }
    }
    return Math.min(1, b2 - b1);
  }
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

/** sRGB encode for atlases sampled as sRGB textures. */
export function encodeSrgb(v) {
  v = clamp01(v);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
