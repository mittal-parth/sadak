/**
 * City buses and two-wheelers.
 *
 * An Indian street is not cars and autos: it is a wall of scooters and
 * motorcycles filtering along the kerb, and a city bus in that city's own
 * livery. BEST red double-deckers are Mumbai; a green DTC low-floor is Delhi;
 * a blue BMTC is Bengaluru. Livery is identity, so each city gets its own.
 *
 * Both are built from flat-coloured parts baked into one vertex-coloured
 * geometry, so a scooter with two riders is a single draw call and a bus is
 * one body mesh, one glass mesh and its wheels.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./props";
import type { Landmark } from "./assets";
import type { TaxiStyle, VehicleMaterials } from "./vehicles";

/* ------------------------------------------------------------------ *
 * Per-city traffic
 * ------------------------------------------------------------------ */

export type BusLivery = {
  /** Lower body, stripe band, and upper body / roof. */
  body: number;
  stripe: number;
  upper: number;
  /** Share of the fleet that is a double-decker (Mumbai only). */
  doubleDecker: number;
};

export type CityTraffic = {
  bikes: number;
  buses: number;
  bus: BusLivery;
  taxi: TaxiStyle;
};

export const CITY_TRAFFIC: Record<Landmark, CityTraffic> = {
  // DTC low-floor CNG: green with a yellow band.
  delhi: { bikes: 12, buses: 2, taxi: "plain", bus: { body: 0x2e8b4f, stripe: 0xf2c230, upper: 0x2e8b4f, doubleDecker: 0 } },
  // BEST: red with a cream band, half of them double-deckers.
  mumbai: { bikes: 9, buses: 3, taxi: "kaaliPeeli", bus: { body: 0xc0282d, stripe: 0xf1e3c2, upper: 0xc0282d, doubleDecker: 0.5 } },
  // MTC: green lower body, yellow upper.
  chennai: { bikes: 12, buses: 2, taxi: "plain", bus: { body: 0x2f7d4a, stripe: 0xffffff, upper: 0xe7c43a, doubleDecker: 0 } },
  // BMTC Vajra blue.
  bengaluru: { bikes: 16, buses: 2, taxi: "plain", bus: { body: 0x2a5caa, stripe: 0xffffff, upper: 0x2a5caa, doubleDecker: 0 } },
  // Kolkata private buses: yellow and blue, and the yellow Ambassador taxi.
  kolkata: { bikes: 7, buses: 3, taxi: "yellow", bus: { body: 0x2d5aa8, stripe: 0xf2c230, upper: 0xf2c230, doubleDecker: 0 } },
  // TSRTC city: red with a white band.
  hyderabad: { bikes: 14, buses: 2, taxi: "plain", bus: { body: 0xb3262d, stripe: 0xffffff, upper: 0xb3262d, doubleDecker: 0 } },
  // KSRTC: red with a yellow band.
  kochi: { bikes: 10, buses: 2, taxi: "plain", bus: { body: 0xc8322b, stripe: 0xf2c230, upper: 0xc8322b, doubleDecker: 0 } },
  // Janmarg BRTS: red and white.
  ahmedabad: { bikes: 13, buses: 2, taxi: "plain", bus: { body: 0xd23b2f, stripe: 0xffffff, upper: 0xf4f1ea, doubleDecker: 0 } },
  // Amritsar BRTS: blue and white.
  amritsar: { bikes: 10, buses: 2, taxi: "plain", bus: { body: 0x1f4e9c, stripe: 0xffffff, upper: 0x1f4e9c, doubleDecker: 0 } },
  // Mo Bus: violet-blue with a pink band.
  bhubaneswar: { bikes: 11, buses: 2, taxi: "plain", bus: { body: 0x3b3aa6, stripe: 0xe9468f, upper: 0xf4f1ea, doubleDecker: 0 } },
};

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

