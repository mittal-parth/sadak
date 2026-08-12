/**
 * Street clutter: the difference between a geometric layout and a lived-in
 * street. `buildCity` gives us a big, clean, nearly-empty grid; this module
 * scatters hundreds of small procedural props across it — poles, wires,
 * rubbish, carts, posters, potted plants — so a pavement reads as used
 * rather than modelled.
 *
 * Every prop TYPE is one InstancedMesh, so three hundred crates cost one
 * draw call, not three hundred. Multi-part props (a hand-cart, a stack of
 * chairs) are pre-merged into a single BufferGeometry with baked vertex
 * colours, the same trick `buildings.ts` uses for facades, so instancing
 * still works even though the prop itself has several "materials" worth of
 * colour in it.
 *
 * Nothing here reads city.ts at runtime — only its Box type, for the
 * collider list. The caller hands over colliders/roadLines/geometry
 * constants explicitly (see ClutterOpts), which keeps this file a pure
 * function of "here is the world" rather than a hidden dependency on how
 * buildCity happens to be implemented today.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MaterialLibrary } from "./materials";
import type { Theme } from "./districts";
import type { Box } from "./city";

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export type ClutterOpts = {
  /** Building/tree/etc colliders already in the scene — never spawn inside these. */
  colliders: Box[];
  /**
   * The subset of `colliders` that are actual building footprints. Anything
   * that mounts on a wall (posters, signboards, hoardings, a leaning bicycle)
   * is placed against these, so a poster never ends up pasted to a parked car
   * or floating in a tree. Defaults to `colliders`.
   */
  facades?: Box[];
  /** Coordinates of every road centreline, used for BOTH axes (matches city.ts's grid). */
  roadLines: number[];
  /** Full road width. */
  roadWidth: number;
  /** Building block edge length (pavement squares are blockSize+5 on a side). */
  blockSize: number;
  /** Distance between consecutive road lines (block + road). */
  spacing: number;
  /** Centre of the open plaza, left lighter on clutter. */
  chowk: { x: number; z: number };
  /** Half-extent of the playable world; nothing spawns outside it. */
  worldLimit: number;
  /**
   * World Y of the pavement top surface (city.ts's kerb block sits at 0.22,
   * a 0.22-thick slab centred at y=0.11). Every ground-level prop is placed
   * here, not at y=0 — get this wrong and short props (kerb chips, drain
   * covers, puddles) end up buried under the pavement slab and invisible.
   */
  pavementY?: number;
  /**
   * Global multiplier on every prop count. The per-type weights are tuned for
   * a maximally busy street; anything below 1 thins the whole scatter evenly,
   * which is what you want when the street should read as lived-in rather than
   * as a jumble sale. Defaults to 1.
   */
  density?: number;
  /** Deterministic seed so the street looks the same on every reload. */
  seed?: number;
};

export type Clutter = {
  group: THREE.Group;
  instanceCount: number;
  drawCalls: number;
  dispose(): void;
};

/* ------------------------------------------------------------------ *
 * Small deterministic PRNG (self-contained, no import from props.ts)
 * ------------------------------------------------------------------ */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Geometry helpers — bake a transform + vertex colour into a primitive
 * so a pile of them can be merged into one BufferGeometry.
 * ------------------------------------------------------------------ */

function colourize(geoIn: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  // Polyhedron geometries (Icosahedron etc.) are non-indexed by construction
  // while Box/Cylinder/Plane geometries are indexed. mergeGeometries()
  // silently returns null (just a console.error, no throw) when a merge
  // list mixes the two, so every part is normalised to non-indexed here —
  // the single place all prop primitives pass through before merging.
  const geo = geoIn.index ? geoIn.toNonIndexed() : geoIn;
  if (geo !== geoIn) geoIn.dispose();
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  colour: THREE.Color,
  ry = 0
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return colourize(g, colour);
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  seg: number,
  x: number,
  y: number,
  z: number,
  colour: THREE.Color
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return colourize(g, colour);
}

function ico(
  r: number,
  detail: number,
  x: number,
  y: number,
  z: number,
  colour: THREE.Color,
  scaleXYZ: [number, number, number] = [1, 1, 1]
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(scaleXYZ[0], scaleXYZ[1], scaleXYZ[2]);
  g.translate(x, y, z);
  return colourize(g, colour);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!g) throw new Error("clutter.ts: mergeGeometries failed — incompatible attributes in part list");
  return g;
}

/** Own, private material — never touch a MaterialLibrary-cached material,
 * those are shared across the whole city and mutating them (e.g. flipping
 * vertexColors) would corrupt buildings/roads that use the same cache. */
function ownMat(roughness = 0.85, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
}

/* ------------------------------------------------------------------ *
 * Placement helpers
 * ------------------------------------------------------------------ */

type Placer = {
  onRoad(x: number, z: number, margin?: number): boolean;
  onBuilding(x: number, z: number, margin?: number): boolean;
  free(x: number, z: number, margin?: number): boolean;
  inBounds(x: number, z: number): boolean;
};

