/**
 * Ragdolls — an articulated chain of capsules solved with position-based
 * dynamics (Gauss-Seidel, a handful of iterations per fixed step).
 *
 * Why PBD rather than an impulse-based articulation: with 15 bones, unilateral
 * world contacts and 120 Hz steps, a projected-Gauss-Seidel position solver is
 * unconditionally stable — bones cannot gain energy, so bodies *settle* instead
 * of buzzing or exploding, which is the entire brief. Each bone is a segment of
 * two particles; joints are shared particles, so joint separation is impossible
 * by construction and only the *angular* limits need constraints.
 *
 * Constraints, applied in order every iteration:
 *   1. bone length      (hard distance, stiffness 1)
 *   2. cone limit       (swing of a bone relative to its parent)
 *   3. twist limit      (roll of a bone's reference frame, damped)
 *   4. world contact    (capsule vs static BVH + Coulomb friction)
 *
 * `ai` hands over a dead actor with createRagdoll()/adoptSkeleton() and we own
 * the bone transforms from that moment on.
 */

import * as THREE from 'three';
import { MASK, SURFACE_PROPS } from './surfaces.js';
import { closestPtSegSeg, makeClosest } from './math.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Default humanoid rig                                                */
/* ------------------------------------------------------------------ */

/**
 * A 15-capsule humanoid sized from a total height, in the actor's local frame
 * (feet at y = 0, +Z forward). Proportions are the standard 7.5-head figure.
 */
export function humanoidSpec(height = 1.8, scaleMass = 82) {
  const h = height;
  const M = scaleMass;
  const y = (f) => h * f;
  const b = (name, hx, hy, hz, tx, ty, tz, r, m, parent, cone, twist) => ({
    name,
    head: [hx, hy, hz],
    tail: [tx, ty, tz],
    radius: r * h,
    mass: m * M,
    parent,
    cone: cone * DEG,
    twist: twist * DEG,
  });
  const sh = h * 0.105; // half shoulder width
  const hip = h * 0.055;
  return [
    /* 0 */ b('pelvis', 0, y(0.53), 0, 0, y(0.63), 0, 0.085, 0.14, -1, 0, 0),
    /* 1 */ b('spine', 0, y(0.63), 0, 0, y(0.74), 0, 0.082, 0.12, 0, 22, 18),
    /* 2 */ b('chest', 0, y(0.74), 0, 0, y(0.83), 0, 0.088, 0.19, 1, 20, 15),
    /* 3 */ b('neck', 0, y(0.83), 0, 0, y(0.875), 0, 0.042, 0.02, 2, 30, 25),
    /* 4 */ b('head', 0, y(0.875), 0, 0, y(0.97), 0.01, 0.062, 0.07, 3, 42, 30),
    /* 5 */ b('upperArmL', -sh, y(0.815), 0, -sh - h * 0.015, y(0.65), 0, 0.045, 0.027, 2, 85, 60),
    /* 6 */ b('forearmL', -sh - h * 0.015, y(0.65), 0, -sh - h * 0.02, y(0.50), 0, 0.037, 0.018, 5, 80, 45),
    /* 7 */ b('handL', -sh - h * 0.02, y(0.50), 0, -sh - h * 0.02, y(0.44), 0, 0.032, 0.006, 6, 55, 40),
    /* 8 */ b('upperArmR', sh, y(0.815), 0, sh + h * 0.015, y(0.65), 0, 0.045, 0.027, 2, 85, 60),
    /* 9 */ b('forearmR', sh + h * 0.015, y(0.65), 0, sh + h * 0.02, y(0.50), 0, 0.037, 0.018, 8, 80, 45),
    /*10 */ b('handR', sh + h * 0.02, y(0.50), 0, sh + h * 0.02, y(0.44), 0, 0.032, 0.006, 9, 55, 40),
    /*11 */ b('thighL', -hip, y(0.53), 0, -hip * 1.05, y(0.29), 0, 0.062, 0.10, 0, 75, 35),
    /*12 */ b('shinL', -hip * 1.05, y(0.29), 0, -hip * 1.05, y(0.055), 0, 0.048, 0.045, 11, 70, 20),
    /*13 */ b('thighR', hip, y(0.53), 0, hip * 1.05, y(0.29), 0, 0.062, 0.10, 0, 75, 35),
    /*14 */ b('shinR', hip * 1.05, y(0.29), 0, hip * 1.05, y(0.055), 0, 0.048, 0.045, 13, 70, 20),
  ];
}

