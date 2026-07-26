/**
 * Rigid bodies for debris, gibs, casings and dropped weapons.
 *
 * Full 6-DoF: semi-implicit Euler integration, an inertia tensor rotated into
 * world space each step, sequential-impulse contact resolution with Coulomb
 * friction and restitution, Baumgarte position correction with slop, and an
 * island-free sleep system (a body that stops moving is skipped entirely, so a
 * street littered with a hundred settled shells costs nothing).
 *
 * Shapes are approximated for *contact generation* by a small set of local
 * "probe" spheres — 8 corners for a box, 1 for a sphere, 2..3 for a capsule.
 * That gives correct resting behaviour (a box on a floor produces four
 * contacts and lies flat) at a fraction of the cost of full SAT clipping, and
 * it is exactly what shipped debris systems do.
 */

import * as THREE from 'three';
import { makeHitRecord, closestPtPointTriangle } from './math.js';
import { MASK, SURFACE_PROPS } from './surfaces.js';

const _m3 = new THREE.Matrix3();
const _m3b = new THREE.Matrix3();

let _nextId = 1;

export class RigidBody {
  constructor(opts = {}) {
    this.id = _nextId++;
    this.shape = opts.shape ?? 'box';
    this.active = true;

    const hx = opts.halfExtents?.x ?? opts.halfExtents?.[0] ?? 0.1;
    const hy = opts.halfExtents?.y ?? opts.halfExtents?.[1] ?? 0.1;
    const hz = opts.halfExtents?.z ?? opts.halfExtents?.[2] ?? 0.1;
    this.hx = hx; this.hy = hy; this.hz = hz;
    this.radius = opts.radius ?? Math.min(hx, hy, hz);
    this.halfHeight = opts.halfHeight ?? Math.max(0, hy - this.radius);

    this.mass = opts.mass ?? 1;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;

    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.linearVelocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.prevPosition = new THREE.Vector3();
    this.prevQuaternion = new THREE.Quaternion();

    this.restitution = opts.restitution ?? 0.25;
    this.friction = opts.friction ?? 0.6;
    /** Exponential air drag, 1/s. */
    this.linearDamping = opts.linearDamping ?? 0.16;
    this.angularDamping = opts.angularDamping ?? 0.5;
    this.gravityScale = opts.gravityScale ?? 1;
    this.surface = opts.surface ?? 0;
    this.mask = opts.mask ?? MASK.DEBRIS;
    this.layer = opts.layer ?? 0;
    this.ccd = opts.ccd ?? true;

    this.sleeping = false;
    this.sleepTimer = 0;
    this.lifetime = opts.lifetime ?? Infinity;
    this.age = 0;

    this.object3D = opts.object3D ?? null;
    this.userData = opts.userData ?? null;
    this.onSleep = opts.onSleep ?? null;
    this.onImpact = opts.onImpact ?? null;
    /** Impact reporting throttle so one bounce doesn't emit 8 events. */
    this._impactCooldown = 0;

    this.invInertiaLocal = new THREE.Vector3();
    this.invInertiaWorld = new THREE.Matrix3();
    this._computeInertia();

    // Local-space contact probes: [x,y,z,r] * n
    this.probes = buildProbes(this);
    this.probeCount = this.probes.length / 4;
    /** Smallest probe radius — the resolution of discrete contact detection. */
    this.probeRadius = Infinity;
    for (let i = 0; i < this.probeCount; i++) {
      if (this.probes[i * 4 + 3] < this.probeRadius) this.probeRadius = this.probes[i * 4 + 3];
    }
    /** Bounding radius used for broadphase and CCD substep sizing. */
    this.boundRadius = Math.hypot(hx, hy, hz);
    this.minExtent = Math.min(hx, hy, hz);

    if (opts.position) this.position.copy(opts.position);
    if (opts.quaternion) this.quaternion.copy(opts.quaternion);
    if (opts.velocity) this.linearVelocity.copy(opts.velocity);
    if (opts.angularVelocity) this.angularVelocity.copy(opts.angularVelocity);
    this.prevPosition.copy(this.position);
    this.prevQuaternion.copy(this.quaternion);
  }

