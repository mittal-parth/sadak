/**
 * Small, dependency-free noise kit for procedural texture generation.
 * Everything here is deterministic (seeded) and built to TILE SEAMLESSLY,
 * because every surface in the city repeats a small texture across a big
 * mesh (roads, walls, kerbs...). Tiling is achieved by sizing each noise
 * lattice to exactly the sampling frequency used across the canvas, so the
 * value at u=1 always lands back on the value at u=0.
 */

/** Deterministic PRNG (mulberry32) — same algorithm used elsewhere in the game. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Noise2D = (x: number, y: number) => number;

/**
 * Classic smooth value noise on an integer lattice of size `latticeSize`,
 * seeded. Sampling coordinates wrap modulo `latticeSize`, so a caller who
 * always samples `x` over the exact range [0, latticeSize) gets a
 * perfectly tileable field.
 */
export function makeValueNoise2D(seed: number, latticeSize: number): Noise2D {
  const n = Math.max(2, Math.round(latticeSize));
  const rand = mulberry32(seed);
  const perm = new Float32Array(n * n);
  for (let i = 0; i < perm.length; i++) perm[i] = rand();
  const at = (xi: number, yi: number) => {
    const x = ((xi % n) + n) % n;
    const y = ((yi % n) + n) % n;
    return perm[y * n + x];
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const v00 = at(xi, yi);
    const v10 = at(xi + 1, yi);
    const v01 = at(xi, yi + 1);
    const v11 = at(xi + 1, yi + 1);
    const u = fade(xf);
    const v = fade(yf);
    const a = v00 + (v10 - v00) * u;
    const b = v01 + (v11 - v01) * u;
    return a + (b - a) * v;
  };
}

/**
 * Tileable fractal Brownian motion. Each octave gets its own lattice sized
 * exactly to that octave's frequency (so every octave tiles independently)
 * and its own seed offset (so octaves don't just look like the same noise
 * resampled — a common bug that produces flat, repetitive fBm).
 *
 * Call the returned function with u, v in [0, 1).
 */
export function makeTileableFbm(
  seed: number,
  baseFreq: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5
): Noise2D {
  const gens: Noise2D[] = [];
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    gens.push(makeValueNoise2D(seed + o * 977 + 1, freq));
    freq *= lacunarity;
  }
  return (u: number, v: number) => {
    let amp = 0.5;
    let sum = 0;
    let norm = 0;
    let f = baseFreq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * gens[o](u * f, v * f);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  };
}

export interface WorleyResult {
  /** Distance to nearest feature point. */
  f1: number;
  /** Distance to second-nearest feature point (useful for crack patterns: f2 - f1 ~ 0 at cell borders). */
  f2: number;
  /** Pseudo-random id of the nearest cell, stable per cell (useful for per-brick colour variation). */
  id: number;
}

/**
 * Tileable Worley / cellular noise. `cells` is both the grid resolution and
 * the wrap period, so call with u, v already scaled into [0, cells).
 */
export function makeWorley2D(seed: number, cells: number) {
  const n = Math.max(1, Math.round(cells));
  const rand = mulberry32(seed);
  const px = new Float32Array(n * n);
  const py = new Float32Array(n * n);
  const pid = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    px[i] = rand();
    py[i] = rand();
    pid[i] = rand();
  }
  return (u: number, v: number): WorleyResult => {
    const cx = Math.floor(u);
    const cy = Math.floor(v);
    const fx = u - cx;
    const fy = v - cy;
    let best = 8;
    let best2 = 8;
    let bestId = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = (((cx + ox) % n) + n) % n;
        const gy = (((cy + oy) % n) + n) % n;
        const idx = gy * n + gx;
        const dx = ox + px[idx] - fx;
        const dy = oy + py[idx] - fy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) {
          best2 = best;
          best = d;
          bestId = pid[idx];
        } else if (d < best2) {
          best2 = d;
        }
      }
    }
    return { f1: best, f2: best2, id: bestId };
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