function makePlacer(opts: ClutterOpts): Placer {
  const half = opts.roadWidth / 2;
  return {
    onRoad(x, z, margin = 0) {
      for (const c of opts.roadLines) {
        if (Math.abs(x - c) < half + margin) return true;
        if (Math.abs(z - c) < half + margin) return true;
      }
      return false;
    },
    onBuilding(x, z, margin = 0.4) {
      for (const b of opts.colliders) {
        if (Math.abs(x - b.x) < b.hw + margin && Math.abs(z - b.z) < b.hd + margin) return true;
      }
      return false;
    },
    free(x, z, margin = 0.4) {
      if (!this.inBounds(x, z)) return false;
      if (this.onRoad(x, z, margin)) return false;
      if (this.onBuilding(x, z, margin)) return false;
      return true;
    },
    inBounds(x, z) {
      return Math.abs(x) < opts.worldLimit && Math.abs(z) < opts.worldLimit;
    },
  };
}

/** Pavement squares reconstructed from adjacent road lines, the same maths
 * city.ts uses for its kerb blocks — but derived from the lines array so
 * this file never needs GRID/BLOCK constants of its own. */
function pavementSquares(opts: ClutterOpts): { cx: number; cz: number; half: number }[] {
  const lines = [...opts.roadLines].sort((a, b) => a - b);
  const out: { cx: number; cz: number; half: number }[] = [];
  const half = (opts.blockSize + 5) / 2;
  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      out.push({ cx: (lines[i] + lines[i + 1]) / 2, cz: (lines[j] + lines[j + 1]) / 2, half });
    }
  }
  return out;
}

/** Kerb-line runs: for every road line, both edges, as a set of straight
 * segments so poles/wires/kerb chips can walk along them. */
function kerbRuns(opts: ClutterOpts): { fixed: number; axis: "x" | "z"; side: 1 | -1 }[] {
  const runs: { fixed: number; axis: "x" | "z"; side: 1 | -1 }[] = [];
  for (const c of opts.roadLines) {
    // Road running north-south at x=c: kerbs run along z, offset in x.
    runs.push({ fixed: c, axis: "z", side: 1 });
    runs.push({ fixed: c, axis: "z", side: -1 });
    // Road running east-west at z=c: kerbs run along x, offset in z.
    runs.push({ fixed: c, axis: "x", side: 1 });
    runs.push({ fixed: c, axis: "x", side: -1 });
  }
  return runs;
}

/** Every road intersection, the natural place for rubbish/carts to gather. */
function intersections(opts: ClutterOpts): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const a of opts.roadLines) for (const b of opts.roadLines) out.push({ x: a, z: b });
  return out;
}

/* ------------------------------------------------------------------ *
 * District weighting
 * ------------------------------------------------------------------ */

type Weights = Record<string, number>;

function districtWeights(landmark: Theme["landmark"]): Weights {
  const base: Weights = {
    pole: 1, wire: 1, bulb: 1, transformerBox: 1,
    groundPatch: 1, drainCover: 1, puddle: 1, rubble: 1,
    cart: 1, chairStack: 1, drum: 1, rubbishPile: 1, tyreStack: 1,
    sackBundle: 1, gasCylinder: 1, crate: 1, paanStall: 1,
    signboard: 1, poster: 1, barberPole: 1, hoarding: 1,
    pottedPlant: 1, bananaClump: 1, weed: 1,
    bicycle: 1, scooter: 1, coveredVehicle: 1,
  };
  switch (landmark) {
    case "delhi":
      return { ...base, pole: 1.6, wire: 1.7, bulb: 1.5, cart: 1.6, poster: 1.8, sackBundle: 1.3 };
    case "chennai":
      return { ...base, crate: 2.0, rubbishPile: 0.7, bananaClump: 1.6, sackBundle: 1.6, tyreStack: 0.6, poster: 0.7 };
    case "bengaluru":
      return { ...base, pole: 1.3, scooter: 1.9, puddle: 2.2, groundPatch: 1.4, hoarding: 1.6, drum: 1.3 };
    case "kolkata":
      return { ...base, wire: 1.9, poster: 2.0, pottedPlant: 1.5, cart: 1.3, sackBundle: 1.2 };

    // Every landmark value must appear here. The six seed districts used to
    // borrow one of the four above; once they got their own Landmark values
    // they silently fell through to the flat base weights and lost their
    // street character.
    case "hyderabad":
      return { ...base, pole: 1.5, wire: 1.6, cart: 1.7, paanStall: 1.8, poster: 1.4, drum: 1.3 };
    case "kochi":
      return { ...base, crate: 2.1, sackBundle: 1.8, bananaClump: 1.9, puddle: 1.5, weed: 1.4, tyreStack: 0.5 };
    case "mumbai":
      return { ...base, pole: 1.4, wire: 1.8, hoarding: 1.9, scooter: 1.7, rubbishPile: 1.4, poster: 1.5 };
    case "ahmedabad":
      return { ...base, cart: 1.8, chairStack: 1.6, paanStall: 1.5, pottedPlant: 1.4, sackBundle: 1.4 };
    case "amritsar":
      return { ...base, cart: 1.6, drum: 1.5, sackBundle: 1.7, signboard: 1.6, gasCylinder: 1.4 };
    case "bhubaneswar":
      return { ...base, bananaClump: 1.7, weed: 1.6, pottedPlant: 1.6, groundPatch: 1.3, bicycle: 1.5 };
  }
}

/* ------------------------------------------------------------------ *
 * Prop geometry builders
 * ------------------------------------------------------------------ */

const C = (hex: number) => new THREE.Color(hex);