  _computeInertia() {
    const m = this.mass;
    if (m <= 0) {
      this.invInertiaLocal.set(0, 0, 0);
      return;
    }
    let ix, iy, iz;
    if (this.shape === 'sphere') {
      const i = 0.4 * m * this.radius * this.radius;
      ix = iy = iz = i;
    } else if (this.shape === 'capsule') {
      const r = this.radius, h = this.halfHeight * 2;
      // cylinder + two hemispheres, standard composite
      const mc = m * (h / (h + 1.3333 * r));
      const ms = m - mc;
      const iyy = 0.5 * mc * r * r + 0.8 * ms * r * r;
      const ixx =
        mc * (0.25 * r * r + h * h / 12) +
        ms * (0.4 * r * r + 0.375 * r * h + 0.25 * h * h);
      ix = iz = ixx;
      iy = iyy;
    } else {
      const w = this.hx * 2, ht = this.hy * 2, d = this.hz * 2;
      const k = m / 12;
      ix = k * (ht * ht + d * d);
      iy = k * (w * w + d * d);
      iz = k * (w * w + ht * ht);
    }
    this.invInertiaLocal.set(ix > 0 ? 1 / ix : 0, iy > 0 ? 1 / iy : 0, iz > 0 ? 1 / iz : 0);
  }

  updateInertiaWorld() {
    _m3.setFromMatrix4(_mat4FromQuat(this.quaternion));
    const e = _m3.elements;
    const ix = this.invInertiaLocal.x, iy = this.invInertiaLocal.y, iz = this.invInertiaLocal.z;
    // R * diag(I) * R^T
    const a = _m3b.elements;
    a[0] = e[0] * ix; a[1] = e[1] * ix; a[2] = e[2] * ix;
    a[3] = e[3] * iy; a[4] = e[4] * iy; a[5] = e[5] * iy;
    a[6] = e[6] * iz; a[7] = e[7] * iz; a[8] = e[8] * iz;
    const o = this.invInertiaWorld.elements;
    o[0] = a[0] * e[0] + a[3] * e[3] + a[6] * e[6];
    o[1] = a[1] * e[0] + a[4] * e[3] + a[7] * e[6];
    o[2] = a[2] * e[0] + a[5] * e[3] + a[8] * e[6];
    o[3] = a[0] * e[1] + a[3] * e[4] + a[6] * e[7];
    o[4] = a[1] * e[1] + a[4] * e[4] + a[7] * e[7];
    o[5] = a[2] * e[1] + a[5] * e[4] + a[8] * e[7];
    o[6] = a[0] * e[2] + a[3] * e[5] + a[6] * e[8];
    o[7] = a[1] * e[2] + a[4] * e[5] + a[7] * e[8];
    o[8] = a[2] * e[2] + a[5] * e[5] + a[8] * e[8];
  }

