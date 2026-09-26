/**
 * The player: a young traveller on India's streets, built for this cel world
 * rather than borrowed from the crowd. Rust kurta over indigo jeans, canvas
 * sneakers, a cross-body jhola bag and a checked gamcha round the neck, so
 * the silhouette reads as "you" from across a chowk.
 *
 * A full rig (pelvis, spine, chest, neck, head; upper arm, forearm, hand;
 * thigh, shin, foot) driven procedurally by HeroAnimator: walk to jog to
 * sprint with heel strike and toe-off, counter-rotating spine and chest, a
 * head that steadies itself and glances at what is near, a crouch before a
 * jump and a squash on landing, a stumble when a vehicle knocks you aside,
 * and a bag and scarf that swing on damped springs.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ *
 * Look
 * ------------------------------------------------------------------ */

const SKIN = 0xa0673b;
const SKIN_SHADE = 0x8a5530;
const KURTA = 0xc2562b;
const KURTA_TRIM = 0xf1e3c2;
const JEANS = 0x283a5a;
const SHOE = 0xf2efe8;
const SHOE_SOLE = 0xc9c3b6;
const SHOE_STRIPE = 0xc0392b;
const HAIR = 0x17120d;
const EYE = 0x1a1410;
const BAG = 0x6b6b3a;
const BAG_STRIPE = 0xd9a441;
const GAMCHA = 0xb3262f;
const GAMCHA_CHECK = 0xf4efe4;
const WATCH = 0x2b2d31;

/** Heights, metres from the ground. */
const HIP_Y = 1.02;
const THIGH = 0.44;
const SHIN = 0.43;

