/**
 * Real building geometry.
 *
 * The previous version was a single textured box, which is why no amount of
 * post-processing made the city read as a city. What sells a street is depth
 * you can see the light catch: recessed window reveals, floor ledges that cast
 * a line of shadow, balconies that break the silhouette, and a ground floor at
 * human scale with shopfronts.
 *
 * All of it is merged into a handful of BufferGeometries per building, so a
 * facade with two hundred parts still costs about three draw calls. Without
 * merging this would add ~40 meshes per building and the city would die.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./props";

const FLOOR_H = 3.2;
const GROUND_H = 4.2; // shopfronts are taller than flats

export type BuildingParts = {
  /** Plaster/concrete shell, ledges, reveals. */
  shell: THREE.BufferGeometry;
  /** Window glass, emissive at night. */
  glass: THREE.BufferGeometry;
  /** Painted metal: railings, shutters, awning frames. */
  metal: THREE.BufferGeometry;
  /** Shop signage and awning fabric. */
  signage: THREE.BufferGeometry;
  height: number;
};

/** Box helper that bakes a transform into the geometry so it can be merged. */
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
 * One window: a recessed opening built from four surrounds plus a glass pane
 * set back from the wall. The setback is the whole point, it is what produces
 * the shadow line that makes a facade look solid rather than printed.
 */
function window(
  shell: THREE.BufferGeometry[],
  glass: THREE.BufferGeometry[],
  metal: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  ww: number,
  wh: number,
  rand: () => number
) {
  const reveal = 0.22; // how deep the opening sits
  const frame = 0.12;
  const zOuter = faceZ;
  const zGlass = faceZ - facing * reveal;

  // Surround: four thin slabs framing the opening, sitting proud of the wall.
  shell.push(slab(ww + frame * 2, frame, reveal, cx, cy + wh / 2, zOuter - (facing * reveal) / 2));
  shell.push(slab(ww + frame * 2, frame, reveal, cx, cy - wh / 2, zOuter - (facing * reveal) / 2));
  shell.push(slab(frame, wh, reveal, cx - ww / 2, cy, zOuter - (facing * reveal) / 2));
  shell.push(slab(frame, wh, reveal, cx + ww / 2, cy, zOuter - (facing * reveal) / 2));

  // Sill, proud of the facade. Catches light, drips a stain in the texture.
  shell.push(slab(ww + frame * 3, 0.1, 0.26, cx, cy - wh / 2 - 0.06, zOuter + facing * 0.06));

  glass.push(slab(ww, wh, 0.05, cx, cy, zGlass));

  // Mullion, and sometimes a security grille: very common, and it reads.
  metal.push(slab(0.05, wh, 0.06, cx, cy, zGlass - facing * 0.04));
  if (rand() > 0.55) {
    const bars = 3;
    for (let i = 1; i <= bars; i++) {
      metal.push(
        slab(ww, 0.035, 0.04, cx, cy - wh / 2 + (wh * i) / (bars + 1), zGlass - facing * 0.09)
      );
    }
  }
}

/** A projecting balcony with a railing. Breaks the silhouette. */
function balcony(
  shell: THREE.BufferGeometry[],
  metal: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  w: number
) {
  const depth = 0.85;
  const z = faceZ + facing * (depth / 2);
  shell.push(slab(w, 0.14, depth, cx, cy, z));

  const railH = 0.85;
  const zEdge = faceZ + facing * depth;
  metal.push(slab(w, 0.07, 0.07, cx, cy + railH, zEdge));
  metal.push(slab(0.07, railH, 0.07, cx - w / 2, cy + railH / 2, zEdge));
  metal.push(slab(0.07, railH, 0.07, cx + w / 2, cy + railH / 2, zEdge));
  const n = Math.max(3, Math.round(w / 0.35));
  for (let i = 1; i < n; i++) {
    metal.push(slab(0.035, railH, 0.035, cx - w / 2 + (w * i) / n, cy + railH / 2, zEdge));
  }
}