function buildPoleGeo(): THREE.BufferGeometry {
  // Base at the origin so instance transforms tilt it about its foot.
  return merge([cyl(0.055, 0.09, 6.2, 7, 0, 3.1, 0, C(0x5a5850))]);
}

function buildTransformerGeo(): THREE.BufferGeometry {
  return merge([
    box(0.7, 0.5, 0.45, 0, 0.25, 0, C(0x4a5a44)),
    box(0.76, 0.06, 0.5, 0, 0.5, 0, C(0x2c332a)),
    box(0.1, 0.1, 0.1, -0.2, 0.55, 0.24, C(0x2a2a2a)),
    box(0.1, 0.1, 0.1, 0.2, 0.55, 0.24, C(0x2a2a2a)),
  ]);
}

/** A tube along a real catenary curve for one fixed span length. Reused via
 * InstancedMesh for every pole-to-pole gap of that span. */
function buildWireGeo(span: number, sagDepth: number, radius = 0.025): THREE.BufferGeometry {
  const samples = 16;
  const pts: THREE.Vector3[] = [];
  // y = a * cosh(x/a) shifted so endpoints sit at y=0 and the midpoint sags
  // by sagDepth. Solve `a` numerically for the target sag, few iterations
  // of bisection is plenty for a decoration.
  const half = span / 2;
  let a = span; // seed guess
  for (let iter = 0; iter < 30; iter++) {
    const sag = a * (Math.cosh(half / a) - 1);
    if (sag > sagDepth) a *= 1.08;
    else a *= 0.93;
  }
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = -half + t * span;
    const y = -(a * (Math.cosh(x / a) - 1));
    pts.push(new THREE.Vector3(x + half, y, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 24, radius, 5, false);
  return colourize(g, C(0x1c1c1c));
}

function buildBulbGeo(): THREE.BufferGeometry {
  return merge([
    cyl(0.02, 0.02, 0.18, 5, 0, -0.09, 0, C(0x2a2a2a)),
    ico(0.055, 0, 0, -0.2, 0, C(0xfff0b0)),
  ]);
}

function buildGroundPatchGeo(): THREE.BufferGeometry {
  // Unit box, foot at y=0. Scaled wildly per-instance to serve as kerb
  // chips, broken paving slabs AND loose bricks, tinted per-instance.
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return colourize(g, C(0xffffff));
}

function buildDrainCoverGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [cyl(0.42, 0.42, 0.06, 14, 0, 0.03, 0, C(0x35342f))];
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) * Math.PI - Math.PI / 2;
    parts.push(box(0.04, 0.03, 0.74, Math.cos(t) * 0.0, 0.065, 0, C(0x232219), t));
  }
  return merge(parts);
}

function buildPuddleGeo(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 16);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.012, 0);
  return colourize(g, C(0x1b2126));
}

function buildRubbleGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(7);
  for (let i = 0; i < 6; i++) {
    const s = 0.14 + r() * 0.22;
    parts.push(
      ico(
        s, 0,
        (r() - 0.5) * 0.6, s * 0.6, (r() - 0.5) * 0.6,
        C(0x8a8378).lerp(C(0x5a544a), r()),
        [1, 0.7 + r() * 0.3, 1]
      )
    );
  }
  return merge(parts);
}

function buildSackBundleGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(11);
  const colours = [0xb8a066, 0xa08a52, 0x8f6b45];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.32;
    parts.push(ico(0.34, 0, x, 0.3 + r() * 0.05, 0, C(colours[i % colours.length]), [1, 0.75, 1.1]));
  }
  return merge(parts);
}

function buildCartGeo(): THREE.BufferGeometry {
  const wood = C(0x7a5230);
  const dark = C(0x241f1a);
  const parts: THREE.BufferGeometry[] = [
    box(1.9, 0.1, 1.1, 0, 0.62, 0, wood),
    box(1.9, 0.35, 0.06, 0, 0.85, 0.55, wood),
    box(1.9, 0.35, 0.06, 0, 0.85, -0.55, wood),
    box(0.06, 0.35, 1.1, 0.95, 0.85, 0, wood),
    box(0.06, 0.35, 1.1, -0.95, 0.85, 0, wood),
    box(0.08, 0.5, 0.08, 0.85, 0.32, 0.45, dark),
    box(0.08, 0.5, 0.08, 0.85, 0.32, -0.45, dark),
    box(0.08, 0.5, 0.08, -0.85, 0.32, 0.45, dark),
    box(0.08, 0.5, 0.08, -0.85, 0.32, -0.45, dark),
    cyl(0.32, 0.32, 0.09, 12, 0.6, 0.32, 0.62, dark),
    cyl(0.32, 0.32, 0.09, 12, -0.6, 0.32, 0.62, dark),
    box(1.6, 0.06, 0.06, 0.0, 0.55, 1.05, wood),
  ];
  return merge(parts);
}

function buildChairStackGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(19);
  const base = [0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22];
  for (let i = 0; i < 6; i++) {
    const y = 0.12 + i * 0.14;
    const c = C(base[i % base.length]);
    parts.push(box(0.5, 0.05, 0.5, 0, y, 0, c));
    parts.push(box(0.5, 0.28, 0.05, 0, y + 0.16, -0.22, c));
  }
  void r;
  return merge(parts);
}

