/**
 * Real building geometry.
 *
 * The previous version was a single textured box, which is why no amount of
 * post-processing made the city read as a city. What sells a street is depth
 * you can see the light catch: recessed window reveals, floor ledges that cast
 * a line of shadow, balconies that break the silhouette, and a ground floor at
 * human scale with shopfronts.
 *
 * On top of the architecture sits the lived-in layer that makes it an Indian
 * street rather than a model: split-AC units under the windows, tin sunshades,
 * drain pipes, laundry on the balcony rail, potted tulsi and money plants,
 * black Sintex tanks and dish antennas on the roof, kirana packet strips and
 * stacked crates at the shop mouths, and a painted signboard in the local
 * script over every shop.
 *
 * All of it is merged into a handful of BufferGeometries per building, so a
 * facade with several hundred parts still costs about seven draw calls. The
 * lived-in layer carries per-vertex colour, which is what lets a red AC
 * bracket, a blue tarp and a green kurta share one mesh and one material.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./props";
import {
  makeArchedOpening,
  makeChhajja,
  makeChhatri,
  makeJaliPanel,
  makeJharokha,
} from "./arch-details";
import type { ArchStyle } from "./districts";
import type { UvRect } from "./signage";

export const FLOOR_H = 3.2;
export const GROUND_H = 4.2; // shopfronts are taller than flats
/** Height of the shop opening, and how far the ground floor is set back on
 *  shop faces so the bay reads as a hole in the wall. */
const SHOP_BAY_H = 2.9;
const SHOP_INSET = 0.35;

export type BuildingParts = {
  /** Plaster/concrete shell. */
  shell: THREE.BufferGeometry;
  /** Contrasting painted trim: window surrounds, sills, ledges, cornice,
   *  arched heads. The two-tone wall/trim split is most of what makes a
   *  facade read as designed rather than extruded. */
  trim: THREE.BufferGeometry;
  /** Window glass. */
  glass: THREE.BufferGeometry;
  /** Painted metal: railings, shutters, awning frames, tank stands. */
  metal: THREE.BufferGeometry;
  /** Signboard frames and awning fabric. */
  signage: THREE.BufferGeometry;
  /** Vertex-coloured lived-in layer. Has a `color` attribute. */
  decor: THREE.BufferGeometry;
  /** Signboard faces, UV-mapped into the district sign atlas. */
  signs: THREE.BufferGeometry;
  height: number;
};

export type BuildingOptions = {
  style?: ArchStyle;
  /** Sign atlas cells to pick from. Without it shops get no lettered faces. */
  signs?: { cells: number; rect(i: number): UvRect };
  /**
   * Only the street face (+z) gets shops, windows and balconies; the back and
   * sides are plain party walls. Terraced plots press against their
   * neighbours, so detailing those faces was most of the triangles for
   * nothing.
   */
  frontOnly?: boolean;
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

/* ------------------------------------------------------------------ *
 * Vertex-coloured decor
 * ------------------------------------------------------------------ */

const _c = new THREE.Color();

/** Bakes a flat colour into a geometry as a `color` attribute. Non-indexed,
 *  so boxes, cylinders and icosahedra can all merge into one list. */
function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  _c.setHex(hex);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) _c.toArray(cols, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  // Icosahedra carry uvs, some helpers do not; decor needs none.
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number) {
  return paint(slab(w, h, d, x, y, z), hex);
}

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: number, seg = 10) {
  return paint(new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y, z), hex);
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

const AC_BODY = 0xe9e5da;
const AC_GRILLE = 0x3a3d42;
const TANK_COLOURS = [0x26272b, 0x26272b, 0x26272b, 0x2f5d9e, 0xd9cfb4];
const SHADE_COLOURS = [0x3f7f8c, 0x9b3b2f, 0x6b8f3a, 0x46505c, 0xb07a2a];
const CLOTH_COLOURS = [
  0xd8342c, 0xf2b631, 0x2c7bd1, 0x2aa36b, 0xf06aa0, 0xffffff, 0x7c3fb0, 0xf08a24, 0x1f2f5a,
];
const PACKET_COLOURS = [0xe63b2e, 0xf7c52b, 0x2f9e44, 0x2266c4, 0xf08a24, 0xd6336c];
const CRATE_COLOURS = [0x3a78c2, 0xd13b30, 0x2f9e44, 0xe0a13a, 0x8a5a2b];
const POT = 0xb8583a;
const LEAF = [0x3f8f3a, 0x2f7a3a, 0x5aa33f];
const PIPE_COLOURS = [0x8d8f8a, 0x3d4a52, 0xd8d2c4];

