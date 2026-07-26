/**
 * Per-surface procedural texture recipes. Each function builds a
 * heightfield (fBm / Worley / deterministic pattern as appropriate),
 * derives a Sobel normal map from it, paints a colour field, and derives
 * roughness (and sometimes AO) from the same underlying structure so the
 * bump you see, the roughness you feel, and the colour you read all agree
 * with each other.
 */
import { makeTileableFbm, makeWorley2D, mulberry32, clamp01, lerp } from "./noise";
import { Field, makeField, heightToNormalCanvas, rgbCanvas, aoFromHeight } from "./canvas";

export const SIZE = 256;

export interface SurfaceBuild {
  colorCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  roughness: Field;
  ao?: Field;
  repeat: [number, number];
  metalness: number;
  normalStrength?: number;
}

function hash1(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function fieldsFromSize(size = SIZE) {
  return { h: makeField(size), r: makeField(size), g: makeField(size), b: makeField(size), rough: makeField(size) };
}

/* ------------------------------------------------------------------ *
 * 1. Weathered plaster — chalky stucco, monsoon-stained, hairline cracks.
 * Colour map is kept near-neutral so tintMaterial() can recolour it per
 * district without regenerating the texture.
 * ------------------------------------------------------------------ */
export function buildWeatheredPlaster(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const stucco = makeTileableFbm(seed, 5, 5, 2, 0.55);
  const grain = makeTileableFbm(seed + 1, 32, 3, 2, 0.5);
  const crackField = makeWorley2D(seed + 2, 6);
  const streak = makeTileableFbm(seed + 3, 4, 3, 2.2, 0.5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      let height = stucco(u, v) * 0.7 + grain(u, v) * 0.3;

      // Hairline cracks: thin dark grooves where Worley cells nearly tie.
      const w = crackField(u * 6, v * 6);
      const crack = clamp01(1 - (w.f2 - w.f1) * 14);
      height -= crack * 0.35;

      h[i] = clamp01(height);

      const streakAmt = streak(u, v * 0.4);
      const grime = clamp01(v * 0.85 + streakAmt * 0.4 - 0.2) * 0.5;
      const base = 0.82 + (stucco(u, v) - 0.5) * 0.18 - crack * 0.3;
      const lum = clamp01(base * (1 - grime));
      r[i] = lum;
      g[i] = lum * 0.985;
      b[i] = lum * 0.95;

      rough[i] = clamp01(0.82 + (grain(u, v) - 0.5) * 0.25 + crack * 0.1);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 2.6);
  const ao = aoFromHeight(h, size, 5, 1.1);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [3, 3], metalness: 0.0, normalStrength: 1.0 };
}

/* ------------------------------------------------------------------ *
 * 2. Painted plaster — smoother, semi-gloss, less grime, faint dirt speckle.
 * ------------------------------------------------------------------ */
export function buildPaintedPlaster(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const bump = makeTileableFbm(seed, 6, 4, 2, 0.5);
  const dirt = makeTileableFbm(seed + 1, 5, 3, 2, 0.5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      h[i] = clamp01(0.55 + (bump(u, v) - 0.5) * 0.12);

      const grime = clamp01(v * 0.35 + dirt(u, v) * 0.25 - 0.2) * 0.28;
      const lum = clamp01((0.92 + (bump(u, v) - 0.5) * 0.06) * (1 - grime));
      r[i] = lum;
      g[i] = lum;
      b[i] = lum * 0.98;

      rough[i] = clamp01(0.45 + (dirt(u, v) - 0.5) * 0.3 + grime * 0.3);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 1.4);
  const ao = aoFromHeight(h, size, 4, 0.6);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [3, 3], metalness: 0.0, normalStrength: 0.7 };
}

/* ------------------------------------------------------------------ *
 * 3. Concrete — poured, blotchy, aggregate speckle, faint formwork seams.
 * ------------------------------------------------------------------ */