function buildDrumGeo(): THREE.BufferGeometry {
  const body = C(0x2f6b8f);
  const ring = C(0x1c1c1c);
  return merge([
    cyl(0.34, 0.34, 0.9, 14, 0, 0.45, 0, body),
    cyl(0.36, 0.36, 0.06, 14, 0, 0.15, 0, ring),
    cyl(0.36, 0.36, 0.06, 14, 0, 0.75, 0, ring),
  ]);
}

function buildRubbishPileGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(23);
  for (let i = 0; i < 8; i++) {
    const s = 0.12 + r() * 0.2;
    const tone = 0.25 + r() * 0.35;
    parts.push(
      ico(s, 0, (r() - 0.5) * 0.9, s * 0.5, (r() - 0.5) * 0.7, new THREE.Color(tone, tone * 0.9, tone * 0.7), [1, 0.6, 1])
    );
  }
  return merge(parts);
}

function buildTyreStackGeo(): THREE.BufferGeometry {
  const black = C(0x111111);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const y = 0.16 + i * 0.32;
    parts.push(cyl(0.4, 0.4, 0.28, 16, 0, y, 0, black));
  }
  return merge(parts);
}

function buildGasCylinderGeo(): THREE.BufferGeometry {
  return merge([
    cyl(0.22, 0.22, 0.75, 12, 0, 0.5, 0, C(0xb23a2e)),
    cyl(0.14, 0.22, 0.12, 12, 0, 0.93, 0, C(0xb23a2e)),
    cyl(0.05, 0.05, 0.1, 8, 0, 1.02, 0, C(0x3a3a3a)),
  ]);
}

function buildCrateGeo(): THREE.BufferGeometry {
  const wood = C(0x8a6a3f);
  const bottle = C(0x2f6b45);
  const parts: THREE.BufferGeometry[] = [
    box(0.55, 0.32, 0.4, 0, 0.16, 0, wood),
    box(0.55, 0.02, 0.02, 0, 0.32, 0.19, wood),
    box(0.55, 0.02, 0.02, 0, 0.32, -0.19, wood),
  ];
  const r = rng(31);
  for (let i = 0; i < 6; i++) {
    const gx = (i % 3) * 0.18 - 0.18;
    const gz = Math.floor(i / 3) * 0.18 - 0.09;
    parts.push(cyl(0.05, 0.06, 0.28 + r() * 0.04, 8, gx, 0.34, gz, bottle));
  }
  return merge(parts);
}

function buildPaanStallGeo(): THREE.BufferGeometry {
  const wood = C(0x6b4a2e);
  const bright = C(0xd94f4f);
  return merge([
    box(1.3, 0.9, 0.55, 0, 0.45, 0, wood),
    box(1.36, 0.06, 0.6, 0, 0.9, 0, wood),
    box(1.32, 0.35, 0.05, 0, 1.1, -0.26, bright),
    box(0.05, 0.9, 0.05, -0.6, 0.45, 0.24, C(0x2a2018)),
    box(0.05, 0.9, 0.05, 0.6, 0.45, 0.24, C(0x2a2018)),
  ]);
}

function buildSignboardGeo(): THREE.BufferGeometry {
  const r = rng(41);
  const colours = [0xd94f4f, 0x2f8f5a, 0xe0a52f, 0x2f6f9f, 0xf2f2ec];
  const c = C(colours[Math.floor(r() * colours.length)]);
  return merge([
    box(1.5, 0.55, 0.06, 0, 0, 0, c),
    box(0.05, 0.4, 0.05, -0.5, -0.4, 0.15, C(0x2a2a2a)),
    box(0.05, 0.4, 0.05, 0.5, -0.4, 0.15, C(0x2a2a2a)),
  ]);
}

function buildPosterGeo(): THREE.BufferGeometry {
  const r = rng(43);
  const colours = [0xc0392b, 0xf1c40f, 0x2980b9, 0x27ae60, 0xecf0f1, 0x8e44ad];
  const c = C(colours[Math.floor(r() * colours.length)]);
  const g = new THREE.PlaneGeometry(1, 1.4);
  return colourize(g, c);
}

export function buildBarberPoleGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stripes = [0xd94f4f, 0xffffff, 0x2f6f9f];
  for (let i = 0; i < 9; i++) {
    parts.push(cyl(0.09, 0.09, 0.14, 10, 0, 0.07 + i * 0.14, 0, C(stripes[i % 3])));
  }
  parts.push(cyl(0.1, 0.1, 0.08, 10, 0, 1.34, 0, C(0xd9c090)));
  return merge(parts);
}

function buildHoardingGeo(): THREE.BufferGeometry {
  const leg = C(0x4a5057);
  const r = rng(47);
  const panels = [0x1f6feb, 0x8957e5, 0x1a7f64, 0xd94f4f];
  const panel = C(panels[Math.floor(r() * panels.length)]);
  return merge([
    cyl(0.08, 0.1, 4, 6, -1.6, 2, 0, leg),
    cyl(0.08, 0.1, 4, 6, 1.6, 2, 0, leg),
    box(4.2, 1.9, 0.14, 0, 4.6, 0, panel),
    box(3.8, 0.3, 0.16, 0, 4.2, 0.03, C(0xf5f0dc)),
  ]);
}