const _c = new THREE.Color();

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  _c.setHex(hex);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) _c.toArray(cols, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number) {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = BufferGeometryUtils.mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Shared vertex-colour material for every bus body and bike in a city. */
export function createTransitMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/* ------------------------------------------------------------------ *
 * Bus
 * ------------------------------------------------------------------ */

/**
 * A city bus, facing +z. Two decks when `double`. Wheels are separate so the
 * traffic loop can roll them; `userData` follows the makeCar contract.
 */
export function makeBus(
  mats: VehicleMaterials,
  body: THREE.Material,
  livery: BusLivery,
  seed: number
): THREE.Group {
  const rand = mulberry32(seed);
  const double = rand() < livery.doubleDecker;
  const L = double ? 10.4 : 11.2;
  const W = 2.5;
  const deck = 2.05;
  const H = double ? deck * 2 + 0.35 : 3.05;
  const floor = 0.45;
  const hl = L / 2;

  const parts: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];

  // Lower body up to the window line, then the band, then the upper body.
  const beltY = floor + 1.05;
  parts.push(box(W, beltY - floor, L, 0, (floor + beltY) / 2, 0, livery.body));
  parts.push(box(W + 0.02, 0.22, L + 0.02, 0, beltY + 0.05, 0, livery.stripe));
  parts.push(box(W, H - beltY, L, 0, (beltY + H) / 2 + 0.08, 0, livery.upper));
  // Roof, a shade lighter, with an AC pod on single-deckers.
  parts.push(box(W - 0.1, 0.12, L - 0.3, 0, H + 0.14, 0, 0xe8e6e0));
  if (!double) parts.push(box(1.5, 0.28, 2.6, 0, H + 0.34, -1.2, 0xd9d6cf));
  // Bumpers and skirt.
  parts.push(box(W + 0.04, 0.3, 0.2, 0, floor + 0.05, hl + 0.05, 0x2a2a2e));
  parts.push(box(W + 0.04, 0.3, 0.2, 0, floor + 0.05, -hl - 0.05, 0x2a2a2e));
  parts.push(box(W - 0.2, 0.35, L - 1.0, 0, floor - 0.1, 0, 0x2a2a2e));
  // Destination board: amber LED strip above the windscreen.
  parts.push(box(1.7, 0.26, 0.05, 0, H - 0.25, hl + 0.03, 0xffb21e));
  // Headlamps.
  for (const sx of [-0.85, 0.85]) parts.push(box(0.3, 0.16, 0.05, sx, floor + 0.45, hl + 0.03, 0xfff3c8));

  // Windows: a continuous band per deck on both sides, split by pillars, plus
  // windscreen and rear glass.
  const decks = double ? [beltY + 0.18, beltY + deck + 0.12] : [beltY + 0.18];
  for (const y0 of decks) {
    const wh = 0.95;
    for (const sx of [-1, 1]) {
      glass.push(new THREE.BoxGeometry(0.04, wh, L - 1.4).translate(sx * (W / 2 + 0.01), y0 + wh / 2, -0.2));
      // Window pillars.
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const z = -hl + 0.5 + ((L - 1.4) * i) / n;
        parts.push(box(0.06, wh, 0.12, sx * (W / 2 + 0.02), y0 + wh / 2, z, livery.upper));
      }
    }
    glass.push(new THREE.BoxGeometry(W - 0.3, wh, 0.04).translate(0, y0 + wh / 2, -hl - 0.01));
  }
  // Windscreen, tall on the lower deck.
  glass.push(new THREE.BoxGeometry(W - 0.25, 1.35, 0.04).translate(0, beltY + 0.55, hl + 0.01));
  // Doors on the kerb (left) side, front and middle.
  for (const z of [hl - 1.4, -0.6]) {
    parts.push(box(0.05, 2.0, 1.0, -W / 2 - 0.02, floor + 1.0, z, 0x3a3f46));
  }

  const g = new THREE.Group();
  g.name = double ? "bus_double" : "bus";
  const bodyMesh = new THREE.Mesh(merge(parts), body);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  g.add(bodyMesh);
  const glassGeo = BufferGeometryUtils.mergeGeometries(glass, false)!;
  glass.forEach((p) => p.dispose());
  g.add(new THREE.Mesh(glassGeo, mats.glass));

  const wheelR = 0.5;
  const tyre = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 14).rotateZ(Math.PI / 2);
  const wheels: THREE.Object3D[] = [];
  for (const az of [hl - 2.0, -hl + 2.6]) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(tyre, mats.tyre);
      w.position.set(sx * (W / 2 - 0.2), wheelR, az);
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
  }

  g.userData.wheels = wheels;
  g.userData.wheelRadius = wheelR;
  g.userData.halfLength = hl;
  g.userData.kind = "bus";
  return g;
}

/* ------------------------------------------------------------------ *
 * Two-wheelers
 * ------------------------------------------------------------------ */

const BIKE_COLOURS = [0x1b1b1f, 0xc0282d, 0x1f4e9c, 0xe9eaec, 0x7c7f86, 0x2e6b3a, 0x6b2a86, 0xf08a24];
const SHIRTS = [0xf4f1ea, 0x2f5f9e, 0xc0392b, 0x3b3b3b, 0x6d8f5a, 0xe6b84a, 0x9ec3e6];
const SARI = [0xd63a2f, 0xe8a317, 0x1f8a70, 0x8e2c6f, 0xef6f9f, 0x2f6fb3];
const SKIN = [0x8d5a3b, 0x9c6644, 0xa9724b, 0x7a4b2e, 0xb58058];
const HELMETS = [0x111111, 0xe9e9e9, 0xc0282d, 0x1f4e9c, 0xf2c230];

