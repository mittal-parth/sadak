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
  /** When false, skips random shoulder bag / head bundle props. */
  carryProp?: boolean;
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
  segs = 12
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

/**
 * Skull-and-jaw head silhouette via a lathe, instead of a cube.
 *
 * Width and height scale independently: the profile below is authored at a
 * natural 0.185 tall by 0.09 in radius, and a head that has been scaled
 * uniformly to fit a shorter chin-to-crown span comes out visibly squat.
 */
function headGeometry(widthScale: number, heightScale: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.015, 0.0), // chin tip
    new THREE.Vector2(0.055, 0.012), // jaw curve
    new THREE.Vector2(0.07, 0.02), // jaw
    new THREE.Vector2(0.08, 0.04), // lower cheek
    new THREE.Vector2(0.085, 0.06), // cheek
    new THREE.Vector2(0.09, 0.1), // ear line
    new THREE.Vector2(0.087, 0.125), // upper temple
    new THREE.Vector2(0.082, 0.14), // temple
    new THREE.Vector2(0.07, 0.16), // crown curve
    new THREE.Vector2(0.055, 0.17), // crown start
    new THREE.Vector2(0.03, 0.18), // near top
    new THREE.Vector2(0.0, 0.185), // top
  ];
  const g = new THREE.LatheGeometry(pts, 20);
  g.scale(widthScale, heightScale, widthScale);
  return g;
}