function buildPottedPlantGeo(leafColour: number): THREE.BufferGeometry {
  const pot = C(0x9a5a3a);
  const leaf = C(leafColour);
  const parts: THREE.BufferGeometry[] = [cyl(0.22, 0.16, 0.32, 10, 0, 0.16, 0, pot)];
  const r = rng(53);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(
      ico(0.16 + r() * 0.08, 0, Math.cos(a) * 0.14, 0.42 + r() * 0.18, Math.sin(a) * 0.14, leaf, [1, 1.4, 1])
    );
  }
  return merge(parts);
}

function buildBananaClumpGeo(): THREE.BufferGeometry {
  const trunk = C(0x4a6b3a);
  const leaf = C(0x3d7a3a);
  const parts: THREE.BufferGeometry[] = [cyl(0.12, 0.16, 1.6, 8, 0, 0.8, 0, trunk)];
  const r = rng(59);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const g = new THREE.PlaneGeometry(0.5, 1.3);
    g.rotateX(-0.5);
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.3, 1.5, Math.sin(a) * 0.3);
    parts.push(colourize(g, leaf));
  }
  return merge(parts);
}

function buildWeedGeo(): THREE.BufferGeometry {
  const leaf = C(0x4f7a3a);
  const a = new THREE.PlaneGeometry(0.05, 0.32);
  a.translate(0, 0.16, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return merge([colourize(a, leaf), colourize(b, leaf.clone())]);
}

function buildBicycleGeo(): THREE.BufferGeometry {
  const frame = C(0x2a2a2a);
  const parts: THREE.BufferGeometry[] = [
    cyl(0.32, 0.32, 0.03, 16, -0.45, 0.32, 0, frame),
    cyl(0.32, 0.32, 0.03, 16, 0.45, 0.32, 0, frame),
    box(0.9, 0.04, 0.04, 0, 0.55, 0, frame),
    box(0.04, 0.4, 0.04, -0.45, 0.32, 0, frame, 0.5),
    box(0.04, 0.5, 0.04, 0.45, 0.4, 0, frame, -0.3),
    box(0.3, 0.03, 0.03, 0.45, 0.85, 0, frame),
  ];
  return merge(parts);
}

function buildScooterGeo(): THREE.BufferGeometry {
  const body = C(0x445566);
  const dark = C(0x1c1c1c);
  return merge([
    cyl(0.24, 0.24, 0.06, 14, -0.5, 0.24, 0, dark),
    cyl(0.24, 0.24, 0.06, 14, 0.5, 0.24, 0, dark),
    box(1.1, 0.4, 0.4, 0, 0.5, 0, body),
    box(0.06, 0.5, 0.4, 0.5, 0.75, 0, body),
    box(0.4, 0.06, 0.06, 0.5, 1.0, 0, dark),
  ]);
}

function buildCoveredVehicleGeo(tarpColour: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1.1, 0.65, 2.0);
  g.translate(0, 0.05, 0);
  return colourize(g, C(tarpColour));
}

/* ------------------------------------------------------------------ *
 * Generic InstancedMesh spawner
 * ------------------------------------------------------------------ */

/** A placer returns `false` to reject a candidate, `true` to accept it with
 * no colour override, or a THREE.Color to accept it AND tint that instance
 * (used for props sharing one geometry/material across several "kinds"). */
type PlaceResult = boolean | THREE.Color;
type SpawnFn = (i: number, dummy: THREE.Object3D, r: () => number) => PlaceResult;

