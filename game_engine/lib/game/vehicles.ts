/**
 * Road vehicles.
 *
 * The street used to be nothing but auto-rickshaws, and an auto is easy to fake
 * with boxes because it genuinely is boxy. A car is not: the thing that makes a
 * car read as a car is the *side silhouette* — the fall of the bonnet, the rake
 * of the windscreen, the drop of the roofline into the boot. Stacking cuboids
 * gets you a bread van every time.
 *
 * So each body is an ExtrudeGeometry of a real side profile, bevelled so the
 * edges catch light, and the greenhouse is a SECOND, narrower extrusion in
 * glass sitting on top of it. That one decision (body and glasshouse as
 * separate tapered volumes rather than a window texture on a box) is what gives
 * the shoulder line and the tumblehome that make the shape legible from any
 * angle.
 *
 * Perf follows the buildings.ts/people.ts pattern: every static part is baked
 * into world-space-of-the-car geometry and merged per material, so a whole car
 * is ~6 draw calls including its four wheels, which are left separate only
 * because they have to spin.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./props";

export type CarKind = "hatchback" | "sedan" | "suv" | "taxi" | "van";

/** Kinds that make sense as moving traffic, in rough Indian street proportion. */
export const TRAFFIC_KINDS: CarKind[] = [
  "hatchback",
  "hatchback",
  "hatchback",
  "sedan",
  "sedan",
  "suv",
  "taxi",
  "van",
];

/** Believable mass-market paint. Deliberately desaturated: a street full of
 *  primary colours reads as a toy box. White/silver dominate for a reason. */
export const CAR_COLOURS = [
  0xe9eaec, 0xe9eaec, 0xd8dade, 0xb9bcc0, 0x8f959b, 0x2b2f36,
  0x1b3a5c, 0x6d1f22, 0x3d5a45, 0x7c4a2a, 0xc9c2b2,
];

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

/**
 * Per-Game material kit. Cars share a handful of materials across the whole
 * fleet rather than allocating a set each, but the kit is owned by the caller
 * so nothing leaks between Game instances (Game.dispose() walks the scene and
 * disposes what it finds, which would poison a module-level cache).
 */
export type VehicleMaterials = {
  paint(colour: number): THREE.Material;
  glass: THREE.Material;
  chrome: THREE.Material;
  trim: THREE.Material;
  tyre: THREE.Material;
  lamp: THREE.Material;
  tail: THREE.Material;
  plate: THREE.Material;
  dispose(): void;
};

export function createVehicleMaterials(): VehicleMaterials {
  const paints = new Map<number, THREE.Material>();
  const owned: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T): T => {
    owned.push(m);
    return m;
  };

  // Clearcoat over a mildly metallic base is what separates car paint from
  // painted plaster: a tight bright highlight riding on a broader body colour.
  const paint = (colour: number) => {
    const hit = paints.get(colour);
    if (hit) return hit;
    const m = keep(
      new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.34,
        metalness: 0.5,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      })
    );
    paints.set(colour, m);
    return m;
  };

  return {
    paint,
    glass: keep(
      new THREE.MeshPhysicalMaterial({
        color: 0x121b21,
        roughness: 0.09,
        metalness: 0.2,
        transparent: true,
        opacity: 0.62,
      })
    ),
    chrome: keep(new THREE.MeshStandardMaterial({ color: 0xc6cace, roughness: 0.2, metalness: 0.95 })),
    trim: keep(new THREE.MeshStandardMaterial({ color: 0x191b1f, roughness: 0.78, metalness: 0.1 })),
    tyre: keep(new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.96, metalness: 0 })),
    lamp: keep(
      new THREE.MeshStandardMaterial({
        color: 0xfff4d6,
        emissive: 0xffe9b8,
        emissiveIntensity: 1.1,
        roughness: 0.2,
      })
    ),
    tail: keep(
      new THREE.MeshStandardMaterial({
        color: 0x8c1410,
        emissive: 0xff2a18,
        emissiveIntensity: 0.9,
        roughness: 0.3,
      })
    ),
    plate: keep(new THREE.MeshStandardMaterial({ color: 0xe4e2d6, roughness: 0.85 })),
    dispose() {
      owned.forEach((m) => m.dispose());
      owned.length = 0;
      paints.clear();
    },
  };
}

/* ------------------------------------------------------------------ *
 * Body profiles
 * ------------------------------------------------------------------ */

/**
 * A car described entirely in side view. All Z values are along the car's
 * length with +Z forward (matching the game's convention that rotation.y = 0
 * faces +Z), all Y values are heights above the road.
 */
