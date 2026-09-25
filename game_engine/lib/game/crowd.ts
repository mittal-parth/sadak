/**
 * The street crowd: people walking the footpaths, strolling the chowk, and
 * standing about in knots at corners and stalls.
 *
 * A few hundred full `makePerson` rigs would cost thousands of draw calls, so
 * the crowd is its own lightweight figure built from instanced parts: one
 * InstancedMesh per body part for the whole city, eight draw calls however
 * many people there are. Each part carries per-instance colour, so a sari, a
 * lungi and a checked shirt are the same mesh in different colours. Walkers
 * swing their legs and arms from the hip and shoulder every frame; standing
 * people are posed once.
 *
 * What people wear follows the city: more saris and lungis in Chennai, white
 * mundu in Kochi, salwar kameez and turbans in Amritsar, skullcaps in the old
 * city in Hyderabad.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./props";
import type { Landmark } from "./assets";
import type { Box } from "./city";

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

/**
 * Point on a square loop of half-size `half` centred on the origin, `s`
 * metres along it, walking anticlockwise (seen from above, +x then +z).
 * Returns the heading as a yaw that faces the direction of travel.
 */
export function loopPoint(half: number, s: number): { x: number; z: number; yaw: number } {
  const side = half * 2;
  const perim = side * 4;
  const t = ((s % perim) + perim) % perim;
  const leg = Math.floor(t / side);
  const d = t - leg * side;
  switch (leg) {
    case 0:
      return { x: -half + d, z: -half, yaw: Math.PI / 2 };
    case 1:
      return { x: half, z: -half + d, yaw: 0 };
    case 2:
      return { x: half - d, z: half, yaw: -Math.PI / 2 };
    default:
      return { x: -half, z: half - d, yaw: Math.PI };
  }
}

/* ------------------------------------------------------------------ *
 * Costume
 * ------------------------------------------------------------------ */

export type Costume = "trousers" | "kurta" | "salwar" | "sari" | "lungi";
const COSTUMES: Costume[] = ["trousers", "kurta", "salwar", "sari", "lungi"];

type CityDress = {
  /** Weights over COSTUMES. */
  mix: [number, number, number, number, number];
  /** Share of men in a turban, and in a skullcap. */
  turban: number;
  skullcap: number;
  /** Lungi/mundu colours; Kochi is nearly all white. */
  lungi: number[];
  /** Crowd size multiplier. */
  density: number;
};

const LUNGI_CHECKS = [0x2d5f9a, 0x7a2f3a, 0x3f6b3a, 0xf1ece0, 0x4a3f7a, 0xb2472a];
const MUNDU = [0xf6f1e3, 0xf6f1e3, 0xf6f1e3, 0xefe4c4];

export const CITY_DRESS: Record<Landmark, CityDress> = {
  delhi: { mix: [0.4, 0.15, 0.25, 0.15, 0.05], turban: 0.12, skullcap: 0.05, lungi: LUNGI_CHECKS, density: 1.3 },
  chennai: { mix: [0.35, 0.02, 0.13, 0.28, 0.22], turban: 0, skullcap: 0.02, lungi: LUNGI_CHECKS, density: 1.1 },
  bengaluru: { mix: [0.52, 0.05, 0.15, 0.18, 0.1], turban: 0.01, skullcap: 0.03, lungi: LUNGI_CHECKS, density: 1.0 },
  kolkata: { mix: [0.4, 0.1, 0.1, 0.28, 0.12], turban: 0.02, skullcap: 0.04, lungi: LUNGI_CHECKS, density: 1.25 },
  hyderabad: { mix: [0.4, 0.15, 0.2, 0.15, 0.1], turban: 0.01, skullcap: 0.22, lungi: LUNGI_CHECKS, density: 1.2 },
  kochi: { mix: [0.35, 0.02, 0.12, 0.2, 0.31], turban: 0, skullcap: 0.06, lungi: MUNDU, density: 0.9 },
  mumbai: { mix: [0.55, 0.05, 0.15, 0.2, 0.05], turban: 0.02, skullcap: 0.05, lungi: LUNGI_CHECKS, density: 1.35 },
  ahmedabad: { mix: [0.4, 0.1, 0.2, 0.28, 0.02], turban: 0.02, skullcap: 0.05, lungi: LUNGI_CHECKS, density: 1.1 },
  amritsar: { mix: [0.35, 0.2, 0.35, 0.08, 0.02], turban: 0.5, skullcap: 0, lungi: LUNGI_CHECKS, density: 1.15 },
  bhubaneswar: { mix: [0.4, 0.05, 0.12, 0.33, 0.1], turban: 0, skullcap: 0.02, lungi: LUNGI_CHECKS, density: 0.95 },
};