function spawn(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  wanted: number,
  r: () => number,
  place: SpawnFn
): number {
  if (wanted <= 0 || !geo.attributes.position) return 0;
  const mesh = new THREE.InstancedMesh(geo, mat, wanted);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const colours: (THREE.Color | null)[] = [];
  let anyColour = false;
  let n = 0;
  // Give placement a generous number of attempts: many candidates get
  // rejected for overlapping a building or a road, so wanted != placed.
  const maxAttempts = wanted * 6;
  for (let attempt = 0; attempt < maxAttempts && n < wanted; attempt++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    const res = place(n, dummy, r);
    if (res) {
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      if (res instanceof THREE.Color) {
        colours[n] = res;
        anyColour = true;
      } else {
        colours[n] = null;
      }
      n++;
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (anyColour) {
    const arr = new Float32Array(n * 3).fill(1);
    for (let i = 0; i < n; i++) {
      const c = colours[i];
      if (c) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(arr, 3);
  }
  if (n > 0) group.add(mesh);
  else mesh.geometry.dispose();
  return n;
}

/* ------------------------------------------------------------------ *
 * createClutter
 * ------------------------------------------------------------------ */

export function createClutter(
  scene: THREE.Object3D,
  theme: Theme,
  mats: MaterialLibrary | undefined,
  opts: ClutterOpts
): Clutter {
  const group = new THREE.Group();
  group.name = "clutter";
  const GY = opts.pavementY ?? 0.22;
  const r = rng(opts.seed ?? 20260726);
  const P = makePlacer(opts);
  const W = districtWeights(theme.landmark);
  // Scaling the weights rather than each call site keeps `density` honest: it
  // thins every prop type by the same proportion, so the district's character
  // (Bengaluru's scooters, Kolkata's wires) survives at any density.
  const density = opts.density ?? 1;
  if (density !== 1) for (const k of Object.keys(W)) W[k] *= density;
  const squares = pavementSquares(opts);
  const runs = kerbRuns(opts);
  const nodes = intersections(opts);
  const facades = opts.facades ?? opts.colliders;

  let instanceCount = 0;
  let drawCalls = 0;
  const track = (n: number) => {
    instanceCount += n;
    if (n > 0) drawCalls++;
  };

  const disposables: THREE.BufferGeometry[] = [];
  const track_ = (g: THREE.BufferGeometry) => {
    disposables.push(g);
    return g;
  };

  const metalMat = mats ? mats.tint("rusted_metal", 0x6b6f66, 3) : new THREE.MeshLambertMaterial({ color: 0x6b6f66 });

  /* ------------------------------------------------------------- *
   * OVERHEAD: poles + sagging wires + festoon bulbs + transformers
   * ------------------------------------------------------------- */

  const poleStep = 11;
  type PoleRec = { x: number; z: number; axis: "x" | "z"; side: 1 | -1; run: number };
  const poles: PoleRec[] = [];

  for (const run of runs) {
    const runIdx = runs.indexOf(run);
    const off = opts.roadWidth / 2 + 1.0;
    for (let t = -opts.worldLimit + 8; t < opts.worldLimit; t += poleStep) {
      const x = run.axis === "z" ? run.fixed + off * run.side : t;
      const z = run.axis === "x" ? run.fixed + off * run.side : t;
      if (!P.inBounds(x, z)) continue;
      if (P.onBuilding(x, z, 0.6)) continue;
      poles.push({ x, z, axis: run.axis, side: run.side, run: runIdx });
    }
  }

  {
    const geo = track_(buildPoleGeo());
    const mat = metalMat;
    const wanted = Math.round(poles.length * W.pole);
    const list = poles.slice(0, Math.min(poles.length, wanted));
    const n = spawn(group, geo, mat, list.length, r, (i, d, rr) => {
      const p = list[i];
      d.position.set(p.x, GY, p.z);
      d.rotation.set((rr() - 0.5) * 0.05, rr() * Math.PI * 2, (rr() - 0.5) * 0.05);
      const s = 0.85 + rr() * 0.3;
      d.scale.set(s, s, s);
      return true;
    });
    track(n);
  }

  // Wires: connect consecutive poles along the same run.
  {
    const wireGeo = track_(buildWireGeo(poleStep, 0.9));
    const wireMat = ownMat(0.6, 0.4);
    const byRun = new Map<number, PoleRec[]>();
    for (const p of poles) {
      if (!byRun.has(p.run)) byRun.set(p.run, []);
      byRun.get(p.run)!.push(p);
    }
    const spans: { x: number; z: number; ang: number }[] = [];
    for (const list of byRun.values()) {
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i];
        const b = list[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist > poleStep * 1.4) continue; // gap too big, poles not adjacent
        spans.push({ x: a.x, z: a.z, ang: Math.atan2(dz, dx) });
      }
    }
    const wanted = Math.round(spans.length * W.wire);
    const list = spans.slice(0, Math.min(spans.length, wanted));
    const n = spawn(group, wireGeo, wireMat, list.length, r, (i, d) => {
      const s = list[i];
      d.position.set(s.x, GY + 5.6, s.z);
      d.rotation.y = -s.ang;
      return true;
    });
    track(n);

    // Festoon bulbs sampled along the same catenary shape as the wire.
    const bulbGeo = track_(buildBulbGeo());
    const bulbMat = ownMat(0.4, 0.2);
    const bulbSamples: { x: number; y: number; z: number }[] = [];
    const half = poleStep / 2;
    let a = poleStep;
    for (let iter = 0; iter < 30; iter++) {
      const sag = a * (Math.cosh(half / a) - 1);
      if (sag > 0.9) a *= 1.08;
      else a *= 0.93;
    }
    for (const s of list) {
      for (const t of [0.25, 0.5, 0.75]) {
        const x = -half + t * poleStep;
        const y = -(a * (Math.cosh(x / a) - 1));
        const along = x + half;
        bulbSamples.push({
          x: s.x + Math.cos(s.ang) * along,
          y: GY + 5.6 + y,
          z: s.z + Math.sin(s.ang) * along,
        });
      }
    }
    const bWanted = Math.round(bulbSamples.length * W.bulb);
    const bList = bulbSamples.slice(0, Math.min(bulbSamples.length, bWanted));
    const bn = spawn(group, bulbGeo, bulbMat, bList.length, r, (i, d) => {
      const p = bList[i];
      d.position.set(p.x, p.y, p.z);
      return true;
    });
    track(bn);
  }

  // Transformer boxes: mounted on roughly every 4th pole.
  {
    const geo = track_(buildTransformerGeo());
    const wanted = Math.round((poles.length / 4) * W.transformerBox);
    const n = spawn(group, geo, metalMat, wanted, r, (i, d, rr) => {
      const p = poles[Math.floor(rr() * poles.length)];
      if (!p) return false;
      d.position.set(p.x, GY + 3.2 + rr() * 0.4, p.z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  /* ------------------------------------------------------------- *
   * GROUND: kerb chips / broken paving / bricks, drain covers, puddles, rubble
   * ------------------------------------------------------------- */

  {
    const geo = track_(buildGroundPatchGeo());
    const mat = ownMat(0.95, 0.02);
    const wanted = Math.round(squares.length * 9 * W.groundPatch);
    const n = spawn(group, geo, mat, wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.8;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.8;
      if (!P.free(x, z, 0.3)) return false;
      const kind = rr();
      if (kind < 0.4) {
        // kerb chip: small pale cube
        d.scale.set(0.22 + rr() * 0.1, 0.12 + rr() * 0.06, 0.22 + rr() * 0.1);
      } else if (kind < 0.75) {
        // broken paving patch: wide, thin, dark
        d.scale.set(0.6 + rr() * 0.5, 0.04, 0.5 + rr() * 0.4);
      } else {
        // loose brick
        d.scale.set(0.2, 0.1, 0.42);
      }
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      const tone = kind < 0.4 ? 0.75 + rr() * 0.15 : kind < 0.75 ? 0.15 + rr() * 0.1 : 0.5 + rr() * 0.15;
      return kind < 0.75
        ? new THREE.Color(tone, tone, tone)
        : new THREE.Color(tone, tone * 0.55, tone * 0.4);
    });
    track(n);
  }

  {
    const geo = track_(buildDrainCoverGeo());
    const wanted = Math.round(squares.length * 2.4 * W.drainCover);
    const n = spawn(group, geo, metalMat, wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.6;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.6;
      if (!P.free(x, z, 0.5)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildPuddleGeo());
    const mat = ownMat(0.08, 0.6);
    const wanted = Math.round(squares.length * 2.2 * W.puddle);
    const n = spawn(group, geo, mat, wanted, r, (i, d, rr) => {
      const run = runs[Math.floor(rr() * runs.length)];
      const off = opts.roadWidth / 2 + 0.6 + rr() * 1.5;
      const t = (rr() - 0.5) * opts.worldLimit * 1.8;
      const x = run.axis === "z" ? run.fixed + off * run.side : t;
      const z = run.axis === "x" ? run.fixed + off * run.side : t;
      if (!P.free(x, z, 0.3)) return false;
      const s = 0.5 + rr() * 1.1;
      d.scale.set(s, 1, s * (0.7 + rr() * 0.5));
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildRubbleGeo());
    const wanted = Math.round(squares.length * 1.6 * W.rubble);
    const n = spawn(group, geo, ownMat(), wanted, r, (i, d, rr) => {
      const node = nodes[Math.floor(rr() * nodes.length)];
      const ang = rr() * Math.PI * 2;
      const dist = opts.roadWidth / 2 + 1.5 + rr() * 3;
      const x = node.x + Math.cos(ang) * dist;
      const z = node.z + Math.sin(ang) * dist;
      if (!P.free(x, z, 0.5)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      const s = 0.7 + rr() * 0.6;
      d.scale.set(s, s, s);
      return true;
    });
    track(n);
  }

  /* ------------------------------------------------------------- *
   * STREET FURNITURE: clusters at corners + near the chowk
   * ------------------------------------------------------------- */

  function furnitureCluster(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    perNode: number,
    weight: number,
    scaleJitter = 0.15
  ) {
    const wanted = Math.round(nodes.length * perNode * weight);
    const n = spawn(group, geo, mat, wanted, r, (i, d, rr) => {
      const node = nodes[Math.floor(rr() * nodes.length)];
      const ang = rr() * Math.PI * 2;
      const dist = opts.roadWidth / 2 + 1.2 + rr() * 2.5;
      const x = node.x + Math.cos(ang) * dist;
      const z = node.z + Math.sin(ang) * dist;
      if (!P.free(x, z, 0.6)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      const s = 1 - scaleJitter / 2 + rr() * scaleJitter;
      d.scale.set(s, s, s);
      return true;
    });
    track(n);
  }

  furnitureCluster(track_(buildCartGeo()), ownMat(), 0.45, W.cart);
  furnitureCluster(track_(buildChairStackGeo()), ownMat(0.7), 0.35, W.chairStack);
  furnitureCluster(track_(buildDrumGeo()), ownMat(0.6, 0.3), 0.35, W.drum);
  furnitureCluster(track_(buildRubbishPileGeo()), ownMat(), 0.6, W.rubbishPile, 0.4);
  furnitureCluster(track_(buildTyreStackGeo()), ownMat(0.9), 0.3, W.tyreStack);
  furnitureCluster(track_(buildSackBundleGeo()), ownMat(), 0.5, W.sackBundle);
  furnitureCluster(track_(buildGasCylinderGeo()), ownMat(0.4, 0.6), 0.3, W.gasCylinder);
  furnitureCluster(track_(buildCrateGeo()), ownMat(), 0.5, W.crate);

  {
    // Paan stalls: a few, near the chowk specifically.
    const geo = track_(buildPaanStallGeo());
    const wanted = Math.max(2, Math.round(3 * W.paanStall));
    const n = spawn(group, geo, ownMat(), wanted, r, (i, d, rr) => {
      const ang = rr() * Math.PI * 2;
      const dist = opts.blockSize * 0.3 + rr() * opts.blockSize * 0.3;
      const x = opts.chowk.x + Math.cos(ang) * dist;
      const z = opts.chowk.z + Math.sin(ang) * dist;
      if (!P.free(x, z, 0.8)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  /* ------------------------------------------------------------- *
   * SIGNAGE: mounted on / near building facades
   * ------------------------------------------------------------- */

  function facadePoint(b: Box, rr: () => number): { x: number; z: number; ny: number } {
    // Pick one of the four sides, biased to the two long ones.
    const side = Math.floor(rr() * 4);
    const along = (rr() - 0.5) * 1.6;
    switch (side) {
      case 0: return { x: b.x + along * b.hw, z: b.z + b.hd + 0.12, ny: 0 };
      case 1: return { x: b.x + along * b.hw, z: b.z - b.hd - 0.12, ny: Math.PI };
      case 2: return { x: b.x + b.hw + 0.12, z: b.z + along * b.hd, ny: -Math.PI / 2 };
      default: return { x: b.x - b.hw - 0.12, z: b.z + along * b.hd, ny: Math.PI / 2 };
    }
  }

  {
    const geo = track_(buildSignboardGeo());
    const wanted = Math.round(facades.length * 0.9 * W.signboard);
    const n = spawn(group, geo, ownMat(0.6), wanted, r, (i, d, rr) => {
      const b = facades[Math.floor(rr() * facades.length)];
      const p = facadePoint(b, rr);
      d.position.set(p.x, GY + 3.4 + rr() * 1.2, p.z);
      d.rotation.y = p.ny;
      const s = 0.8 + rr() * 0.5;
      d.scale.set(s, s, 1);
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildPosterGeo());
    const wanted = Math.round(facades.length * 1.6 * W.poster);
    const n = spawn(group, geo, ownMat(0.9), wanted, r, (i, d, rr) => {
      const b = facades[Math.floor(rr() * facades.length)];
      const p = facadePoint(b, rr);
      d.position.set(p.x, GY + 1.4 + rr() * 1.4, p.z);
      d.rotation.y = p.ny;
      // occasionally scale up into a wall-advertising panel
      const big = rr() > 0.8;
      const s = big ? 1.8 + rr() * 0.6 : 0.6 + rr() * 0.3;
      d.scale.set(s, s * (big ? 0.6 : 1), 1);
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildBarberPoleGeo());
    const wanted = Math.max(1, Math.round(facades.length * 0.06 * W.barberPole));
    const n = spawn(group, geo, ownMat(0.5), wanted, r, (i, d, rr) => {
      const b = facades[Math.floor(rr() * facades.length)];
      const p = facadePoint(b, rr);
      d.position.set(p.x, GY, p.z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildHoardingGeo());
    const wanted = Math.max(1, Math.round(facades.length * 0.1 * W.hoarding));
    const n = spawn(group, geo, ownMat(0.4), wanted, r, (i, d, rr) => {
      const b = facades[Math.floor(rr() * facades.length)];
      const p = facadePoint(b, rr);
      // approximate roof height from footprint; real height isn't passed in
      const roofY = GY + 8 + rr() * 8;
      d.position.set(p.x, roofY, p.z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  /* ------------------------------------------------------------- *
   * VEGETATION
   * ------------------------------------------------------------- */

  {
    const geo = track_(buildPottedPlantGeo(theme.leaf));
    const wanted = Math.round(squares.length * 2.4 * W.pottedPlant);
    const n = spawn(group, geo, ownMat(), wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.7;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.7;
      if (!P.free(x, z, 0.5)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      const s = 0.8 + rr() * 0.4;
      d.scale.set(s, s, s);
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildBananaClumpGeo());
    const wanted = Math.max(1, Math.round(squares.length * 0.6 * W.bananaClump));
    const n = spawn(group, geo, ownMat(), wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.6;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.6;
      if (!P.free(x, z, 0.7)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildWeedGeo());
    const wanted = Math.round(squares.length * 14 * W.weed);
    const n = spawn(group, geo, ownMat(1, 0), wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.95;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.95;
      if (P.onBuilding(x, z, 0.2)) return false;
      if (!P.inBounds(x, z)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      const s = 0.6 + rr() * 0.8;
      d.scale.set(s, s, s);
      return true;
    });
    track(n);
  }

  /* ------------------------------------------------------------- *
   * PARKED: bicycles, scooters, a covered vehicle
   * ------------------------------------------------------------- */

  {
    const geo = track_(buildBicycleGeo());
    const wanted = Math.round(facades.length * 0.4 * W.bicycle);
    const n = spawn(group, geo, ownMat(0.5), wanted, r, (i, d, rr) => {
      const b = facades[Math.floor(rr() * facades.length)];
      const p = facadePoint(b, rr);
      d.position.set(p.x, GY, p.z);
      d.rotation.y = p.ny + (rr() - 0.5) * 0.4;
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildScooterGeo());
    const wanted = Math.round(squares.length * 1.2 * W.scooter);
    const n = spawn(group, geo, ownMat(0.55), wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.7;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.7;
      if (!P.free(x, z, 0.6)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  {
    const geo = track_(buildCoveredVehicleGeo(theme.canopies[0] ?? 0x3a4a5a));
    const wanted = Math.max(1, Math.round(squares.length * 0.3 * W.coveredVehicle));
    const n = spawn(group, geo, ownMat(0.9), wanted, r, (i, d, rr) => {
      const sq = squares[Math.floor(rr() * squares.length)];
      const x = sq.cx + (rr() - 0.5) * sq.half * 1.5;
      const z = sq.cz + (rr() - 0.5) * sq.half * 1.5;
      if (!P.free(x, z, 1.2)) return false;
      d.position.set(x, GY, z);
      d.rotation.y = rr() * Math.PI * 2;
      return true;
    });
    track(n);
  }

  scene.add(group);

  return {
    group,
    instanceCount,
    drawCalls,
    dispose() {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      disposables.forEach((g) => g.dispose());
    },
  };
}