export function buildConcrete(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const blotch = makeTileableFbm(seed, 4, 5, 2, 0.55);
  const speck = makeTileableFbm(seed + 1, 48, 2, 2, 0.5);
  const panelSize = size / 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;

      const px = x % panelSize;
      const py = y % panelSize;
      const seam = px < 2 || px > panelSize - 3 || py < 2 || py > panelSize - 3 ? 0.12 : 0;

      let height = blotch(u, v) * 0.6 + speck(u, v) * 0.4 - seam;
      h[i] = clamp01(height);

      const g0 = 0.62 + (blotch(u, v) - 0.5) * 0.22 + (speck(u, v) - 0.5) * 0.08 - seam * 0.5;
      const lum = clamp01(g0);
      r[i] = lum * 1.0;
      g[i] = lum * 0.99;
      b[i] = lum * 0.95;

      rough[i] = clamp01(0.78 + (speck(u, v) - 0.5) * 0.2);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 2.2);
  const ao = aoFromHeight(h, size, 6, 1.0);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [2, 2], metalness: 0.0, normalStrength: 1.0 };
}

/* ------------------------------------------------------------------ *
 * 4. Brick — running-bond coursing, mortar grooves, per-brick hue jitter.
 * ------------------------------------------------------------------ */
export function buildBrick(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const rows = 8;
  const brickH = size / rows;
  const mortar = Math.max(2, Math.round(brickH * 0.14));
  const brickW = size / 4;
  const face = makeTileableFbm(seed, 24, 3, 2, 0.5);

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / brickH);
    const yInRow = y - row * brickH;
    const offset = (row % 2) * (brickW / 2);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xAdj = (((x + offset) % size) + size) % size;
      const xInBrick = xAdj % brickW;
      const brickCol = Math.floor(xAdj / brickW);
      const brickId = Math.floor(hash1(brickCol * 131.7 + row * 71.3) * 1000);

      const inMortarX = xInBrick < mortar || xInBrick > brickW - mortar;
      const inMortarY = yInRow < mortar || yInRow > brickH - mortar;
      const isMortar = inMortarX || inMortarY;

      const u = x / size;
      const v = y / size;
      const wear = face(u, v);

      if (isMortar) {
        h[i] = 0.15 + wear * 0.08;
        const lum = 0.62 + (wear - 0.5) * 0.15;
        r[i] = lum;
        g[i] = lum;
        b[i] = lum * 0.97;
        rough[i] = 0.92;
      } else {
        const jitter = hash1(brickId) - 0.5;
        h[i] = 0.55 + wear * 0.25 + jitter * 0.05;
        const baseR = 0.62 + jitter * 0.18 + (wear - 0.5) * 0.1;
        const baseG = 0.32 + jitter * 0.1 + (wear - 0.5) * 0.06;
        const baseB = 0.26 + jitter * 0.08;
        r[i] = clamp01(baseR);
        g[i] = clamp01(baseG);
        b[i] = clamp01(baseB);
        rough[i] = clamp01(0.68 + (wear - 0.5) * 0.25);
      }
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 3.2);
  const ao = aoFromHeight(h, size, 3, 1.3);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [2, 1], metalness: 0.0, normalStrength: 1.0 };
}

/* ------------------------------------------------------------------ *
 * 5. Asphalt — dark aggregate speckle, centre-lane oil sheen, cracks.
 * ------------------------------------------------------------------ */
export function buildAsphalt(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const speck = makeWorley2D(seed, 40);
  const patch = makeTileableFbm(seed + 1, 5, 4, 2, 0.5);
  const crackField = makeWorley2D(seed + 2, 5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const sp = speck(u * 40, v * 40);
      const stone = sp.f1 < 0.22 ? clamp01(1 - sp.f1 / 0.22) : 0;

      const w = crackField(u * 5, v * 5);
      const crack = clamp01(1 - (w.f2 - w.f1) * 16);

      let height = 0.35 + patch(u, v) * 0.15 + stone * 0.35 - crack * 0.3;
      h[i] = clamp01(height);

      // Oil sheen: a soft dark band down the middle of the tile (wheel track).
      const laneDist = Math.abs(u - 0.5);
      const oil = clamp01(1 - laneDist * 4) * 0.5;

      const lum = clamp01(0.16 + patch(u, v) * 0.05 + stone * 0.22 - oil * 0.06 + crack * 0.08);
      r[i] = lum * 1.02;
      g[i] = lum * 1.0;
      b[i] = lum * 0.98;

      rough[i] = clamp01(0.78 - oil * 0.35 + stone * 0.1 - crack * 0.1);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 1.8);
  const ao = aoFromHeight(h, size, 4, 0.8);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [6, 20], metalness: 0.0, normalStrength: 0.8 };
}