/* ------------------------------------------------------------------ */

const MAX_PARTICLE_STEP = 0.35; // metres per fixed step, anti-explosion clamp
const SLEEP_MOTION = 0.0022;
const SLEEP_TIME = 0.6;

let _nextRagdollId = 1;

export class Ragdoll {
  /**
   * @param {StaticWorld} world
   * @param {object} opts
   *   bones      bone spec array (see humanoidSpec)
   *   transform  THREE.Matrix4 placing the spec into world space
   *   gravity    m/s^2 (negative)
   *   iterations Gauss-Seidel iterations per fixed step
   */
  constructor(world, opts = {}) {
    this.id = _nextRagdollId++;
    this.world = world;
    this.gravity = opts.gravity ?? -20.6;
    this.iterations = opts.iterations ?? 6;
    this.mask = opts.mask ?? MASK.DEBRIS;
    this.linearDamping = opts.damping ?? 0.985;
    this.friction = opts.friction ?? 0.72;
    this.userData = opts.userData ?? null;
    this.actor = opts.actor ?? null;
    this.alive = true;
    this.sleeping = false;
    this.sleepTimer = 0;
    this.age = 0;

    const spec = opts.bones ?? humanoidSpec(opts.height ?? 1.8, opts.mass ?? 82);
    this.spec = spec;
    const nb = spec.length;
    this.boneCount = nb;

    // --- particle set with shared joints ---
    const px = [], py = [], pz = [], pm = [];
    const key = (x, y, z) =>
      `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    const map = new Map();
    const mat = opts.transform ?? null;
    const _v = new THREE.Vector3();
    const addPoint = (arr) => {
      _v.set(arr[0], arr[1], arr[2]);
      if (mat) _v.applyMatrix4(mat);
      const k = key(_v.x, _v.y, _v.z);
      let i = map.get(k);
      if (i === undefined) {
        i = px.length;
        px.push(_v.x); py.push(_v.y); pz.push(_v.z); pm.push(0);
        map.set(k, i);
      }
      return i;
    };

    this.boneHead = new Int32Array(nb);
    this.boneTail = new Int32Array(nb);
    this.boneLen = new Float32Array(nb);
    this.boneRadius = new Float32Array(nb);
    this.boneMass = new Float32Array(nb);
    this.boneParent = new Int32Array(nb);
    this.boneCone = new Float32Array(nb);
    this.boneTwist = new Float32Array(nb);
    /** Reference up-vector per bone, parallel-transported for twist. */
    this.boneUp = new Float32Array(nb * 3);

    for (let i = 0; i < nb; i++) {
      const s = spec[i];
      const a = addPoint(s.head);
      const c = addPoint(s.tail);
      this.boneHead[i] = a;
      this.boneTail[i] = c;
      this.boneRadius[i] = s.radius ?? 0.06;
      this.boneMass[i] = s.mass ?? 4;
      this.boneParent[i] = s.parent ?? -1;
      this.boneCone[i] = s.cone ?? 70 * DEG;
      this.boneTwist[i] = s.twist ?? 40 * DEG;
      pm[a] += this.boneMass[i] * 0.5;
      pm[c] += this.boneMass[i] * 0.5;
      this.boneUp[i * 3] = 0;
      this.boneUp[i * 3 + 1] = 0;
      this.boneUp[i * 3 + 2] = 1;
    }

    const np = px.length;
    this.particleCount = np;
    this.px = new Float64Array(px);
    this.py = new Float64Array(py);
    this.pz = new Float64Array(pz);
    this.qx = Float64Array.from(px);
    this.qy = Float64Array.from(py);
    this.qz = Float64Array.from(pz);
    this.invMass = new Float64Array(np);
    for (let i = 0; i < np; i++) this.invMass[i] = pm[i] > 0 ? 1 / pm[i] : 0;

    for (let i = 0; i < nb; i++) {
      const a = this.boneHead[i], c = this.boneTail[i];
      this.boneLen[i] = Math.hypot(this.px[c] - this.px[a], this.py[c] - this.py[a], this.pz[c] - this.pz[a]);
      if (this.boneLen[i] < 1e-4) this.boneLen[i] = 1e-4;
      this._initUp(i);
    }

    // skeleton binding (filled by adoptSkeleton)
    this.bones3D = null;
    this.boneBind = null;
    this.rootObject = null;
    this._m4 = new THREE.Matrix4();
    this._m4b = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v3 = new THREE.Vector3();
    this._v3b = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);

    this.aabb = { minx: 0, miny: 0, minz: 0, maxx: 0, maxy: 0, maxz: 0 };
    this._updateAabb();

    this._ss = makeClosest();
    this.selfPairs = this._buildSelfPairs();
  }

  /**
   * Bone pairs worth testing against each other. Bones that share a joint are
   * excluded (they always touch), and so is any pair that already overlaps in
   * the bind pose — pelvis/thigh, chest/upper-arm — otherwise the solver would
   * spend every step fighting the rig itself and the doll would inflate.
   */
  _buildSelfPairs() {
    const pairs = [];
    for (let i = 0; i < this.boneCount; i++) {
      for (let j = i + 1; j < this.boneCount; j++) {
        const ai = this.boneHead[i], bi = this.boneTail[i];
        const aj = this.boneHead[j], bj = this.boneTail[j];
        if (ai === aj || ai === bj || bi === aj || bi === bj) continue;
        const rad = this.boneRadius[i] + this.boneRadius[j];
        closestPtSegSeg(
          this.px[ai], this.py[ai], this.pz[ai], this.px[bi], this.py[bi], this.pz[bi],
          this.px[aj], this.py[aj], this.pz[aj], this.px[bj], this.py[bj], this.pz[bj],
          this._ss ?? (this._ss = makeClosest())
        );
        if (this._ss.d2 < rad * rad * 0.95) continue;
        pairs.push(i, j);
      }
    }
    return Int32Array.from(pairs);
  }

  _initUp(i) {
    const a = this.boneHead[i], c = this.boneTail[i];
    let dx = this.px[c] - this.px[a], dy = this.py[c] - this.py[a], dz = this.pz[c] - this.pz[a];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    // pick any axis not parallel to the bone
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(dz) > 0.9) { ux = 1; uy = 0; uz = 0; }
    const d = ux * dx + uy * dy + uz * dz;
    ux -= dx * d; uy -= dy * d; uz -= dz * d;
    const ul = Math.hypot(ux, uy, uz) || 1;
    this.boneUp[i * 3] = ux / ul;
    this.boneUp[i * 3 + 1] = uy / ul;
    this.boneUp[i * 3 + 2] = uz / ul;
  }

  /** Set a uniform initial velocity (m/s) on every particle. */
  setVelocity(vx, vy, vz, dt = 1 / 120) {
    for (let i = 0; i < this.particleCount; i++) {
      this.qx[i] = this.px[i] - vx * dt;
      this.qy[i] = this.py[i] - vy * dt;
      this.qz[i] = this.pz[i] - vz * dt;
    }
    this.wake();
  }

  /**
   * Kick the doll at a world point — the killing shot, an explosion, a melee.
   * Falloff is 1/(1+d^2) so a headshot snaps the head without teleporting the
   * whole body.
   */
  applyImpulse(x, y, z, ix, iy, iz, radius = 0.45, dt = 1 / 120) {
    for (let i = 0; i < this.particleCount; i++) {
      const dx = this.px[i] - x, dy = this.py[i] - y, dz = this.pz[i] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const w = 1 / (1 + d2 / (radius * radius));
      const im = this.invMass[i];
      this.qx[i] -= ix * im * w * dt;
      this.qy[i] -= iy * im * w * dt;
      this.qz[i] -= iz * im * w * dt;
    }
    this.wake();
  }

  wake() {
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  step(dt) {
    if (!this.alive || this.sleeping) return;
    this.age += dt;
    const n = this.particleCount;
    const g = this.gravity * dt * dt;
    const damp = this.linearDamping;
    let motion = 0;

    // --- Verlet integration ---
    for (let i = 0; i < n; i++) {
      if (this.invMass[i] === 0) continue;
      let vx = (this.px[i] - this.qx[i]) * damp;
      let vy = (this.py[i] - this.qy[i]) * damp;
      let vz = (this.pz[i] - this.qz[i]) * damp;
      const vl = Math.hypot(vx, vy, vz);
      if (vl > MAX_PARTICLE_STEP) {
        const s = MAX_PARTICLE_STEP / vl;
        vx *= s; vy *= s; vz *= s;
      }
      this.qx[i] = this.px[i];
      this.qy[i] = this.py[i];
      this.qz[i] = this.pz[i];
      this.px[i] += vx;
      this.py[i] += vy + g;
      this.pz[i] += vz;
      motion += vx * vx + vy * vy + vz * vz;
    }

    // --- Gauss-Seidel constraint solve ---
    for (let it = 0; it < this.iterations; it++) {
      this._solveDistance();
      this._solveCones();
      this._solveContacts(it === this.iterations - 1);
    }
    // One self-collision pass per step: enough to stop an arm sinking through
    // the chest, cheap enough to run on every corpse on screen.
    this._solveSelf();

    this._transportUp();
    this._updateAabb();

    // --- sleep ---
    const avg = motion / Math.max(1, n);
    if (avg < SLEEP_MOTION * SLEEP_MOTION) {
      this.sleepTimer += dt;
      if (this.sleepTimer > SLEEP_TIME) {
        this.sleeping = true;
        for (let i = 0; i < n; i++) {
          this.qx[i] = this.px[i];
          this.qy[i] = this.py[i];
          this.qz[i] = this.pz[i];
        }
      }
    } else {
      this.sleepTimer = 0;
    }
  }

  _solveDistance() {
    for (let i = 0; i < this.boneCount; i++) {
      const a = this.boneHead[i], c = this.boneTail[i];
      const wa = this.invMass[a], wc = this.invMass[c];
      const w = wa + wc;
      if (w === 0) continue;
      const dx = this.px[c] - this.px[a];
      const dy = this.py[c] - this.py[a];
      const dz = this.pz[c] - this.pz[a];
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-9) continue;
      const diff = (d - this.boneLen[i]) / d / w;
      this.px[a] += dx * diff * wa;
      this.py[a] += dy * diff * wa;
      this.pz[a] += dz * diff * wa;
      this.px[c] -= dx * diff * wc;
      this.py[c] -= dy * diff * wc;
      this.pz[c] -= dz * diff * wc;
    }
  }

  /**
   * Swing limit: the child bone direction may not deviate from its parent's by
   * more than `cone`. Correction rotates the child's free end back onto the
   * cone boundary, weighted by inverse mass so heavy limbs win.
   */
  _solveCones() {
    for (let i = 0; i < this.boneCount; i++) {
      const p = this.boneParent[i];
      if (p < 0) continue;
      const cone = this.boneCone[i];
      if (cone >= Math.PI - 1e-3) continue;

      const pa = this.boneHead[p], pc = this.boneTail[p];
      let ax = this.px[pc] - this.px[pa];
      let ay = this.py[pc] - this.py[pa];
      let az = this.pz[pc] - this.pz[pa];
      const al = Math.hypot(ax, ay, az);
      if (al < 1e-9) continue;
      ax /= al; ay /= al; az /= al;

      const a = this.boneHead[i], c = this.boneTail[i];
      let bx = this.px[c] - this.px[a];
      let by = this.py[c] - this.py[a];
      let bz = this.pz[c] - this.pz[a];
      const bl = Math.hypot(bx, by, bz);
      if (bl < 1e-9) continue;
      bx /= bl; by /= bl; bz /= bl;

      let dot = ax * bx + ay * by + az * bz;
      if (dot > 1) dot = 1; else if (dot < -1) dot = -1;
      const angle = Math.acos(dot);
      if (angle <= cone) continue;

      // axis = a x b (fall back to any perpendicular when anti-parallel)
      let kx = ay * bz - az * by;
      let ky = az * bx - ax * bz;
      let kz = ax * by - ay * bx;
      let kl = Math.hypot(kx, ky, kz);
      if (kl < 1e-7) {
        kx = -ay; ky = ax; kz = 0;
        kl = Math.hypot(kx, ky, kz);
        if (kl < 1e-7) { kx = 1; ky = 0; kz = 0; kl = 1; }
      }
      kx /= kl; ky /= kl; kz /= kl;

      // Rodrigues: rotate the parent direction by `cone` about k -> target dir
      const ca = Math.cos(cone), sa = Math.sin(cone);
      const cross_x = ky * az - kz * ay;
      const cross_y = kz * ax - kx * az;
      const cross_z = kx * ay - ky * ax;
      const kdot = kx * ax + ky * ay + kz * az;
      const tx = ax * ca + cross_x * sa + kx * kdot * (1 - ca);
      const ty = ay * ca + cross_y * sa + ky * kdot * (1 - ca);
      const tz = az * ca + cross_z * sa + kz * kdot * (1 - ca);

      // desired tail position, blended for stability
      const stiff = 0.65;
      const gx = this.px[a] + tx * bl;
      const gy = this.py[a] + ty * bl;
      const gz = this.pz[a] + tz * bl;
      const wa = this.invMass[a], wc = this.invMass[c];
      const w = wa + wc;
      if (w === 0) continue;
      const ex = (gx - this.px[c]) * stiff;
      const ey = (gy - this.py[c]) * stiff;
      const ez = (gz - this.pz[c]) * stiff;
      this.px[c] += ex * (wc / w);
      this.py[c] += ey * (wc / w);
      this.pz[c] += ez * (wc / w);
      this.px[a] -= ex * (wa / w);
      this.py[a] -= ey * (wa / w);
      this.pz[a] -= ez * (wa / w);
    }
  }

  /** Capsule bones vs the static world, with friction against the previous position. */
  _solveContacts(applyFriction) {
    const w = this.world;
    if (!w || w.triCount === 0) return;
    for (let i = 0; i < this.boneCount; i++) {
      const a = this.boneHead[i], c = this.boneTail[i];
      const r = this.boneRadius[i];
      const n = w.overlapCapsule(
        this.px[a], this.py[a], this.pz[a],
        this.px[c], this.py[c], this.pz[c],
        r, this.mask, 0
      );
      if (n === 0) continue;
      const cts = w.contacts;
      let pushx = 0, pushy = 0, pushz = 0;
      let fric = 0.7;
      let param = 0;
      let wsum = 0;
      for (let k = 0; k < n; k++) {
        const d = cts.depth[k];
        if (d <= 1e-5) continue;
        const nx = cts.nx[k], ny = cts.ny[k], nz = cts.nz[k];
        // Accumulate the *maximum* push along each normal instead of the sum:
        // a tessellated floor would otherwise eject the bone into orbit.
        const already = pushx * nx + pushy * ny + pushz * nz;
        const extra = d - already;
        if (extra > 0) {
          pushx += nx * extra;
          pushy += ny * extra;
          pushz += nz * extra;
        }
        param += cts.s[k] * d;
        wsum += d;
        const sp = SURFACE_PROPS[w.surface[cts.tri[k]]];
        if (sp) fric = sp.friction;
      }
      const pl = Math.hypot(pushx, pushy, pushz);
      if (pl < 1e-6) continue;
      const cap = 0.2;
      if (pl > cap) {
        const s = cap / pl;
        pushx *= s; pushy *= s; pushz *= s;
      }
      // Distribute along the capsule so the *contact point* clears the surface
      // rather than the midpoint: classic PBD segment weighting.
      const sPar = wsum > 0 ? param / wsum : 0.5;
      const w0 = 1 - sPar, w1 = sPar;
      const wa = this.invMass[a], wc = this.invMass[c];
      const denom = w0 * w0 * wa + w1 * w1 * wc;
      if (denom < 1e-12) continue;
      const k0 = (w0 * wa) / denom;
      const k1 = (w1 * wc) / denom;
      this.px[a] += pushx * k0; this.py[a] += pushy * k0; this.pz[a] += pushz * k0;
      this.px[c] += pushx * k1; this.py[c] += pushy * k1; this.pz[c] += pushz * k1;

      if (applyFriction) {
        const mu = Math.min(1, this.friction * fric);
        this._frictionAt(a, pushx, pushy, pushz, mu);
        this._frictionAt(c, pushx, pushy, pushz, mu);
      }
    }
  }

  /** Capsule-vs-capsule pushout between non-adjacent bones. */
  _solveSelf() {
    const pairs = this.selfPairs;
    const cl = this._ss;
    for (let k = 0; k < pairs.length; k += 2) {
      const i = pairs[k], j = pairs[k + 1];
      const a0 = this.boneHead[i], a1 = this.boneTail[i];
      const b0 = this.boneHead[j], b1 = this.boneTail[j];
      const rad = (this.boneRadius[i] + this.boneRadius[j]) * 0.92;
      const d2 = closestPtSegSeg(
        this.px[a0], this.py[a0], this.pz[a0], this.px[a1], this.py[a1], this.pz[a1],
        this.px[b0], this.py[b0], this.pz[b0], this.px[b1], this.py[b1], this.pz[b1],
        cl
      );
      if (d2 >= rad * rad) continue;
      const d = Math.sqrt(d2);
      let nx, ny, nz;
      if (d > 1e-6) {
        nx = (cl.ax - cl.bx) / d; ny = (cl.ay - cl.by) / d; nz = (cl.az - cl.bz) / d;
      } else {
        nx = 0; ny = 1; nz = 0;
      }
      const push = (rad - d) * 0.5;
      const s = cl.s, t = cl.t;
      const wa0 = this.invMass[a0] * (1 - s), wa1 = this.invMass[a1] * s;
      const wb0 = this.invMass[b0] * (1 - t), wb1 = this.invMass[b1] * t;
      const wsum = wa0 + wa1 + wb0 + wb1;
      if (wsum < 1e-12) continue;
      const k1 = push / wsum;
      this.px[a0] += nx * wa0 * k1; this.py[a0] += ny * wa0 * k1; this.pz[a0] += nz * wa0 * k1;
      this.px[a1] += nx * wa1 * k1; this.py[a1] += ny * wa1 * k1; this.pz[a1] += nz * wa1 * k1;
      this.px[b0] -= nx * wb0 * k1; this.py[b0] -= ny * wb0 * k1; this.pz[b0] -= nz * wb0 * k1;
      this.px[b1] -= nx * wb1 * k1; this.py[b1] -= ny * wb1 * k1; this.pz[b1] -= nz * wb1 * k1;
    }
  }

  _frictionAt(i, nx, ny, nz, mu) {
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    nx /= nl; ny /= nl; nz /= nl;
    let vx = this.px[i] - this.qx[i];
    let vy = this.py[i] - this.qy[i];
    let vz = this.pz[i] - this.qz[i];
    const vn = vx * nx + vy * ny + vz * nz;
    let tx = vx - nx * vn, ty = vy - ny * vn, tz = vz - nz * vn;
    // Kill the tangential component; PBD friction is applied by moving the
    // previous position towards the current one.
    this.qx[i] += tx * mu;
    this.qy[i] += ty * mu;
    this.qz[i] += tz * mu;
  }

  /**
   * Parallel-transport each bone's reference up-vector so the rendered roll is
   * continuous, then clamp the twist relative to the parent.
   */
  _transportUp() {
    for (let i = 0; i < this.boneCount; i++) {
      const a = this.boneHead[i], c = this.boneTail[i];
      let dx = this.px[c] - this.px[a];
      let dy = this.py[c] - this.py[a];
      let dz = this.pz[c] - this.pz[a];
      const l = Math.hypot(dx, dy, dz);
      if (l < 1e-9) continue;
      dx /= l; dy /= l; dz /= l;
      let ux = this.boneUp[i * 3], uy = this.boneUp[i * 3 + 1], uz = this.boneUp[i * 3 + 2];
      const d = ux * dx + uy * dy + uz * dz;
      ux -= dx * d; uy -= dy * d; uz -= dz * d;
      let ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-5) {
        this._initUp(i);
        continue;
      }
      ux /= ul; uy /= ul; uz /= ul;

      // twist limit against the parent's frame
      const p = this.boneParent[i];
      const lim = this.boneTwist[i];
      if (p >= 0 && lim < Math.PI - 1e-3) {
        let rx = this.boneUp[p * 3], ry = this.boneUp[p * 3 + 1], rz = this.boneUp[p * 3 + 2];
        const rd = rx * dx + ry * dy + rz * dz;
        rx -= dx * rd; ry -= dy * rd; rz -= dz * rd;
        const rl = Math.hypot(rx, ry, rz);
        if (rl > 1e-5) {
          rx /= rl; ry /= rl; rz /= rl;
          let cs = ux * rx + uy * ry + uz * rz;
          if (cs > 1) cs = 1; else if (cs < -1) cs = -1;
          const ang = Math.acos(cs);
          if (ang > lim) {
            // rotate u back towards r by (ang - lim)
            const t = (ang - lim) / ang;
            ux += (rx - ux) * t; uy += (ry - uy) * t; uz += (rz - uz) * t;
            const nl2 = Math.hypot(ux, uy, uz) || 1;
            ux /= nl2; uy /= nl2; uz /= nl2;
          }
        }
      }
      this.boneUp[i * 3] = ux;
      this.boneUp[i * 3 + 1] = uy;
      this.boneUp[i * 3 + 2] = uz;
    }
  }

  _updateAabb() {
    let minx = Infinity, miny = Infinity, minz = Infinity;
    let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let i = 0; i < this.particleCount; i++) {
      if (this.px[i] < minx) minx = this.px[i];
      if (this.py[i] < miny) miny = this.py[i];
      if (this.pz[i] < minz) minz = this.pz[i];
      if (this.px[i] > maxx) maxx = this.px[i];
      if (this.py[i] > maxy) maxy = this.py[i];
      if (this.pz[i] > maxz) maxz = this.pz[i];
    }
    const a = this.aabb;
    a.minx = minx; a.miny = miny; a.minz = minz;
    a.maxx = maxx; a.maxy = maxy; a.maxz = maxz;
  }

  /* ---------------------------------------------------------------- */
  /* Read-back                                                         */
  /* ---------------------------------------------------------------- */

  /** World-space capsule of bone i: writes head/tail/radius into `out`. */
  getBoneCapsule(i, out) {
    const a = this.boneHead[i], c = this.boneTail[i];
    out.ax = this.px[a]; out.ay = this.py[a]; out.az = this.pz[a];
    out.bx = this.px[c]; out.by = this.py[c]; out.bz = this.pz[c];
    out.r = this.boneRadius[i];
    return out;
  }

  /**
   * World transform of bone i. `upAxis` names which local axis runs down the
   * bone — THREE bones conventionally point along +Y.
   */
  getBoneTransform(i, outPos, outQuat) {
    const a = this.boneHead[i], c = this.boneTail[i];
    outPos.set(this.px[a], this.py[a], this.pz[a]);
    let dx = this.px[c] - this.px[a];
    let dy = this.py[c] - this.py[a];
    let dz = this.pz[c] - this.pz[a];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const ux = this.boneUp[i * 3], uy = this.boneUp[i * 3 + 1], uz = this.boneUp[i * 3 + 2];
    // basis: Y = bone dir, Z = up-ish, X = Y x Z
    let xx = dy * uz - dz * uy;
    let xy = dz * ux - dx * uz;
    let xz = dx * uy - dy * ux;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    const zx = xy * dz - xz * dy;
    const zy = xz * dx - xx * dz;
    const zz = xx * dy - xy * dx;
    this._m4.set(
      xx, dx, zx, 0,
      xy, dy, zy, 0,
      xz, dz, zz, 0,
      0, 0, 0, 1
    );
    outQuat.setFromRotationMatrix(this._m4);
    return outPos;
  }

  /**
   * Take ownership of a THREE.Skeleton. `boneMap` maps our bone index to a
   * THREE.Bone (or a name). After this, writeToSkeleton() drives the mesh.
   */
  adoptSkeleton(skeleton, boneMap) {
    const bones = new Array(this.boneCount).fill(null);
    for (let i = 0; i < this.boneCount; i++) {
      const entry = boneMap?.[i] ?? boneMap?.[this.spec[i].name] ?? null;
      if (!entry) continue;
      bones[i] = typeof entry === 'string' ? skeleton.getBoneByName(entry) : entry;
    }
    this.bones3D = bones;
    this.skeleton = skeleton;
    return this;
  }

  /** Push the simulated transforms into the adopted skeleton. */
  writeToSkeleton() {
    if (!this.bones3D) return;
    // A settled corpse re-derives 25 bone transforms per frame from particle
    // positions that `step()` has already stopped touching (it early-returns on
    // `sleeping`), so every one of those writes is the same value it wrote last
    // frame. Skip them — but only AFTER one write has landed while asleep: the
    // frame the ragdoll falls asleep, `step()` has already moved the particles
    // one last time before setting the flag, and dropping that write would leave
    // the skeleton one step stale forever. `sleeping` going false re-arms this on
    // the next call, so a re-woken ragdoll writes again immediately.
    if (this.sleeping && this._sleepWritten) return;
    this._sleepWritten = this.sleeping;
    const pos = this._v3;
    const quat = this._q;
    for (let i = 0; i < this.boneCount; i++) {
      const bone = this.bones3D[i];
      if (!bone) continue;
      this.getBoneTransform(i, pos, quat);
      this._m4b.compose(pos, quat, this._scale);
      if (bone.parent) {
        bone.parent.updateWorldMatrix(true, false);
        this._m4.copy(bone.parent.matrixWorld).invert().multiply(this._m4b);
      } else {
        this._m4.copy(this._m4b);
      }
      this._m4.decompose(bone.position, bone.quaternion, this._v3b);
      bone.updateMatrix();
    }
    this.bones3D[0]?.updateMatrixWorld(true);
  }

  dispose() {
    this.alive = false;
    this.bones3D = null;
    this.skeleton = null;
  }
}

/**
 * Build a bone spec from an existing THREE.Skeleton by walking parent/child
 * links. Bones with no children get a short stub along their local +Y.
 * Returns { spec, boneMap } ready for `new Ragdoll(...).adoptSkeleton(...)`.
 */
export function specFromSkeleton(skeleton, opts = {}) {
  const bones = skeleton.bones;
  const spec = [];
  const boneMap = [];
  const indexOf = new Map();
  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const totalMass = opts.mass ?? 82;

  for (let i = 0; i < bones.length; i++) indexOf.set(bones[i], i);

  const specIndexOfBone = new Map();
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    bone.updateWorldMatrix(true, false);
    v.setFromMatrixPosition(bone.matrixWorld);
    const childBone = bone.children.find((c) => c.isBone);
    if (childBone) {
      childBone.updateWorldMatrix(true, false);
      v2.setFromMatrixPosition(childBone.matrixWorld);
    } else {
      v2.copy(v).addScaledVector(
        new THREE.Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())),
        opts.stubLength ?? 0.08
      );
    }
    const len = v.distanceTo(v2);
    if (len < 1e-4) continue;
    const si = spec.length;
    specIndexOfBone.set(bone, si);
    const parentSpec =
      bone.parent && specIndexOfBone.has(bone.parent) ? specIndexOfBone.get(bone.parent) : -1;
    spec.push({
      name: bone.name || `bone${i}`,
      head: [v.x, v.y, v.z],
      tail: [v2.x, v2.y, v2.z],
      radius: Math.max(0.025, len * (opts.radiusRatio ?? 0.32)),
      mass: 1,
      parent: parentSpec,
      cone: (opts.cone ?? 70) * DEG,
      twist: (opts.twist ?? 35) * DEG,
    });
    boneMap[si] = bone;
  }
  // distribute mass by bone volume
  let vol = 0;
  for (const s of spec) {
    const l = Math.hypot(s.tail[0] - s.head[0], s.tail[1] - s.head[1], s.tail[2] - s.head[2]);
    s.mass = Math.PI * s.radius * s.radius * l;
    vol += s.mass;
  }
  if (vol > 0) for (const s of spec) s.mass = Math.max(0.4, (s.mass / vol) * totalMass);

  return { spec, boneMap };
}
