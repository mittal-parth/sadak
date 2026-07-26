import * as THREE from 'three';
import { P, buildBrassTextures } from './atlas.js';
import { resetSpawn } from './particles.js';

/**
 * Ejected shell casings.
 *
 * Real rigid bodies through `physics.addRigidBody` when physics is up: they
 * tumble on a proper inertia tensor, bounce off the world's BVH, come to rest,
 * and report their impacts so audio can ping and a puff of dust can lift off
 * the floor. One InstancedMesh draws all of them, so a firefight's worth of
 * brass costs one draw call.
 *
 * The casing itself is a lathed 5.56-profile case — rim, body taper, shoulder,
 * neck and a hollow mouth — in brass (metalness 1, F0 tinted, roughness map with
 * drawing marks and extractor scuffing) so it catches the sun as it spins.
 */

const CAPACITY = 14;
const LIFETIME = 9.0;
const FADE = 0.7;
/** Length of the modelled case (5.56x45), in metres — the scale=1 reference. */
const CASE_LEN = 0.045;

function caseProfile() {
  // metres; a 5.56x45 case is 45 mm long, 9.6 mm at the base
  const pts = [];
  const add = (r, y) => pts.push(new THREE.Vector2(r, y));
  add(0.0, 0.0);
  add(0.0046, 0.0);
  add(0.00475, 0.0012); // extractor rim
  add(0.00455, 0.0035);
  add(0.00452, 0.026);
  add(0.00436, 0.0315);
  add(0.0031, 0.0357); // shoulder
  add(0.00295, 0.0442);
  add(0.00285, 0.045); // mouth
  add(0.00245, 0.0438); // inner lip -> hollow
  add(0.00235, 0.008);
  add(0.0, 0.0075);
  return pts;
}

