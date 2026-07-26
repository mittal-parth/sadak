/**
 * Pedestrians for the Indian street.
 *
 * The old `makeCharacter` in props.ts was five coloured boxes — a stack that
 * reads fine from a car window and like a shooter-game bot from anywhere
 * closer. Now that buildings have real facade geometry (see buildings.ts)
 * people are the worst thing on screen, so this rebuilds them from real
 * silhouettes: tapered limbs, a jaw/skull head, and clothing that is actual
 * geometry (a draped pallu, baggy salwar, a wrapped lungi) rather than a
 * colour swapped onto a box.
 *
 * Perf follows the buildings.ts pattern: every static part of the body is
 * authored as a small BufferGeometry with its transform baked in via
 * `.translate()/.rotateX()`, then merged with BufferGeometryUtils grouped by
 * material. The one wrinkle versus a building is that limbs must be able to
 * rotate independently for the walk cycle, so merging happens *within* each
 * limb (thigh+its clothing merge together, but never with the other leg or
 * the torso) and each limb is left as its own named Group/mesh so
 * `setWalkPhase` can drive its rotation.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./props";
import type { MaterialLibrary } from "./materials";

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

export type PersonPreset =
  | "sari"
  | "salwar_kameez"
  | "lungi"
  | "kurta_pyjama"
  | "shirt_trousers"
  | "uniform"
  | "delivery_rider";

export const PERSON_PRESETS: PersonPreset[] = [
  "sari",
  "salwar_kameez",
  "lungi",
  "kurta_pyjama",
  "shirt_trousers",
  "uniform",
  "delivery_rider",
];

export type PersonOptions = {
  preset?: PersonPreset;
  seed?: number;
  heightScale?: number;
  skin?: number;
  cloth1?: number;
  cloth2?: number;
};

/** Named pivots exposed on `group.userData.limbs` so callers can pose them. */
export type PersonLimbs = {
  hips: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  head: THREE.Group;
  baseHipY: number;
};

/* ------------------------------------------------------------------ *
 * Deterministic colour palettes (Indian streetwear, not primary colours)
 * ------------------------------------------------------------------ */

const SKIN_TONES = [0xa9744f, 0x8d5524, 0x6f4a30, 0xc48a5e, 0x5a3a24];
const SARI_COLOURS = [0xb23a48, 0x1f6f5c, 0xd4a017, 0x6a3f8f, 0xc65d2e, 0x2f5f8f];
const KURTA_COLOURS = [0xe8dcc0, 0x3f5b6b, 0x8a3324, 0x4a6741, 0xc9a15a];
const SHIRT_COLOURS = [0xe4e1d6, 0x3a5f7d, 0x7a4a3a, 0x556b2f, 0x9e9e8f];
const TROUSER_COLOURS = [0x2c3e50, 0x35302a, 0x4a4238, 0x24303a];
const LUNGI_COLOURS = [0x2f5f8f, 0x8a3324, 0x3f5b3f, 0x5a4a7a];
const HAIR_COLOURS = [0x14100c, 0x1c1712, 0x2a231c, 0x3a332a];

/* ------------------------------------------------------------------ *
 * Geometry helpers — bake transform into the geometry so it can merge.
 * Mirrors the `slab()` helper in buildings.ts.
 * ------------------------------------------------------------------ */