/** Ground-floor shopfront: recessed bay, roll shutter, awning, signboard. */
function shopfront(
  shell: THREE.BufferGeometry[],
  glass: THREE.BufferGeometry[],
  metal: THREE.BufferGeometry[],
  signage: THREE.BufferGeometry[],
  cx: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  rand: () => number
) {
  const bayH = 2.9;
  const inset = 0.35;
  const zBack = faceZ - facing * inset;

  // Recessed bay: side returns and a head, so the shop reads as a hole.
  shell.push(slab(0.3, bayH, inset, cx - w / 2, bayH / 2, faceZ - (facing * inset) / 2));
  shell.push(slab(0.3, bayH, inset, cx + w / 2, bayH / 2, faceZ - (facing * inset) / 2));
  shell.push(slab(w, 0.3, inset, cx, bayH, faceZ - (facing * inset) / 2));

  if (rand() > 0.45) {
    // Open shop: dark interior plus a glazed front.
    glass.push(slab(w - 0.4, bayH - 0.5, 0.05, cx, bayH / 2 - 0.1, zBack));
  } else {
    // Shuttered: corrugated roll shutter, ribbed so it catches light.
    const ribs = 9;
    for (let i = 0; i < ribs; i++) {
      metal.push(
        slab(w - 0.3, bayH / ribs - 0.03, 0.1, cx, (bayH / ribs) * (i + 0.5), zBack)
      );
    }
  }

  // Signboard above the bay: the single most Indian-street detail there is.
  signage.push(slab(w + 0.1, 0.75, 0.12, cx, bayH + 0.5, faceZ + facing * 0.06));

  // Awning, angled out over the pavement.
  if (rand() > 0.4) {
    const aw = new THREE.BoxGeometry(w, 0.06, 1.1);
    aw.rotateX(facing * -0.32);
    aw.translate(cx, bayH + 1.1, faceZ + facing * 0.55);
    signage.push(aw);
    metal.push(slab(0.06, 0.5, 0.06, cx - w / 2 + 0.1, bayH + 1.3, faceZ + facing * 0.1));
    metal.push(slab(0.06, 0.5, 0.06, cx + w / 2 - 0.1, bayH + 1.3, faceZ + facing * 0.1));
  }
}

export function buildBuildingParts(
  w: number,
  d: number,
  floors: number,
  seed: number
): BuildingParts {
  const rand = mulberry32(seed);
  const height = GROUND_H + floors * FLOOR_H;

  const shell: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];
  const signage: THREE.BufferGeometry[] = [];

  // Core mass, slightly inset so surrounds and sills read as proud of it.
  shell.push(slab(w, height, d, 0, height / 2, 0));

  // Plinth: buildings meet the pavement on a base, they do not just stop.
  shell.push(slab(w + 0.35, 0.5, d + 0.35, 0, 0.25, 0));

  // Floor ledges. A horizontal shadow line per storey does an enormous amount
  // of work for how solid the facade looks.
  for (let f = 1; f <= floors; f++) {
    const y = GROUND_H + (f - 1) * FLOOR_H;
    shell.push(slab(w + 0.24, 0.16, d + 0.24, 0, y, 0));
  }

  // Cornice and parapet.
  shell.push(slab(w + 0.45, 0.3, d + 0.45, 0, height + 0.15, 0));
  shell.push(slab(w + 0.2, 0.75, d + 0.2, 0, height + 0.6, 0));

  // The two long faces get full treatment; the returns get windows only.
  const faces: Array<{ axis: "z"; faceZ: number; facing: 1 | -1; span: number }> = [
    { axis: "z", faceZ: d / 2, facing: 1, span: w },
    { axis: "z", faceZ: -d / 2, facing: -1, span: w },
  ];

  for (const face of faces) {
    const bays = Math.max(1, Math.floor(face.span / 3.2));
    const bayW = face.span / bays;

    // Ground floor: shops.
    for (let b = 0; b < bays; b++) {
      const cx = -face.span / 2 + bayW * (b + 0.5);
      shopfront(shell, glass, metal, signage, cx, face.faceZ, face.facing, bayW * 0.82, rand);
    }

    // Upper floors: windows, some with balconies.
    for (let f = 0; f < floors; f++) {
      const cy = GROUND_H + f * FLOOR_H + FLOOR_H / 2;
      for (let b = 0; b < bays; b++) {
        const cx = -face.span / 2 + bayW * (b + 0.5);
        const ww = Math.min(1.5, bayW * 0.5);
        window(shell, glass, metal, cx, cy, face.faceZ, face.facing, ww, 1.5, rand);

        if (rand() > 0.62) {
          balcony(shell, metal, cx, GROUND_H + f * FLOOR_H + 0.1, face.faceZ, face.facing, bayW * 0.8);
        }
      }
    }
  }

  // Rooftop clutter. Water tanks and dishes are the Indian roofline.
  const tanks = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < tanks; i++) {
    const tx = (rand() - 0.5) * (w - 1.5);
    const tz = (rand() - 0.5) * (d - 1.5);
    const th = 0.9 + rand() * 0.5;
    const t = new THREE.CylinderGeometry(0.5, 0.5, th, 10);
    t.translate(tx, height + 1.0 + th / 2, tz);
    metal.push(t);
    metal.push(slab(0.9, 0.5, 0.9, tx, height + 1.2, tz)); // stand
  }

  // A stair headroom box: real roofs are never flat and empty.
  if (rand() > 0.4) {
    shell.push(
      slab(2.2, 2.2, 2.2, (rand() - 0.5) * (w - 3), height + 2.1, (rand() - 0.5) * (d - 3))
    );
  }

  const merge = (list: THREE.BufferGeometry[]) =>
    list.length ? BufferGeometryUtils.mergeGeometries(list, false) : new THREE.BufferGeometry();

  const parts: BuildingParts = {
    shell: merge(shell),
    glass: merge(glass),
    metal: merge(metal),
    signage: merge(signage),
    height,
  };

  // Merged copies hold the data now; release the sources.
  [...shell, ...glass, ...metal, ...signage].forEach((g) => g.dispose());
  return parts;
}