/** A mesh of vertex-coloured parts, merged. */
class Kit {
  private parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, hex: number, at?: THREE.Matrix4): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (at) geo.applyMatrix4(at);
    const c = new THREE.Color(hex);
    const n = geo.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.parts.push(geo);
    return this;
  }
  mesh(mat: THREE.Material): THREE.Mesh {
    const g = BufferGeometryUtils.mergeGeometries(this.parts, false)!;
    this.parts.forEach((p) => p.dispose());
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

const M = new THREE.Matrix4();
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  M.clone().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** A capsule hanging down from its joint: top at y=0, bottom at -len. */
const limb = (r0: number, len: number, r1 = r0) =>
  new THREE.CylinderGeometry(r0, r1, len, 12, 1).translate(0, -len / 2, 0);

export type HeroRig = {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  wristL: THREE.Group;
  wristR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  ankleL: THREE.Group;
  ankleR: THREE.Group;
  bag: THREE.Group;
  scarfL: THREE.Group;
  scarfR: THREE.Group;
};

/** The hero, standing, feet on y=0, facing +z. Rig on `userData.hero`. */
export function makeHero(): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const g = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const root = new THREE.Group();
  root.name = "hero";

  const pelvis = g("pelvis", root, 0, HIP_Y, 0);
  {
    const k = new Kit();
    // Seat of the jeans, a belt, and the kurta's hem falling over it.
    k.add(new THREE.CylinderGeometry(0.15, 0.16, 0.16, 14).translate(0, -0.04, 0), JEANS);
    k.add(new THREE.CylinderGeometry(0.19, 0.225, 0.3, 16, 1, true).translate(0, -0.1, 0), KURTA);
    k.add(new THREE.TorusGeometry(0.212, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, -0.25, 0), KURTA_TRIM);
    // The side slits of a kurta: darker strips.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.01, 0.2, 0.05).translate(s * 0.215, -0.15, 0), 0x8f3d1f);
    pelvis.add(k.mesh(mat));
  }

  // Legs: jeans to the ankle, canvas sneakers.
  const leg = (side: number) => {
    const hip = g(side < 0 ? "hipL" : "hipR", pelvis, side * 0.095, -0.05, 0);
    {
      const k = new Kit();
      k.add(limb(0.078, THIGH, 0.062), JEANS);
      k.add(new THREE.SphereGeometry(0.078, 12, 8), JEANS);
      hip.add(k.mesh(mat));
    }
    const knee = g(side < 0 ? "kneeL" : "kneeR", hip, 0, -THIGH, 0);
    {
      const k = new Kit();
      k.add(new THREE.SphereGeometry(0.062, 12, 8), JEANS);
      k.add(limb(0.06, SHIN - 0.03, 0.05), JEANS);
      // Turn-up at the hem.
      k.add(new THREE.CylinderGeometry(0.056, 0.056, 0.04, 12).translate(0, -SHIN + 0.05, 0), 0x3a5078);
      knee.add(k.mesh(mat));
    }
    const ankle = g(side < 0 ? "ankleL" : "ankleR", knee, 0, -SHIN, 0);
    {
      const k = new Kit();
      k.add(new THREE.BoxGeometry(0.1, 0.075, 0.25).translate(0, -0.035, 0.05), SHOE);
      k.add(new THREE.SphereGeometry(0.05, 10, 6).scale(1, 0.75, 1).translate(0, -0.03, 0.17), SHOE);
      k.add(new THREE.BoxGeometry(0.108, 0.025, 0.27).translate(0, -0.075, 0.055), SHOE_SOLE);
      k.add(new THREE.BoxGeometry(0.104, 0.018, 0.12).translate(0, -0.02, 0.03), SHOE_STRIPE);
      k.add(new THREE.BoxGeometry(0.07, 0.01, 0.1).translate(0, 0.005, 0.1), 0xdedad0);
      ankle.add(k.mesh(mat));
    }
    return { hip, knee, ankle };
  };
  const L = leg(-1);
  const R = leg(1);

  const spine = g("spine", pelvis, 0, 0.08, 0);
  {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.185, 0.19, 0.2, 16).translate(0, 0.08, 0), KURTA);
    spine.add(k.mesh(mat));
  }
  const chest = g("chest", spine, 0, 0.14, 0);
  {
    const k = new Kit();
    // Chest tapering out to the shoulders, a little deeper than wide at the
    // back so it reads as a body, not a tin.
    k.add(new THREE.CylinderGeometry(0.215, 0.185, 0.3, 16).scale(1, 1, 0.78).translate(0, 0.13, 0), KURTA);
    k.add(new THREE.SphereGeometry(0.215, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 0.78).translate(0, 0.28, 0), KURTA);
    // Placket with buttons down the front.
    k.add(new THREE.BoxGeometry(0.05, 0.2, 0.01).translate(0, 0.18, 0.168), KURTA_TRIM);
    for (const y of [0.12, 0.18, 0.24]) k.add(new THREE.SphereGeometry(0.009, 6, 4).translate(0, y, 0.175), 0x6b4a2e);
    // The bag strap across the chest, right shoulder to left hip.
    k.add(new THREE.BoxGeometry(0.035, 0.62, 0.012).rotateZ(-0.62).translate(0.0, 0.1, 0.172), 0x4f4f2a);
    k.add(new THREE.BoxGeometry(0.035, 0.62, 0.012).rotateZ(0.62).translate(0.0, 0.1, -0.172), 0x4f4f2a);
    chest.add(k.mesh(mat));
  }

  // Gamcha: a checked cotton towel round the neck, ends hanging in front.
  {
    const k = new Kit();
    k.add(new THREE.TorusGeometry(0.105, 0.032, 8, 18).rotateX(Math.PI / 2).scale(1, 1, 0.9).translate(0, 0.32, 0.01), GAMCHA);
    k.add(new THREE.TorusGeometry(0.105, 0.012, 6, 18).rotateX(Math.PI / 2).scale(1.02, 1, 0.92).translate(0, 0.335, 0.01), GAMCHA_CHECK);
    chest.add(k.mesh(mat));
  }
  const scarfEnd = (side: number) => {
    const p = g(side < 0 ? "scarfL" : "scarfR", chest, side * 0.075, 0.3, 0.165);
    const k = new Kit();
    k.add(new THREE.BoxGeometry(0.07, 0.24, 0.015).translate(0, -0.12, 0), GAMCHA);
    for (const y of [-0.05, -0.12, -0.19]) k.add(new THREE.BoxGeometry(0.072, 0.02, 0.017).translate(0, y, 0), GAMCHA_CHECK);
    k.add(new THREE.BoxGeometry(0.014, 0.24, 0.017).translate(0, -0.12, 0), GAMCHA_CHECK);
    p.add(k.mesh(mat));
    return p;
  };
  const scarfL = scarfEnd(-1);
  const scarfR = scarfEnd(1);

  // The jhola: a woven cotton bag on its strap, hanging at the left hip.
  const bag = g("bag", chest, -0.23, 0.02, 0.02);
  {
    const k = new Kit();
    k.add(new THREE.BoxGeometry(0.05, 0.3, 0.012).translate(0, -0.15, 0), 0x4f4f2a);
    k.add(new THREE.BoxGeometry(0.075, 0.28, 0.25).translate(-0.02, -0.4, 0), BAG);
    k.add(new THREE.BoxGeometry(0.08, 0.05, 0.255).translate(-0.02, -0.33, 0), BAG_STRIPE);
    k.add(new THREE.BoxGeometry(0.08, 0.03, 0.255).translate(-0.02, -0.46, 0), BAG_STRIPE);
    for (const z of [-0.09, 0, 0.09]) k.add(new THREE.CylinderGeometry(0.008, 0.004, 0.08, 5).translate(-0.02, -0.58, z), BAG_STRIPE);
    bag.add(k.mesh(mat));
  }

  const neck = g("neck", chest, 0, 0.27, 0.01);
  {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.048, 0.056, 0.1, 12).translate(0, 0.04, 0), SKIN);
    neck.add(k.mesh(mat));
  }
  const head = g("head", neck, 0, 0.08, 0.01);
  {
    const k = new Kit();
    // Skull and jaw: an egg, a little narrower than deep, the chin forward.
    k.add(new THREE.SphereGeometry(0.1, 20, 14).scale(0.92, 1.12, 1.0).translate(0, 0.09, 0), SKIN);
    k.add(new THREE.SphereGeometry(0.07, 14, 8).scale(1, 0.8, 1).translate(0, 0.02, 0.035), SKIN);
    k.add(new THREE.ConeGeometry(0.018, 0.045, 6).rotateX(Math.PI / 2).translate(0, 0.08, 0.105), SKIN_SHADE);
    for (const s of [-1, 1]) {
      k.add(new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8).translate(s * 0.093, 0.085, 0), SKIN_SHADE);
      // Eyes, brows.
      k.add(new THREE.SphereGeometry(0.013, 8, 6).scale(1, 0.8, 0.5).translate(s * 0.035, 0.11, 0.092), EYE);
      k.add(new THREE.BoxGeometry(0.04, 0.009, 0.01).rotateZ(s * -0.12).translate(s * 0.036, 0.137, 0.094), HAIR);
    }
    // Moustache and mouth line.
    k.add(new THREE.BoxGeometry(0.055, 0.012, 0.01).translate(0, 0.045, 0.098), HAIR);
    k.add(new THREE.BoxGeometry(0.04, 0.005, 0.01).translate(0, 0.028, 0.094), 0x5a2e1e);
    // Hair: a cap over the crown, fuller on top, a fringe swept to one side,
    // short at the back and over the ears.
    // Crown, down to the brow all round...
    k.add(new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.36).scale(0.95, 1.1, 1.05).translate(0, 0.1, -0.008), HAIR);
    // ...and the back of the head (the -z half) down to the nape.
    k.add(new THREE.SphereGeometry(0.106, 14, 10, Math.PI, Math.PI, 0, Math.PI * 0.74).scale(0.95, 1.1, 1.02).translate(0, 0.1, -0.01), HAIR);
    k.add(new THREE.SphereGeometry(0.07, 12, 8).scale(1.4, 0.55, 1.1).translate(0.01, 0.2, 0.02), HAIR);
    for (const [x, rz] of [[-0.05, 0.5], [-0.01, 0.35], [0.035, 0.2]] as const) {
      k.add(new THREE.ConeGeometry(0.03, 0.08, 5).rotateX(-1.2).rotateZ(rz).translate(x, 0.17, 0.085), HAIR);
    }
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.02, 0.05, 0.06).translate(s * 0.093, 0.13, -0.01), HAIR);
    head.add(k.mesh(mat));
  }

  const arm = (side: number) => {
    const shoulder = g(side < 0 ? "shoulderL" : "shoulderR", chest, side * 0.215, 0.23, 0);
    {
      const k = new Kit();
      // Kurta sleeve to just past the elbow, rolled.
      k.add(new THREE.SphereGeometry(0.066, 12, 8), KURTA);
      k.add(limb(0.062, 0.27, 0.055), KURTA);
      k.add(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 12).translate(0, -0.27, 0), KURTA_TRIM);
      shoulder.add(k.mesh(mat));
    }
    const elbow = g(side < 0 ? "elbowL" : "elbowR", shoulder, 0, -0.28, 0);
    {
      const k = new Kit();
      k.add(new THREE.SphereGeometry(0.046, 10, 6), SKIN);
      k.add(limb(0.044, 0.23, 0.036), SKIN);
      // A watch on the left wrist.
      if (side < 0) k.add(new THREE.CylinderGeometry(0.041, 0.041, 0.025, 10).translate(0, -0.2, 0), WATCH);
      elbow.add(k.mesh(mat));
    }
    const wrist = g(side < 0 ? "wristL" : "wristR", elbow, 0, -0.24, 0);
    {
      const k = new Kit();
      k.add(new THREE.BoxGeometry(0.06, 0.09, 0.035).translate(0, -0.045, 0.005), SKIN);
      k.add(new THREE.BoxGeometry(0.018, 0.045, 0.02).rotateZ(side * 0.4).translate(side * -0.032, -0.03, 0.02), SKIN);
      wrist.add(k.mesh(mat));
    }
    return { shoulder, elbow, wrist };
  };
  const AL = arm(-1);
  const AR = arm(1);

  const rig: HeroRig = {
    root,
    pelvis,
    spine,
    chest,
    neck,
    head,
    shoulderL: AL.shoulder,
    shoulderR: AR.shoulder,
    elbowL: AL.elbow,
    elbowR: AR.elbow,
    wristL: AL.wrist,
    wristR: AR.wrist,
    hipL: L.hip,
    hipR: R.hip,
    kneeL: L.knee,
    kneeR: R.knee,
    ankleL: L.ankle,
    ankleR: R.ankle,
    bag,
    scarfL,
    scarfR,
  };
  root.userData.hero = rig;
  return root;
}