/** Authored dimensions of the head lathe profile above. */
const HEAD_LATHE_H = 0.185;
const HEAD_LATHE_R = 0.09;

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
  const build = 0.98 + rand() * 0.22; // torso/limb girth multiplier
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
  // Chin dropped closer to the collar so the exposed neck is a couple of
  // centimetres, not a hand's width.
  const chinY = 1.545;
  // Chin-to-crown was 0.16 against a lathe authored at 0.185, so every head
  // was being squashed to ~86% of its intended height.
  const headTop = 1.78;
  const shoulderW = (0.22 + (female ? -0.015 : 0.025)) * build;
  const hipW = (0.19 + (female ? 0.02 : 0)) * build;
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
    limbCyl(hipW * 0.95, hipW, waistTop - hipY, 0, waistTop - hipY, 0, 16)
  );

  // Torso: tapered cylinder, waist -> shoulders.
  const torsoH = shoulderY - waistTop;
  const isDraped = preset === "sari" || preset === "kurta_pyjama" || preset === "salwar_kameez";
  const torsoTopR = shoulderW * (isDraped ? 0.85 : 0.78);
  const torsoBotR = hipW * 0.85;
  clothStatic.push(limbCyl(torsoTopR, torsoBotR, torsoH, 0, shoulderY - hipY, 0, 16));

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
  clothStatic.push(sphereAt(torsoTopR * 0.95, 0, shoulderY - hipY, 0, 1, 0.35, 0.75, 10, 6));

  // ---- Neck + head ----
  //
  // The head sits with its chin exactly at chinY and the neck runs from the
  // shoulder well past that, so the jaw closes over the top of the neck. The
  // old numbers left the neck stopping just short of a chin that had itself
  // been nudged up 2cm, which is what left a visible seam at the throat.
  const skullBaseY = chinY - hipY;
  const headH = headTop - chinY;
  const headScaleY = headH / HEAD_LATHE_H;
  // Width stays near natural: a head scaled to the taller span in every axis
  // would read as a bobblehead.
  const headScaleXZ = 0.94;
  const headW = HEAD_LATHE_R * headScaleXZ;

  // Neck: from inside the torso up into the skull, so there is no join to see
  // from any angle. Overlap is free — it all merges into one skin mesh.
  //
  // NOTE limbCyl's 5th argument is the TOP of the cylinder, not its centre.
  // Passing a midpoint here (as this did) drops the neck by half its length
  // and leaves the head floating clear of the shoulders.
  // Only the exposed span between collar and jaw should read as neck; the
  // rest is buried in the torso above and the skull below.
  const neckBottom = shoulderY - 0.1;
  const neckTop = chinY + headH * 0.18;
  skinStatic.push(
    limbCyl(
      // Tapered narrower at the top so it tucks up under the jaw rather than
      // bulging out past it.
      0.052,
      0.075,
      neckTop - neckBottom,
      0,
      neckTop - hipY,
      0,
      10
    )
  );

  const headGroup = new THREE.Group();
  headGroup.position.set(0, skullBaseY, 0);
  const headGeo = headGeometry(headScaleXZ, headScaleY);
  skinStatic.push(xf(headGeo, 0, skullBaseY, 0));
  const skullCrownY = skullBaseY + headH;

  // Face features are placed as fractions of the head so they track its size.
  const browY = skullBaseY + headH * 0.62;
  const noseY = skullBaseY + headH * 0.52;
  // Ears.
  [-1, 1].forEach((s) => {
    skinStatic.push(boxAt(0.018, 0.032, 0.02, s * (headW + 0.012), browY - 0.01, 0));
  });
  // Nose: the head lathe is a solid of revolution (no front/back on its
  // own), so this small wedge is what actually breaks the symmetry and
  // gives the face — and the whole body's "+Z is front" convention used by
  // the pallu drape, badge and backpack placement below — a visible tell.
  skinStatic.push(boxAt(0.02, 0.032, 0.03, 0, noseY, headW * 0.98, 0.35));
  // Eyes — dark spheres break up the smooth lathe and read as a face up close.
  [-1, 1].forEach((s) => {
    hairStatic.push(sphereAt(0.013, s * 0.034, browY, headW * 0.92, 1, 1, 1, 8, 6));
  });

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

  /** Sphere with its bottom resting on the skull crown (hip-local Y). */
  const onCrown = (r: number, sy: number, sz = 1) =>
    sphereAt(r, 0, skullCrownY + r * sy, 0, 1, sy, sz, 6, 4);

  // Actual hair over the scalp for the uncovered styles. Without this the
  // bare lathe crown is skin-coloured and every "short"-haired character —
  // most of the crowd — reads as bald.
  if (hairStyle === "short" || hairStyle === "bun" || hairStyle === "braid") {
    // Sized to hug the crown and swept slightly back, so it shows a hairline
    // above the forehead without ever dipping over the eyes (z 0.078).
    hairStatic.push(
      sphereAt(0.092, 0, skullCrownY - 0.045, -0.02, 1, 0.6, 1, 12, 7)
    );
  }

  if (hairStyle === "short") {
    // Cap above covers it; nothing extra.
  } else if (hairStyle === "bun") {
    hairStatic.push(sphereAt(0.05, 0, skullCrownY - 0.09, -0.11, 1, 0.85, 0.9, 6, 4));
  } else if (hairStyle === "braid") {
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
          skullCrownY - 0.08 - t0 * braidLen,
          -0.09 - t0 * 0.02,
          6
        )
      );
    }
  } else if (hairStyle === "turban") {
    for (let i = 0; i < 2; i++) {
      cloth2Static.push(
        torusAt(0.086 - i * 0.008, 0.028, 0, skullCrownY - 0.06 + i * 0.045, 0)
      );
    }
    cloth2Static.push(sphereAt(0.05, 0.02, skullCrownY + 0.04, 0.01, 1, 0.8, 1, 6, 4));
  } else if (hairStyle === "topi") {
    accentStatic.push(
      xf(new THREE.CylinderGeometry(0.082, 0.086, 0.05, 8), 0, skullCrownY + 0.025, 0)
    );
  } else if (hairStyle === "cap") {
    // Constable's peaked cap.
    accentStatic.push(
      xf(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 8), 0, skullCrownY + 0.035, 0)
    );
    accentStatic.push(boxAt(0.16, 0.02, 0.09, 0, skullCrownY + 0.01, 0.09));
  } else if (hairStyle === "helmet") {
    accentStatic.push(sphereAt(0.1, 0, skullCrownY - 0.04, 0, 1, 0.92, 1, 8, 6));
    accentStatic.push(boxAt(0.15, 0.03, 0.08, 0, skullCrownY - 0.14, 0.1, -0.15));
    accentStatic.push(
      xf(
        new THREE.SphereGeometry(0.05, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        0,
        skullCrownY - 0.16,
        0.06,
        Math.PI
      )
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
  const allowCarry = opts.carryProp !== false;
  if (allowCarry && preset !== "delivery_rider" && preset !== "uniform" && carryRoll < 0.3) {
    if (carryRoll < 0.16) {
      // Side bag on a shoulder strap.
      const bagY = shoulderY - hipY - 0.3;
      accentStatic.push(boxAt(0.16, 0.2, 0.08, shoulderW * 0.9, bagY, 0.02));
      accentStatic.push(
        boxAt(0.02, 0.5, 0.02, shoulderW * 0.6, shoulderY - hipY - 0.1, 0.06, 0, 0, -0.5)
      );
    } else {
      // Cloth bundle balanced on the head — base on the crown, not floating above it.
      cloth2Static.push(onCrown(0.1, 0.48));
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
    const thighTopR = 0.088 * build;
    const thighBotR = 0.072 * build;

    if (bareLeg) {
      thighSkin.push(limbCyl(thighTopR, thighBotR, kneeDrop, 0, 0, 0, 10));
      thighSkin.push(sphereAt(thighTopR * 0.98, 0, 0, 0, 1, 1, 1, 10, 6));
    } else {
      const bag = preset === "salwar_kameez" ? 1.7 : 1.0; // baggy salwar
      thighCloth.push(limbCyl(thighTopR * bag, thighBotR * bag, kneeDrop, 0, 0, 0, 10));
      // Hip joint sphere so the thigh doesn't shear open at the pelvis mid-stride.
      thighCloth.push(sphereAt(thighTopR * bag * 0.98, 0, 0, 0, 1, 1, 1, 10, 6));
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
      shinSkin.push(limbCyl(0.065 * build, 0.048 * build, shinLen, 0, 0, 0, 10));
      shinSkin.push(sphereAt(0.062 * build, 0, 0, 0, 1, 1, 1, 10, 6));
    } else {
      const bag = preset === "salwar_kameez" ? 1.35 : 1.0;
      const cuff = preset === "salwar_kameez" ? 0.032 : 0.045; // salwar cuffs in at the ankle
      shinCloth.push(limbCyl(thighBotR * bag, cuff * build, shinLen, 0, 0, 0, 10));
      // Knee joint sphere: fills the wedge the bent knee opens between
      // thigh bottom and shin top.
      shinCloth.push(sphereAt(thighBotR * bag * 0.96, 0, 0, 0, 1, 1, 1, 10, 6));
    }
    // Foot: main block plus a lower rounded toe so it reads as a shoe, not a brick.
    shinSkin.push(boxAt(0.065, footH, 0.12, 0, -shinLen - footH / 2, 0.02));
    shinSkin.push(sphereAt(0.034, 0, -shinLen - footH * 0.7, 0.095, 1, 0.6, 1.3, 8, 5));

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

    // Hang the arm a few degrees outboard: dead vertical it embeds in the
    // torso cylinder and the silhouette loses the arm entirely.
    shoulderPivot.rotation.z = side * 0.09;

    const sleeved = preset !== "sari"; // sari blouse sleeves are short; keep simple: everyone else covered
    const upperCloth: THREE.BufferGeometry[] = [];
    const upperSkin: THREE.BufferGeometry[] = [];
    const upperR = 0.058 * build;
    if (sleeved && preset !== "lungi") {
      upperCloth.push(limbCyl(upperR * 1.1, upperR, upperArmLen, 0, 0, 0, 10));
      // Shoulder cap sphere rounds off the sleeve top against the torso.
      upperCloth.push(sphereAt(upperR * 1.12, 0, 0.01, 0, 1, 1, 1, 10, 6));
    } else {
      upperSkin.push(limbCyl(upperR, upperR * 0.9, upperArmLen, 0, 0, 0, 10));
      upperSkin.push(sphereAt(upperR * 1.02, 0, 0.01, 0, 1, 1, 1, 10, 6));
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
    foreSkin.push(limbCyl(0.044 * build, 0.036 * build, forearmLen, 0, 0, 0, 10));
    // Elbow joint sphere, same job as the knee's.
    foreSkin.push(sphereAt(0.045 * build, 0, 0, 0, 1, 1, 1, 10, 6));
    // Rounded hand instead of a box paddle.
    foreSkin.push(sphereAt(0.038, 0, -forearmLen - 0.03, 0.005, 0.85, 1.15, 0.7, 8, 6));
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

/**
 * Every pose here is written into this one scratch object and then blended,
 * so a frame costs no allocation however many people are on screen.
 */
type Pose = {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
  /** Vertical offset from baseHipY. */
  bob: number;
  /** Pelvis twist about Y. */
  twist: number;
  /** Pelvis roll about Z — the weight shift that stops an idle looking dead. */
  roll: number;
};

const poseA: Pose = blank();
const poseB: Pose = blank();

function blank(): Pose {
  return {
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
    shoulderL: 0, shoulderR: 0, elbowL: 0, elbowR: 0,
    bob: 0, twist: 0, roll: 0,
  };
}

/**
 * One-sided and C1-continuous, unlike Math.max(0, x). The old knee driver used
 * a hard clamp, whose derivative jumps at zero — that showed up as a visible
 * kink in the knee once per stride.
 */
function softPos(x: number): number {
  return x > 0 ? x * x : 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function copyPose(out: Pose, src: Pose): void {
  Object.assign(out, src);
}

function blendInto(out: Pose, a: Pose, b: Pose, t: number): void {
  out.hipL = lerp(a.hipL, b.hipL, t);
  out.hipR = lerp(a.hipR, b.hipR, t);
  out.kneeL = lerp(a.kneeL, b.kneeL, t);
  out.kneeR = lerp(a.kneeR, b.kneeR, t);
  out.shoulderL = lerp(a.shoulderL, b.shoulderL, t);
  out.shoulderR = lerp(a.shoulderR, b.shoulderR, t);
  out.elbowL = lerp(a.elbowL, b.elbowL, t);
  out.elbowR = lerp(a.elbowR, b.elbowR, t);
  out.bob = lerp(a.bob, b.bob, t);
  out.twist = lerp(a.twist, b.twist, t);
  out.roll = lerp(a.roll, b.roll, t);
}

/**
 * Standing, but alive: slow breathing, a weight shift from one hip to the
 * other, and a faint arm sway. `t` is wall-clock seconds.
 *
 * This used to be a fixed pose, which meant a standing character — the player
 * whenever they stopped, and every NPC in the district, permanently — was a
 * frozen statue.
 */
function idlePose(out: Pose, t: number): void {
  const breath = Math.sin(t * 1.5);
  // Weight shift is deliberately slower than the breath and slightly out of
  // phase with it, so the two never visibly line up into a single bounce.
  const shift = Math.sin(t * 0.55);

  out.hipL = shift * 0.03;
  out.hipR = -shift * 0.03;
  out.kneeL = 0.04 + Math.max(0, shift) * 0.05;
  out.kneeR = 0.04 + Math.max(0, -shift) * 0.05;

  out.shoulderL = 0.06 + breath * 0.025 + shift * 0.02;
  out.shoulderR = -0.04 + breath * 0.025 - shift * 0.02;
  out.elbowL = 0.12 + breath * 0.03;
  out.elbowR = 0.16 + breath * 0.03;

  out.bob = breath * 0.008;
  out.twist = shift * 0.025;
  out.roll = shift * 0.035;
}

/**
 * Walk and run share a driver but not their constants. A run is not a walk
 * played fast: the stride opens up, the knee lifts higher, the elbows come up
 * and stay bent, and the pelvis works harder.
 */
function gaitPose(out: Pose, phase: number, run: number): void {
  const swing = Math.sin(phase);
  const swingOpp = -swing;

  const stride = lerp(0.55, 0.85, run);
  const knee = lerp(1.0, 1.35, run);
  const armSwing = lerp(0.4, 0.72, run);
  const elbowBend = lerp(0.08, 0.55, run);
  const bobAmt = lerp(0.025, 0.055, run);

  out.hipL = swing * stride;
  out.hipR = swingOpp * stride;
  out.kneeL = softPos(-swing) * knee + 0.05;
  out.kneeR = softPos(-swingOpp) * knee + 0.05;

  // Arms counter-swing against the legs — same-side arm and leg moving
  // together is the classic broken-walk tell.
  out.shoulderL = swingOpp * armSwing;
  out.shoulderR = swing * armSwing;
  out.elbowL = softPos(swingOpp) * 0.5 + elbowBend;
  out.elbowR = softPos(swing) * 0.5 + elbowBend;

  out.bob = Math.abs(Math.sin(phase * 2)) * bobAmt;
  // Pelvis counter-rotates against the shoulders.
  out.twist = swing * lerp(0.06, 0.11, run);
  out.roll = swing * lerp(0.02, 0.05, run);
}

/**
 * Airborne: trailing leg tucked, lead leg reaching, arms up and out for
 * balance. A static pose — the hop is short enough that a driven one would
 * never be seen.
 */
function airPose(out: Pose): void {
  out.hipL = 0.62;
  out.hipR = -0.3;
  out.kneeL = 0.95;
  out.kneeR = 0.35;
  out.shoulderL = -0.75;
  out.shoulderR = -0.6;
  out.elbowL = 0.7;
  out.elbowR = 0.62;
  out.bob = 0;
  out.twist = 0.04;
  out.roll = 0;
}

function applyPose(L: PersonLimbs, p: Pose, lean: number): void {
  L.hipL.rotation.x = p.hipL - lean;
  L.hipR.rotation.x = p.hipR - lean;
  L.kneeL.rotation.x = p.kneeL;
  L.kneeR.rotation.x = p.kneeR;
  L.shoulderL.rotation.x = p.shoulderL;
  L.shoulderR.rotation.x = p.shoulderR;
  L.elbowL.rotation.x = p.elbowL;
  L.elbowR.rotation.x = p.elbowR;

  L.hips.position.y = L.baseHipY + p.bob;
  L.hips.rotation.y = p.twist;
  L.hips.rotation.z = p.roll;
  // Whole-body lean from acceleration. The legs are counter-rotated above so
  // the torso tips forward without the feet swinging out behind.
  L.hips.rotation.x = lean;
}

/**
 * Drives a standing character's idle. Used for NPCs, who are otherwise never
 * updated after spawn.
 */
export function setIdlePhase(group: THREE.Group, t: number): void {
  const L = group.userData.limbs as PersonLimbs | undefined;
  if (!L) return;
  idlePose(poseA, t);
  applyPose(L, poseA, 0);
}

/** Snaps straight to the neutral standing pose, with no motion. */
export function makeIdlePose(group: THREE.Group): void {
  setIdlePhase(group, 0);
}

/**
 * Blends idle → walk → run and writes the result to the rig.
 *
 * @param phase  stride phase in radians
 * @param gait   0 standing, 1 walking, 2 running — fractional, and damped by
 *               the caller so transitions crossfade instead of popping
 * @param lean   forward body lean in radians, from acceleration
 * @param t      wall-clock seconds, drives the idle's breathing
 * @param air    0 grounded, 1 fully airborne — blends over the ground pose
 */
export function setWalkPhase(
  group: THREE.Group,
  phase: number,
  gait = 1,
  lean = 0,
  t = 0,
  air = 0
): void {
  const L = group.userData.limbs as PersonLimbs | undefined;
  if (!L) return;

  if (gait <= 0.001) {
    idlePose(poseA, t);
  } else {
    const run = Math.min(1, Math.max(0, gait - 1));
    gaitPose(poseB, phase, run);
    if (gait >= 1) {
      copyPose(poseA, poseB);
    } else {
      // Standing-to-walking: crossfade, so the feet don't skate through a
      // half-amplitude walk.
      idlePose(poseA, t);
      blendInto(poseA, poseA, poseB, gait);
    }
  }

  if (air > 0.001) {
    airPose(poseB);
    blendInto(poseA, poseA, poseB, air);
  }

  applyPose(L, poseA, lean * (1 - air));
}