/* ------------------------------------------------------------------ *
 * 6. Kerb stone — chipped concrete block with the classic black/yellow
 *    hazard paint band Indian kerbstones carry.
 * ------------------------------------------------------------------ */
export function buildKerbStone(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const chip = makeWorley2D(seed, 10);
  const blotch = makeTileableFbm(seed + 1, 6, 3, 2, 0.5);
  const bandCount = 4;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const ch = chip(u * 10, v * 10);
      const edgeChip = clamp01(1 - ch.f1 * 3.2) * (ch.id > 0.6 ? 1 : 0);

      const band = Math.floor(u * bandCount) % 2 === 0;
      const height = 0.55 + blotch(u, v) * 0.2 - edgeChip * 0.4;
      h[i] = clamp01(height);

      if (band) {
        // Weathered black paint.
        const lum = clamp01(0.08 + blotch(u, v) * 0.05 - edgeChip * 0.03);
        r[i] = lum;
        g[i] = lum;
        b[i] = lum * 1.05;
        rough[i] = clamp01(0.55 + blotch(u, v) * 0.2);
      } else {
        // Sun-bleached hazard yellow, chipped to reveal grey concrete.
        const yellow = clamp01(0.78 + blotch(u, v) * 0.1);
        r[i] = lerp(0.55, yellow, 1 - edgeChip);
        g[i] = lerp(0.55, yellow * 0.82, 1 - edgeChip);
        b[i] = lerp(0.53, yellow * 0.25, 1 - edgeChip);
        rough[i] = clamp01(0.6 + edgeChip * 0.3);
      }
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 2.4);
  const ao = aoFromHeight(h, size, 4, 1.1);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [4, 1], metalness: 0.0, normalStrength: 1.0 };
}

/* ------------------------------------------------------------------ *
 * 7. Corrugated metal — sinusoidal ridges, galvanized sheen, rust freckles.
 * ------------------------------------------------------------------ */
export function buildCorrugatedMetal(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const ridges = 10;
  const wear = makeTileableFbm(seed, 6, 3, 2, 0.5);
  const rustField = makeTileableFbm(seed + 1, 4, 4, 2.1, 0.55);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const ridge = Math.sin(u * Math.PI * 2 * ridges);
      let height = 0.5 + ridge * 0.42 + (wear(u, v) - 0.5) * 0.05;

      const rust = clamp01((rustField(u, v) - 0.42) * 2.6);
      height -= rust * 0.15;
      h[i] = clamp01(height);

      const metalLum = clamp01(0.62 + ridge * 0.18 + (wear(u, v) - 0.5) * 0.1);
      const rustR = 0.42 + rustField(u, v) * 0.15;
      const rustG = 0.22 + rustField(u, v) * 0.08;
      const rustB = 0.12;

      r[i] = lerp(metalLum, rustR, rust);
      g[i] = lerp(metalLum, rustG, rust);
      b[i] = lerp(metalLum * 1.02, rustB, rust);

      rough[i] = clamp01(0.35 + Math.abs(ridge) * 0.1 + rust * 0.5);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 3.5);
  return { colorCanvas, normalCanvas, roughness: rough, repeat: [4, 3], metalness: 0.75, normalStrength: 1.2 };
}

/* ------------------------------------------------------------------ *
 * 8. Rusted metal — flat sheet steel dominated by rust bloom + pitting.
 * ------------------------------------------------------------------ */