  wake() {
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  applyImpulse(ix, iy, iz, px, py, pz) {
    if (this.invMass === 0) return;
    this.wake();
    this.linearVelocity.x += ix * this.invMass;
    this.linearVelocity.y += iy * this.invMass;
    this.linearVelocity.z += iz * this.invMass;
    if (px !== undefined) {
      const rx = px - this.position.x, ry = py - this.position.y, rz = pz - this.position.z;
      const tx = ry * iz - rz * iy;
      const ty = rz * ix - rx * iz;
      const tz = rx * iy - ry * ix;
      const w = this.invInertiaWorld.elements;
      this.angularVelocity.x += w[0] * tx + w[3] * ty + w[6] * tz;
      this.angularVelocity.y += w[1] * tx + w[4] * ty + w[7] * tz;
      this.angularVelocity.z += w[2] * tx + w[5] * ty + w[8] * tz;
    }
  }
}

const _tmpMat4 = new THREE.Matrix4();
function _mat4FromQuat(q) {
  return _tmpMat4.makeRotationFromQuaternion(q);
}

function buildProbes(body) {
  if (body.shape === 'sphere') {
    return new Float32Array([0, 0, 0, body.radius]);
  }
  if (body.shape === 'capsule') {
    const h = body.halfHeight;
    return new Float32Array([0, -h, 0, body.radius, 0, h, 0, body.radius, 0, 0, 0, body.radius]);
  }
  // Box: 8 corners, each a small sphere so edges/corners generate contacts.
  // The radius is a real fraction of the box (not an epsilon) — it sets the
  // contact detection band and therefore the CCD substep size.
  const { hx, hy, hz } = body;
  const r = Math.max(0.006, Math.min(hx, hy, hz) * 0.35);
  const p = new Float32Array(8 * 4);
  let k = 0;
  for (let sx = -1; sx <= 1; sx += 2)
    for (let sy = -1; sy <= 1; sy += 2)
      for (let sz = -1; sz <= 1; sz += 2) {
        p[k++] = sx * (hx - r);
        p[k++] = sy * (hy - r);
        p[k++] = sz * (hz - r);
        p[k++] = r;
      }
  return p;
}

/* ------------------------------------------------------------------ */

const MAX_CONTACTS = 48;
const SLOP = 0.0015;
/** Fraction of residual penetration removed positionally each step. */
const BAUMGARTE = 0.4;
const REST_THRESHOLD = 0.55; // m/s below which restitution is suppressed
const SLEEP_LINEAR = 0.035;
const SLEEP_ANGULAR = 0.22;
const SLEEP_TIME = 0.45;

export class RigidBodyWorld {
  constructor(staticWorld, gravity = -20.6) {
    this.world = staticWorld;
    this.gravity = gravity;
    this.bodies = [];
    this.maxBodies = 256;
    this.solverIterations = 4;

    // contact scratch
    this._cn = new Float32Array(MAX_CONTACTS * 3);
    this._cp = new Float32Array(MAX_CONTACTS * 3);
    this._cd = new Float32Array(MAX_CONTACTS);
    this._cf = new Float32Array(MAX_CONTACTS); // friction coefficient
    this._ce = new Float32Array(MAX_CONTACTS); // restitution
    this._cs = new Int32Array(MAX_CONTACTS); // surface index
    this._hit = makeHitRecord();
    this._awake = 0;
    this._contactsLastStep = 0;
  }

  add(body) {
    if (this.bodies.length >= this.maxBodies) {
      // Recycle the oldest sleeping body so the budget is never exceeded.
      let victim = -1;
      let bestAge = -1;
      for (let i = 0; i < this.bodies.length; i++) {
        const b = this.bodies[i];
        if (b.sleeping && b.age > bestAge) { bestAge = b.age; victim = i; }
      }
      if (victim < 0) victim = 0;
      this.remove(this.bodies[victim]);
    }
    body.updateInertiaWorld();
    this.bodies.push(body);
    return body;
  }

  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
    body.active = false;
    return body;
  }

  clear() {
    this.bodies.length = 0;
  }

  /** Wake and shove everything inside a blast radius. */
  applyRadialImpulse(x, y, z, radius, strength) {
    const r2 = radius * radius;
    for (const b of this.bodies) {
      const dx = b.position.x - x, dy = b.position.y - y, dz = b.position.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const falloff = 1 - d / radius;
      const j = strength * falloff * falloff * b.mass;
      b.applyImpulse(
        (dx / d) * j, (dy / d) * j + j * 0.35, (dz / d) * j,
        b.position.x + dx * 0.05, b.position.y + dy * 0.05, b.position.z + dz * 0.05
      );
    }
  }

