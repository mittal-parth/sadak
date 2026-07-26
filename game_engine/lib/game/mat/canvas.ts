import * as THREE from "three";
import { clamp01 } from "./noise";

/** A height/roughness/AO scalar field, row-major, values nominally in [0,1]. */
export type Field = Float32Array;

export function makeField(size: number): Field {
  return new Float32Array(size * size);
}

export function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  return { canvas, ctx };
}

/**
 * Sobel-filter a heightfield into a tangent-space normal map canvas.
 * This is the single highest-impact op in the library: it's what turns a
 * flat colour swatch into something that catches raking light.
 */
export function heightToNormalCanvas(height: Field, size: number, strength = 2.2): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    return height[yi * size + xi];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      let nx = -gx * strength;
      let ny = -gy * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const idx = (y * size + x) * 4;
      img.data[idx] = (nx * 0.5 + 0.5) * 255;
      img.data[idx + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[idx + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function grayscaleCanvas(values: Field, size: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(clamp01(values[i]) * 255);
    const idx = i * 4;
    img.data[idx] = v;
    img.data[idx + 1] = v;
    img.data[idx + 2] = v;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** RGB triple fields -> an 8-bit colour canvas. */
export function rgbCanvas(r: Field, g: Field, b: Field, size: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4;
    img.data[idx] = Math.round(clamp01(r[i]) * 255);
    img.data[idx + 1] = Math.round(clamp01(g[i]) * 255);
    img.data[idx + 2] = Math.round(clamp01(b[i]) * 255);
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Wrap-around separable box blur, used to derive cheap ambient occlusion from a heightfield. */
export function boxBlur(values: Field, size: number, radius: number): Field {
  if (radius <= 0) return values.slice();
  const tmp = makeField(size);
  const out = makeField(size);
  const norm = 1 / (radius * 2 + 1);
  for (let y = 0; y < size; y++) {
    let sum = 0;
    const row = y * size;
    for (let k = -radius; k <= radius; k++) sum += values[row + (((k % size) + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = sum * norm;
      const addX = (x + radius + 1) % size;
      const subX = ((x - radius) % size + size) % size;
      sum += values[row + addX] - values[row + subX];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[((((k % size) + size) % size)) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum * norm;
      const addY = (y + radius + 1) % size;
      const subY = ((y - radius) % size + size) % size;
      sum += tmp[addY * size + x] - tmp[subY * size + x];
    }
  }
  return out;
}

/** Cavities (below the local blurred average) read as darker AO; bumps stay bright. */
export function aoFromHeight(height: Field, size: number, radius = 4, strength = 1.0): Field {
  const blurred = boxBlur(height, size, radius);
  const out = makeField(size);
  for (let i = 0; i < out.length; i++) {
    const delta = height[i] - blurred[i];
    out[i] = clamp01(1 + Math.min(0, delta) * strength * 2.2);
  }
  return out;
}

export interface TextureOpts {
  srgb?: boolean;
  repeat?: [number, number];
  anisotropy?: number;
}

export function textureFromCanvas(canvas: HTMLCanvasElement, opts: TextureOpts = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.anisotropy) tex.anisotropy = opts.anisotropy;
  // Colour maps are authored in sRGB; normal/roughness/AO maps must stay
  // linear data or lighting goes flat and washed out.
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Vertical grime/weathering gradient multiplier: darker low, cleaner high, with a bit of noise-driven runoff streaking. */
export function applyVerticalGrime(
  r: Field,
  g: Field,
  b: Field,
  size: number,
  streak: (u: number, v: number) => number,
  darkness = 0.4
) {
  for (let y = 0; y < size; y++) {
    const v = y / size; // 0 top .. 1 bottom
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const streakAmt = streak(u, v);
      // more grime toward the bottom, modulated by vertical streak noise
      const grime = clamp01(v * 0.8 + streakAmt * 0.5 - 0.15) * darkness;
      r[i] *= 1 - grime;
      g[i] *= 1 - grime;
      b[i] *= 1 - grime;
    }
  }
}
