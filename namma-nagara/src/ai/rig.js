/**
 * AI — the soldier skeleton.
 *
 * 25 bones, authored in metres in the actor's bind space: feet on y = 0, the
 * character facing +Z. Because Y is up and Z is forward in a right-handed
 * frame, the character's own **right** side is at negative X (right =
 * forward x up) — every `*R` bone lives at x < 0. Get this backwards and the
 * rifle ends up in the wrong hand.
 *
 * Bone axis convention matches what `physics`'s ragdoll expects when it adopts
 * the skeleton: local **+Y runs down the bone** toward its child and local +Z
 * points roughly forward, so a death hand-off doesn't pop.
 *
 * The bind pose is not a T-pose. It is a genuine patrol carry — stock in the
 * right shoulder pocket, support hand on the handguard — which means the
 * geometry is modelled where the limbs actually are and the skin weights never
 * have to survive a 90 degree shoulder rotation.
 */

import * as THREE from 'three';

const H = 1.8; // reference height the proportions are authored at (8 heads)

/* Arm/leg segment lengths for the reference height. */
const UPPER_ARM = 0.29;
const FOREARM = 0.255;
const HAND = 0.095;

/**
 * Two-bone solve used at author time to place the elbow from the shoulder,
 * the wrist and a pole hint.
 */
function solveElbow(S, W, l1, l2, pole) {
  const s = new THREE.Vector3(...S);
  const w = new THREE.Vector3(...W);
  const axis = new THREE.Vector3().subVectors(w, s);
  const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, axis.length()));
  axis.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = new THREE.Vector3(...pole).normalize();
  // component of the pole perpendicular to the bone axis
  const perp = p.clone().addScaledVector(axis, -p.dot(axis));
  if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0).addScaledVector(axis, -axis.y * -1);
  perp.normalize();
  return s.clone().addScaledVector(axis, a).addScaledVector(perp, h);
}

/* -------------------------------------------------------------------- */
/* Hand targets — derived from where the weapon sits in the bind pose.  */
/* -------------------------------------------------------------------- */

/** Bore line of the carried weapon in bind pose: origin + direction. */
export const BORE_ORIGIN = [-0.148, 1.398, -0.078];
export const BORE_DIR = (() => {
  const v = new THREE.Vector3(0.115, -0.10, 1).normalize();
  return [v.x, v.y, v.z];
})();

function alongBore(t, dropY) {
  return [
    BORE_ORIGIN[0] + BORE_DIR[0] * t,
    BORE_ORIGIN[1] + BORE_DIR[1] * t - dropY,
    BORE_ORIGIN[2] + BORE_DIR[2] * t,
  ];
}

/** Firing hand (pistol grip) and support hand (handguard) in bind pose. */
export const GRIP_R = alongBore(0.26, 0.095);
export const GRIP_L = alongBore(0.45, 0.05);

const SHOULDER_R = [-0.172, 1.425, 0.004];
const SHOULDER_L = [0.172, 1.425, 0.004];

const ELBOW_R = solveElbow(SHOULDER_R, GRIP_R, UPPER_ARM, FOREARM, [-0.35, -1, -0.45]);
const ELBOW_L = solveElbow(SHOULDER_L, GRIP_L, UPPER_ARM, FOREARM, [0.55, -1, -0.2]);

/* -------------------------------------------------------------------- */
/* Bone table                                                           */
/* -------------------------------------------------------------------- */

/** name, parent, bind world position, optional up hint, optional leaf dir. */
export const BONES = [
  ['Hips', null, [0, 0.98, -0.005]],
  ['Spine', 'Hips', [0, 1.09, -0.012]],
  ['Spine1', 'Spine', [0, 1.215, 0.0]],
  ['Spine2', 'Spine1', [0, 1.345, 0.006]],
  ['Neck', 'Spine2', [0, 1.475, -0.008]],
  ['Head', 'Neck', [0, 1.552, 0.004]],
  ['HeadTop', 'Head', [0, 1.8, 0.012]],

  ['ClavicleR', 'Spine2', [-0.038, 1.408, 0.016]],
  ['UpperArmR', 'ClavicleR', SHOULDER_R],
  ['ForearmR', 'UpperArmR', [ELBOW_R.x, ELBOW_R.y, ELBOW_R.z]],
  ['HandR', 'ForearmR', GRIP_R],
  ['FingersR', 'HandR', null, null, [0.30, -0.35, 0.89]],

  ['ClavicleL', 'Spine2', [0.038, 1.408, 0.016]],
  ['UpperArmL', 'ClavicleL', SHOULDER_L],
  ['ForearmL', 'UpperArmL', [ELBOW_L.x, ELBOW_L.y, ELBOW_L.z]],
  ['HandL', 'ForearmL', GRIP_L],
  ['FingersL', 'HandL', null, null, [-0.32, -0.30, 0.90]],

  ['UpLegR', 'Hips', [-0.092, 0.945, 0.0]],
  ['LegR', 'UpLegR', [-0.098, 0.505, 0.02]],
  ['FootR', 'LegR', [-0.103, 0.088, -0.022], [0, 1, 0]],
  ['ToeR', 'FootR', [-0.103, 0.03, 0.108], [0, 1, 0]],

  ['UpLegL', 'Hips', [0.092, 0.945, 0.0]],
  ['LegL', 'UpLegL', [0.098, 0.505, 0.02]],
  ['FootL', 'LegL', [0.103, 0.088, -0.022], [0, 1, 0]],
  ['ToeL', 'FootL', [0.103, 0.03, 0.108], [0, 1, 0]],
];