export function buildRustedMetal(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const rustBloom = makeTileableFbm(seed, 4, 5, 2, 0.55);
  const pit = makeWorley2D(seed + 1, 20);
  const fineGrain = makeTileableFbm(seed + 2, 40, 2, 2, 0.5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const p = pit(u * 20, v * 20);
      const pitDepth = clamp01(1 - p.f1 * 2.6) * (p.id > 0.7 ? 1 : 0);

      const rust = clamp01(rustBloom(u, v) * 1.15);
      let height = 0.5 + (fineGrain(u, v) - 0.5) * 0.15 - pitDepth * 0.4 - rust * 0.1;
      h[i] = clamp01(height);

      const steel = 0.55 + (fineGrain(u, v) - 0.5) * 0.15;
      const rustR = 0.5 + rustBloom(u, v) * 0.2;
      const rustG = 0.24 + rustBloom(u, v) * 0.1;
      const rustB = 0.1 + rustBloom(u, v) * 0.04;

      r[i] = clamp01(lerp(steel, rustR, rust) - pitDepth * 0.15);
      g[i] = clamp01(lerp(steel, rustG, rust) - pitDepth * 0.15);
      b[i] = clamp01(lerp(steel * 1.03, rustB, rust) - pitDepth * 0.15);

      rough[i] = clamp01(0.4 + rust * 0.5 + pitDepth * 0.3);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 3.0);
  const ao = aoFromHeight(h, size, 3, 1.0);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [2, 2], metalness: 0.55, normalStrength: 1.1 };
}

/* ------------------------------------------------------------------ *
 * 9. Painted wood — planks, stretched anisotropic grain, chipped paint.
 * Kept near-neutral so tintMaterial() can carry the stall's own colour.
 * ------------------------------------------------------------------ */
export function buildPaintedWood(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const planks = 5;
  const plankW = size / planks;
  // Anisotropic grain: stretch noise heavily along one axis by sampling a
  // much lower frequency in that direction.
  const grain = makeTileableFbm(seed, 3, 4, 2, 0.55);
  const chip = makeWorley2D(seed + 1, 8);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xInPlank = x % plankW;
      const seam = xInPlank < 2 || xInPlank > plankW - 3;

      const u = x / size;
      const grainV = grain(u * 8, v * 0.6); // stretched: fine across, smooth along the plank
      const ch = chip(u * 8, v * 8);
      const chipped = clamp01(1 - ch.f1 * 3) * (ch.id > 0.55 ? 1 : 0);

      let height = 0.6 + (grainV - 0.5) * 0.25 - (seam ? 0.35 : 0) - chipped * 0.2;
      h[i] = clamp01(height);

      const paintLum = clamp01(0.85 + (grainV - 0.5) * 0.12 - (seam ? 0.2 : 0));
      const woodR = 0.5 + grainV * 0.15;
      const woodG = 0.34 + grainV * 0.1;
      const woodB = 0.2 + grainV * 0.06;

      r[i] = lerp(paintLum, woodR, chipped);
      g[i] = lerp(paintLum, woodG, chipped);
      b[i] = lerp(paintLum, woodB, chipped);

      rough[i] = clamp01(0.5 + chipped * 0.3 + (seam ? 0.15 : 0));
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 2.4);
  const ao = aoFromHeight(h, size, 3, 0.9);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [1, 1], metalness: 0.0, normalStrength: 1.0 };
}

/* ------------------------------------------------------------------ *
 * 10. Tarpaulin — woven crosshatch weave + sagging fold creases, plasticky.
 * Kept near-neutral so tintMaterial() covers the usual stall-canopy colours.
 * ------------------------------------------------------------------ */