type Profile = {
  length: number;
  width: number;
  /** Bottom of the body shell — the rocker panel, below the doors. */
  sill: number;
  /** Top of the doors; where the glasshouse starts. */
  belt: number;
  /** Top of the roof panel. */
  roof: number;
  /** Height of the bonnet, and of the boot lid. */
  bonnet: number;
  boot: number;
  /** Z where the windscreen meets the bonnet, and the rear screen the boot. */
  cabinFront: number;
  cabinRear: number;
  /** Z of the roof panel's leading and trailing edge — the difference between
   *  these and cabinFront/cabinRear is the pillar rake. */
  roofFront: number;
  roofRear: number;
  /** Z of each axle. */
  frontAxle: number;
  rearAxle: number;
  wheelR: number;
  wheelW: number;
  /** How much narrower the glasshouse is than the body (tumblehome). */
  tumble: number;
};

function profileFor(kind: CarKind): Profile {
  switch (kind) {
    case "hatchback":
      // Short rear overhang, roof carried almost to the tail: the shape of
      // every small car on an Indian street.
      return {
        length: 3.72, width: 1.66,
        sill: 0.44, belt: 1.06, roof: 1.5, bonnet: 0.98, boot: 1.06,
        cabinFront: 0.24, cabinRear: -1.6,
        roofFront: -0.24, roofRear: -1.36,
        frontAxle: 1.2, rearAxle: -1.16, wheelR: 0.3, wheelW: 0.19,
        tumble: 0.13,
      };
    case "sedan":
      return {
        length: 4.36, width: 1.76,
        sill: 0.42, belt: 1.05, roof: 1.46, bonnet: 0.96, boot: 1.06,
        cabinFront: 0.34, cabinRear: -1.24,
        roofFront: -0.16, roofRear: -1.02,
        frontAxle: 1.36, rearAxle: -1.32, wheelR: 0.32, wheelW: 0.21,
        tumble: 0.14,
      };
    case "taxi":
      // The old three-box saloon: upright glass, tall roof, small wheels.
      return {
        length: 4.28, width: 1.78,
        sill: 0.46, belt: 1.12, roof: 1.62, bonnet: 1.02, boot: 1.12,
        cabinFront: 0.42, cabinRear: -1.18,
        roofFront: 0.06, roofRear: -1.0,
        frontAxle: 1.3, rearAxle: -1.26, wheelR: 0.33, wheelW: 0.2,
        tumble: 0.11,
      };
    case "suv":
      return {
        length: 4.5, width: 1.88,
        sill: 0.56, belt: 1.28, roof: 1.86, bonnet: 1.22, boot: 1.28,
        cabinFront: 0.5, cabinRear: -1.66,
        roofFront: 0.06, roofRear: -1.5,
        frontAxle: 1.44, rearAxle: -1.38, wheelR: 0.38, wheelW: 0.24,
        tumble: 0.1,
      };
    case "van":
      // Cab-forward: the windscreen starts almost at the front axle.
      return {
        length: 4.42, width: 1.8,
        sill: 0.5, belt: 1.32, roof: 2.06, bonnet: 1.18, boot: 1.32,
        cabinFront: 1.16, cabinRear: -2.0,
        roofFront: 0.66, roofRear: -2.02,
        frontAxle: 1.28, rearAxle: -1.34, wheelR: 0.34, wheelW: 0.22,
        tumble: 0.06,
      };
  }
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/**
 * Extrudes a side-view shape (drawn in XY, +X forward) across the car's width
 * and rotates it into the car's frame (+Z forward).
 */
function extrudeSide(shape: THREE.Shape, width: number, bevel = 0.045): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, width - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  // Extrusion runs 0..depth in Z; centre it, then swing the length axis round
  // from X to Z so the car faces +Z like every other prop in the game.
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

function slab(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  // ExtrudeGeometry comes back non-indexed and BoxGeometry indexed, and
  // mergeGeometries refuses to mix the two. Flatten everything to non-indexed
  // rather than silently getting null back.
  const flat = parts.map((p) => (p.getIndex() ? p.toNonIndexed() : p));
  const out = BufferGeometryUtils.mergeGeometries(flat, false);
  parts.forEach((p, i) => {
    if (flat[i] !== p) p.dispose();
  });
  flat.forEach((f) => f.dispose());
  return out;
}

/** Lower body: rocker -> boot -> beltline -> bonnet -> nose, as one closed loop. */
function bodyShape(p: Profile): THREE.Shape {
  const hl = p.length / 2;
  const s = new THREE.Shape();

  s.moveTo(-hl + 0.06, p.sill);
  // Rear panel up to the boot lid, with the corner knocked off.
  s.lineTo(-hl, p.sill + 0.18);
  s.lineTo(-hl, p.boot - 0.1);
  s.quadraticCurveTo(-hl, p.boot, -hl + 0.12, p.boot);
  // Boot lid forward to the base of the rear screen.
  s.lineTo(p.cabinRear, p.belt);
  // Along the beltline under the glass.
  s.lineTo(p.cabinFront, p.belt);
  // Down the cowl onto the bonnet, then along it.
  s.quadraticCurveTo(p.cabinFront + 0.12, p.bonnet, p.cabinFront + 0.32, p.bonnet);
  s.lineTo(hl - 0.22, p.bonnet - 0.02);
  // Round the nose down to the bumper line.
  s.quadraticCurveTo(hl, p.bonnet - 0.04, hl, p.bonnet - 0.28);
  s.lineTo(hl, p.sill + 0.16);
  s.quadraticCurveTo(hl, p.sill, hl - 0.08, p.sill);
  s.closePath();
  return s;
}

/** The glasshouse: beltline up to the roof, with raked A and C pillars. */
function glassShape(p: Profile): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(p.cabinRear, p.belt);
  s.lineTo(p.roofRear, p.roof);
  s.lineTo(p.roofFront, p.roof);
  s.lineTo(p.cabinFront, p.belt);
  s.closePath();
  return s;
}