export class ShellSystem {
  constructor(fx, opts = {}) {
    this.fx = fx;
    const geo = new THREE.LatheGeometry(caseProfile(), 16);
    geo.translate(0, -0.0225, 0); // origin at the centre of mass
    geo.computeVertexNormals();
    this.geometry = geo;

    const tex = buildBrassTextures(fx.rng.fork(), 128);
    this.textures = tex;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.78, 0.62, 0.31), // brass F0
      metalness: 1,
      roughness: 1,
      roughnessMap: tex.orm,
      aoMap: tex.orm,
      normalMap: tex.normal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      envMapIntensity: 1,
      dithering: true,
    });
    mat.name = 'fx-brass';
    this.material = mat;

    this.mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.name = 'fx-shells';
    this.mesh.userData.owProbe = true;
    this.mesh.userData.owNoShadow = true;

    this.slots = [];
    for (let i = 0; i < CAPACITY; i++) {
      this.slots.push({
        alive: false,
        age: 0,
        body: null,
        proxy: new THREE.Object3D(),
        // fallback integration when physics is absent
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        spin: new THREE.Vector3(),
        scale: 1,
        baseScale: 1,
      });
      this.slots[i].proxy.matrixAutoUpdate = false;
    }
    this.cursor = 0;
    this._lastCount = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
    this._onImpact = this._onImpact.bind(this);
  }

  spawn(position, velocity, opts = {}) {
    const fx = this.fx;
    const rng = fx.rng;
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % CAPACITY;
    if (slot.alive) this._release(slot);

    slot.alive = true;
    slot.age = 0;
    // The lathe is a 5.56x45 case. `weapons` publishes the real case dimensions
    // on `weapon:shell`, so a 9x19 pistol case comes out at 42% of the length
    // instead of wearing rifle brass.
    const caseLen = opts.caseLen > 0 ? opts.caseLen : CASE_LEN;
    slot.baseScale = caseLen / CASE_LEN;
    slot.scale = slot.baseScale;
    slot.pos.copy(position);
    slot.vel.set(velocity?.x ?? 2.4, velocity?.y ?? 1.6, velocity?.z ?? 0);
    // Real ejection is violent and always tumbling end over end. `weapons` may
    // publish the ejector-imparted spin rate; otherwise roll one.
    const spin = opts.spin > 0 ? opts.spin : 0;
    if (spin) {
      slot.spin.set(rng.signed() * spin, rng.signed() * spin * 0.7, rng.signed() * spin);
    } else {
      slot.spin.set(rng.range(-38, 38), rng.range(-26, 26), rng.range(-38, 38));
    }
    this._e.set(rng.float() * 6.28, rng.float() * 6.28, rng.float() * 6.28);
    slot.quat.setFromEuler(this._e);

    const physics = fx.physics;
    if (physics?.addRigidBody) {
      slot.proxy.position.copy(slot.pos);
      slot.proxy.quaternion.copy(slot.quat);
      slot.body = physics.addRigidBody({
        shape: 'box',
        halfExtents: {
          x: 0.0047 * slot.baseScale,
          y: 0.0225 * slot.baseScale,
          z: 0.0047 * slot.baseScale,
        },
        radius: 0.0047 * slot.baseScale,
        mass: 0.0115 * slot.baseScale ** 3, // 11.5 g of 5.56 brass
        position: slot.pos,
        quaternion: slot.quat,
        velocity: slot.vel,
        angularVelocity: slot.spin,
        restitution: 0.36,
        friction: 0.42,
        linearDamping: 0.1,
        angularDamping: 0.25,
        lifetime: LIFETIME + 1,
        surfaceType: 'metal',
        object3D: slot.proxy,
        onImpact: this._onImpact,
      });
      if (slot.body) slot.body.userData = slot;
    }
    return slot;
  }

  _release(slot) {
    if (slot.body && this.fx.physics?.removeRigidBody) {
      this.fx.physics.removeRigidBody(slot.body);
    }
    slot.body = null;
    slot.alive = false;
  }

  _onImpact(body, px, py, pz, nx, ny, nz, speed) {
    const fx = this.fx;
    if (speed < 0.7) return;
    const rng = fx.rng;
    const gain = Math.min(1, speed / 3.5);
    fx.audioPing(px, py, pz, gain);
    // a tick of dust and a metallic glint where it struck
    const s = resetSpawn();
    s.x = px; s.y = py + 0.005; s.z = pz;
    s.vx = nx * 0.25; s.vy = ny * 0.3 + 0.15; s.vz = nz * 0.25;
    s.tile = P.DUST;
    s.size0 = 0.012; s.size1 = 0.07; s.sizeCurve = 0.5;
    s.life = 0.3; s.drag = 5; s.gravity = -0.4;
    s.rot = rng.float() * 6.28;
    s.r0 = 0.55; s.g0 = 0.53; s.b0 = 0.5;
    s.r1 = 0.5; s.g1 = 0.48; s.b1 = 0.46;
    s.alpha = 0.3 * gain; s.alphaCurve = 1.6; s.soft = 0.1; s.seed = rng.float();
    fx.emitLit(s);
  }

  update(dt, now) {
    const gravity = this.fx.gravity;
    let count = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.alive) continue;
      slot.age += dt;
      if (slot.age > LIFETIME) {
        this._release(slot);
        continue;
      }
      if (slot.body) {
        slot.pos.copy(slot.proxy.position);
        slot.quat.copy(slot.proxy.quaternion);
      } else {
        // No physics yet: ballistic arc with a crude floor bounce so brass
        // still behaves if this subsystem boots first.
        slot.vel.y += gravity * dt;
        slot.pos.addScaledVector(slot.vel, dt);
        this._e.set(slot.spin.x * dt, slot.spin.y * dt, slot.spin.z * dt);
        this._q.setFromEuler(this._e);
        slot.quat.multiply(this._q);
      }
      const fadeAt = LIFETIME - FADE;
      slot.scale =
        slot.baseScale * (slot.age > fadeAt ? Math.max(0, 1 - (slot.age - fadeAt) / FADE) : 1);
      count = i + 1;
    }
    if (count === 0 && this._lastCount === 0) {
      this.mesh.visible = false;
      return;
    }
    this._lastCount = count;
    // Write instance matrices; dead slots collapse to zero scale.
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const sc = slot.alive ? slot.scale : 0;
      this._s.set(sc, sc, sc);
      this._m.compose(slot.pos, slot.quat, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = count > 0;
  }

  dispose() {
    for (const s of this.slots) if (s.alive) this._release(s);
    this.geometry.dispose();
    this.material.dispose();
    this.textures.normal.dispose();
    this.textures.orm.dispose();
    this.mesh.dispose();
  }
}