  step(dt) {
    const bodies = this.bodies;
    this._awake = 0;
    this._contactsLastStep = 0;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      b.age += dt;
      if (b.age > b.lifetime) {
        this.remove(b);
        continue;
      }
      if (b.sleeping) continue;
      this._awake++;
      this._stepBody(b, dt);
    }
  }

  _stepBody(b, dt) {
    b.prevPosition.copy(b.position);
    b.prevQuaternion.copy(b.quaternion);
    if (b._impactCooldown > 0) b._impactCooldown -= dt;

    // --- integrate velocity ---
    b.linearVelocity.y += this.gravity * b.gravityScale * dt;
    const ld = Math.exp(-b.linearDamping * dt);
    const ad = Math.exp(-b.angularDamping * dt);
    b.linearVelocity.multiplyScalar(ld);
    b.angularVelocity.multiplyScalar(ad);

    // --- Continuous pass -------------------------------------------------
    // A shell leaving the ejection port at 4 m/s or a gib from a grenade at
    // 40 m/s travels far further per step than its own probe radius, so the
    // discrete solver below could never see the wall. Sweep the body's core
    // sphere first and clamp the step at the time of impact.
    const speed = b.linearVelocity.length();
    const travel = speed * dt;
    const probeR = b.probeRadius;
    if (b.ccd && travel > probeR && this.world.triCount > 0) {
      const inv = 1 / speed;
      const dx = b.linearVelocity.x * inv;
      const dy = b.linearVelocity.y * inv;
      const dz = b.linearVelocity.z * inv;
      const hit = this._hit;
      const core = Math.max(probeR, b.minExtent * 0.9);
      if (this.world.sweepCapsule(
        b.position.x, b.position.y, b.position.z,
        b.position.x, b.position.y, b.position.z,
        core, dx, dy, dz, travel, b.mask, hit
      )) {
        const adv = Math.max(0, hit.t - 0.002);
        b.position.x += dx * adv;
        b.position.y += dy * adv;
        b.position.z += dz * adv;
        // Reflect with restitution + tangential friction, and convert some of
        // the tangential slide into spin so it tumbles instead of skating.
        const sp = SURFACE_PROPS[this.world.surface[hit.tri]] ?? SURFACE_PROPS[0];
        const e = Math.sqrt(Math.max(0, b.restitution * sp.restitution));
        const mu = Math.sqrt(Math.max(0, b.friction * sp.friction));
        const vn = b.linearVelocity.x * hit.nx + b.linearVelocity.y * hit.ny + b.linearVelocity.z * hit.nz;
        if (vn < 0) {
          const tx = b.linearVelocity.x - hit.nx * vn;
          const ty = b.linearVelocity.y - hit.ny * vn;
          const tz = b.linearVelocity.z - hit.nz * vn;
          const keep = Math.max(0, 1 - mu * 0.5);
          b.linearVelocity.set(
            tx * keep - hit.nx * vn * e,
            ty * keep - hit.ny * vn * e,
            tz * keep - hit.nz * vn * e
          );
          const spin = Math.min(30, -vn * 2.5);
          b.angularVelocity.x += (hit.ny * tz - hit.nz * ty) * spin * 0.05;
          b.angularVelocity.y += (hit.nz * tx - hit.nx * tz) * spin * 0.05;
          b.angularVelocity.z += (hit.nx * ty - hit.ny * tx) * spin * 0.05;
        }
        if (b.onImpact && b._impactCooldown <= 0 && -vn > 1.0) {
          b._impactCooldown = 0.08;
          b.onImpact(b, hit.px, hit.py, hit.pz, hit.nx, hit.ny, hit.nz, -vn, this.world.surface[hit.tri]);
        }
        integrateQuaternion(b.quaternion, b.angularVelocity, dt);
        b.updateInertiaWorld();
        this._sleepCheck(b, dt);
        return;
      }
    }

    // --- Discrete substepping --------------------------------------------
    const maxStepDist = Math.max(0.004, probeR * 0.75);
    let sub = b.ccd ? Math.ceil(travel / maxStepDist) : 1;
    if (!(sub >= 1)) sub = 1;
    if (sub > 12) sub = 12;
    const h = dt / sub;

    for (let s = 0; s < sub; s++) {
      b.position.addScaledVector(b.linearVelocity, h);
      integrateQuaternion(b.quaternion, b.angularVelocity, h);
      b.updateInertiaWorld();
      const n = this._collect(b);
      if (n > 0) {
        this._contactsLastStep += n;
        this._solve(b, n, h);
      }
    }

    this._sleepCheck(b, dt);
  }

  _sleepCheck(b, dt) {
    let lin = b.linearVelocity.lengthSq();
    let ang = b.angularVelocity.lengthSq();
    // Angular tolerance scales with size: 0.3 rad/s on a 9 cm chip is 1 cm/s of
    // surface motion and reads as perfectly still.
    const angLimit = SLEEP_ANGULAR / Math.max(0.12, b.boundRadius);
    // Micro-friction: a body already this slow is being held up by contacts,
    // and the last of its jitter is solver noise. Bleed it off so debris
    // reaches sleep in a fraction of a second instead of rocking forever.
    if (lin < 9 * SLEEP_LINEAR * SLEEP_LINEAR && ang < 9 * angLimit * angLimit) {
      b.linearVelocity.multiplyScalar(0.9);
      b.angularVelocity.multiplyScalar(0.85);
      lin = b.linearVelocity.lengthSq();
      ang = b.angularVelocity.lengthSq();
    }
    if (lin < SLEEP_LINEAR * SLEEP_LINEAR && ang < angLimit * angLimit) {
      b.sleepTimer += dt;
      if (b.sleepTimer > SLEEP_TIME) {
        b.sleeping = true;
        b.linearVelocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        b.onSleep?.(b);
      }
    } else {
      b.sleepTimer = 0;
    }
  }

  /** Contact generation: probes vs static triangles. */
  _collect(b) {
    const w = this.world;
    if (w.triCount === 0) return 0;
    const R = b.boundRadius + 0.05;
    const n = w.queryAabb(
      b.position.x - R, b.position.y - R, b.position.z - R,
      b.position.x + R, b.position.y + R, b.position.z + R,
      b.mask
    );
    if (n === 0) return 0;
    const cand = w.candidates;
    const pos = w.pos;
    const nrm = w.nrm;
    const probes = b.probes;
    const q = b.quaternion;
    let count = 0;

    for (let pi = 0; pi < b.probeCount && count < MAX_CONTACTS; pi++) {
      const lx = probes[pi * 4], ly = probes[pi * 4 + 1], lz = probes[pi * 4 + 2];
      const pr = probes[pi * 4 + 3];
      // rotate local probe into world
      const wx = rotX(q, lx, ly, lz) + b.position.x;
      const wy = rotY(q, lx, ly, lz) + b.position.y;
      const wz = rotZ(q, lx, ly, lz) + b.position.z;

      let deepest = 0;
      let dnx = 0, dny = 0, dnz = 0, dpx = 0, dpy = 0, dpz = 0, dtri = -1;

      for (let c = 0; c < n; c++) {
        const tri = cand[c];
        const p = tri * 9;
        closestPtPointTriangle(
          wx, wy, wz,
          pos[p], pos[p + 1], pos[p + 2],
          pos[p + 3], pos[p + 4], pos[p + 5],
          pos[p + 6], pos[p + 7], pos[p + 8],
          _cpt
        );
        const ex = wx - _cpt.bx, ey = wy - _cpt.by, ez = wz - _cpt.bz;
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 >= pr * pr) continue;
        const d = Math.sqrt(d2);
        let nx, ny, nz;
        if (d > 1e-6) {
          nx = ex / d; ny = ey / d; nz = ez / d;
          if (nx * nrm[tri * 3] + ny * nrm[tri * 3 + 1] + nz * nrm[tri * 3 + 2] < 0.02) {
            nx = nrm[tri * 3]; ny = nrm[tri * 3 + 1]; nz = nrm[tri * 3 + 2];
          }
        } else {
          nx = nrm[tri * 3]; ny = nrm[tri * 3 + 1]; nz = nrm[tri * 3 + 2];
        }
        const depth = pr - d;
        if (depth > deepest) {
          deepest = depth;
          dnx = nx; dny = ny; dnz = nz;
          dpx = _cpt.bx; dpy = _cpt.by; dpz = _cpt.bz;
          dtri = tri;
        }
      }

      if (dtri >= 0) {
        const k = count++;
        this._cn[k * 3] = dnx; this._cn[k * 3 + 1] = dny; this._cn[k * 3 + 2] = dnz;
        this._cp[k * 3] = dpx; this._cp[k * 3 + 1] = dpy; this._cp[k * 3 + 2] = dpz;
        this._cd[k] = deepest;
        const sp = SURFACE_PROPS[w.surface[dtri]] ?? SURFACE_PROPS[0];
        this._cf[k] = Math.sqrt(Math.max(0, b.friction * sp.friction));
        this._ce[k] = Math.sqrt(Math.max(0, b.restitution * sp.restitution));
        this._cs[k] = w.surface[dtri];
      }
    }
    return count;
  }

  _solve(b, n, dt) {
    const iw = b.invInertiaWorld.elements;
    const im = b.invMass;
    let maxApproach = 0;
    let impactIdx = -1;

    // Pre-pass: find the hardest approach for impact reporting.
    for (let k = 0; k < n; k++) {
      const nx = this._cn[k * 3], ny = this._cn[k * 3 + 1], nz = this._cn[k * 3 + 2];
      const rx = this._cp[k * 3] - b.position.x;
      const ry = this._cp[k * 3 + 1] - b.position.y;
      const rz = this._cp[k * 3 + 2] - b.position.z;
      const vx = b.linearVelocity.x + (b.angularVelocity.y * rz - b.angularVelocity.z * ry);
      const vy = b.linearVelocity.y + (b.angularVelocity.z * rx - b.angularVelocity.x * rz);
      const vz = b.linearVelocity.z + (b.angularVelocity.x * ry - b.angularVelocity.y * rx);
      const vn = vx * nx + vy * ny + vz * nz;
      if (-vn > maxApproach) { maxApproach = -vn; impactIdx = k; }
    }

    for (let iter = 0; iter < this.solverIterations; iter++) {
      for (let k = 0; k < n; k++) {
        const nx = this._cn[k * 3], ny = this._cn[k * 3 + 1], nz = this._cn[k * 3 + 2];
        const rx = this._cp[k * 3] - b.position.x;
        const ry = this._cp[k * 3 + 1] - b.position.y;
        const rz = this._cp[k * 3 + 2] - b.position.z;

        // relative velocity at the contact
        let vx = b.linearVelocity.x + (b.angularVelocity.y * rz - b.angularVelocity.z * ry);
        let vy = b.linearVelocity.y + (b.angularVelocity.z * rx - b.angularVelocity.x * rz);
        let vz = b.linearVelocity.z + (b.angularVelocity.x * ry - b.angularVelocity.y * rx);
        const vn = vx * nx + vy * ny + vz * nz;

        // effective mass along n: im + n . (Iinv (r x n)) x r
        const rnx = ry * nz - rz * ny;
        const rny = rz * nx - rx * nz;
        const rnz = rx * ny - ry * nx;
        const iax = iw[0] * rnx + iw[3] * rny + iw[6] * rnz;
        const iay = iw[1] * rnx + iw[4] * rny + iw[7] * rnz;
        const iaz = iw[2] * rnx + iw[5] * rny + iw[8] * rnz;
        const angTerm =
          (iay * rz - iaz * ry) * nx + (iaz * rx - iax * rz) * ny + (iax * ry - iay * rx) * nz;
        const kn = im + angTerm;
        if (kn <= 1e-9) continue;

        // No Baumgarte velocity bias here on purpose: injecting positional
        // error as velocity leaves a resting body with a permanent residual
        // speed, and it never falls under the sleep threshold. Penetration is
        // taken out positionally after the solve instead, which adds no energy.
        const e = maxApproach > REST_THRESHOLD ? this._ce[k] : 0;
        let jn = (-(1 + e) * vn) / kn;
        if (jn < 0) jn = 0;
        if (jn > 0) applyImpulse(b, nx * jn, ny * jn, nz * jn, rx, ry, rz, iw);

        // --- friction ---
        vx = b.linearVelocity.x + (b.angularVelocity.y * rz - b.angularVelocity.z * ry);
        vy = b.linearVelocity.y + (b.angularVelocity.z * rx - b.angularVelocity.x * rz);
        vz = b.linearVelocity.z + (b.angularVelocity.x * ry - b.angularVelocity.y * rx);
        const vnn = vx * nx + vy * ny + vz * nz;
        let tx = vx - nx * vnn, ty = vy - ny * vnn, tz = vz - nz * vnn;
        const tl = Math.hypot(tx, ty, tz);
        if (tl > 1e-6) {
          tx /= tl; ty /= tl; tz /= tl;
          const rtx = ry * tz - rz * ty;
          const rty = rz * tx - rx * tz;
          const rtz = rx * ty - ry * tx;
          const jx = iw[0] * rtx + iw[3] * rty + iw[6] * rtz;
          const jy = iw[1] * rtx + iw[4] * rty + iw[7] * rtz;
          const jz = iw[2] * rtx + iw[5] * rty + iw[8] * rtz;
          const angT =
            (jy * rz - jz * ry) * tx + (jz * rx - jx * rz) * ty + (jx * ry - jy * rx) * tz;
          const kt = im + angT;
          if (kt > 1e-9) {
            let jt = -tl / kt;
            const maxF = this._cf[k] * jn;
            if (jt < -maxF) jt = -maxF;
            if (jt > maxF) jt = maxF;
            applyImpulse(b, tx * jt, ty * jt, tz * jt, rx, ry, rz, iw);
          }
        }
      }
    }

    // Positional correction — pushes out residual penetration without adding
    // energy. Uses the deepest contact only; summing over 8 probes on a corner
    // would double-count.
    let deepest = 0, dk = -1;
    for (let k = 0; k < n; k++) if (this._cd[k] > deepest) { deepest = this._cd[k]; dk = k; }
    if (dk >= 0 && deepest > SLOP) {
      const push = Math.min(deepest - SLOP, 0.08) * BAUMGARTE;
      b.position.x += this._cn[dk * 3] * push;
      b.position.y += this._cn[dk * 3 + 1] * push;
      b.position.z += this._cn[dk * 3 + 2] * push;
    }

    if (impactIdx >= 0 && maxApproach > 1.0 && b._impactCooldown <= 0 && b.onImpact) {
      b._impactCooldown = 0.08;
      b.onImpact(
        b,
        this._cp[impactIdx * 3], this._cp[impactIdx * 3 + 1], this._cp[impactIdx * 3 + 2],
        this._cn[impactIdx * 3], this._cn[impactIdx * 3 + 1], this._cn[impactIdx * 3 + 2],
        maxApproach,
        this._cs[impactIdx]
      );
    }
  }

  get awakeCount() {
    return this._awake;
  }
}