export function buildTarpaulin(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const folds = makeTileableFbm(seed, 3, 3, 2, 0.5);
  const weaveFreq = 60;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const weave = Math.sin(u * Math.PI * 2 * weaveFreq) * Math.sin(v * Math.PI * 2 * weaveFreq);
      const fold = (folds(u, v) - 0.5) * 0.5;

      const height = 0.55 + weave * 0.06 + fold;
      h[i] = clamp01(height);

      const lum = clamp01(0.88 + weave * 0.03 + fold * 0.2);
      r[i] = lum;
      g[i] = lum * 0.995;
      b[i] = lum * 0.97;

      rough[i] = clamp01(0.42 + Math.abs(weave) * 0.08 - fold * 0.1);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 1.6);
  return { colorCanvas, normalCanvas, roughness: rough, repeat: [2, 2], metalness: 0.0, normalStrength: 0.8 };
}

/* ------------------------------------------------------------------ *
 * 11. Dry mud — parched cracked earth, Worley-cell crack network.
 * ------------------------------------------------------------------ */
export function buildDryMud(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const cellField = makeWorley2D(seed, 8);
  const patch = makeTileableFbm(seed + 1, 5, 4, 2, 0.5);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const w = cellField(u * 8, v * 8);
      const crack = clamp01(1 - (w.f2 - w.f1) * 9);

      let height = 0.5 + patch(u, v) * 0.3 - crack * 0.55;
      h[i] = clamp01(height);

      const base = 0.5 + (patch(u, v) - 0.5) * 0.25 - crack * 0.35;
      r[i] = clamp01(base * 1.15);
      g[i] = clamp01(base * 0.92);
      b[i] = clamp01(base * 0.68);

      rough[i] = clamp01(0.88 + crack * 0.1);
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 2.8);
  const ao = aoFromHeight(h, size, 4, 1.2);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [3, 3], metalness: 0.0, normalStrength: 1.0 };
}

/* ------------------------------------------------------------------ *
 * 12. Tile — glazed terracotta/Kota-stone floor tile with grout grid.
 * ------------------------------------------------------------------ */
export function buildTile(seed: number, size = SIZE): SurfaceBuild {
  const { h, r, g, b, rough } = fieldsFromSize(size);
  const cols = 4;
  const tileSize = size / cols;
  const grout = Math.max(2, Math.round(tileSize * 0.06));
  const speck = makeTileableFbm(seed, 30, 3, 2, 0.5);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const xInTile = x % tileSize;
      const yInTile = y % tileSize;
      const tileCol = Math.floor(x / tileSize);
      const tileRow = Math.floor(y / tileSize);
      const tileId = hash1(tileCol * 91.7 + tileRow * 53.1);

      const isGrout = xInTile < grout || yInTile < grout;

      if (isGrout) {
        h[i] = 0.2;
        const lum = 0.5;
        r[i] = lum;
        g[i] = lum * 0.98;
        b[i] = lum * 0.95;
        rough[i] = 0.85;
      } else {
        h[i] = clamp01(0.6 + (speck(u, v) - 0.5) * 0.08);
        const jitter = (tileId - 0.5) * 0.15;
        r[i] = clamp01(0.62 + jitter + (speck(u, v) - 0.5) * 0.05);
        g[i] = clamp01(0.34 + jitter * 0.6);
        b[i] = clamp01(0.26 + jitter * 0.4);
        rough[i] = clamp01(0.28 + (speck(u, v) - 0.5) * 0.1);
      }
    }
  }
  const colorCanvas = rgbCanvas(r, g, b, size);
  const normalCanvas = heightToNormalCanvas(h, size, 2.0);
  const ao = aoFromHeight(h, size, 3, 1.0);
  return { colorCanvas, normalCanvas, roughness: rough, ao, repeat: [3, 3], metalness: 0.0, normalStrength: 0.9 };
}

export const SURFACE_BUILDERS: Record<string, (seed: number, size?: number) => SurfaceBuild> = {
  weathered_plaster: buildWeatheredPlaster,
  painted_plaster: buildPaintedPlaster,
  concrete: buildConcrete,
  brick: buildBrick,
  asphalt: buildAsphalt,
  kerb_stone: buildKerbStone,
  corrugated_metal: buildCorrugatedMetal,
  rusted_metal: buildRustedMetal,
  painted_wood: buildPaintedWood,
  tarpaulin: buildTarpaulin,
  dry_mud: buildDryMud,
  tile: buildTile,
};