/** Seated rider, astride (or side-saddle for a sari pillion), facing +z. */
function rider(
  parts: THREE.BufferGeometry[],
  z: number,
  seatY: number,
  rand: () => number,
  opts: { sideSaddle?: boolean; helmet?: boolean }
) {
  const skin = SKIN[Math.floor(rand() * SKIN.length)];
  const top = opts.sideSaddle ? SARI[Math.floor(rand() * SARI.length)] : SHIRTS[Math.floor(rand() * SHIRTS.length)];
  const legs = opts.sideSaddle ? top : 0x2b2f3a;

  // Torso leaning slightly forward.
  const torso = new THREE.BoxGeometry(0.38, 0.58, 0.24);
  torso.rotateX(opts.sideSaddle ? 0 : 0.18);
  torso.translate(0, seatY + 0.32, z);
  parts.push(paint(torso, top));
  parts.push(box(0.2, 0.2, 0.2, 0, seatY + 0.75, z + 0.04, skin));
  if (opts.helmet) {
    parts.push(box(0.26, 0.2, 0.28, 0, seatY + 0.84, z + 0.03, HELMETS[Math.floor(rand() * HELMETS.length)]));
  } else {
    parts.push(box(0.22, 0.08, 0.22, 0, seatY + 0.86, z + 0.02, 0x16120f));
  }
  if (opts.sideSaddle) {
    // Both legs down one side, draped.
    parts.push(box(0.3, 0.52, 0.3, 0.3, seatY - 0.2, z, legs));
  } else {
    for (const sx of [-0.17, 0.17]) {
      const thigh = new THREE.BoxGeometry(0.14, 0.14, 0.45).translate(sx, seatY + 0.02, z + 0.2);
      parts.push(paint(thigh, legs));
      parts.push(box(0.12, 0.45, 0.13, sx * 1.35, seatY - 0.22, z + 0.42, legs));
    }
    // Arms reaching for the bars.
    for (const sx of [-0.22, 0.22]) {
      const arm = new THREE.BoxGeometry(0.09, 0.09, 0.5);
      arm.rotateX(0.35);
      arm.translate(sx, seatY + 0.45, z + 0.32);
      parts.push(paint(arm, top));
    }
  }
}

/**
 * A scooter or a motorcycle with its rider, sometimes a pillion: a woman in a
 * sari side-saddle behind a helmeted man is the most Indian image in traffic.
 * One vertex-coloured mesh; wheels are not split out (at street distance
 * nobody can tell a 0.3m wheel is not turning, and it saves three meshes).
 */
export function makeTwoWheeler(
  material: THREE.Material,
  seed: number,
  opts: { parked?: boolean } = {}
): THREE.Group {
  const rand = mulberry32(seed);
  const scooter = rand() < 0.55;
  const colour = BIKE_COLOURS[Math.floor(rand() * BIKE_COLOURS.length)];
  const parts: THREE.BufferGeometry[] = [];
  const wheelR = scooter ? 0.26 : 0.32;

  for (const z of [0.62, -0.62]) {
    const t = new THREE.CylinderGeometry(wheelR, wheelR, 0.11, 12).rotateZ(Math.PI / 2).translate(0, wheelR, z);
    parts.push(paint(t, 0x141416));
  }

  let seatY: number;
  if (scooter) {
    // Step-through: apron at the front, floorboard, rounded rear body.
    parts.push(box(0.36, 0.72, 0.18, 0, 0.62, 0.48, colour));
    parts.push(box(0.3, 0.1, 0.55, 0, 0.3, 0.1, 0x2a2a2e));
    parts.push(box(0.4, 0.42, 0.72, 0, 0.5, -0.36, colour));
    parts.push(box(0.32, 0.1, 0.62, 0, 0.77, -0.32, 0x1c1c1e));
    parts.push(box(0.56, 0.05, 0.05, 0, 1.03, 0.52, 0x2a2a2e));
    parts.push(box(0.16, 0.1, 0.05, 0, 0.92, 0.6, 0xfff3c8));
    seatY = 0.8;
  } else {
    // Commuter motorcycle: tank, frame, seat, silver engine.
    parts.push(box(0.28, 0.22, 0.46, 0, 0.82, 0.22, colour));
    parts.push(box(0.14, 0.14, 1.0, 0, 0.58, 0, 0x2a2a2e));
    parts.push(box(0.3, 0.26, 0.34, 0, 0.42, 0.06, 0x9a9da3));
    parts.push(box(0.26, 0.09, 0.66, 0, 0.84, -0.3, 0x1c1c1e));
    parts.push(box(0.07, 0.07, 0.6, 0.16, 0.36, -0.36, 0xb6b9be));
    parts.push(box(0.62, 0.05, 0.05, 0, 1.05, 0.5, 0x2a2a2e));
    parts.push(box(0.18, 0.16, 0.08, 0, 0.95, 0.6, 0xfff3c8));
    seatY = 0.88;
  }

  if (opts.parked) {
    // Side stand down, so it leans.
    parts.push(box(0.04, 0.3, 0.04, -0.2, 0.15, 0.05, 0x2a2a2e));
  } else {
    rider(parts, -0.08, seatY, rand, { helmet: rand() < 0.6 });
    if (rand() < 0.35) rider(parts, -0.5, seatY, rand, { sideSaddle: rand() < 0.6, helmet: false });
  }

  const g = new THREE.Group();
  g.name = scooter ? "scooter" : "motorcycle";
  const mesh = new THREE.Mesh(merge(parts), material);
  mesh.castShadow = true;
  if (opts.parked) mesh.rotation.z = 0.12;
  g.add(mesh);
  g.userData.wheels = [];
  g.userData.wheelRadius = wheelR;
  g.userData.halfLength = 0.95;
  g.userData.kind = "bike";
  return g;
}