function applyImpulse(b, ix, iy, iz, rx, ry, rz, iw) {
  b.linearVelocity.x += ix * b.invMass;
  b.linearVelocity.y += iy * b.invMass;
  b.linearVelocity.z += iz * b.invMass;
  const tx = ry * iz - rz * iy;
  const ty = rz * ix - rx * iz;
  const tz = rx * iy - ry * ix;
  b.angularVelocity.x += iw[0] * tx + iw[3] * ty + iw[6] * tz;
  b.angularVelocity.y += iw[1] * tx + iw[4] * ty + iw[7] * tz;
  b.angularVelocity.z += iw[2] * tx + iw[5] * ty + iw[8] * tz;
}

function integrateQuaternion(q, w, dt) {
  const wx = w.x * dt * 0.5, wy = w.y * dt * 0.5, wz = w.z * dt * 0.5;
  const x = q.x, y = q.y, z = q.z, s = q.w;
  q.x = x + (wx * s + wy * z - wz * y);
  q.y = y + (wy * s + wz * x - wx * z);
  q.z = z + (wz * s + wx * y - wy * x);
  q.w = s - (wx * x + wy * y + wz * z);
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  if (l > 1e-9) {
    const i = 1 / l;
    q.x *= i; q.y *= i; q.z *= i; q.w *= i;
  } else {
    q.set(0, 0, 0, 1);
  }
}

/* quaternion-rotate a local vector, component at a time (no allocations) */
function rotX(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return x + q.w * tx + (q.y * tz - q.z * ty);
}
function rotY(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return y + q.w * ty + (q.z * tx - q.x * tz);
}
function rotZ(q, x, y, z) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  return z + q.w * tz + (q.x * ty - q.y * tx);
}

/** Shared closest-point record; `closestPtPointTriangle` writes b* into it. */
const _cpt = { bx: 0, by: 0, bz: 0 };

export { rotX, rotY, rotZ, integrateQuaternion };