/* ------------------------------------------------------------------ *
 * Animation
 * ------------------------------------------------------------------ */

/** What the body is doing this frame, from the engine's physics. */
export type HeroMotion = {
  dt: number;
  /** Wall clock, seconds. */
  t: number;
  /** Ground speed, m/s. */
  speed: number;
  /** Forward acceleration, m/s^2 (negative when braking). */
  accel: number;
  /** Turn rate of the body, rad/s (positive = turning left). */
  turn: number;
  /** 0 on the ground .. 1 in the air. */
  air: number;
  /** Vertical velocity while airborne, m/s. */
  vy: number;
  /** 0..1: the crouch before a jump, or the squash of a landing. */
  crouch: number;
  /** 0..1: knocked aside by a vehicle. */
  stumble: number;
  /** Head turn toward something interesting, radians about Y (0 = ahead). */
  look: number;
  /** 0..1: sitting (the back seat of an auto). */
  sit?: number;
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** One-sided and C1-continuous, so the knee never kinks at the crossover. */
const pos = (x: number) => (x > 0 ? x * x : 0);

/** A damped spring on one angle, for the bag and the scarf. */
class Swing {
  angle = 0;
  vel = 0;
  constructor(private k: number, private damping: number) {}
  step(dt: number, drive: number, rest = 0) {
    const acc = -this.k * (this.angle - rest) - this.damping * this.vel + drive;
    this.vel += acc * dt;
    this.angle += this.vel * dt;
    this.angle = Math.max(-1.1, Math.min(1.1, this.angle));
  }
}

/**
 * Drives the hero's rig from its motion. Owns the stride phase so the feet
 * keep pace with the ground: one step per half cycle, the step as long as
 * the leg's swing makes it.
 */
export class HeroAnimator {
  private phase = 0;
  private bagFwd = new Swing(28, 5);
  private bagSide = new Swing(24, 5);
  private scarf = new Swing(40, 6);
  private headYaw = 0;
  private lastBob = 0;

  constructor(private rig: HeroRig) {}

  /** How far each step carries the body at a given speed, metres: about
   *  0.9m at a stroll, 1.9m at a jog, 2.1m flat out, so the cadence stays
   *  human (2 to 4.5 steps a second) at every speed. */
  static stepLength(speed: number): number {
    return Math.min(2.1, Math.max(0.6, 0.5 + 0.3 * speed));
  }

  update(m: HeroMotion): void {
    const r = this.rig;
    const dt = Math.min(m.dt, 0.05);
    // 0 walk .. 1 jog (by 4.6 m/s) .. sprint beyond.
    const moving = smooth(0.12, 0.9, m.speed);
    const run = smooth(2.2, 4.6, m.speed);
    const sprint = smooth(5.5, 9.5, m.speed);
    this.phase += ((Math.PI * m.speed) / HeroAnimator.stepLength(m.speed)) * dt;
    const ph = this.phase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);

    /* ---- legs ---- */
    // The left leg is forward at sin = 1 and swings through (knee bent,
    // foot clear of the ground) while cos > 0; the right leg is half a cycle
    // behind. So one knee is up while the other leg carries the body, never
    // both at once.
    const stride = lerp(0.38, 0.55, run) + sprint * 0.12;
    const kneeLift = lerp(0.65, 1.1, run) + sprint * 0.35;
    const swingL = Math.max(0, c) ** 1.5;
    const swingR = Math.max(0, -c) ** 1.5;
    const idleShift = Math.sin(m.t * 0.55);
    let hipL = lerp(idleShift * 0.03, s * stride, moving);
    let hipR = lerp(-idleShift * 0.03, -s * stride, moving);
    let kneeL = lerp(0.04 + Math.max(0, idleShift) * 0.06, 0.08 + run * 0.12 + swingL * kneeLift, moving);
    let kneeR = lerp(0.04 + Math.max(0, -idleShift) * 0.06, 0.08 + run * 0.12 + swingR * kneeLift, moving);
    // On top of keeping the foot level: toes down through the swing, heel
    // first as the leg lands in front, a push off the toes as it trails.
    let ankleL = moving * (swingL * 0.3 - Math.max(0, s) * (1 - swingL) * 0.18 + Math.max(0, -s) * (1 - swingL) * 0.3);
    let ankleR = moving * (swingR * 0.3 - Math.max(0, -s) * (1 - swingR) * 0.18 + Math.max(0, s) * (1 - swingR) * 0.3);

    /* ---- arms ---- */
    const armSwing = lerp(0.35, 0.8, run) + sprint * 0.15;
    const elbowBend = lerp(0.15, 1.2, run) + sprint * 0.2;
    const breath = Math.sin(m.t * 1.5);
    let shL = lerp(0.05 + breath * 0.02, -s * armSwing, moving);
    let shR = lerp(-0.03 + breath * 0.02, s * armSwing, moving);
    let elL = lerp(0.14, pos(-s) * 0.4 + elbowBend, moving);
    let elR = lerp(0.18, pos(s) * 0.4 + elbowBend, moving);
    let armOut = 0.08;

    /* ---- trunk ---- */
    // Lowest as a foot lands (legs spread), highest as they pass.
    const bob = lerp(breath * 0.006, (1 - Math.abs(s)) * lerp(0.025, 0.05, run) - 0.02, moving);
    let pelvisY = HIP_Y + bob - run * 0.03;
    let pelvisTwist = lerp(idleShift * 0.02, s * lerp(0.08, 0.14, run), moving);
    let pelvisRoll = lerp(idleShift * 0.035, s * lerp(0.03, 0.05, run), moving);
    // Lean into acceleration and into speed; bank into turns.
    const lean = Math.max(-0.2, Math.min(0.3, m.accel * 0.018 + run * 0.1 + sprint * 0.12));
    const bank = Math.max(-0.25, Math.min(0.25, -m.turn * m.speed * 0.02));
    let spineX = lean * 0.6;
    let chestX = lean * 0.4 - breath * 0.01;
    let chestTwist = -pelvisTwist * 1.3;
    let headX = -lean * 0.7;

    /* ---- jump, landing, stumble ---- */
    if (m.air > 0.001) {
      const rising = m.vy > 0 ? 1 : 0;
      const a = m.air;
      hipL = lerp(hipL, rising ? 0.9 : 0.5, a);
      hipR = lerp(hipR, rising ? -0.2 : 0.25, a);
      kneeL = lerp(kneeL, rising ? 1.3 : 0.6, a);
      kneeR = lerp(kneeR, rising ? 0.4 : 0.5, a);
      ankleL = lerp(ankleL, 0.2, a);
      ankleR = lerp(ankleR, 0.35, a);
      // Arms reach up on the way up, forward for balance on the way down.
      shL = lerp(shL, rising ? 2.4 : 1.1, a);
      shR = lerp(shR, rising ? 2.1 : 0.9, a);
      elL = lerp(elL, 0.6, a);
      elR = lerp(elR, 0.5, a);
      armOut = lerp(armOut, 0.45, a);
      spineX = lerp(spineX, rising ? 0.1 : -0.05, a);
    }
    if (m.crouch > 0.001) {
      const k = m.crouch;
      pelvisY -= 0.2 * k;
      hipL += 0.75 * k;
      hipR += 0.75 * k;
      kneeL += 1.3 * k;
      kneeR += 1.3 * k;
      spineX += 0.35 * k;
      headX -= 0.3 * k;
      // Arms drawn back, ready to swing up.
      shL -= 0.6 * k;
      shR -= 0.6 * k;
    }
    if (m.stumble > 0.001) {
      const k = m.stumble;
      const wob = Math.sin(m.t * 22) * 0.15;
      pelvisRoll += (0.35 + wob) * k;
      spineX -= 0.3 * k;
      headX += 0.25 * k;
      shL = lerp(shL, 2.4 + wob, k);
      shR = lerp(shR, 2.0 - wob, k);
      armOut = lerp(armOut, 0.9, k);
      elL = lerp(elL, 0.3, k);
      elR = lerp(elR, 0.4, k);
      kneeL += 0.4 * k;
    }

    if (m.sit && m.sit > 0.001) {
      const k = m.sit;
      pelvisY = lerp(pelvisY, HIP_Y - 0.42, k);
      hipL = lerp(hipL, 1.5, k);
      hipR = lerp(hipR, 1.5, k);
      kneeL = lerp(kneeL, 1.45, k);
      kneeR = lerp(kneeR, 1.45, k);
      ankleL = lerp(ankleL, 0.1, k);
      ankleR = lerp(ankleR, 0.1, k);
      shL = lerp(shL, 0.35, k);
      shR = lerp(shR, 0.25, k);
      elL = lerp(elL, 0.9, k);
      elR = lerp(elR, 0.8, k);
      spineX = lerp(spineX, -0.05, k);
    }

    /* ---- head: steady the gaze, glance at what is near ---- */
    this.headYaw += (m.look - this.headYaw) * (1 - Math.exp(-5 * dt));
    const idleGlance = (1 - moving) * Math.sin(m.t * 0.23) * 0.35;

    /* ---- write the rig ---- */
    r.pelvis.position.y = pelvisY;
    r.pelvis.rotation.set(lean * 0.4, pelvisTwist, pelvisRoll + bank);
    r.hipL.rotation.set(-hipL - lean * 0.4, 0, 0.02);
    r.hipR.rotation.set(-hipR - lean * 0.4, 0, -0.02);
    r.kneeL.rotation.x = kneeL;
    r.kneeR.rotation.x = kneeR;
    // Level the foot against the thigh and shin (foot pitch = -hip + knee +
    // ankle), then add the toe-and-heel play above.
    r.ankleL.rotation.x = hipL - kneeL + ankleL;
    r.ankleR.rotation.x = hipR - kneeR + ankleR;
    r.spine.rotation.set(spineX, -pelvisTwist * 0.5, -pelvisRoll * 0.6);
    r.chest.rotation.set(chestX, chestTwist, -pelvisRoll * 0.4 - bank * 0.5);
    r.neck.rotation.set(0, -chestTwist * 0.6 + this.headYaw * 0.4, 0);
    r.head.rotation.set(headX, this.headYaw * 0.6 + idleGlance, -bank * 0.4);
    r.shoulderL.rotation.set(-shL, 0, -armOut);
    r.shoulderR.rotation.set(-shR, 0, armOut);
    r.elbowL.rotation.x = -elL;
    r.elbowR.rotation.x = -elR;
    r.wristL.rotation.set(-0.1 - run * 0.2, 0, 0.1);
    r.wristR.rotation.set(-0.1 - run * 0.2, 0, -0.1);

    /* ---- secondary motion: bag and scarf on springs ---- */
    const vBob = (bob - this.lastBob) / Math.max(dt, 1e-4);
    this.lastBob = bob;
    this.bagFwd.step(dt, m.accel * 1.4 + vBob * 6 + (m.air > 0 ? -m.vy * 2 : 0), lean * 0.8);
    this.bagSide.step(dt, m.turn * m.speed * 1.2 + Math.cos(ph) * moving * run * 6, 0.05);
    this.scarf.step(dt, m.accel * 1.2 + vBob * 10 + m.speed * 0.8, Math.min(0.6, m.speed * 0.06));
    r.bag.rotation.set(this.bagFwd.angle, 0, -this.bagSide.angle);
    r.scarfL.rotation.set(-this.scarf.angle, 0, 0.05);
    r.scarfR.rotation.set(-this.scarf.angle * 0.85, 0, -0.05);
  }
}