/** Split-AC outdoor unit on two brackets, fan grille facing the street. */
function acUnit(decor: THREE.BufferGeometry[], x: number, y: number, faceZ: number, facing: 1 | -1) {
  const z = faceZ + facing * 0.2;
  decor.push(box(0.8, 0.52, 0.3, x, y, z, AC_BODY));
  const grille = new THREE.CylinderGeometry(0.18, 0.18, 0.03, 8);
  grille.rotateX(Math.PI / 2);
  grille.translate(x - 0.13, y, z + facing * 0.16);
  decor.push(paint(grille, AC_GRILLE));
  decor.push(box(0.06, 0.06, 0.34, x - 0.3, y - 0.3, faceZ + facing * 0.17, AC_GRILLE));
  decor.push(box(0.06, 0.06, 0.34, x + 0.3, y - 0.3, faceZ + facing * 0.17, AC_GRILLE));
}

/** Tin hood over a window, sloped to shed monsoon rain. */
function sunshade(decor: THREE.BufferGeometry[], cx: number, y: number, faceZ: number, facing: 1 | -1, w: number, hex: number) {
  const depth = 0.62;
  const hood = new THREE.BoxGeometry(w, 0.05, depth);
  hood.rotateX(facing * 0.38);
  hood.translate(cx, y, faceZ + facing * (depth / 2 - 0.02));
  decor.push(paint(hood, hex));
  // Side cheeks.
  for (const s of [-1, 1]) {
    decor.push(box(0.04, 0.26, depth * 0.8, cx + (s * w) / 2, y - 0.1, faceZ + facing * (depth * 0.4), hex));
  }
}

/** A few garments drying over the balcony rail. */
function laundry(
  decor: THREE.BufferGeometry[],
  cx: number,
  railY: number,
  zEdge: number,
  facing: 1 | -1,
  w: number,
  rand: () => number
) {
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const cw = 0.3 + rand() * 0.25;
    const ch = 0.4 + rand() * 0.35;
    const x = cx - w / 2 + (w * (i + 0.5)) / n + (rand() - 0.5) * 0.15;
    decor.push(box(cw, ch, 0.03, x, railY - ch / 2 + 0.04, zEdge + facing * 0.06, pick(CLOTH_COLOURS, rand)));
  }
}

/** Terracotta pot with a leafy ball in it. */
function pottedPlant(decor: THREE.BufferGeometry[], x: number, y: number, z: number, rand: () => number) {
  decor.push(cyl(0.16, 0.12, 0.26, x, y + 0.13, z, POT, 8));
  const leaf = new THREE.IcosahedronGeometry(0.2 + rand() * 0.08, 0);
  leaf.translate(x, y + 0.42, z);
  decor.push(paint(leaf, pick(LEAF, rand)));
}

/** Vertical strips of chips and shampoo sachets hung at a kirana entrance. */
function packetStrips(decor: THREE.BufferGeometry[], cx: number, top: number, z: number, w: number, rand: () => number) {
  const strips = 3 + Math.floor(rand() * 3);
  for (let s = 0; s < strips; s++) {
    const x = cx - w / 2 + 0.35 + ((w - 0.7) * s) / Math.max(1, strips - 1);
    const colour = pick(PACKET_COLOURS, rand);
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      decor.push(box(0.2, 0.22, 0.03, x, top - 0.16 - i * 0.25, z, i % 2 === 0 ? colour : pick(PACKET_COLOURS, rand)));
    }
  }
}

/** Stacked crates and sacks spilling out of an open shop. */
function shopGoods(decor: THREE.BufferGeometry[], cx: number, z: number, w: number, facing: 1 | -1, rand: () => number) {
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + 0.4 + (w - 0.8) * rand();
    const s = 0.4 + rand() * 0.2;
    const zz = z + facing * (0.3 + rand() * 0.3);
    if (rand() > 0.4) {
      decor.push(box(s, s * 0.7, s, x, 0.26 + (s * 0.7) / 2, zz, pick(CRATE_COLOURS, rand)));
      if (rand() > 0.5) {
        decor.push(box(s * 0.9, s * 0.6, s * 0.9, x, 0.26 + s * 0.7 + (s * 0.6) / 2, zz, pick(CRATE_COLOURS, rand)));
      }
    } else {
      // Grain sack: squat, pale jute.
      decor.push(cyl(s * 0.42, s * 0.5, s * 0.8, x, 0.26 + s * 0.4, zz, 0xcdb88a, 8));
    }
  }
}