const SKIN = [0x8d5a3b, 0x9c6644, 0xa9724b, 0x7a4b2e, 0xb58058, 0x6b4028, 0xc28b62];
const SHIRTS = [0xf4f1ea, 0x9ec3e6, 0x2f5f9e, 0xd8d2c0, 0x6d8f5a, 0xc0392b, 0x3b3b3b, 0xe6b84a, 0x8e6fb5, 0xf08a5d];
const TROUSERS = [0x2b2f3a, 0x3b3f4a, 0x5a4a3a, 0x7b7d82, 0x1f3050, 0xc9bfa6];
const SARI = [0xd63a2f, 0xe8a317, 0x1f8a70, 0x8e2c6f, 0xef6f9f, 0x2f6fb3, 0xf2c14e, 0x6a3fa0, 0xe86a2c, 0x0f7c5a];
const SALWAR = [0xf28fb0, 0x5fb3a8, 0xf3d36b, 0xa66fd1, 0xe07a5f, 0x7fb069, 0xf4efe6, 0x4d7cc2];
const KURTA = [0xf6f1e3, 0xe9d8a6, 0xa7c7e7, 0xf2e2c4, 0xd9e4d0];
const TURBANS = [0xf08a24, 0x1f3a8a, 0xf6f1e3, 0xd6336c, 0x2a9d8f, 0x111111, 0xe8c547];

/* ------------------------------------------------------------------ *
 * Figure geometry (facing +z, feet at y = 0)
 * ------------------------------------------------------------------ */

const HIP_Y = 0.88;
const SHOULDER_Y = 1.42;
const HIP_X = 0.09;
const SHOULDER_X = 0.22;

function tint(geo: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(shade);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = BufferGeometryUtils.mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Leg with its foot, pivoting at the hip. Foot is darker (sandal/shoe). */
function legGeometry() {
  return merged([
    tint(new THREE.BoxGeometry(0.15, 0.84, 0.16).translate(0, -0.42, 0), 1),
    tint(new THREE.BoxGeometry(0.13, 0.07, 0.25).translate(0, -0.845, 0.045), 0.3),
  ]);
}

/** Arm with a hand, pivoting at the shoulder. Hand shares the instance
 *  colour, slightly darker, so a bare arm and a sleeve both read. */
function armGeometry() {
  return merged([
    tint(new THREE.BoxGeometry(0.1, 0.56, 0.11).translate(0, -0.28, 0), 1),
    tint(new THREE.BoxGeometry(0.09, 0.12, 0.1).translate(0, -0.62, 0), 0.88),
  ]);
}

function torsoGeometry() {
  const body = new THREE.CylinderGeometry(0.2, 0.16, 0.6, 8).scale(1, 1, 0.62).translate(0, 1.13, 0);
  const shoulders = new THREE.BoxGeometry(0.46, 0.1, 0.22).translate(0, 1.4, 0);
  const neck = new THREE.CylinderGeometry(0.05, 0.055, 0.08, 6).translate(0, 1.47, 0);
  return merged([tint(body, 1), tint(shoulders, 1), tint(neck, 0.92)]);
}

/** Skirt, hanging from the waist; scaled in y for a knee-length kurta. */
function skirtGeometry() {
  return merged([tint(new THREE.CylinderGeometry(0.19, 0.27, 0.84, 10).scale(1, 1, 0.78).translate(0, -0.42, 0), 1)]);
}

/** Head with hair; `long` adds a plait down the back. Hair is baked in as a
 *  near-black vertex shade, which the skin instance colour multiplies. */
function headGeometry(long: boolean) {
  const parts = [
    tint(new THREE.IcosahedronGeometry(0.115, 1).scale(0.92, 1.05, 1).translate(0, 1.6, 0.01), 1),
    tint(
      new THREE.SphereGeometry(0.123, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
        .scale(0.95, 1, 1)
        .translate(0, 1.62, -0.012),
      0.12
    ),
  ];
  if (long) {
    parts.push(tint(new THREE.BoxGeometry(0.1, 0.42, 0.06).translate(0, 1.4, -0.12), 0.12));
  }
  return merged(parts);
}

function headwearGeometry() {
  // Turban: a wrapped crown with a peaked front fold.
  return merged([
    tint(new THREE.CylinderGeometry(0.14, 0.128, 0.13, 10).translate(0, 1.7, -0.005), 1),
    tint(new THREE.ConeGeometry(0.1, 0.1, 6).translate(0, 1.77, 0.03), 0.9),
  ]);
}

/** Pallu or dupatta: a band over one shoulder, diagonally across the chest. */
function drapeGeometry() {
  const band = new THREE.BoxGeometry(0.16, 0.7, 0.03);
  band.rotateZ(0.55);
  band.translate(0.02, 1.15, 0.13);
  const back = new THREE.BoxGeometry(0.16, 0.55, 0.03);
  back.translate(0.16, 1.1, -0.13);
  return merged([tint(band, 1), tint(back, 0.9)]);
}

/* ------------------------------------------------------------------ *
 * Crowd
 * ------------------------------------------------------------------ */

type Mover =
  | { kind: "loop"; cx: number; cz: number; half: number; dir: 1 | -1; s: number; lateral: number }
  | { kind: "stroll"; tx: number; tz: number }
  | { kind: "stand" };

type Person = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  phase: number;
  height: number;
  costume: Costume;
  mover: Mover;
};

export type CrowdOpts = {
  landmark: Landmark;
  /** Centres of blocks whose footpaths people walk. */
  blocks: { cx: number; cz: number }[];
  blockSize: number;
  /** Walking lines, distance in from the kerb edge; one per direction. */
  lanes: readonly [number, number];
  /** Pavement top height. */
  groundY: number;
  /** The open square, strolled rather than looped. */
  chowk: { x: number; z: number; half: number };
  /** Static obstacles strollers and standers keep clear of. */
  colliders: Box[];
  /** Spots where people gather and stand: stalls, corners, bus stops. */
  gatherings: { x: number; z: number; size: number }[];
  seed?: number;
};

export type Crowd = {
  group: THREE.Group;
  count: number;
  update(dt: number): void;
  dispose(): void;
};

const PARTS = ["legs", "arms", "torso", "skirt", "headShort", "headLong", "headwear", "drape"] as const;
type PartName = (typeof PARTS)[number];

function pickWeighted<T>(items: readonly T[], weights: readonly number[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i] / total;
    if (r < acc) return items[i];
  }
  return items[items.length - 1];
}