const LEAF_STUB = 0.075;

export class Rig {
  constructor() {
    this.names = [];
    this.parent = [];
    this.children = [];
    this.bindPos = []; // Vector3, world (actor) space
    this.bindQuat = []; // Quaternion, world
    this.localPos = []; // Vector3, parent space
    this.localQuat = []; // Quaternion, parent space
    this.tail = []; // Vector3 — end of the bone (child or stub)
    this.length = [];
    this._map = new Map();

    for (let i = 0; i < BONES.length; i++) {
      const [name, parent] = BONES[i];
      this.names.push(name);
      this._map.set(name, i);
      this.parent.push(parent === null ? -1 : -2); // resolved below
      this.children.push([]);
    }
    for (let i = 0; i < BONES.length; i++) {
      const parent = BONES[i][1];
      const pi = parent === null ? -1 : this._map.get(parent);
      this.parent[i] = pi;
      if (pi >= 0) this.children[pi].push(i);
    }

    // ---- positions -----------------------------------------------------
    for (let i = 0; i < BONES.length; i++) {
      const spec = BONES[i];
      let p = spec[2];
      if (!p) {
        // leaf with an explicit direction: hang it off the parent
        const pi = this.parent[i];
        const base = this.bindPos[pi];
        const d = new THREE.Vector3(...spec[4]).normalize();
        p = [base.x + d.x * LEAF_STUB, base.y + d.y * LEAF_STUB, base.z + d.z * LEAF_STUB];
      }
      this.bindPos.push(new THREE.Vector3(...p));
    }

    // ---- world rotations: +Y down the bone -----------------------------
    const m = new THREE.Matrix4();
    const yAxis = new THREE.Vector3();
    const xAxis = new THREE.Vector3();
    const zAxis = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let i = 0; i < BONES.length; i++) {
      const kids = this.children[i];
      const tail = new THREE.Vector3();
      if (kids.length) {
        // primary child: the first one listed (chains are authored in order)
        tail.copy(this.bindPos[kids[0]]);
        if (kids.length > 1) {
          // a branch point (Hips, Spine2): aim at the average of the chain kids
          const primary = kids.find((k) => !/Clavicle|UpLeg/.test(this.names[k]));
          if (primary !== undefined) tail.copy(this.bindPos[primary]);
          else {
            tail.set(0, 0, 0);
            for (const k of kids) tail.add(this.bindPos[k]);
            tail.multiplyScalar(1 / kids.length);
          }
        }
      } else {
        const spec = BONES[i];
        const d = spec[4]
          ? new THREE.Vector3(...spec[4]).normalize()
          : new THREE.Vector3().subVectors(this.bindPos[i], this.bindPos[this.parent[i]]).normalize();
        tail.copy(this.bindPos[i]).addScaledVector(d, LEAF_STUB);
      }
      this.tail.push(tail);
      yAxis.copy(tail).sub(this.bindPos[i]);
      this.length.push(yAxis.length());
      if (yAxis.lengthSq() < 1e-10) yAxis.set(0, 1, 0);
      yAxis.normalize();
      const hint = BONES[i][3] ?? [0, 0, 1];
      up.set(hint[0], hint[1], hint[2]);
      if (Math.abs(up.dot(yAxis)) > 0.985) up.set(1, 0, 0);
      xAxis.copy(yAxis).cross(up).normalize();
      zAxis.copy(xAxis).cross(yAxis).normalize();
      m.makeBasis(xAxis, yAxis, zAxis);
      this.bindQuat.push(new THREE.Quaternion().setFromRotationMatrix(m));
    }

    // ---- local transforms ---------------------------------------------
    const inv = new THREE.Quaternion();
    const v = new THREE.Vector3();
    for (let i = 0; i < BONES.length; i++) {
      const pi = this.parent[i];
      if (pi < 0) {
        this.localPos.push(this.bindPos[i].clone());
        this.localQuat.push(this.bindQuat[i].clone());
      } else {
        inv.copy(this.bindQuat[pi]).invert();
        v.copy(this.bindPos[i]).sub(this.bindPos[pi]).applyQuaternion(inv);
        this.localPos.push(v.clone());
        this.localQuat.push(inv.clone().multiply(this.bindQuat[i]));
      }
    }

    this.count = BONES.length;
    this.eyeHeight = 1.665;
  }

  index(name) {
    const i = this._map.get(name);
    if (i === undefined) throw new Error(`[ai] unknown bone "${name}"`);
    return i;
  }

  has(name) {
    return this._map.has(name);
  }

  /** Distance from a point to a bone's bind-pose segment. */
  distanceToBone(i, x, y, z) {
    const a = this.bindPos[i], b = this.tail[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = l2 > 1e-12 ? ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t), z - (a.z + dz * t));
  }

  /** Fresh THREE.Bone hierarchy + Skeleton for one actor instance. */
  createSkeleton() {
    const bones = [];
    for (let i = 0; i < this.count; i++) {
      const b = new THREE.Bone();
      b.name = this.names[i];
      b.position.copy(this.localPos[i]);
      b.quaternion.copy(this.localQuat[i]);
      b.matrixAutoUpdate = false;
      b.updateMatrix();
      bones.push(b);
    }
    for (let i = 0; i < this.count; i++) {
      const pi = this.parent[i];
      if (pi >= 0) bones[pi].add(bones[i]);
    }
    bones[0].updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    return { bones, skeleton, root: bones[0] };
  }
}

/** One shared rig — the bind pose is identical for every soldier. */
export const RIG = new Rig();
