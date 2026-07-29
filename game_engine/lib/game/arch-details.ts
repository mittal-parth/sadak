/**
 * Indian architectural detail vocabulary, shared across every district.
 *
 * This vocabulary already existed, but only inside assets/delhi.ts, where it
 * was welded into two hero landmarks (makeBazaarGate, makeHaveliBalcony) and
 * could not be reused. Ordinary street buildings — which is nearly everything
 * the player actually walks past — got none of it, so the cities read as
 * generic boxes with awnings.
 *
 * Everything here emits plain BufferGeometry with the transform already baked
 * in, matching the convention in buildings.ts so the results merge into the
 * same handful of draw calls. Nothing here creates a mesh or a material.
 *
 * `facing` is +1 for a face pointing at +z and -1 for -z, the same convention
 * buildings.ts uses; `faceZ` is the wall plane.
 */

import * as THREE from "three";
import type { ArchStyle } from "./districts";

/** Box with its transform baked in, so it can be merged. Mirrors buildings.ts. */
function slab(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * Chhajja — the projecting drip eave that shades a window or runs the width of
 * a facade, carried on small brackets. This is the strongest single silhouette
 * cue in Indian street architecture: a facade with chhajjas casts a stack of
 * hard horizontal shadows that no amount of texture detail replicates.
 */
export function makeChhajja(
  out: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  depth = 0.55
): void {
  // The slab itself, tilted very slightly to shed water — and, more usefully,
  // to catch a different amount of light than the wall behind it.
  const eave = new THREE.BoxGeometry(w, 0.12, depth);
  eave.rotateX(facing * -0.06);
  eave.translate(cx, cy, faceZ + facing * (depth / 2));
  out.push(eave);

  // Drip lip on the outer edge.
  out.push(slab(w, 0.16, 0.1, cx, cy - 0.04, faceZ + facing * depth));

  // Support brackets. Three across for a wide chhajja, two for a narrow one.
  const n = w > 2.2 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const bx = cx - w / 2 + (w * (i + 0.5)) / n;
    const brk = new THREE.BoxGeometry(0.14, 0.42, 0.3);
    brk.rotateX(facing * 0.5);
    brk.translate(bx, cy - 0.24, faceZ + facing * 0.18);
    out.push(brk);
  }
}

/**
 * Jali — a perforated stone or timber lattice screen.
 *
 * Real jali is pierced; cutting actual holes would mean CSG and a geometry
 * budget this project does not have. Instead a dark backing plate carries a
 * grid of small proud studs, which is exactly the trick assets/delhi.ts uses
 * on the haveli, and at street distance it reads correctly.
 *
 * Pushes the backing into `dark` and the lattice studs into `light`.
 */
export function makeJaliPanel(
  dark: THREE.BufferGeometry[],
  light: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  h: number,
  cell = 0.26
): void {
  dark.push(slab(w, h, 0.06, cx, cy, faceZ + facing * 0.03));

  const cols = Math.max(2, Math.round(w / cell));
  const rows = Math.max(2, Math.round(h / cell));
  const sw = (w / cols) * 0.55;
  const sh = (h / rows) * 0.55;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Checkerboard, so the studs read as a diagonal lattice rather than a
      // grid of dots.
      if ((r + c) % 2 === 0) continue;
      light.push(
        slab(
          sw,
          sh,
          0.05,
          cx - w / 2 + (w * (c + 0.5)) / cols,
          cy - h / 2 + (h * (r + 0.5)) / rows,
          faceZ + facing * 0.07
        )
      );
    }
  }
}

/**
 * The head of an arched opening, sat on top of a rectangular window.
 *
 * Built as a fan of short chords rather than a real extruded curve — merged
 * into the shell it is indistinguishable at street distance and costs a
 * fraction of the vertices.
 *
 *  - `mughal`    pointed (ogee-ish) arch, the Indo-Islamic default
 *  - `dravidian` shallow lintel-and-corbel head, South Indian temple street
 *  - `colonial`  semicircular Roman arch
 *  - `modern`    nothing; flat-headed openings
 */