export function createCrowd(opts: CrowdOpts): Crowd {
  const rand = mulberry32(opts.seed ?? 31337);
  const dress = CITY_DRESS[opts.landmark];
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

  const blocked = (x: number, z: number, margin: number) =>
    opts.colliders.some((b) => Math.abs(x - b.x) < b.hw + margin && Math.abs(z - b.z) < b.hd + margin);

  /* ---------------- population ---------------- */

  const people: Person[] = [];
  const add = (x: number, z: number, yaw: number, mover: Mover) => {
    const costume = pickWeighted(COSTUMES, dress.mix, rand());
    people.push({
      x,
      z,
      yaw,
      speed: mover.kind === "stand" ? 0 : 1.05 + rand() * 0.55,
      phase: rand() * Math.PI * 2,
      height: 0.88 + rand() * 0.14,
      costume,
      mover,
    });
  };

  // Footpath walkers: a few per block, each on its lane's loop. Lane 0 walks
  // anticlockwise, lane 1 clockwise, so the two streams pass rather than
  // queue behind each other.
  // Busiest round the chowk, where the player spends their time; the
  // outer blocks thin out rather than empty.
  for (const b of opts.blocks) {
    const near =
      Math.abs(b.cx - opts.chowk.x) <= opts.blockSize * 1.5 && Math.abs(b.cz - opts.chowk.z) <= opts.blockSize * 1.5;
    const n = Math.round((near ? 13 : 6) * dress.density) + (rand() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const lane = i % 2;
      const half = opts.blockSize / 2 - opts.lanes[lane];
      const s = rand() * half * 8;
      add(b.cx, b.cz, 0, {
        kind: "loop",
        cx: b.cx,
        cz: b.cz,
        half,
        dir: lane === 0 ? 1 : -1,
        s,
        lateral: (rand() - 0.5) * 0.3,
      });
    }
  }

  // Strollers crossing the chowk between free spots.
  const chowkPoint = (): { x: number; z: number } => {
    for (let tries = 0; tries < 30; tries++) {
      const x = opts.chowk.x + (rand() - 0.5) * opts.chowk.half * 1.8;
      const z = opts.chowk.z + (rand() - 0.5) * opts.chowk.half * 1.8;
      if (!blocked(x, z, 0.6)) return { x, z };
    }
    return { x: opts.chowk.x, z: opts.chowk.z - opts.chowk.half * 0.6 };
  };
  const strollers = Math.round(18 * dress.density);
  for (let i = 0; i < strollers; i++) {
    const p = chowkPoint();
    const t = chowkPoint();
    add(p.x, p.z, 0, { kind: "stroll", tx: t.x, tz: t.z });
  }

  // Knots of people standing together, facing into the group.
  for (const g of opts.gatherings) {
    const n = Math.max(1, Math.round(g.size * dress.density));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.5;
      const r = n === 1 ? 0 : 0.55 + rand() * 0.25;
      const x = g.x + Math.cos(a) * r;
      const z = g.z + Math.sin(a) * r;
      if (blocked(x, z, 0.25)) continue;
      // Face the middle of the knot (yaw faces +z at 0).
      const yaw = n === 1 ? rand() * Math.PI * 2 : Math.atan2(g.x - x, g.z - z);
      add(x, z, yaw, { kind: "stand" });
    }
  }

  /* ---------------- meshes ---------------- */

  const N = people.length;
  const geos: Record<PartName, THREE.BufferGeometry> = {
    legs: legGeometry(),
    arms: armGeometry(),
    torso: torsoGeometry(),
    skirt: skirtGeometry(),
    headShort: headGeometry(false),
    headLong: headGeometry(true),
    headwear: headwearGeometry(),
    drape: drapeGeometry(),
  };
  const counts: Record<PartName, number> = {
    legs: N * 2,
    arms: N * 2,
    torso: N,
    skirt: N,
    headShort: N,
    headLong: N,
    headwear: N,
    drape: N,
  };

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.name = "crowd";
  const meshes = {} as Record<PartName, THREE.InstancedMesh>;
  for (const name of PARTS) {
    const m = new THREE.InstancedMesh(geos[name], material, counts[name]);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instances span the whole city; the geometry's bounds say nothing about
    // where they are.
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    meshes[name] = m;
    group.add(m);
  }

  /* ---------------- per-person colour and part visibility ---------------- */

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const col = new THREE.Color();
  /** Which optional parts each person shows. */
  const shows: { skirt: number; long: boolean; headwear: boolean; cap: boolean; drape: boolean }[] = [];

  people.forEach((p, i) => {
    const skin = pick(SKIN);
    let shirt = pick(SHIRTS);
    let legs = pick(TROUSERS);
    let skirtColour = 0;
    let skirt = 0; // skirt length scale; 0 = none
    let long = false;
    let drape = 0;
    let bareArms = rand() < 0.45;

    switch (p.costume) {
      case "sari": {
        const s = pick(SARI);
        skirtColour = s;
        skirt = 1;
        shirt = rand() < 0.5 ? s : pick(SARI);
        drape = s;
        legs = skin;
        long = true;
        bareArms = true;
        break;
      }
      case "salwar":
        shirt = pick(SALWAR);
        skirtColour = shirt;
        skirt = 0.62;
        legs = rand() < 0.5 ? 0xf4efe6 : pick(SALWAR);
        drape = pick(SALWAR);
        long = true;
        bareArms = rand() < 0.3;
        break;
      case "kurta":
        shirt = pick(KURTA);
        skirtColour = shirt;
        skirt = 0.55;
        legs = 0xf4efe6;
        bareArms = false;
        break;
      case "lungi":
        skirtColour = pick(dress.lungi);
        skirt = 1;
        shirt = rand() < 0.4 ? 0xf4f1ea : pick(SHIRTS);
        legs = skin;
        break;
      case "trousers":
        long = rand() < 0.28;
        break;
    }

    const female = long;
    const headwear = !female && (rand() < dress.turban || rand() < dress.skullcap);
    const turban = headwear && rand() < dress.turban / Math.max(0.001, dress.turban + dress.skullcap);

    meshes.torso.setColorAt(i, col.setHex(shirt));
    meshes.skirt.setColorAt(i, col.setHex(skirtColour || shirt));
    for (const k of [0, 1]) {
      meshes.legs.setColorAt(i * 2 + k, col.setHex(legs));
      meshes.arms.setColorAt(i * 2 + k, col.setHex(bareArms ? skin : shirt));
    }
    meshes.headShort.setColorAt(i, col.setHex(skin));
    meshes.headLong.setColorAt(i, col.setHex(skin));
    meshes.headwear.setColorAt(i, col.setHex(turban ? pick(TURBANS) : 0xf6f4ee));
    meshes.drape.setColorAt(i, col.setHex(drape || shirt));

    shows.push({ skirt, long, headwear, cap: headwear && !turban, drape: drape !== 0 });
  });

  for (const name of PARTS) {
    if (meshes[name].instanceColor) meshes[name].instanceColor!.needsUpdate = true;
  }

  /* ---------------- posing ---------------- */

  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const scaleV = new THREE.Vector3();
  const capScale = new THREE.Matrix4().makeScale(1.02, 0.45, 1.02);
  const capOffset = new THREE.Matrix4().makeTranslation(0, 0.9, 0);
  // Arms hang slightly out from the body.
  const armTilt = [new THREE.Matrix4().makeRotationZ(0.08), new THREE.Matrix4().makeRotationZ(-0.08)];

  function pose(i: number) {
    const p = people[i];
    const sh = shows[i];
    const walking = p.speed > 0 ? 1 : 0;
    const swing = Math.sin(p.phase) * 0.5 * walking;
    const bob = Math.abs(Math.cos(p.phase)) * 0.035 * walking;

    base.makeRotationY(p.yaw);
    base.setPosition(p.x, opts.groundY + bob, p.z);
    base.scale(scaleV.setScalar(p.height));

    // Legs; a full-length skirt shortens the stride so feet do not punch
    // through the hem.
    const legSwing = sh.skirt >= 1 ? swing * 0.55 : swing;
    for (const k of [0, 1] as const) {
      const sign = k === 0 ? 1 : -1;
      local.makeRotationX(legSwing * sign).setPosition(HIP_X * sign, HIP_Y, 0);
      meshes.legs.setMatrixAt(i * 2 + k, out.multiplyMatrices(base, local));
      local.makeRotationX(-swing * 0.7 * sign).setPosition(SHOULDER_X * sign, SHOULDER_Y, 0);
      local.multiply(armTilt[k]);
      meshes.arms.setMatrixAt(i * 2 + k, out.multiplyMatrices(base, local));
    }

    meshes.torso.setMatrixAt(i, base);

    if (sh.skirt > 0) {
      local.makeScale(1, sh.skirt, 1).setPosition(0, HIP_Y + 0.02, 0);
      meshes.skirt.setMatrixAt(i, out.multiplyMatrices(base, local));
    } else {
      meshes.skirt.setMatrixAt(i, ZERO);
    }

    meshes.headShort.setMatrixAt(i, sh.long ? ZERO : base);
    meshes.headLong.setMatrixAt(i, sh.long ? base : ZERO);

    if (sh.headwear) {
      if (sh.cap) {
        // Skullcap: the turban squashed onto the crown.
        out.multiplyMatrices(base, capOffset).multiply(capScale);
        meshes.headwear.setMatrixAt(i, out);
      } else {
        meshes.headwear.setMatrixAt(i, base);
      }
    } else {
      meshes.headwear.setMatrixAt(i, ZERO);
    }

    meshes.drape.setMatrixAt(i, sh.drape ? base : ZERO);
  }

  function step(p: Person, dt: number) {
    const m = p.mover;
    if (m.kind === "stand") return;
    const dist = p.speed * dt;
    p.phase += (dist / 1.35) * Math.PI * 2;

    if (m.kind === "loop") {
      m.s += dist * m.dir;
      const q = loopPoint(m.half, m.s);
      // Lateral jitter perpendicular to travel, so a stream is not a line.
      const nx = Math.cos(q.yaw);
      const nz = -Math.sin(q.yaw);
      p.x = m.cx + q.x + nx * m.lateral;
      p.z = m.cz + q.z + nz * m.lateral;
      p.yaw = m.dir === 1 ? q.yaw : q.yaw + Math.PI;
      return;
    }

    // Stroll: head for the target, pick a new one on arrival.
    const dx = m.tx - p.x;
    const dz = m.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) {
      const t = chowkPoint();
      m.tx = t.x;
      m.tz = t.z;
      return;
    }
    const want = Math.atan2(dx, dz);
    let delta = want - p.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    p.yaw += delta * Math.min(1, dt * 4);
    const nx = p.x + Math.sin(p.yaw) * dist;
    const nz = p.z + Math.cos(p.yaw) * dist;
    if (blocked(nx, nz, 0.3)) {
      // Walked into a stall or a tree: choose somewhere else.
      const t = chowkPoint();
      m.tx = t.x;
      m.tz = t.z;
      return;
    }
    p.x = nx;
    p.z = nz;
  }

  // Initial placement for everyone, then only movers are re-posed.
  const movers: number[] = [];
  people.forEach((p, i) => {
    step(p, 0);
    pose(i);
    if (p.mover.kind !== "stand") movers.push(i);
  });
  for (const name of PARTS) meshes[name].instanceMatrix.needsUpdate = true;

  return {
    group,
    count: N,
    update(dt) {
      for (const i of movers) {
        step(people[i], dt);
        pose(i);
      }
      for (const name of PARTS) meshes[name].instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const name of PARTS) {
        meshes[name].dispose();
        geos[name].dispose();
      }
      material.dispose();
    },
  };
}
