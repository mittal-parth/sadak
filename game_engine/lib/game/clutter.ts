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

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Where props can go, derived from the district map by the world builder.
 * Placement never looks at the street network itself; it only asks for
 * these, which keeps this file about props rather than about maps.
 */
export type ClutterSites = {
  /** Kerb lines, ordered along the street: poles and wires stand on these. */
  kerbs: [number, number][][];
  /** A random clear point on a footpath or plaza, off the walking lines. */
  ground(rand: () => number): { x: number; z: number } | null;
  /** Street corners, with the clearance radius of the junction. */
  junctions: { x: number; z: number; r: number }[];
  /** Building fronts: centre of the street face, facing yaw, and width. */
  fronts: { x: number; z: number; rot: number; w: number; top: number }[];
  /** Busy spots (bazaar, temple gate) for stalls. */
  squares: { x: number; z: number }[];
  /** Is a circle of radius `margin` at (x, z) clear of everything? */
  free(x: number, z: number, margin: number): boolean;
  /** Walkable surface height. */
  groundAt(x: number, z: number): number;
  /** Global multiplier on every prop count. */
  density?: number;
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
 * District weighting
 * ------------------------------------------------------------------ */

type Weights = Record<string, number>;

function districtWeights(landmark: Theme["landmark"]): Weights {
  const base: Weights = {
    pole: 1, wire: 1, bulb: 1, transformerBox: 1,
    groundPatch: 1, drainCover: 1, puddle: 1, rubble: 1,
    cart: 1, chairStack: 1, drum: 1, rubbishPile: 1, tyreStack: 1,
    sackBundle: 1, gasCylinder: 1, crate: 1, paanStall: 1,
    poster: 1, barberPole: 1, hoarding: 1,
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
      return { ...base, cart: 1.6, drum: 1.5, sackBundle: 1.7, gasCylinder: 1.4 };
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

function buildPosterGeo(): THREE.BufferGeometry {
  const r = rng(43);
  const colours = [0xc0392b, 0xf1c40f, 0x2980b9, 0x27ae60, 0xecf0f1, 0x8e44ad];
  const c = C(colours[Math.floor(r() * colours.length)]);
  const g = new THREE.PlaneGeometry(1, 1.4);
  return colourize(g, c);
}

function buildBarberPoleGeo(): THREE.BufferGeometry {
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
  sites: ClutterSites
): Clutter {
  const group = new THREE.Group();
  group.name = "clutter";
  const r = rng(sites.seed ?? 20260726);
  const W = districtWeights(theme.landmark);
  // Scaling the weights rather than each call site keeps `density` honest: it
  // thins every prop type by the same proportion, so the district's character
  // (Bengaluru's scooters, Kolkata's wires) survives at any density.
  const density = sites.density ?? 1;
  if (density !== 1) for (const k of Object.keys(W)) W[k] *= density;
  const Y = (x: number, z: number) => sites.groundAt(x, z);
  const { kerbs, junctions, fronts, squares } = sites;
  const n = (base: number, w: number) => Math.round(base * w);

  let instanceCount = 0;
  let drawCalls = 0;
  const track = (k: number) => {
    instanceCount += k;
    if (k > 0) drawCalls++;
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
  type PoleRec = { x: number; z: number; run: number };
  const poles: PoleRec[] = [];
  kerbs.forEach((run, runIdx) => {
    let carry = 4;
    for (let k = 0; k < run.length - 1; k++) {
      const [ax, az] = run[k];
      const [bx, bz] = run[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      let t = carry;
      for (; t < L; t += poleStep) {
        const x = ax + ((bx - ax) * t) / L;
        const z = az + ((bz - az) * t) / L;
        if (sites.free(x, z, 0.35)) poles.push({ x, z, run: runIdx });
      }
      carry = t - L;
    }
  });

  {
    const geo = track_(buildPoleGeo());
    const list = poles.slice(0, n(poles.length, W.pole));
    track(
      spawn(group, geo, metalMat, list.length, r, (i, d, rr) => {
        const p = list[i];
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.set((rr() - 0.5) * 0.05, rr() * Math.PI * 2, (rr() - 0.5) * 0.05);
        const s = 0.85 + rr() * 0.3;
        d.scale.set(s, s, s);
        return true;
      })
    );
  }

  // Wires: connect consecutive poles along the same kerb.
  {
    const wireGeo = track_(buildWireGeo(poleStep, 0.9));
    const wireMat = ownMat(0.6, 0.4);
    const spans: { x: number; z: number; y: number; ang: number; len: number }[] = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      if (a.run !== b.run) continue;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > poleStep * 1.4) continue;
      spans.push({ x: a.x, z: a.z, y: Y(a.x, a.z), ang: Math.atan2(b.z - a.z, b.x - a.x), len: dist });
    }
    const list = spans.slice(0, n(spans.length, W.wire));
    track(
      spawn(group, wireGeo, wireMat, list.length, r, (i, d) => {
        const s = list[i];
        d.position.set(s.x, s.y + 5.6, s.z);
        d.rotation.y = -s.ang;
        d.scale.x = s.len / poleStep;
        return true;
      })
    );

    // Festoon bulbs sampled along the same catenary shape as the wire.
    const bulbGeo = track_(buildBulbGeo());
    const bulbMat = ownMat(0.4, 0.2);
    const half = poleStep / 2;
    let a = poleStep;
    for (let iter = 0; iter < 30; iter++) {
      const sag = a * (Math.cosh(half / a) - 1);
      if (sag > 0.9) a *= 1.08;
      else a *= 0.93;
    }
    const bulbs: { x: number; y: number; z: number }[] = [];
    for (const s of list) {
      for (const t of [0.25, 0.5, 0.75]) {
        const x = -half + t * poleStep;
        const y = -(a * (Math.cosh(x / a) - 1));
        const along = (x + half) * (s.len / poleStep);
        bulbs.push({ x: s.x + Math.cos(s.ang) * along, y: s.y + 5.6 + y, z: s.z + Math.sin(s.ang) * along });
      }
    }
    const bList = bulbs.slice(0, n(bulbs.length, W.bulb));
    track(
      spawn(group, bulbGeo, bulbMat, bList.length, r, (i, d) => {
        const p = bList[i];
        d.position.set(p.x, p.y, p.z);
        return true;
      })
    );
  }

  // Transformer boxes on roughly every 4th pole.
  {
    const geo = track_(buildTransformerGeo());
    track(
      spawn(group, geo, metalMat, n(poles.length / 4, W.transformerBox), r, (i, d, rr) => {
        const p = poles[Math.floor(rr() * poles.length)];
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z) + 3.2 + rr() * 0.4, p.z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
  }

  /* ------------------------------------------------------------- *
   * GROUND: kerb chips / broken paving / bricks, drain covers, puddles, rubble
   * ------------------------------------------------------------- */

  const onGround = (margin: number, rr: () => number) => {
    const p = sites.ground(rr);
    return p && sites.free(p.x, p.z, margin) ? p : null;
  };
  const base = Math.max(40, fronts.length);

  {
    const geo = track_(buildGroundPatchGeo());
    track(
      spawn(group, geo, ownMat(0.95, 0.02), n(base * 1.2, W.groundPatch), r, (i, d, rr) => {
        const p = onGround(0.3, rr);
        if (!p) return false;
        const kind = rr();
        if (kind < 0.4) d.scale.set(0.22 + rr() * 0.1, 0.12 + rr() * 0.06, 0.22 + rr() * 0.1);
        else if (kind < 0.75) d.scale.set(0.6 + rr() * 0.5, 0.04, 0.5 + rr() * 0.4);
        else d.scale.set(0.2, 0.1, 0.42);
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        const tone = kind < 0.4 ? 0.75 + rr() * 0.15 : kind < 0.75 ? 0.15 + rr() * 0.1 : 0.5 + rr() * 0.15;
        return kind < 0.75 ? new THREE.Color(tone, tone, tone) : new THREE.Color(tone, tone * 0.55, tone * 0.4);
      })
    );
  }

  {
    const geo = track_(buildDrainCoverGeo());
    track(
      spawn(group, geo, metalMat, n(base * 0.3, W.drainCover), r, (i, d, rr) => {
        const p = onGround(0.5, rr);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
  }

  {
    const geo = track_(buildPuddleGeo());
    track(
      spawn(group, geo, ownMat(0.08, 0.6), n(base * 0.25, W.puddle), r, (i, d, rr) => {
        const p = onGround(0.3, rr);
        if (!p) return false;
        const s = 0.5 + rr() * 1.1;
        d.scale.set(s, 1, s * (0.7 + rr() * 0.5));
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
  }

  /* ------------------------------------------------------------- *
   * STREET CORNERS: rubble and clusters of carts, drums, crates
   * ------------------------------------------------------------- */

  const atCorner = (rr: () => number, margin: number) => {
    if (!junctions.length) return null;
    const j = junctions[Math.floor(rr() * junctions.length)];
    const ang = rr() * Math.PI * 2;
    const dist = j.r + 1.2 + rr() * 2.5;
    const x = j.x + Math.cos(ang) * dist;
    const z = j.z + Math.sin(ang) * dist;
    return sites.free(x, z, margin) ? { x, z } : null;
  };

  {
    const geo = track_(buildRubbleGeo());
    track(
      spawn(group, geo, ownMat(), n(junctions.length * 0.4, W.rubble), r, (i, d, rr) => {
        const p = atCorner(rr, 0.5);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        const s = 0.7 + rr() * 0.6;
        d.scale.set(s, s, s);
        return true;
      })
    );
  }

  function furnitureCluster(geo: THREE.BufferGeometry, mat: THREE.Material, perNode: number, weight: number, jitter = 0.15) {
    track(
      spawn(group, geo, mat, n(junctions.length * perNode, weight), r, (i, d, rr) => {
        const p = atCorner(rr, 0.6);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        const s = 1 - jitter / 2 + rr() * jitter;
        d.scale.set(s, s, s);
        return true;
      })
    );
  }

  furnitureCluster(track_(buildCartGeo()), ownMat(), 0.3, W.cart);
  furnitureCluster(track_(buildChairStackGeo()), ownMat(0.7), 0.2, W.chairStack);
  furnitureCluster(track_(buildDrumGeo()), ownMat(0.6, 0.3), 0.2, W.drum);
  furnitureCluster(track_(buildRubbishPileGeo()), ownMat(), 0.3, W.rubbishPile, 0.4);
  furnitureCluster(track_(buildTyreStackGeo()), ownMat(0.9), 0.15, W.tyreStack);
  furnitureCluster(track_(buildSackBundleGeo()), ownMat(), 0.25, W.sackBundle);
  furnitureCluster(track_(buildGasCylinderGeo()), ownMat(0.4, 0.6), 0.15, W.gasCylinder);
  furnitureCluster(track_(buildCrateGeo()), ownMat(), 0.25, W.crate);

  {
    // Paan stalls at the busy spots.
    const geo = track_(buildPaanStallGeo());
    track(
      spawn(group, geo, ownMat(), Math.max(2, n(squares.length * 1.5, W.paanStall)), r, (i, d, rr) => {
        if (!squares.length) return false;
        const sq = squares[Math.floor(rr() * squares.length)];
        const ang = rr() * Math.PI * 2;
        const x = sq.x + Math.cos(ang) * (4 + rr() * 6);
        const z = sq.z + Math.sin(ang) * (4 + rr() * 6);
        if (!sites.free(x, z, 0.8)) return false;
        d.position.set(x, Y(x, z), z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
  }

  /* ------------------------------------------------------------- *
   * ON THE FRONTS: posters, barber poles, rooftop hoardings, bicycles
   * ------------------------------------------------------------- */

  /** A point on a building's street face, `out` metres in front of it. */
  const front = (rr: () => number, out: number) => {
    const f = fronts[Math.floor(rr() * fronts.length)];
    const along = (rr() - 0.5) * f.w * 0.8;
    const c = Math.cos(f.rot);
    const s = Math.sin(f.rot);
    // Local +x is (cos, -sin), local +z (the street) is (sin, cos).
    return { x: f.x + along * c + out * s, z: f.z - along * s + out * c, ny: f.rot, top: f.top };
  };

  if (fronts.length) {
    {
      const geo = track_(buildPosterGeo());
      track(
        spawn(group, geo, ownMat(0.9), n(fronts.length * 0.5, W.poster), r, (i, d, rr) => {
          const p = front(rr, 0.12);
          d.position.set(p.x, 1.4 + rr() * 1.4, p.z);
          d.rotation.y = p.ny;
          const big = rr() > 0.8;
          const s = big ? 1.8 + rr() * 0.6 : 0.6 + rr() * 0.3;
          d.scale.set(s, s * (big ? 0.6 : 1), 1);
          return true;
        })
      );
    }
    {
      const geo = track_(buildBarberPoleGeo());
      track(
        spawn(group, geo, ownMat(0.5), Math.max(1, n(fronts.length * 0.03, W.barberPole)), r, (i, d, rr) => {
          const p = front(rr, 0.5);
          if (!sites.free(p.x, p.z, 0.2)) return false;
          d.position.set(p.x, Y(p.x, p.z), p.z);
          d.rotation.y = rr() * Math.PI * 2;
          return true;
        })
      );
    }
    {
      const geo = track_(buildHoardingGeo());
      track(
        spawn(group, geo, ownMat(0.4), Math.max(1, n(fronts.length * 0.04, W.hoarding)), r, (i, d, rr) => {
          const p = front(rr, -1.5);
          d.position.set(p.x, p.top + 1, p.z);
          d.rotation.y = p.ny + Math.PI;
          return true;
        })
      );
    }
    {
      const geo = track_(buildBicycleGeo());
      track(
        spawn(group, geo, ownMat(0.5), n(fronts.length * 0.12, W.bicycle), r, (i, d, rr) => {
          const p = front(rr, 0.45);
          if (!sites.free(p.x, p.z, 0.3)) return false;
          d.position.set(p.x, Y(p.x, p.z), p.z);
          d.rotation.y = p.ny + Math.PI / 2 + (rr() - 0.5) * 0.4;
          return true;
        })
      );
    }
    {
      const geo = track_(buildPottedPlantGeo(theme.leaf));
      track(
        spawn(group, geo, ownMat(), n(fronts.length * 0.15, W.pottedPlant), r, (i, d, rr) => {
          const p = front(rr, 0.4);
          if (!sites.free(p.x, p.z, 0.3)) return false;
          d.position.set(p.x, Y(p.x, p.z), p.z);
          d.rotation.y = rr() * Math.PI * 2;
          const s = 0.8 + rr() * 0.4;
          d.scale.set(s, s, s);
          return true;
        })
      );
    }
  }

  /* ------------------------------------------------------------- *
   * VEGETATION AND PARKED BITS on open ground
   * ------------------------------------------------------------- */

  {
    const geo = track_(buildBananaClumpGeo());
    track(
      spawn(group, geo, ownMat(), n(base * 0.05, W.bananaClump), r, (i, d, rr) => {
        const p = onGround(0.7, rr);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
  }
  {
    const geo = track_(buildWeedGeo());
    track(
      spawn(group, geo, ownMat(1, 0), n(base * 1.2, W.weed), r, (i, d, rr) => {
        const p = sites.ground(rr);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        const s = 0.6 + rr() * 0.8;
        d.scale.set(s, s, s);
        return true;
      })
    );
  }
  {
    const geo = track_(buildScooterGeo());
    track(
      spawn(group, geo, ownMat(0.55), n(base * 0.12, W.scooter), r, (i, d, rr) => {
        const p = onGround(0.6, rr);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
  }
  {
    const geo = track_(buildCoveredVehicleGeo(theme.canopies[0] ?? 0x3a4a5a));
    track(
      spawn(group, geo, ownMat(0.9), Math.max(1, n(base * 0.02, W.coveredVehicle)), r, (i, d, rr) => {
        const p = onGround(1.2, rr);
        if (!p) return false;
        d.position.set(p.x, Y(p.x, p.z), p.z);
        d.rotation.y = rr() * Math.PI * 2;
        return true;
      })
    );
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