const INTERIOR = 0x2c211c;
const SHELF = 0x7a5537;

/** Back wall, three shelves and rows of stock, seen through an open shutter. */
function shopInterior(
  decor: THREE.BufferGeometry[],
  cx: number,
  zBack: number,
  facing: 1 | -1,
  w: number,
  h: number,
  rand: () => number
) {
  decor.push(box(w, h, 0.04, cx, h / 2, zBack + facing * 0.02, INTERIOR));
  for (let i = 0; i < 3; i++) {
    const y = 0.7 + i * 0.62;
    decor.push(box(w - 0.1, 0.05, 0.3, cx, y, zBack + facing * 0.17, SHELF));
    // Stock: a run of small coloured boxes of varying height on each shelf.
    let x = cx - w / 2 + 0.12;
    while (x < cx + w / 2 - 0.2) {
      const bw = 0.12 + rand() * 0.14;
      const bh = 0.16 + rand() * 0.24;
      decor.push(box(bw, bh, 0.2, x + bw / 2, y + 0.025 + bh / 2, zBack + facing * 0.17, pick(PACKET_COLOURS, rand)));
      x += bw + 0.03 + rand() * 0.06;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Architecture
 * ------------------------------------------------------------------ */

type Lists = {
  shell: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  metal: THREE.BufferGeometry[];
  decor: THREE.BufferGeometry[];
};

/**
 * One window: a recessed opening built from four surrounds plus a glass pane
 * set back from the wall. The setback is the whole point, it is what produces
 * the shadow line that makes a facade look solid rather than printed.
 */
function window(
  L: Lists,
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  ww: number,
  wh: number,
  rand: () => number,
  style: ArchStyle = "modern"
) {
  // The core mass is a solid box, so nothing can be recessed into it: the
  // pane sits on the wall plane and the surround stands proud of it by
  // `reveal`, which gives the same shadow line. (This used to set the glass
  // and surrounds *into* the wall, where the core box hid them entirely.)
  const reveal = 0.16;
  const frame = 0.12;
  const zOuter = faceZ;
  const zGlass = faceZ + facing * 0.015;
  const zFrame = faceZ + (facing * reveal) / 2;

  // Surround: four thin slabs framing the opening.
  L.trim.push(slab(ww + frame * 2, frame, reveal, cx, cy + wh / 2, zFrame));
  L.trim.push(slab(ww + frame * 2, frame, reveal, cx, cy - wh / 2, zFrame));
  L.trim.push(slab(frame, wh, reveal, cx - ww / 2, cy, zFrame));
  L.trim.push(slab(frame, wh, reveal, cx + ww / 2, cy, zFrame));

  // Sill, proud of the facade.
  L.trim.push(slab(ww + frame * 3, 0.1, 0.26, cx, cy - wh / 2 - 0.06, zOuter + facing * 0.06));

  // Arched head, where the district's architecture calls for one.
  makeArchedOpening(L.trim, cx, cy + wh / 2, zOuter, facing, ww + frame * 2, style);

  L.glass.push(slab(ww, wh, 0.03, cx, cy, zGlass));

  // Mullion and transom: glass split into panes reads as a window, one
  // sheet reads as a hole.
  L.metal.push(slab(0.05, wh, 0.04, cx, cy, zGlass + facing * 0.03));
  L.metal.push(slab(ww, 0.05, 0.04, cx, cy + wh * 0.18, zGlass + facing * 0.03));

  const r = rand();
  if (style !== "modern" && r > 0.72) {
    // Jali infill. Backing goes into metal, the lattice studs into trim so
    // they stand out against the recess.
    makeJaliPanel(L.metal, L.trim, cx, cy, zGlass, facing, ww, wh, 0.34);
  } else if (r > 0.4) {
    // Grille, set just inside the reveal so it sits in front of the glass.
    const bars = 3;
    for (let i = 1; i <= bars; i++) {
      L.metal.push(
        slab(ww, 0.035, 0.04, cx, cy - wh / 2 + (wh * i) / (bars + 1), zGlass + facing * 0.1)
      );
    }
    for (const s of [-1, 1]) {
      L.metal.push(slab(0.035, wh, 0.04, cx + (s * ww) / 4, cy, zGlass + facing * 0.1));
    }
  }

  // Lived-in layer. AC units favour modern and colonial blocks; the old
  // city's jali-and-arch facades get fewer.
  const acChance = style === "modern" ? 0.4 : style === "colonial" ? 0.3 : 0.2;
  if (rand() < acChance) {
    acUnit(L.decor, cx + (rand() - 0.5) * 0.4, cy - wh / 2 - 0.5, faceZ, facing);
  } else if (rand() < 0.14) {
    pottedPlant(L.decor, cx + (rand() - 0.5) * ww * 0.6, cy - wh / 2 - 0.01, faceZ + facing * 0.14, rand);
  }
  if (style !== "mughal" && rand() < 0.3) {
    sunshade(L.decor, cx, cy + wh / 2 + 0.28, faceZ, facing, ww + 0.45, pick(SHADE_COLOURS, rand));
  }
}

/** A projecting balcony with a railing. Breaks the silhouette. */
function balcony(
  L: Lists,
  cx: number,
  cy: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  rand: () => number
) {
  const depth = 0.85;
  const z = faceZ + facing * (depth / 2);
  L.trim.push(slab(w, 0.14, depth, cx, cy, z));

  const railH = 0.85;
  const zEdge = faceZ + facing * depth;
  L.metal.push(slab(w, 0.07, 0.07, cx, cy + railH, zEdge));
  L.metal.push(slab(0.07, railH, 0.07, cx - w / 2, cy + railH / 2, zEdge));
  L.metal.push(slab(0.07, railH, 0.07, cx + w / 2, cy + railH / 2, zEdge));
  const n = Math.max(3, Math.round(w / 0.35));
  for (let i = 1; i < n; i++) {
    L.metal.push(slab(0.035, railH, 0.035, cx - w / 2 + (w * i) / n, cy + railH / 2, zEdge));
  }

  if (rand() < 0.5) laundry(L.decor, cx, cy + railH, zEdge, facing, w * 0.9, rand);
  const pots = rand() < 0.55 ? 1 + Math.floor(rand() * 3) : 0;
  for (let i = 0; i < pots; i++) {
    pottedPlant(L.decor, cx - w / 2 + 0.3 + (w - 0.6) * rand(), cy + 0.07, faceZ + facing * (0.2 + rand() * 0.35), rand);
  }
}

/** Ground-floor shopfront: recessed bay, roll shutter, awning, signboard.
 *  The ground-floor core is inset by SHOP_INSET on shop faces (see
 *  buildBuildingParts); the piers here rebuild the wall line between bays. */
function shopfront(
  L: Lists,
  signage: THREE.BufferGeometry[],
  signs: THREE.BufferGeometry[],
  cx: number,
  faceZ: number,
  facing: 1 | -1,
  w: number,
  bayW: number,
  rand: () => number,
  atlas: BuildingOptions["signs"]
) {
  const bayH = SHOP_BAY_H;
  const inset = SHOP_INSET;
  const zBack = faceZ - facing * inset;
  const zMid = faceZ - (facing * inset) / 2;

  // Piers either side of the opening, running out to the bay boundary so
  // neighbouring shops share a wall, and a head over the opening.
  const pier = (bayW - w) / 2 + 0.15;
  L.shell.push(slab(pier, bayH, inset, cx - w / 2 - pier / 2 + 0.15, bayH / 2, zMid));
  L.shell.push(slab(pier, bayH, inset, cx + w / 2 + pier / 2 - 0.15, bayH / 2, zMid));
  L.shell.push(slab(w, 0.3, inset, cx, bayH, zMid));

  const open = rand() > 0.45;
  if (open) {
    // Open shop: a dark interior with lit shelves of stock, which is what an
    // open Indian shopfront actually looks like from the street — not glass.
    shopInterior(L.decor, cx, zBack, facing, w - 0.3, bayH - 0.15, rand);
    if (rand() < 0.4) packetStrips(L.decor, cx, bayH - 0.2, faceZ - facing * 0.05, w - 0.4, rand);
    if (rand() < 0.5) shopGoods(L.decor, cx, faceZ, w, facing, rand);
  } else {
    // Shuttered: corrugated roll shutter, ribbed so it catches light.
    const ribs = 9;
    for (let i = 0; i < ribs; i++) {
      L.metal.push(
        slab(w - 0.3, bayH / ribs - 0.03, 0.1, cx, (bayH / ribs) * (i + 0.5), zBack + facing * 0.05)
      );
    }
    // Shutter lock box at the bottom.
    L.metal.push(slab(0.3, 0.14, 0.14, cx, 0.35, zBack + facing * 0.13));
  }

  // Signboard above the bay: the single most Indian-street detail there is.
  signage.push(slab(w + 0.1, 0.75, 0.12, cx, bayH + 0.5, faceZ + facing * 0.06));
  if (atlas) {
    const face = new THREE.PlaneGeometry(w - 0.02, 0.66);
    const [u0, v0, u1, v1] = atlas.rect(Math.floor(rand() * atlas.cells));
    const uv = face.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    if (facing === -1) face.rotateY(Math.PI);
    face.translate(cx, bayH + 0.5, faceZ + facing * 0.125);
    signs.push(face);
  }

  // Awning, angled out over the pavement.
  if (rand() > 0.4) {
    const aw = new THREE.BoxGeometry(w, 0.06, 1.1);
    aw.rotateX(facing * -0.32);
    aw.translate(cx, bayH + 1.1, faceZ + facing * 0.55);
    signage.push(aw);
    L.metal.push(slab(0.06, 0.5, 0.06, cx - w / 2 + 0.1, bayH + 1.3, faceZ + facing * 0.1));
    L.metal.push(slab(0.06, 0.5, 0.06, cx + w / 2 - 0.1, bayH + 1.3, faceZ + facing * 0.1));
  }
}

/** Water tanks, dish, stair headroom and the odd tarp shade: the roofline. */
function rooftop(L: Lists, w: number, d: number, height: number, rand: () => number) {
  const roof = height;
  // Stands tall enough that the tanks clear the parapet (height + 1.0) and
  // read from the street.
  const legH = 1.0;

  // Sintex tanks: black ribbed drums on a steel stand. The single most
  // recognisable shape on an Indian skyline.
  const tanks = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < tanks; i++) {
    const tx = (rand() - 0.5) * (w - 1.8);
    const tz = (rand() - 0.5) * (d - 1.8);
    const th = 1.0 + rand() * 0.5;
    const colour = pick(TANK_COLOURS, rand);
    const base = roof + legH;
    L.metal.push(slab(1.0, 0.08, 1.0, tx, base, tz));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      L.metal.push(slab(0.06, legH, 0.06, tx + sx * 0.42, roof + legH / 2, tz + sz * 0.42));
    }
    L.decor.push(cyl(0.52, 0.56, th, tx, base + th / 2, tz, colour, 8));
    // Ribs.
    for (let r = 1; r <= 2; r++) {
      L.decor.push(cyl(0.575, 0.575, 0.06, tx, base + (th * r) / 3, tz, colour, 8));
    }
    L.decor.push(cyl(0.22, 0.3, 0.14, tx, base + th + 0.07, tz, colour, 10));
  }

  if (rand() < 0.35) {
    // Dish antenna on a stub pole, tilted at the southern sky.
    const x = (rand() - 0.5) * (w - 1.5);
    const z = (rand() - 0.5) * (d - 1.5);
    L.decor.push(cyl(0.04, 0.04, 1.6, x, roof + 0.8, z, 0x9a9a95, 6));
    const dish = new THREE.CylinderGeometry(0.42, 0.08, 0.14, 8);
    dish.rotateX(-0.9);
    dish.rotateY(rand() * Math.PI * 2);
    dish.translate(x, roof + 1.7, z);
    L.decor.push(paint(dish, 0xe6e4dc));
  }

  // A stair headroom box: real roofs are never flat and empty.
  if (rand() > 0.4) {
    L.shell.push(slab(2.2, 2.2, 2.2, (rand() - 0.5) * (w - 3), height + 2.1, (rand() - 0.5) * (d - 3)));
  }

  if (rand() < 0.22 && w > 5 && d > 5) {
    // Blue tarp shade over part of the terrace, on four bamboo poles.
    const x = (rand() - 0.5) * (w - 4);
    const z = (rand() - 0.5) * (d - 4);
    const sw = 2.4 + rand();
    const sd = 2.0 + rand();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      L.decor.push(cyl(0.05, 0.05, 2.1, x + (sx * sw) / 2, roof + 1.05, z + (sz * sd) / 2, 0xa8894f, 5));
    }
    const tarp = new THREE.BoxGeometry(sw + 0.2, 0.04, sd + 0.2);
    tarp.rotateX(0.12);
    tarp.translate(x, roof + 2.1, z);
    L.decor.push(paint(tarp, 0x2f6fb3));
  }
}