export function makeArchedOpening(
  out: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  style: ArchStyle
): void {
  if (style === "modern") return;

  const depth = 0.18;
  const z = faceZ + facing * 0.05;
  const r = w / 2;

  if (style === "dravidian") {
    // Corbelled head: two stepped courses, each narrower than the last.
    out.push(slab(w + 0.24, 0.14, depth, cx, cy + 0.07, z));
    out.push(slab(w - 0.1, 0.13, depth, cx, cy + 0.2, z));
    out.push(slab(w - 0.5, 0.12, depth, cx, cy + 0.32, z));
    return;
  }

  // Pointed arches rise higher than semicircular ones for the same span.
  const rise = style === "mughal" ? r * 1.5 : r;
  const segs = 9;
  const thickness = 0.13;

  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const p0 = archPoint(t0, r, rise, style);
    const p1 = archPoint(t1, r, rise, style);

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const seg = new THREE.BoxGeometry(len + thickness * 0.6, thickness, depth);
    seg.rotateZ(Math.atan2(dy, dx));
    seg.translate(cx + (p0.x + p1.x) / 2, cy + (p0.y + p1.y) / 2, z);
    out.push(seg);
  }

  // Keystone.
  out.push(slab(0.2, 0.26, depth + 0.04, cx, cy + rise, z));
}

/** Point on the arch curve, t from 0 (left springing) to 1 (right springing). */
function archPoint(
  t: number,
  r: number,
  rise: number,
  style: ArchStyle
): { x: number; y: number } {
  if (style === "mughal") {
    // Two mirrored quarter-curves meeting in a point at the crown.
    const s = t < 0.5 ? t * 2 : (1 - t) * 2;
    const sign = t < 0.5 ? -1 : 1;
    return {
      x: sign * r * (1 - s),
      y: rise * Math.sin((s * Math.PI) / 2),
    };
  }
  // Semicircle.
  const a = Math.PI * (1 - t);
  return { x: r * Math.cos(a), y: rise * Math.sin(a) };
}

/**
 * Chhatri — the small domed rooftop pavilion on four (or more) slender
 * columns. Sits alongside the existing water tanks on a roofline.
 */
export function makeChhatri(
  out: THREE.BufferGeometry[],
  cx: number,
  baseY: number,
  cz: number,
  scale = 1
): void {
  const s = scale;
  const half = 0.5 * s;

  for (const [px, pz] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ]) {
    const col = new THREE.CylinderGeometry(0.09 * s, 0.09 * s, 1.4 * s, 6);
    col.translate(cx + px, baseY + 0.7 * s, cz + pz);
    out.push(col);
  }

  // Canopy slab.
  out.push(slab(1.35 * s, 0.14 * s, 1.35 * s, cx, baseY + 1.42 * s, cz));

  // Dome: a hemisphere cut a little past the equator so it sits proud.
  const dome = new THREE.SphereGeometry(0.72 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
  dome.translate(cx, baseY + 1.9 * s, cz);
  out.push(dome);

  // Finial.
  const fin = new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.5 * s, 5);
  fin.translate(cx, baseY + 2.55 * s, cz);
  out.push(fin);
}

/**
 * Jharokha — the corbelled bay window projecting over the street, carried on
 * brackets and capped with its own little chhajja. Pushes the stonework into
 * `shell`, the screen backing into `dark`, and the lattice into `light`.
 */
export function makeJharokha(
  shell: THREE.BufferGeometry[],
  dark: THREE.BufferGeometry[],
  light: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  h: number
): void {
  const proj = 0.62;

  // Floor slab of the bay.
  shell.push(slab(w, 0.16, proj, cx, cy - h / 2, faceZ + facing * (proj / 2)));

  // Corbel brackets under it.
  for (const bx of [-w / 2 + 0.2, 0, w / 2 - 0.2]) {
    const brk = new THREE.BoxGeometry(0.16, 0.5, 0.34);
    brk.rotateX(facing * 0.55);
    brk.translate(cx + bx, cy - h / 2 - 0.28, faceZ + facing * 0.2);
    shell.push(brk);
  }

  // Side cheeks, so the bay is a box and not a floating screen.
  for (const sx of [-w / 2, w / 2]) {
    shell.push(slab(0.12, h, proj, cx + sx, cy, faceZ + facing * (proj / 2)));
  }

  // The screen itself, on the outer face of the bay.
  makeJaliPanel(dark, light, cx, cy, faceZ + facing * proj, facing, w - 0.3, h - 0.2, 0.22);

  // Its own little chhajja cap, plus a finial.
  makeChhajja(shell, cx, cy + h / 2 + 0.1, faceZ, facing, w + 0.25, proj + 0.2);
  shell.push(slab(0.14, 0.28, 0.14, cx, cy + h / 2 + 0.34, faceZ + facing * (proj * 0.5)));
}