/* ------------------------------------------------------------------ *
 * makeCar
 * ------------------------------------------------------------------ */

export type CarOptions = {
  kind?: CarKind;
  colour?: number;
  seed?: number;
};

/**
 * Builds one car. Wheels are exposed on `group.userData.wheels` so the caller
 * can roll them; everything else is merged and static.
 */
export function makeCar(mats: VehicleMaterials, opts: CarOptions = {}): THREE.Group {
  const seed = opts.seed ?? 1;
  const rand = mulberry32(seed);
  const kind = opts.kind ?? "sedan";
  const p = profileFor(kind);

  // A taxi is yellow with a black roof whatever the caller asks for; that
  // livery is the whole point of it being on the street.
  const colour =
    kind === "taxi" ? 0xf0b71c : opts.colour ?? CAR_COLOURS[Math.floor(rand() * CAR_COLOURS.length)];

  const g = new THREE.Group();
  g.name = `car_${kind}`;

  const paintMat = mats.paint(colour);
  const roofMat = kind === "taxi" ? mats.trim : paintMat;

  const paint: THREE.BufferGeometry[] = [];
  const roofParts: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const chrome: THREE.BufferGeometry[] = [];
  const lamps: THREE.BufferGeometry[] = [];
  const tails: THREE.BufferGeometry[] = [];

  const hl = p.length / 2;
  const hw = p.width / 2;
  const glassW = p.width - p.tumble * 2;

  /* ---- shell ---- */

  paint.push(extrudeSide(bodyShape(p), p.width));

  // Roof panel: its own slab so a taxi can wear a black one, and so the roof
  // reads as a distinct plane rather than the top edge of the glass.
  roofParts.push(
    slab(
      glassW + 0.04,
      0.07,
      p.roofFront - p.roofRear + 0.06,
      0,
      p.roof,
      (p.roofFront + p.roofRear) / 2
    )
  );

  /* ---- glasshouse ---- */

  const glassGeo = extrudeSide(glassShape(p), glassW, 0.02);
  const glassMesh = new THREE.Mesh(glassGeo, mats.glass);
  glassMesh.castShadow = false;
  g.add(glassMesh);

  // Pillars, in body colour, standing slightly proud of the glass. Without
  // these the cabin is one continuous window and the car looks like a bubble.
  const pillarW = glassW + 0.03;
  const pillarH = p.roof - p.belt;

  // Each pillar is a slab as long as the rake it spans (not as tall as the
  // cabin — a raked windscreen pillar is meaningfully longer than the cabin is
  // high, and cutting it to cabin height leaves a gap under the roof).
  const pillar = (zBottom: number, zTop: number, thickness: number) => {
    const dz = zBottom - zTop;
    const len = Math.hypot(dz, pillarH);
    const s = slab(pillarW, len, thickness, 0, 0, 0);
    s.rotateX(-Math.atan2(dz, pillarH));
    s.translate(0, p.belt + pillarH / 2, (zBottom + zTop) / 2);
    return s;
  };

  paint.push(pillar(p.cabinFront, p.roofFront, 0.11)); // A
  paint.push(pillar(p.cabinRear, p.roofRear, 0.13)); // C
  // B-pillar, in gloss black like nearly every real car.
  if (kind !== "van") {
    const bz = (p.cabinRear + p.cabinFront) / 2 - 0.15;
    trim.push(slab(pillarW + 0.01, pillarH, 0.08, 0, p.belt + pillarH / 2, bz));
  }

  /* ---- wheel arches, sills, bumpers ---- */

  for (const az of [p.frontAxle, p.rearAxle]) {
    // A dark arch liner behind each wheel: the wheel then sits in a hole
    // instead of floating against body colour.
    trim.push(slab(p.width - 0.06, p.wheelR * 1.5, p.wheelR * 2.5, 0, p.sill + 0.06, az));
  }

  trim.push(slab(p.width + 0.02, 0.16, p.length * 0.52, 0, p.sill - 0.02, 0)); // rocker
  trim.push(slab(p.width - 0.02, 0.3, 0.22, 0, p.sill + 0.2, hl - 0.02)); // front bumper
  trim.push(slab(p.width - 0.04, 0.28, 0.2, 0, p.sill + 0.2, -hl + 0.02)); // rear bumper

  // Grille + a chrome bar across it.
  const grilleY = p.bonnet - 0.16;
  trim.push(slab(p.width * 0.62, 0.2, 0.08, 0, grilleY, hl - 0.02));
  chrome.push(slab(p.width * 0.64, 0.05, 0.09, 0, grilleY + 0.09, hl - 0.02));

  /* ---- lamps ---- */

  const lampY = p.bonnet - 0.14;
  const lampX = hw - 0.26;
  for (const sx of [-1, 1]) {
    lamps.push(slab(0.36, 0.14, 0.1, sx * lampX, lampY, hl - 0.06));
    tails.push(slab(0.3, 0.16, 0.09, sx * lampX, p.boot - 0.22, -hl + 0.04));
  }

  /* ---- mirrors ---- */

  for (const sx of [-1, 1]) {
    trim.push(slab(0.18, 0.09, 0.06, sx * (hw + 0.06), p.belt + 0.02, p.cabinFront - 0.14));
  }

  /* ---- number plates ---- */

  const plates = [
    slab(0.46, 0.12, 0.03, 0, p.sill + 0.24, hl + 0.09),
    slab(0.46, 0.12, 0.03, 0, p.sill + 0.24, -hl - 0.09),
  ];

  /* ---- per-kind extras ---- */

  if (kind === "suv") {
    // Roof rails.
    for (const sx of [-1, 1]) {
      trim.push(slab(0.06, 0.06, (p.roofFront - p.roofRear) * 0.86, sx * (glassW / 2 - 0.14), p.roof + 0.06, (p.roofFront + p.roofRear) / 2));
    }
  }
  if (kind === "taxi") {
    // Roof sign.
    lamps.push(slab(0.5, 0.16, 0.24, 0, p.roof + 0.13, 0.2));
    // Livery band along the doors.
    trim.push(slab(p.width + 0.03, 0.14, p.length * 0.5, 0, p.belt - 0.16, -0.1));
  }
  if (kind === "van") {
    // Cargo body has no side glass behind the B-pillar; block it out in paint.
    paint.push(slab(glassW + 0.05, p.roof - p.belt, Math.abs(p.roofRear + 0.5), 0, (p.roof + p.belt) / 2, (p.roofRear - 0.5) / 2 - 0.25));
  }

  /* ---- assemble static meshes ---- */

  const addMesh = (geo: THREE.BufferGeometry | null, mat: THREE.Material, shadow = true) => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
  };

  addMesh(merged(paint), paintMat);
  addMesh(merged(roofParts), roofMat);
  addMesh(merged(trim), mats.trim);
  addMesh(merged(chrome), mats.chrome);
  addMesh(merged(lamps), mats.lamp, false);
  addMesh(merged(tails), mats.tail, false);
  addMesh(merged(plates), mats.plate, false);

  /* ---- wheels ---- */

  const wheels: THREE.Object3D[] = [];
  const tyreGeo = new THREE.CylinderGeometry(p.wheelR, p.wheelR, p.wheelW, 16);
  tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(p.wheelR * 0.6, p.wheelR * 0.6, p.wheelW + 0.03, 12);
  rimGeo.rotateZ(Math.PI / 2);

  for (const az of [p.frontAxle, p.rearAxle]) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, mats.tyre);
      tyre.castShadow = true;
      w.add(tyre);
      const rim = new THREE.Mesh(rimGeo, mats.chrome);
      w.add(rim);
      w.position.set(sx * (hw - p.wheelW / 2 - 0.03), p.wheelR, az);
      g.add(w);
      wheels.push(w);
    }
  }

  g.userData.wheels = wheels;
  g.userData.wheelRadius = p.wheelR;
  g.userData.kind = kind;
  /** Half-length, so traffic can keep a gap measured from the bodywork. */
  g.userData.halfLength = hl;

  return g;
}