export function buildBuildingParts(
  w: number,
  d: number,
  floors: number,
  seed: number,
  opts: BuildingOptions = {}
): BuildingParts {
  const style = opts.style ?? "modern";
  const rand = mulberry32(seed);
  const height = GROUND_H + floors * FLOOR_H;

  // Decided once per building rather than per window, so a terrace reads as a
  // row of coherent buildings instead of a jumble of unrelated details.
  const hasChhajja = style !== "modern" && rand() > 0.35;
  const hasJharokha = (style === "mughal" || style === "colonial") && floors >= 2 && rand() > 0.62;
  const hasChhatri = style === "mughal" && rand() > 0.55;

  const L: Lists = { shell: [], trim: [], glass: [], metal: [], decor: [] };
  const signage: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [];

  // Core mass. The ground floor is set back on both long (shop) faces so the
  // shop bays are genuinely recessed; the upper floors run full depth, with
  // a fascia closing the band between the shop heads and the first floor.
  const shopFaces: (1 | -1)[] = opts.frontOnly ? [1] : [1, -1];
  const backInset = opts.frontOnly ? 0 : SHOP_INSET;
  L.shell.push(slab(w, GROUND_H, d - SHOP_INSET - backInset, 0, GROUND_H / 2, (backInset - SHOP_INSET) / 2));
  L.shell.push(slab(w, height - GROUND_H, d, 0, GROUND_H + (height - GROUND_H) / 2, 0));
  for (const facing of shopFaces) {
    const fh = GROUND_H - SHOP_BAY_H;
    L.shell.push(slab(w, fh, SHOP_INSET, 0, SHOP_BAY_H + fh / 2, facing * (d / 2 - SHOP_INSET / 2)));
  }

  // Plinth: buildings meet the pavement on a base, they do not just stop.
  L.trim.push(slab(w + 0.35, 0.5, d + 0.35, 0, 0.25, 0));

  // Floor ledges. A horizontal shadow line per storey does an enormous amount
  // of work for how solid the facade looks.
  for (let f = 1; f <= floors; f++) {
    const y = GROUND_H + (f - 1) * FLOOR_H;
    L.trim.push(slab(w + 0.24, 0.16, d + 0.24, 0, y, 0));
  }

  // Cornice and parapet.
  L.trim.push(slab(w + 0.45, 0.3, d + 0.45, 0, height + 0.15, 0));
  L.shell.push(slab(w + 0.2, 0.75, d + 0.2, 0, height + 0.6, 0));
  // Parapet coping, so the roofline has a crisp lit edge.
  L.trim.push(slab(w + 0.3, 0.1, d + 0.3, 0, height + 1.0, 0));

  // Long faces get shopfronts and the full detail set; the returns — the ends
  // of a terrace the player walks past at every corner — get windows.
  const faces: Array<{
    faceZ: number;
    facing: 1 | -1;
    span: number;
    rotate: boolean;
    shops: boolean;
  }> = [
    { faceZ: d / 2, facing: 1, span: w, rotate: false, shops: true },
    // In a terrace the back and the side walls are party walls against the
    // neighbours: blank, as they really are.
    ...(opts.frontOnly
      ? []
      : [
          { faceZ: -d / 2, facing: -1 as const, span: w, rotate: false, shops: true },
          { faceZ: w / 2, facing: 1 as const, span: d, rotate: true, shops: false },
          { faceZ: -w / 2, facing: -1 as const, span: d, rotate: true, shops: false },
        ]),
  ];

  for (const face of faces) {
    // Return faces are generated in the same local frame as the long faces and
    // then rotated a quarter turn into place, so there is only one code path.
    const R: Lists = face.rotate ? { shell: [], trim: [], glass: [], metal: [], decor: [] } : L;

    const bays = Math.max(1, Math.floor(face.span / 3.2));
    const bayW = face.span / bays;

    if (face.shops) {
      for (let b = 0; b < bays; b++) {
        const cx = -face.span / 2 + bayW * (b + 0.5);
        shopfront(L, signage, signs, cx, face.faceZ, face.facing, bayW * 0.82, bayW, rand, opts.signs);
      }
    }

    // Upper floors: windows, some with balconies.
    for (let f = 0; f < floors; f++) {
      const cy = GROUND_H + f * FLOOR_H + FLOOR_H / 2;

      // A chhajja runs the full width of the floor rather than per-window: it
      // is a continuous eave in real construction, and the unbroken shadow
      // line is what makes it read from across the street.
      if (hasChhajja && face.shops) {
        makeChhajja(R.trim, 0, cy + 1.05, face.faceZ, face.facing, face.span * 0.96, 0.5);
      }

      for (let b = 0; b < bays; b++) {
        const cx = -face.span / 2 + bayW * (b + 0.5);
        const ww = Math.min(1.5, bayW * 0.5);

        // One jharokha per building, centred, on an upper floor of a street
        // face — any more and it stops reading as a special feature.
        if (hasJharokha && face.shops && f === 1 && b === Math.floor(bays / 2)) {
          makeJharokha(R.shell, R.metal, R.trim, cx, cy, face.faceZ, face.facing, Math.min(2.4, bayW * 0.85), 1.9);
          continue;
        }

        window(R, cx, cy, face.faceZ, face.facing, ww, 1.5, rand, style);

        if (face.shops && rand() > 0.62) {
          balcony(L, cx, GROUND_H + f * FLOOR_H + 0.1, face.faceZ, face.facing, bayW * 0.8, rand);
        }
      }
    }

    // One drain pipe down the street face, at a party wall.
    if (face.shops && rand() < 0.7) {
      const px = (rand() > 0.5 ? 1 : -1) * (face.span / 2 - 0.22);
      L.decor.push(cyl(0.07, 0.07, height, px, height / 2 + 0.3, face.faceZ + face.facing * 0.12, pick(PIPE_COLOURS, rand), 6));
    }

    if (face.rotate) {
      for (const key of ["shell", "trim", "glass", "metal", "decor"] as const) {
        for (const g of R[key]) {
          g.rotateY(Math.PI / 2);
          L[key].push(g);
        }
      }
    }
  }

  rooftop(L, w, d, height, rand);

  // Chhatri on the parapet corner, where the district's architecture has one.
  if (hasChhatri) {
    const s = 0.55 + rand() * 0.25;
    makeChhatri(
      L.trim,
      (rand() > 0.5 ? 1 : -1) * (w / 2 - 0.9),
      height + 1.0,
      (rand() > 0.5 ? 1 : -1) * (d / 2 - 0.9),
      s
    );
  }

  const merge = (list: THREE.BufferGeometry[]) =>
    list.length ? BufferGeometryUtils.mergeGeometries(list, false)! : new THREE.BufferGeometry();

  const parts: BuildingParts = {
    shell: merge(L.shell),
    trim: merge(L.trim),
    glass: merge(L.glass),
    metal: merge(L.metal),
    signage: merge(signage),
    decor: merge(L.decor),
    signs: merge(signs),
    height,
  };

  // Merged copies hold the data now; release the sources.
  [...L.shell, ...L.trim, ...L.glass, ...L.metal, ...L.decor, ...signage, ...signs].forEach((g) => g.dispose());
  return parts;
}

/* ------------------------------------------------------------------ *
 * Baking
 * ------------------------------------------------------------------ */

export type BakedBuilding = {
  /** Every opaque part, vertex-coloured: one draw call. */
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  signs: THREE.BufferGeometry;
};

/**
 * Collapses a building's parts to three geometries. Under cel shading the
 * plaster, trim and metal materials are flat colours anyway, so baking them
 * into vertex colour alongside the decor loses nothing and turns seven draw
 * calls a building into three.
 */
export function bakeBuilding(
  parts: BuildingParts,
  colours: { wall: number; trim: number; metal: number; sign: number }
): BakedBuilding {
  const list: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, hex: number) => {
    if (g.attributes.position) list.push(paint(g, hex));
  };
  add(parts.shell, colours.wall);
  add(parts.trim, colours.trim);
  add(parts.metal, colours.metal);
  add(parts.signage, colours.sign);
  if (parts.decor.attributes.position) list.push(parts.decor);
  for (const g of list) {
    if (g.attributes.uv) g.deleteAttribute("uv");
  }
  const body = BufferGeometryUtils.mergeGeometries(list, false)!;
  list.forEach((g) => g.dispose());
  return { body, glass: parts.glass, signs: parts.signs };
}