function xf(
  g: THREE.BufferGeometry,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.BufferGeometry {
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  if (x || y || z) g.translate(x, y, z);
  return g;
}

/** Tapered limb segment. */
function limbCyl(
  topR: number,
  botR: number,
  h: number,
  x: number,
  yTop: number,
  z: number,
  segs = 6
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(topR, botR, h, segs);
  return xf(g, x, yTop - h / 2, z);
}

function boxAt(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0
): THREE.BufferGeometry {
  return xf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
}

function sphereAt(
  r: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  wSeg = 6,
  hSeg = 5
): THREE.BufferGeometry {
  return xf(new THREE.SphereGeometry(r, wSeg, hSeg), x, y, z, 0, 0, 0, sx, sy, sz);
}

function coneAt(
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  segs = 8
): THREE.BufferGeometry {
  return xf(new THREE.ConeGeometry(r, h, segs), x, y - h / 2, z);
}

function torusAt(
  r: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  rx = Math.PI / 2
): THREE.BufferGeometry {
  return xf(new THREE.TorusGeometry(r, tube, 4, 8), x, y, z, rx);
}

/**
 * A curved cloth sheet: samples a Catmull-Rom curve and extrudes a ribbon of
 * given width perpendicular to the curve, so the pallu of a sari genuinely
 * drapes rather than being a flat quad stood on its edge.
 */
function curvedSheet(
  pts: THREE.Vector3[],
  width: (t: number) => number,
  segments = 8
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const samples: { c: THREE.Vector3; side: THREE.Vector3; w: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const c = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    let side = new THREE.Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
    side.normalize();
    samples.push({ c, side, w: width(t) });
  }

  for (let i = 0; i < segments; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const a0 = a.c.clone().addScaledVector(a.side, -a.w / 2);
    const a1 = a.c.clone().addScaledVector(a.side, a.w / 2);
    const b0 = b.c.clone().addScaledVector(b.side, -b.w / 2);
    const b1 = b.c.clone().addScaledVector(b.side, b.w / 2);

    const n = new THREE.Vector3()
      .crossVectors(b0.clone().sub(a0), a1.clone().sub(a0))
      .normalize();

    // Two triangles, both winding orders so the sheet reads from both sides.
    const push = (p: THREE.Vector3, u: number, v: number) => {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(u, v);
    };
    push(a0, 0, i / segments);
    push(b0, 0, (i + 1) / segments);
    push(a1, 1, i / segments);

    push(a1, 1, i / segments);
    push(b0, 0, (i + 1) / segments);
    push(b1, 1, (i + 1) / segments);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/** Skull-and-jaw head silhouette via a lathe, instead of a cube. */
function headGeometry(scale: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.015, 0.0), // chin tip
    new THREE.Vector2(0.07, 0.02), // jaw
    new THREE.Vector2(0.085, 0.06), // cheek
    new THREE.Vector2(0.09, 0.1), // ear line
    new THREE.Vector2(0.082, 0.14), // temple
    new THREE.Vector2(0.055, 0.17), // crown start
    new THREE.Vector2(0.0, 0.185), // top
  ];
  const g = new THREE.LatheGeometry(pts, 8);
  g.scale(scale, scale, scale);
  return g;
}

/* ------------------------------------------------------------------ *
 * Merge helper — mirrors buildings.ts: merge a bucket, drop the sources.
 * ------------------------------------------------------------------ */

function mergeAndMesh(
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
  castShadow = true
): THREE.Mesh | null {
  if (!parts.length) return null;
  // A body mixes indexed primitives (boxes, cylinders) with non-indexed ones
  // (anything that has been through .toNonIndexed(), e.g. a draped pallu), and
  // mergeGeometries refuses to mix the two. Flatten to non-indexed first.
  const flat = parts.map((p) => (p.getIndex() ? p.toNonIndexed() : p));
  const merged = BufferGeometryUtils.mergeGeometries(flat, false);
  flat.forEach((f, i) => {
    if (f !== parts[i]) f.dispose();
  });
  parts.forEach((p) => p.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

let __triCount = 0;
/** Test hook: returns triangle count accumulated since last reset. */
export function __resetTriCounter(): void {
  __triCount = 0;
}
export function __getTriCounter(): number {
  return __triCount;
}
function countTris(mesh: THREE.Mesh | null) {
  if (!mesh) return;
  const geo = mesh.geometry;
  const idx = geo.getIndex();
  const n = idx ? idx.count : geo.getAttribute("position").count;
  __triCount += Math.round(n / 3);
}

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

type MatKind = "skin" | "cloth" | "hair" | "metal" | "accent";

function makeMats(materials: MaterialLibrary | undefined, colours: Record<MatKind, number>) {
  const local = (color: number, roughness: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  if (!materials) {
    return {
      skin: local(colours.skin, 0.9),
      cloth: local(colours.cloth, 0.95),
      hair: local(colours.hair, 0.6),
      metal: local(colours.metal, 0.4, 0.6),
      accent: local(colours.accent, 0.85),
    };
  }
  return {
    skin: materials.tint("painted_wood", colours.skin, 0.06),
    cloth: materials.tint("tarpaulin", colours.cloth, 0.1),
    hair: local(colours.hair, 0.6),
    metal: materials.tint("rusted_metal", colours.metal, 0.06),
    accent: materials.tint("painted_wood", colours.accent, 0.06),
  };
}

/* ------------------------------------------------------------------ *
 * makePerson
 * ------------------------------------------------------------------ */

export function makePerson(
  opts: PersonOptions = {},
  materials?: MaterialLibrary
): THREE.Group {
  const seed = opts.seed ?? 1;
  const rand = mulberry32(seed);
  const preset: PersonPreset = opts.preset ?? "shirt_trousers";

  // ---- Build variation from the seed --------------------------------
  const heightScale = opts.heightScale ?? 0.92 + rand() * 0.2; // ~0.92-1.12
  const build = 0.85 + rand() * 0.3; // torso/limb girth multiplier
  const female = preset === "sari" || preset === "salwar_kameez" ? rand() > 0.15 : rand() > 0.72;

  const skin = opts.skin ?? SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)];
  const clothPool =
    preset === "sari"
      ? SARI_COLOURS
      : preset === "kurta_pyjama"
      ? KURTA_COLOURS
      : preset === "lungi"
      ? LUNGI_COLOURS
      : SHIRT_COLOURS;
  const cloth1 = opts.cloth1 ?? clothPool[Math.floor(rand() * clothPool.length)];
  const cloth2 =
    opts.cloth2 ?? TROUSER_COLOURS[Math.floor(rand() * TROUSER_COLOURS.length)];
  const hairColour = HAIR_COLOURS[Math.floor(rand() * HAIR_COLOURS.length)];

  const uniformColour = 0x2e4d3a; // constable khaki-olive
  const riderColour = 0xd6482f; // insulated bag orange

  let matColours: Record<MatKind, number> = {
    skin,
    cloth: cloth1,
    hair: hairColour,
    metal: 0x2a2a2a,
    accent: cloth2,
  };
  if (preset === "uniform") matColours = { ...matColours, cloth: uniformColour, metal: 0x1a1a1a };
  if (preset === "delivery_rider") matColours = { ...matColours, accent: riderColour };

  const mats = makeMats(materials, matColours);
  const clothMat2 = materials
    ? materials.tint("tarpaulin", cloth2, 0.1)
    : new THREE.MeshStandardMaterial({ color: cloth2, roughness: 0.95 });

  // ---- Skeleton (metres, before heightScale) -------------------------
  const H = 1.74;
  const hipY = 0.9 * build ** 0.15;
  const kneeDrop = 0.44; // thigh length
  const ankleDrop = 0.42; // shin length
  const footH = 0.07;
  const waistTop = hipY + 0.08;
  const shoulderY = 1.44;
  const neckY = 1.52;
  const chinY = 1.58;
  const headTop = 1.74;
  const shoulderW = (0.19 + (female ? -0.015 : 0.02)) * build;
  const hipW = (0.16 + (female ? 0.02 : 0)) * build;
  const upperArmLen = 0.27;
  const forearmLen = 0.24;

  const root = new THREE.Group();
  root.name = `person_${preset}_${seed}`;

  // ================= TORSO (static) =================
  const skinStatic: THREE.BufferGeometry[] = [];
  const clothStatic: THREE.BufferGeometry[] = [];
  const cloth2Static: THREE.BufferGeometry[] = [];
  const hairStatic: THREE.BufferGeometry[] = [];
  const accentStatic: THREE.BufferGeometry[] = [];

  const hips = new THREE.Group();
  hips.position.set(0, hipY, 0);
  root.add(hips);

  // Pelvis block (local space of `hips`: y=0 is hip height).
  clothStatic.push(
    limbCyl(hipW * 0.95, hipW, waistTop - hipY, 0, waistTop - hipY, 0, 8)
  );

  // Torso: tapered cylinder, waist -> shoulders, low radial count so it
  // reads slightly boxy rather than a smooth tube.
  const torsoH = shoulderY - waistTop;
  const isDraped = preset === "sari" || preset === "kurta_pyjama" || preset === "salwar_kameez";
  const torsoTopR = shoulderW * (isDraped ? 0.85 : 0.78);
  const torsoBotR = hipW * 0.85;
  clothStatic.push(limbCyl(torsoTopR, torsoBotR, torsoH, 0, shoulderY - hipY, 0, 8));

  // Long garment overlay: kameez/kurta/sari fall to thigh height, over the
  // trousers/legs below — this is what changes the silhouette, not colour.
  if (preset === "salwar_kameez" || preset === "kurta_pyjama") {
    const hemY = hipY - 0.32;
    clothStatic.push(
      limbCyl(torsoBotR * 1.02, torsoBotR * 1.18, waistTop - hemY, 0, waistTop - hipY, 0, 8)
    );
  }
  if (preset === "sari") {
    // Ankle-length draped skirt (the sari body wrap).
    const hemY = 0.04;
    clothStatic.push(limbCyl(torsoBotR * 1.05, hipW * 1.35, waistTop - hemY, 0, waistTop - hipY, 0, 10));
    // Pallu: curved sheet from the front waist, up and over the left
    // shoulder, hanging down the back — an actual draped surface.
    const pallu = curvedSheet(
      [
        new THREE.Vector3(hipW * 0.7, waistTop - hipY - 0.05, hipW * 0.6),
        new THREE.Vector3(shoulderW * 0.55, shoulderY - hipY - 0.05, hipW * 0.2),
        new THREE.Vector3(shoulderW * 0.6, shoulderY - hipY + 0.18, -hipW * 0.1),
        new THREE.Vector3(shoulderW * 0.3, shoulderY - hipY - 0.55, -hipW * 0.5),
      ],
      (t) => 0.22 - t * 0.06,
      10
    );
    cloth2Static.push(pallu);
  }
  if (preset === "lungi") {
    // Wrapped lower cloth, worn instead of trousers — bare shins below.
    const hemY = hipY - 0.5;
    clothStatic.push(
      limbCyl(hipW * 1.0, hipW * 1.25, waistTop - hemY, 0, waistTop - hipY, 0, 10)
    );
  }

  // Sloped shoulders: a squashed sphere cap softens the top of the torso
  // cylinder so shoulders don't look cut flat.
  clothStatic.push(sphereAt(torsoTopR * 0.95, 0, shoulderY - hipY, 0, 1, 0.35, 0.75, 6, 4));

  // Neck + head.
  skinStatic.push(limbCyl(0.045, 0.05, neckY - shoulderY + 0.05, 0, neckY - hipY + 0.03, 0, 6));
  const headGroup = new THREE.Group();
  headGroup.position.set(0, chinY - hipY + 0.02, 0);
  const headGeo = headGeometry(1.0);
  headGeo.translate(0, 0, 0);
  skinStatic.push(xf(headGeo, 0, chinY - hipY + 0.02, 0));
  // Ears.
  [-1, 1].forEach((s) => {
    skinStatic.push(boxAt(0.018, 0.03, 0.02, s * 0.088, chinY - hipY + 0.11, 0));
  });
  // Nose: the head lathe is a solid of revolution (no front/back on its
  // own), so this small wedge is what actually breaks the symmetry and
  // gives the face — and the whole body's "+Z is front" convention used by
  // the pallu drape, badge and backpack placement below — a visible tell.
  skinStatic.push(boxAt(0.02, 0.03, 0.03, 0, chinY - hipY + 0.1, 0.083, 0.35));

  // ---- Hair / headwear (also drives whether a topi/turban is worn) ----
  const hairRoll = rand();
  const hairStyle =
    preset === "uniform"
      ? "cap"
      : preset === "delivery_rider"
      ? "helmet"
      : female
      ? hairRoll < 0.5
        ? "bun"
        : hairRoll < 0.85
        ? "braid"
        : "short"
      : hairRoll < 0.18
      ? "bald"
      : hairRoll < 0.34
      ? "turban"
      : hairRoll < 0.46
      ? "topi"
      : "short";

  const crownY = headTop - hipY;
  if (hairStyle === "short") {
    hairStatic.push(sphereAt(0.088, 0, crownY - 0.05, 0, 1, 0.75, 1, 7, 5));
  } else if (hairStyle === "bun") {
    hairStatic.push(sphereAt(0.075, 0, crownY - 0.06, -0.06, 1, 0.7, 0.9, 6, 5));
    hairStatic.push(sphereAt(0.045, 0, crownY - 0.02, -0.11, 1, 1, 1, 6, 4));
  } else if (hairStyle === "braid") {
    hairStatic.push(sphereAt(0.078, 0, crownY - 0.05, -0.03, 1, 0.7, 0.95, 6, 5));
    const braidLen = 0.5;
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4;
      const t1 = (i + 1) / 4;
      hairStatic.push(
        limbCyl(
          0.028 * (1 - t0 * 0.6),
          0.028 * (1 - t1 * 0.6),
          braidLen / 4,
          0,
          crownY - 0.12 - t0 * braidLen,
          -0.09 - t0 * 0.02,
          6
        )
      );
    }
  } else if (hairStyle === "turban") {
    for (let i = 0; i < 2; i++) {
      cloth2Static.push(torusAt(0.083 - i * 0.008, 0.03, 0, crownY - 0.01 + i * 0.05, 0));
    }
    cloth2Static.push(sphereAt(0.05, 0.02, crownY + 0.09, 0.01, 1, 0.8, 1, 6, 4));
  } else if (hairStyle === "topi") {
    hairStatic.push(sphereAt(0.086, 0, crownY - 0.06, 0, 1, 0.55, 1, 6, 5));
    accentStatic.push(
      xf(new THREE.CylinderGeometry(0.078, 0.082, 0.05, 8), 0, crownY - 0.02, 0)
    );
  } else if (hairStyle === "cap") {
    // Constable's peaked cap.
    accentStatic.push(xf(new THREE.CylinderGeometry(0.086, 0.086, 0.07, 8), 0, crownY - 0.02, 0));
    accentStatic.push(boxAt(0.16, 0.02, 0.09, 0, crownY - 0.06, 0.09));
  } else if (hairStyle === "helmet") {
    accentStatic.push(sphereAt(0.098, 0, crownY - 0.03, 0, 1, 0.95, 1, 8, 6));
    accentStatic.push(boxAt(0.15, 0.03, 0.08, 0, crownY - 0.14, 0.1, -0.15));
    accentStatic.push(
      xf(new THREE.SphereGeometry(0.05, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, crownY - 0.16, 0.06, Math.PI)
    );
  }
  // bald: nothing added.

  // ---- Uniform trims ----
  if (preset === "uniform") {
    accentStatic.push(torusAt(hipW * 0.95, 0.018, 0, waistTop - hipY - 0.02, 0)); // belt
    [-1, 1].forEach((s) => {
      accentStatic.push(boxAt(0.09, 0.02, 0.09, s * shoulderW * 0.75, shoulderY - hipY + 0.02, 0)); // epaulette
    });
    accentStatic.push(boxAt(0.05, 0.06, 0.02, shoulderW * 0.3, shoulderY - hipY - 0.15, torsoBotR + 0.01)); // badge
  }

  // ---- Delivery rider insulated backpack ----
  if (preset === "delivery_rider") {
    const bagY = shoulderY - hipY - 0.22;
    accentStatic.push(boxAt(0.34, 0.4, 0.24, 0, bagY, -(torsoBotR + 0.16), 0, 0, 0));
    accentStatic.push(boxAt(0.36, 0.06, 0.26, 0, bagY + 0.21, -(torsoBotR + 0.16)));
    [-1, 1].forEach((s) => {
      accentStatic.push(
        boxAt(0.03, 0.32, 0.02, s * shoulderW * 0.5, shoulderY - hipY - 0.06, torsoBotR * 0.4)
      );
    });
  }

  // ---- A fraction of pedestrians carry a bag or a head-bundle ----
  const carryRoll = rand();
  if (preset !== "delivery_rider" && preset !== "uniform" && carryRoll < 0.3) {
    if (carryRoll < 0.16) {
      // Side bag on a shoulder strap.
      const bagY = shoulderY - hipY - 0.3;
      accentStatic.push(boxAt(0.16, 0.2, 0.08, shoulderW * 0.9, bagY, 0.02));
      accentStatic.push(
        boxAt(0.02, 0.5, 0.02, shoulderW * 0.6, shoulderY - hipY - 0.1, 0.06, 0, 0, -0.5)
      );
    } else {
      // Cloth bundle balanced on the head.
      cloth2Static.push(sphereAt(0.11, 0, crownY + 0.11, 0, 1, 0.55, 1, 6, 4));
    }
  }

  const torsoGroup = new THREE.Group();
  const meshSkin = mergeAndMesh(skinStatic, mats.skin);
  const meshCloth = mergeAndMesh(clothStatic, mats.cloth);
  const meshCloth2 = mergeAndMesh(cloth2Static, clothMat2);
  const meshHair = mergeAndMesh(hairStatic, mats.hair);
  const meshAccent = mergeAndMesh(accentStatic, mats.accent);
  [meshSkin, meshCloth, meshCloth2, meshHair, meshAccent].forEach((m) => {
    if (m) torsoGroup.add(m);
    countTris(m);
  });
  hips.add(torsoGroup);

  // ================= LIMBS =================
  const legCloth = preset === "lungi" ? null : preset === "sari" ? null : mats.cloth;
  const legColourMat =
    preset === "salwar_kameez"
      ? clothMat2
      : preset === "uniform"
      ? mats.cloth
      : preset === "delivery_rider"
      ? clothMat2
      : preset === "kurta_pyjama"
      ? clothMat2
      : legCloth;

  function buildLeg(side: 1 | -1): THREE.Group {
    const hipPivot = new THREE.Group();
    hipPivot.name = side < 0 ? "hipL" : "hipR";
    hipPivot.position.set(side * hipW * 0.55, 0, 0);
    hips.add(hipPivot);

    const thighCloth: THREE.BufferGeometry[] = [];
    const thighSkin: THREE.BufferGeometry[] = [];
    const bareLeg = preset === "sari" || preset === "lungi";
    const thighTopR = 0.075 * build;
    const thighBotR = 0.06 * build;

    if (bareLeg) {
      thighSkin.push(limbCyl(thighTopR, thighBotR, kneeDrop, 0, 0, 0, 6));
    } else {
      const bag = preset === "salwar_kameez" ? 1.7 : 1.0; // baggy salwar
      thighCloth.push(limbCyl(thighTopR * bag, thighBotR * bag, kneeDrop, 0, 0, 0, 6));
    }

    const thighMesh = mergeAndMesh(thighCloth, legColourMat ?? mats.cloth);
    const thighSkinMesh = mergeAndMesh(thighSkin, mats.skin);
    [thighMesh, thighSkinMesh].forEach((m) => {
      if (m) hipPivot.add(m);
      countTris(m);
    });

    const kneePivot = new THREE.Group();
    kneePivot.name = side < 0 ? "kneeL" : "kneeR";
    kneePivot.position.set(0, -kneeDrop, 0);
    hipPivot.add(kneePivot);

    const shinCloth: THREE.BufferGeometry[] = [];
    const shinSkin: THREE.BufferGeometry[] = [];
    const shinLen = ankleDrop - footH;
    const shinBareBelowKnee = preset === "lungi" || preset === "sari";
    if (shinBareBelowKnee) {
      shinSkin.push(limbCyl(0.055 * build, 0.04 * build, shinLen, 0, 0, 0, 6));
    } else {
      const bag = preset === "salwar_kameez" ? 1.35 : 1.0;
      const cuff = preset === "salwar_kameez" ? 0.032 : 0.045; // salwar cuffs in at the ankle
      shinCloth.push(limbCyl(thighBotR * bag, cuff * build, shinLen, 0, 0, 0, 6));
    }
    // Foot.
    shinSkin.push(boxAt(0.055, footH, 0.13, 0, -shinLen - footH / 2, 0.03));

    const shinMesh = mergeAndMesh(shinCloth, legColourMat ?? mats.cloth);
    const shinSkinMesh = mergeAndMesh(shinSkin, mats.skin);
    [shinMesh, shinSkinMesh].forEach((m) => {
      if (m) kneePivot.add(m);
      countTris(m);
    });

    return hipPivot;
  }

  const hipL = buildLeg(-1);
  const hipR = buildLeg(1);
  const kneeL = hipL.children.find((c) => c.name === "kneeL") as THREE.Group;
  const kneeR = hipR.children.find((c) => c.name === "kneeR") as THREE.Group;

  function buildArm(side: 1 | -1): THREE.Group {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.name = side < 0 ? "shoulderL" : "shoulderR";
    shoulderPivot.position.set(side * shoulderW * 0.92, shoulderY - hipY - 0.04, 0);
    hips.add(shoulderPivot);

    const sleeved = preset !== "sari"; // sari blouse sleeves are short; keep simple: everyone else covered
    const upperCloth: THREE.BufferGeometry[] = [];
    const upperSkin: THREE.BufferGeometry[] = [];
    const upperR = 0.05 * build;
    if (sleeved && preset !== "lungi") {
      upperCloth.push(limbCyl(upperR * 1.1, upperR, upperArmLen, 0, 0, 0, 6));
    } else {
      upperSkin.push(limbCyl(upperR, upperR * 0.9, upperArmLen, 0, 0, 0, 6));
    }
    const upperMesh = mergeAndMesh(upperCloth, mats.cloth);
    const upperSkinMesh = mergeAndMesh(upperSkin, mats.skin);
    [upperMesh, upperSkinMesh].forEach((m) => {
      if (m) shoulderPivot.add(m);
      countTris(m);
    });

    const elbowPivot = new THREE.Group();
    elbowPivot.name = side < 0 ? "elbowL" : "elbowR";
    elbowPivot.position.set(0, -upperArmLen, 0);
    shoulderPivot.add(elbowPivot);

    const foreSkin: THREE.BufferGeometry[] = [];
    foreSkin.push(limbCyl(0.038 * build, 0.03 * build, forearmLen, 0, 0, 0, 6));
    foreSkin.push(boxAt(0.05, 0.07, 0.035, 0, -forearmLen - 0.03, 0)); // hand
    const foreMesh = mergeAndMesh(foreSkin, mats.skin);
    if (foreMesh) elbowPivot.add(foreMesh);
    countTris(foreMesh);

    return shoulderPivot;
  }

  const shoulderL = buildArm(-1);
  const shoulderR = buildArm(1);
  const elbowL = shoulderL.children.find((c) => c.name === "elbowL") as THREE.Group;
  const elbowR = shoulderR.children.find((c) => c.name === "elbowR") as THREE.Group;

  root.scale.setScalar(heightScale);

  const limbs: PersonLimbs = {
    hips,
    hipL,
    hipR,
    kneeL,
    kneeR,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    head: headGroup,
    baseHipY: hipY,
  };
  root.userData.limbs = limbs;
  root.userData.preset = preset;
  root.userData.seed = seed;

  return root;
}

/* ------------------------------------------------------------------ *
 * Pose control
 * ------------------------------------------------------------------ */

export function makeIdlePose(group: THREE.Group): void {
  const L = group.userData.limbs as PersonLimbs | undefined;
  if (!L) return;
  L.hipL.rotation.x = 0;
  L.hipR.rotation.x = 0;
  L.kneeL.rotation.x = 0.04;
  L.kneeR.rotation.x = 0.04;
  L.shoulderL.rotation.x = 0.06;
  L.shoulderR.rotation.x = -0.04;
  L.elbowL.rotation.x = 0.12;
  L.elbowR.rotation.x = 0.16;
  L.hips.position.y = L.baseHipY;
  L.hips.rotation.y = 0;
}

/** Swings limb pivots through a walk cycle. `t` is phase in radians. */
export function setWalkPhase(group: THREE.Group, t: number): void {
  const L = group.userData.limbs as PersonLimbs | undefined;
  if (!L) return;
  const swing = Math.sin(t);
  const swingOpp = Math.sin(t + Math.PI);

  L.hipL.rotation.x = swing * 0.55;
  L.hipR.rotation.x = swingOpp * 0.55;
  L.kneeL.rotation.x = Math.max(0, -swing) * 1.0 + 0.05;
  L.kneeR.rotation.x = Math.max(0, -swingOpp) * 1.0 + 0.05;

  L.shoulderL.rotation.x = swingOpp * 0.4;
  L.shoulderR.rotation.x = swing * 0.4;
  L.elbowL.rotation.x = Math.max(0, swingOpp) * 0.5 + 0.08;
  L.elbowR.rotation.x = Math.max(0, swing) * 0.5 + 0.08;

  L.hips.position.y = L.baseHipY + Math.abs(Math.sin(t * 2)) * 0.025;
  L.hips.rotation.y = Math.sin(t) * 0.06;
}
