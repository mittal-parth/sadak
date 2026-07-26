import * as THREE from 'three';
import { box, blob, latheZ, rodZ, dome, extrude, roundRect, ring, mergeAll } from './geometry.js';

/**
 * First-person arms.
 *
 * Two bones per arm, solved analytically from the hand (which is the thing the
 * animation drives — the hands are welded to the weapon, the elbows follow).
 * That is the same order of operations a real animator uses and it means the
 * hands can never slide off the grip.
 *
 * Anatomy is deliberate: a hand is 190 mm wrist-to-fingertip and 88 mm across
 * the knuckles, the fingers taper and *separate*, the knuckles are lumps, the
 * glove has a padded back, a palm patch, seams down the finger sides and a
 * velcro wrist strap, and the sleeve is a tapered tube with real fold rings and
 * a rolled cuff. That list is the difference between a hand and a grey sausage.
 *
 * Hand-local space: -Z along the fingers, +Y out of the back of the hand,
 * +X toward the thumb (a right hand; the left is mirrored).
 */

/**
 * Humerus and forearm+wrist lengths, in metres.
 *
 * A large adult is 300 / 272 mm, and those were the values here. They do not
 * work, and no viewmodel in the genre uses them: once the weapon is far enough
 * from the eye for the magazine and the muzzle to be in frame at all (300 mm —
 * see defs.js), the support hand is 515 mm downrange of a shoulder that has to
 * stay BEHIND the eye, and 572 mm of arm reaches that at 99.5% extension. The
 * two-bone solve then clamps, the elbow locks dead straight, and the arm reads
 * as a broomstick with the hand sliding off the handguard.
 *
 * The obvious alternative — blading the shoulder forward — was measured and is
 * worse: at shoulderZ -0.075 the 89 mm forearm sleeve crosses the frame
 * diagonally and occludes the barrel and muzzle outright, which is exactly what
 * the warning in viewmodel.js predicted.
 *
 * So the bones are cheated 10% long (330 / 300, reach 630 mm). That takes the
 * same target to 91% extension, which leaves a visible elbow bend, and it pushes
 * the elbow FURTHER out of frame rather than into it, because a longer chain
 * between fixed endpoints bends more.
 */
const L_UPPER = 0.33;
const L_FORE = 0.3;

/* -------------------------------------------------------------------------- */
/*  geometry                                                                  */
/* -------------------------------------------------------------------------- */

/** One finger segment: a tapered, chamfered capsule with a joint crease. */
function segment(len, r0, r1) {
  const g = latheZ(
    [
      [0, 0],
      [0, r0 * 0.86],
      [r0 * 0.5, r0],
      [len * 0.42, r0 * 0.99],
      [len * 0.55, r1 * 1.04],
      [len - r1 * 0.7, r1],
      [len - r1 * 0.2, r1 * 0.8],
      [len, r1 * 0.35],
      [len, 0],
    ],
    12
  );
  g.scale(1, 0.88, 1); // fingers are wider than they are deep
  g.rotateY(Math.PI); // extend along -Z
  return g;
}

/** Padded segment cover on the dorsal side (glove reinforcement). */
function segmentPad(len, r) {
  const g = blob(r * 1.55, r * 0.55, len * 0.78, r * 0.25, 2);
  g.translate(0, r * 0.78, -len * 0.46);
  return g;
}

/**
 * Stitched seam down the OUTBOARD side of a finger segment.
 *
 * A glove is sewn from a palm panel and a dorsal panel, and the seam between
 * them runs down the side of every finger. It matters far out of proportion to
 * its size: at 40 px across the whole hand the four fingers merge into one
 * paddle, and the only thing that still separates them is a light line at each
 * boundary. A 1.5 mm strip at 1.4x the shell albedo (see `glove_seam` in
 * materials.js) survives to about 3 px, which is one pixel of separation per
 * finger — enough.
 *
 * @param {number} sx  +1 outboard on the thumb side, -1 on the little-finger side
 */
function segmentSeam(len, r0, r1, sx) {
  const g = box(0.0015, (r0 + r1) * 0.34, len * 0.86, 0.0003, 1);
  // The finger capsule is scaled to 0.88 in Y, so its side wall sits at r in X.
  g.translate(sx * (r0 + r1) * 0.49, r0 * 0.1, -len * 0.47);
  return g;
}

/**
 * Build one finger as three nested groups so it can curl.
 * @returns {{root: THREE.Object3D, joints: THREE.Object3D[]}}
 */
function buildFinger(materials, spec) {
  const { lengths, radii, curl, seamSide } = spec;
  const root = new THREE.Object3D();
  const joints = [];
  let parent = root;
  for (let i = 0; i < 3; i++) {
    const j = new THREE.Object3D();
    j.rotation.x = -curl[i];
    parent.add(j);
    const geo = mergeAll([segment(lengths[i], radii[i], radii[i + 1])]);
    const mesh = new THREE.Mesh(geo, materials.glove);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    j.add(mesh);
    // Sewn seams down BOTH flanks. One seam per finger leaves three boundaries
    // out of five unmarked; seaming both sides puts a light line at every
    // boundary, which is the whole point of the exercise. Two segments only —
    // the distal phalanx is 22 mm long and a seam on it is sub-pixel.
    if (i < 2) {
      const seams = mergeAll(
        (seamSide ?? 0) === 0
          ? [
              segmentSeam(lengths[i], radii[i], radii[i + 1], 1),
              segmentSeam(lengths[i], radii[i], radii[i + 1], -1),
            ]
          : [segmentSeam(lengths[i], radii[i], radii[i + 1], seamSide)]
      );
      j.add(new THREE.Mesh(seams, materials.seam ?? materials.glove));
    }
    if (i < 2) {
      const pad = new THREE.Mesh(segmentPad(lengths[i], radii[i]), materials.pad);
      j.add(pad);
    } else {
      // fingertip grip patch on the palm side
      const tip = blob(radii[i] * 1.5, radii[i] * 0.5, lengths[i] * 0.7, radii[i] * 0.2, 2);
      tip.translate(0, -radii[i] * 0.72, -lengths[i] * 0.45);
      j.add(new THREE.Mesh(tip, materials.pad));
    }
    const next = new THREE.Object3D();
    next.position.z = -lengths[i];
    j.add(next);
    parent = next;
    joints.push(j);
  }
  return { root, joints };
}

/**
 * Glove: palm, thumb web, knuckle plate, wrist strap.
 * Fingers are added as children so they can be posed per-weapon.
 */
function buildGlove(materials, opts = {}) {
  const scale = opts.scale ?? 1;
  const w = 0.088 * scale;
  const h = 0.032 * scale;
  const palmLen = 0.098 * scale;
  const root = new THREE.Object3D();

  const shell = [];
  /**
   * Palm. Built as two overlapping blocks rather than one, because a single
   * 88 x 98 mm slab is exactly what the support hand presents to the camera in a
   * C-clamp and it reads as a brick. A hand is ~88 mm across the knuckles and
   * ~72 mm across the wrist, so the taper is real and it is the difference
   * between a hand silhouette and a paddle.
   */
  const palm = blob(w, h, palmLen * 0.62, 0.012 * scale, 3);
  palm.translate(0, 0, -palmLen * 0.66);
  shell.push(palm);
  const palmRear = blob(w * 0.83, h * 0.96, palmLen * 0.52, 0.012 * scale, 3);
  palmRear.translate(0, -h * 0.01, -palmLen * 0.26);
  shell.push(palmRear);
  // Thenar (thumb muscle) and the heel of the hand.
  const thenar = blob(w * 0.42, h * 0.92, palmLen * 0.6, 0.014 * scale, 3);
  thenar.translate(w * 0.3, -h * 0.06, -palmLen * 0.3);
  shell.push(thenar);
  const heel = blob(w * 0.92, h * 0.86, 0.03 * scale, 0.012 * scale, 3);
  heel.translate(0, -h * 0.04, -0.012 * scale);
  shell.push(heel);
  // Knuckle lumps.
  for (let i = 0; i < 4; i++) {
    const x = w * (0.34 - i * 0.225);
    const k = dome(0.0072 * scale, 10, 0.62);
    k.rotateX(-Math.PI / 2);
    k.translate(x, h * 0.42, -palmLen * 0.94);
    shell.push(k);
  }
  const glove = new THREE.Mesh(mergeAll(shell), materials.glove);
  root.add(glove);

  /**
   * Dorsal armour. This used to be ONE 81 x 41 mm slab across the knuckles plus a
   * second across the back, and since the support hand presents its dorsal side
   * straight at the camera that is precisely what the critique saw: "detached grey
   * slabs". A real glove's knuckle guard is four separate moulded caps with
   * flex gaps between them, and those three gaps are the entire read — they give
   * the silhouette four lobes instead of one rectangle.
   */
  /**
   * COVERAGE BUDGET: the caps plus everything else on the dorsum must not exceed
   * 55% of the back of the hand.
   *
   * The previous set was four caps at 19.6% x 40% of the palm footprint (= 31%),
   * a back panel at 72% x 30% (= 22%) and three tendon ridges — call it 57%, and
   * because they all sat at the same height (h*0.45-0.48) with the same material
   * they merged into ONE continuous shelf across the whole dorsum. That shelf is
   * the "stack of slabs" read, and no amount of retinting fixes it: what the eye
   * is objecting to is that the back of the hand has no soft glove left on it.
   *
   * Now: four caps at 17% x 30% (= 20.4%) over the knuckles only, and one small
   * metacarpal panel at 44% x 22% (= 9.7%) with a clear 12% gap of bare shell
   * between it and the caps. Total 30% — well inside budget, and there is
   * visibly more glove than armour. The tendon ridges are gone entirely; the
   * shell's own knuckle lumps already break that surface up, and the ridges were
   * the thing bridging the caps into the panel.
   */
  const pads = [];
  for (let i = 0; i < 4; i++) {
    const x = w * (0.335 - i * 0.223);
    const cap = blob(w * 0.17, h * 0.3, palmLen * 0.3, 0.005 * scale, 3);
    // outboard caps sit slightly lower, following the knuckle arch
    const drop = Math.abs(i - 1.5) > 1 ? h * 0.055 : 0;
    cap.translate(x, h * 0.46 - drop, -palmLen * 0.82);
    pads.push(cap);
  }
  const backPanel = blob(w * 0.44, h * 0.17, palmLen * 0.22, 0.005 * scale, 3);
  backPanel.translate(0, h * 0.44, -palmLen * 0.4);
  pads.push(backPanel);
  // Palm grip patch.
  const patch = blob(w * 0.82, h * 0.18, palmLen * 0.66, 0.006 * scale, 3);
  patch.translate(0, -h * 0.52, -palmLen * 0.48);
  pads.push(patch);
  root.add(new THREE.Mesh(mergeAll(pads), materials.pad));

  // Seams down the sides of the hand.
  const seams = [];
  for (const sx of [-1, 1]) {
    const s = box(0.0016 * scale, h * 0.5, palmLen * 0.8, 0.0004, 1);
    s.translate(sx * w * 0.5, 0, -palmLen * 0.5);
    seams.push(s);
  }
  root.add(new THREE.Mesh(mergeAll(seams), materials.pad));

  // Wrist cuff + strap + a small steel keeper.
  const cuff = latheZ(
    [
      [0, w * 0.44],
      [0.004 * scale, w * 0.47],
      [0.03 * scale, w * 0.46],
      [0.034 * scale, w * 0.42],
    ],
    16
  );
  cuff.scale(1, 0.82, 1);
  const cuffMesh = new THREE.Mesh(cuff, materials.glove);
  cuffMesh.position.z = 0.004 * scale;
  root.add(cuffMesh);
  const strap = latheZ(
    [
      [0, w * 0.47],
      [0.0022, w * 0.5],
      [0.009 * scale, w * 0.5],
      [0.0112 * scale, w * 0.47],
    ],
    16
  );
  strap.scale(1, 0.82, 1);
  const strapMesh = new THREE.Mesh(strap, materials.pad);
  strapMesh.position.z = 0.02 * scale;
  root.add(strapMesh);

  return root;
}

/**
 * Thumb: two segments on the +X side, angled across the grip.
 *
 * THE PROXIMAL SEGMENT IS THE METACARPAL AS WELL AS THE PROXIMAL PHALANX, and
 * that is why it is 50 mm rather than 38.
 *
 * MEASURED: with a 38 + 30 mm thumb the C-clamp solve (Arm.fitToCylinder) left
 * the tip 13.2 mm clear of the handguard no matter how the base was aimed —
 * scanning abduction alone, then abduction AND rotation in a 21 x 15 grid, moved
 * it by 1 mm. It is not an aiming problem, it is a reach problem: the thumb root
 * sits at the heel of the palm, the palm on a C-clamp stands 29 mm off a 54 mm
 * tube (unavoidable — a 98 mm palm tangent to a 27 mm radius diverges), and 68 mm
 * of thumb simply does not get there.
 *
 * A real hand does not have that problem because the thumb column starts at the
 * CARPOMETACARPAL joint, deep in the wrist, and the visible thumb from the web to
 * the tip is 75-85 mm. This rig has no metacarpal segment at all, so the proximal
 * one absorbs it: 50 + 32 = 82 mm, which reaches with 10 mm of flexion in hand.
 */
function buildThumb(materials, scale = 1, spec = THUMB) {
  const root = new THREE.Object3D();
  const j1 = new THREE.Object3D();
  root.add(j1);
  const s1 = new THREE.Mesh(segment(spec.l0 * scale, spec.r0 * scale, spec.r1 * scale), materials.glove);
  j1.add(s1);
  j1.add(new THREE.Mesh(segmentPad(spec.l0 * scale, spec.r0 * scale), materials.pad));
  // Seams down both flanks, as on the fingers — the thumb is the widest single
  // digit on screen in the support grip and a bare capsule reads as a sausage.
  j1.add(
    new THREE.Mesh(
      mergeAll([
        segmentSeam(spec.l0 * scale, spec.r0 * scale, spec.r1 * scale, 1),
        segmentSeam(spec.l0 * scale, spec.r0 * scale, spec.r1 * scale, -1),
      ]),
      materials.seam ?? materials.glove
    )
  );
  const j2 = new THREE.Object3D();
  j2.position.z = -spec.l0 * scale;
  j1.add(j2);
  const s2 = new THREE.Mesh(segment(spec.l1 * scale, spec.r1 * scale, spec.r2 * scale), materials.glove);
  j2.add(s2);
  // Grip patch on the PALMAR side of the pad, matching the fingers, and a small
  // dorsal nail plate.
  const pad = blob(spec.r2 * 1.6 * scale, spec.r2 * 0.55 * scale, spec.l1 * 0.66 * scale, 0.0012, 2);
  pad.translate(0, -spec.r2 * 0.78 * scale, -spec.l1 * 0.45 * scale);
  j2.add(new THREE.Mesh(pad, materials.pad));
  const nail = blob(0.011 * scale, 0.0035 * scale, 0.016 * scale, 0.0012, 2);
  nail.translate(0, spec.r2 * scale, -0.016 * scale);
  j2.add(new THREE.Mesh(nail, materials.pad));
  return { root, joints: [j1, j2] };
}

/** Thumb dimensions, shared by the mesh and the contact solve. */
const THUMB = { l0: 0.05, l1: 0.032, r0: 0.0115, r1: 0.0102, r2: 0.0078 };

/**
 * Tapered sleeve with fold rings, an elbow pad and a rolled cuff.
 * Both ends are CLOSED — an open lathe reads as a length of pipe, which is
 * exactly the "grey sausage" failure this rig has to avoid.
 */
function buildSleeve(material, len, r0, r1, opts = {}) {
  const parts = [];
  /**
   * SEGMENT COUNT. The support forearm's closest approach to the eye is ~0.38 m
   * and it is ~120 px wide, so a 20-gon puts a facet sagitta of 0.7 px on the
   * silhouette — countable, and countable facets are exactly what the critique
   * measured. 32 takes it to 0.28 px, under the AA threshold.
   */
  const SEG = 32;
  /**
   * The shell profile is no longer a smooth cone. A sleeved forearm has three
   * things a cone does not: the fabric is loose so it bells slightly behind the
   * elbow, it is pulled tight over the muscle belly a third of the way down, and
   * it bunches again at the cuff. Those three inflections are what make the
   * silhouette read as cloth over a limb rather than as pipe.
   */
  const shell = latheZ(
    [
      [0, 0],
      [0, r0 * 0.55],
      [-0.004, r0 * 0.82],
      [-0.006, r0 * 0.98],
      [0.004, r0],
      [len * 0.16, r0 * 1.03],
      [len * 0.34, r0 * 0.9],
      [len * 0.52, (r0 + r1) * 0.5],
      [len * 0.72, r1 * 1.1],
      [len - 0.016, r1 * 1.0],
      [len - 0.005, r1 * 1.07],
      [len, r1 * 0.98],
      [len + 0.003, r1 * 0.8],
      [len + 0.004, 0],
    ],
    SEG
  );
  parts.push(shell);
  // Joint mass at the far end so the two bones read as one limb.
  const joint = latheZ(
    [
      [len - r1 * 1.1, 0],
      [len - r1 * 0.9, r1 * 0.75],
      [len - r1 * 0.2, r1 * 1.04],
      [len + r1 * 0.5, r1 * 0.9],
      [len + r1 * 0.8, r1 * 0.4],
      [len + r1 * 0.85, 0],
    ],
    20
  );
  joint.scale(1, 0.94, 1);
  parts.push(joint);
  /**
   * Fold rings. These are not decoration: they are the only concave creases on
   * the whole limb, and the curvature mask bake (Arm.bakeSurfaceMasks) turns
   * every one of them into a grime line with a dust-rubbed crown either side.
   * That is what puts texture on a surface whose albedo is 0.013 linear.
   *
   * Ellipticity and a per-fold radius jitter matter as much as the count: eight
   * identical circular rings equally spaced read as a hose, which is the failure
   * this is here to avoid.
   */
  const folds = opts.folds ?? 3;
  for (let i = 0; i < folds; i++) {
    const t = 0.14 + (i / Math.max(1, folds - 1)) * 0.7;
    // deterministic wobble, so captures stay byte-identical
    const j = Math.sin(i * 2.399 + 0.7) * 0.5 + Math.sin(i * 5.13) * 0.25;
    const r = (r0 + (r1 - r0) * t) * (1 + j * 0.06);
    const f = ring(r * 0.985, r * (0.085 + j * 0.03), 24, 6);
    f.rotateX(Math.PI / 2);
    f.rotateY(j * 0.12);
    f.scale(1, 0.93, 1);
    f.translate(0, 0, len * t + j * 0.004);
    parts.push(f);
  }
  /**
   * Two longitudinal wrinkle ridges down the inboard and outboard flanks. A
   * tube's silhouette is a straight line; a sleeve's is not, and these are the
   * cheapest thing that breaks it. They sit just proud of the shell so they
   * catch the key on their crown and shade the shell beside them.
   */
  for (const sx of [-1, 1]) {
    const w = latheZ(
      [
        [len * 0.2, 0],
        [len * 0.3, r0 * 0.16],
        [len * 0.55, r0 * 0.2],
        [len * 0.78, r0 * 0.13],
        [len * 0.86, 0],
      ],
      10
    );
    w.scale(1, 0.5, 1);
    w.rotateZ(sx * 0.4);
    w.translate(sx * (r0 + r1) * 0.46, -(r0 + r1) * 0.1, 0);
    parts.push(w);
  }
  if (opts.elbowPad) {
    const pad = blob(r0 * 1.5, r0 * 0.6, len * 0.3, r0 * 0.3, 3);
    pad.translate(0, r0 * 0.75, len * 0.12);
    parts.push(pad);
  }
  if (opts.cuff) {
    // Rolled, stitched cuff: two proud bands with a seam channel between them,
    // which is what a combat-shirt cuff actually looks like and gives the wrist
    // a hard terminator so the sleeve does not appear to melt into the glove.
    const cuff = latheZ(
      [
        [len - 0.032, r1 * 1.02],
        [len - 0.029, r1 * 1.17],
        [len - 0.019, r1 * 1.16],
        [len - 0.016, r1 * 1.08],
        [len - 0.012, r1 * 1.08],
        [len - 0.009, r1 * 1.18],
        [len - 0.003, r1 * 1.17],
        [len, r1 * 1.02],
      ],
      SEG
    );
    parts.push(cuff);
  }
  const g = mergeAll(parts);
  g.rotateY(Math.PI); // extend along -Z, like the bones
  return new THREE.Mesh(g, material);
}

/* -------------------------------------------------------------------------- */
/*  arm rig                                                                   */
/* -------------------------------------------------------------------------- */

const _t = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _bm = new THREE.Matrix4();
// contact-fit scratch (build time only, but the no-allocation rule holds anyway)
const _fitInv = new THREE.Matrix4();
const _fitP = new THREE.Vector3();
const _fitD = new THREE.Vector3();
const _fitAxis = new THREE.Vector3();
const _fitAx0 = new THREE.Vector3();
const _fitM = new THREE.Matrix4();

/**
 * Orient a bone whose geometry runs along its local -Z so that -Z points along
 * `dir`, with local +Y rolled toward `up`.
 *
 * This deliberately does NOT use Object3D.lookAt(): for non-camera objects
 * lookAt aims local **+Z** at the target (so a -Z bone would point backwards),
 * and it interprets the target in WORLD space, which is wrong here because
 * every joint position is authored in the rig's local space.
 */
function aimBone(quat, dir, up) {
  _bz.copy(dir).multiplyScalar(-1).normalize(); // local +Z is opposite the bone
  _by.copy(up);
  _by.addScaledVector(_bz, -_by.dot(_bz));
  if (_by.lengthSq() < 1e-9) {
    // Degenerate roll reference: pick any axis that is not parallel to the bone.
    _by.set(0, 1, 0).addScaledVector(_bz, -_bz.y);
    if (_by.lengthSq() < 1e-9) _by.set(1, 0, 0).addScaledVector(_bz, -_bz.x);
  }
  _by.normalize();
  _bx.crossVectors(_by, _bz).normalize();
  _bm.makeBasis(_bx, _by, _bz);
  return quat.setFromRotationMatrix(_bm);
}

/**
 * One arm: shoulder -> upper -> fore -> hand, solved from the hand target.
 * All positions are expressed in the arm root's parent space (the viewmodel
 * rig's space), which is what makes the maths trivial.
 */
export class Arm {
  constructor(side, materials, opts = {}) {
    this.side = side; // -1 left, +1 right
    this.scale = opts.scale ?? 1;
    this.l1 = (opts.upper ?? L_UPPER) * this.scale;
    this.l2 = (opts.fore ?? L_FORE) * this.scale;

    this.root = new THREE.Object3D();
    this.root.name = side < 0 ? 'arm-left' : 'arm-right';
    /** Kept so `bakeSurfaceMasks` can classify a mesh by which surface it wears. */
    this._mats = materials;

    this.shoulder = new THREE.Vector3(
      side * (opts.shoulderX ?? 0.19),
      opts.shoulderY ?? -0.19,
      opts.shoulderZ ?? 0.12
    );
    /**
     * Elbow swing direction, in the ARM ROOT's space (= the viewmodel rig's
     * space), NOT in hand space.
     *
     * Expressing the pole in hand space is the intuitive choice and it is wrong:
     * the support hand is rolled palm-up on the handguard, so its local "down"
     * points at the sky and the elbow swings UP — straight through the near
     * plane, filling half the screen with forearm. Elbows go down and outboard,
     * always, exactly as they do on a real shooter.
     */
    this.pole = new THREE.Vector3(side * 0.46, -0.86, 0.22).normalize();

    // Bones. Geometry extends along -Z from each joint.
    /**
     * Sleeve radii.
     *
     * MEASURED, twice. At 78 mm across the elbow / 54 mm at the wrist the
     * support forearm rendered as a 160 px-wide smooth tube crossing the lower
     * third of every hipfire frame — "a huge untextured tan tube", and the single
     * most-cited defect in the whole build. The width is not the only problem
     * (see the material and the mask bake) but it is a third of it: the support
     * forearm's closest approach to the eye is ~0.38 m, so every millimetre of
     * radius is 2.6 px of screen at 1080p.
     *
     * A real combat shirt over a forearm is 68 mm at the elbow tapering to 48 mm
     * at the wrist, and that is what these are now: 0.034/0.024. The shooting
     * arm keeps a fuller upper sleeve (it is almost entirely out of frame) so the
     * two arms still read as the same garment.
     *
     * Fold counts go UP, not down: with the tube narrower the folds are what
     * carry the silhouette, and each one is a crease the mask bake fills with
     * grime and a crown it rubs dust onto.
     */
    this.upper = buildSleeve(materials.sleeve, this.l1, 0.044 * this.scale, 0.036 * this.scale, {
      folds: 5,
      elbowPad: true,
    });
    this.fore = buildSleeve(materials.sleeve, this.l2, 0.034 * this.scale, 0.024 * this.scale, {
      folds: 7,
      cuff: true,
    });
    this.upperPivot = new THREE.Object3D();
    this.forePivot = new THREE.Object3D();
    this.upperPivot.add(this.upper);
    this.forePivot.add(this.fore);
    this.root.add(this.upperPivot);
    this.root.add(this.forePivot);

    // Hand.
    this.hand = new THREE.Object3D();
    this.hand.name = side < 0 ? 'hand-left' : 'hand-right';
    this.handInner = new THREE.Object3D();
    /**
     * CHIRALITY. The basis built by handBasis is right-handed with X = Y cross Z,
     * so for a hand whose fingers run along -Z and whose palm faces -Y, +X points
     * AWAY from the thumb on a right hand and TOWARD it on a left hand. The
     * geometry below puts the thumb at +X, which makes the authored mesh a LEFT
     * hand — so it is the RIGHT arm that needs the mirror, not the left.
     *
     * With this the wrong way round the shooting hand was a left hand on the
     * right side of the grip: the index (which setTrigger drives) came out at the
     * bottom-rear of the grip instead of on the trigger, and no choice of target
     * frame could fix it, because putting the thumb at the top of the grip forced
     * the fingers to wrap backwards around the back strap.
     */
    this.handInner.scale.x = side < 0 ? 1 : -1;
    this.hand.add(this.handInner);
    this.glove = buildGlove(materials, { scale: this.scale });
    this.handInner.add(this.glove);
    this.root.add(this.hand);

    // Fingers: index is separate so it can work the trigger.
    const fingerSpecs = [
      { x: 0.0298, len: [0.045, 0.028, 0.022], r: [0.0102, 0.0096, 0.0086, 0.0062] }, // index
      { x: 0.0102, len: [0.049, 0.031, 0.023], r: [0.0104, 0.0098, 0.0088, 0.0064] },
      { x: -0.0104, len: [0.046, 0.029, 0.022], r: [0.01, 0.0094, 0.0084, 0.006] },
      { x: -0.0298, len: [0.038, 0.024, 0.02], r: [0.0092, 0.0086, 0.0078, 0.0056] },
    ];
    this.fingers = [];
    // Per-segment dimensions, kept so `fitToCylinder` can walk the chain without
    // re-deriving them.
    this._segRadius = fingerSpecs.map((s) => s.r.map((v) => v * this.scale));
    this._segLength = fingerSpecs.map((s) => s.len.map((v) => v * this.scale));
    for (let i = 0; i < 4; i++) {
      const sp = fingerSpecs[i];
      const f = buildFinger(materials, {
        lengths: sp.len.map((v) => v * this.scale),
        radii: sp.r.map((v) => v * this.scale),
        curl: [0, 0, 0],
      });
      // The metacarpophalangeal joints sit on the PALMAR half of the hand, not on
      // its centre line. 3.5 mm dorsal put every finger's axis 10 mm further from
      // whatever the hand was gripping than the palm's own contact surface, so a
      // palm placed flush on a handguard still left the fingers hovering 8-14 mm
      // clear of it — the daylight the critique measured. -6 mm puts the finger
      // axis 8 mm off the palm's contact plane, which is one finger radius.
      f.root.position.set(sp.x * this.scale, -0.006 * this.scale, -0.096 * this.scale);
      // fingers fan out very slightly
      f.root.rotation.y = -sp.x * 2.2;
      this.glove.add(f.root);
      this.fingers.push(f);
    }
    this.thumb = buildThumb(materials, this.scale, THUMB);
    // The carpometacarpal joint is palmar and a little further into the hand than
    // the old placement: a thumb rooted on the hand's centre plane rotates in the
    // plane of the back of the hand, which is why the old one read as a spur.
    this.thumb.root.position.set(0.037 * this.scale, -0.009 * this.scale, -0.04 * this.scale);
    this.thumb.root.rotation.set(0.2, -0.95, -0.5);
    this.glove.add(this.thumb.root);

    // Same rule as the weapon: receive the world sun shadow, cast nothing.
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });

    /**
     * Per-weapon pose overrides, written by `fitToCylinder`. `setPose` looks here
     * first, so a pose solved against one weapon's handguard cannot leak onto
     * another's — and, critically, a clip that swaps the support hand to 'open'
     * and back to 'clamp' restores the FITTED clamp, not the authored one.
     */
    this.poses = {};

    this.setPose(opts.pose ?? 'wrap');
  }

  /**
   * BUILD-TIME CONTACT SOLVE: clamp every fingertip onto a cylinder.
   *
   * The authored `clamp` curls were derived analytically from a 47 mm tube and
   * one nominal contact clock angle, and on paper they put the PIP, DIP and tip
   * all 8.2 mm off the surface. On screen they did not: in hero, detail, weapon
   * and ads the distal segments visibly stood clear of the handguard, because the
   * analytic solve ignored (a) the 0.88 Y-scale on the finger capsules, (b) the
   * -6 mm palmar offset of the MCP row, (c) the fan-out rotation on each finger
   * root and (d) the fact that the four fingers start at four different X, so
   * they meet the cylinder at four different clock angles.
   *
   * Rather than push more algebra at it, MEASURE it: pose the hand, walk the real
   * transform chain to each fingertip's contact patch, and search the distal
   * joint's own rotation for the value that lands the patch on the surface. That
   * is a raycast against the collision profile in all but name, and it is exact
   * by construction because it uses the same matrices the renderer will.
   *
   * The thumb is fitted the same way but wraps to the OPPOSITE side of the tube:
   * a C-clamp whose thumb is on the same side as the fingers is a fist held next
   * to the gun, not a grip on it.
   *
   * @param {THREE.Vector3}  handPos    wrist target, arm-root space
   * @param {THREE.Quaternion} handQuat wrist orientation
   * @param {number[]} axisPoint  a point on the cylinder axis, arm-root space
   * @param {number[]} axisDir    the cylinder axis direction
   * @param {number}   radius     cylinder radius
   * @param {object}   opts       { clearance, poseName }
   * @returns {THREE.Vector3[]}   contact points, arm-root space (for baked AO)
   */
  fitToCylinder(handPos, handQuat, axisPoint, axisDir, radius, opts = {}) {
    const clearance = opts.clearance ?? 0.001;
    const poseName = opts.poseName ?? this.pose;
    const base = this.poses[poseName] ?? HAND_POSES[poseName] ?? HAND_POSES.clamp;

    this.hand.position.copy(handPos);
    this.hand.quaternion.copy(handQuat);
    this.root.updateMatrixWorld(true);
    // Everything is measured in the ARM ROOT's space, so the result is
    // independent of wherever the rig happens to be this frame.
    _fitInv.copy(this.root.matrixWorld).invert();
    _fitAxis.set(axisDir[0], axisDir[1], axisDir[2]).normalize();
    const ax0 = _fitAx0.set(axisPoint[0], axisPoint[1], axisPoint[2]);

    /** Signed distance from a joint-local point to the cylinder surface. */
    const gapAt = (joint, lx, ly, lz, out) => {
      joint.updateWorldMatrix(true, true);
      _fitP.set(lx, ly, lz).applyMatrix4(joint.matrixWorld).applyMatrix4(_fitInv);
      if (out) out.copy(_fitP);
      _fitD.copy(_fitP).sub(ax0);
      _fitD.addScaledVector(_fitAxis, -_fitD.dot(_fitAxis));
      return _fitD.length() - radius;
    };

    /**
     * Scan a joint's flexion for the angle that puts `local` on the surface.
     *
     * A scan, not a bisection: the gap is not monotonic in curl (past ~110 deg
     * the tip starts coming back OUT the far side of the tube), so a bisection
     * can converge on the wrong root. 40 samples over the anatomical range is
     * 2.5 deg of resolution, which is 0.4 mm at the fingertip.
     */
    const fitJoint = (joint, local, lo, hi, standoff = 0) => {
      let best = joint.rotation.x;
      let bestCost = Infinity;
      for (let i = 0; i <= 48; i++) {
        const a = lo + ((hi - lo) * i) / 48;
        joint.rotation.x = a;
        const g = gapAt(joint, local[0], local[1], local[2]) - standoff;
        // Target: on the surface, up to `clearance` proud, at most 1.5 mm buried.
        const cost = Math.abs(g - clearance * 0.5) + (g < -0.0015 ? (-g - 0.0015) * 8 : 0);
        if (cost < bestCost) {
          bestCost = cost;
          best = a;
        }
      }
      joint.rotation.x = best;
      return best;
    };

    /**
     * Wrap all three joints, PROXIMAL FIRST.
     *
     * Fitting only the distal joint cannot wrap a cylinder: if the MCP and PIP
     * are authored for a different contact clock angle the finger traces the
     * wrong spiral, and the distal joint is then asked to close a gap it is 22 mm
     * long and physically cannot reach. Solving the chain outward — each joint
     * placing the NEXT joint's origin one finger-radius off the surface, then the
     * distal joint placing the actual contact patch on it — is what a finger does,
     * and it is stable because each stage only has one degree of freedom.
     */
    const fingers = [];
    const contacts = [];
    for (let i = 0; i < 4; i++) {
      const f = this.fingers[i];
      const curl = base.fingers[i].slice();
      for (let j = 0; j < 3; j++) f.joints[j].rotation.x = -curl[j];
      const rr = this._segRadius?.[i] ?? [0.01, 0.0094, 0.0084, 0.006];
      const ll = this._segLength?.[i] ?? [0.046, 0.029, 0.022];
      for (let j = 0; j < 2; j++) {
        // The next joint's origin sits ON the finger's own axis, so it wants to
        // be one segment-radius clear of the surface, not on it.
        const a = fitJoint(f.joints[j], [0, 0, -ll[j]], -1.75, -0.05, rr[j + 1] * 0.92);
        curl[j] = -a;
      }
      // The fingertip grip patch: palmar side, one radius below the axis, half
      // way along the distal segment — the same numbers as the `tip` blob in
      // buildFinger, so the mask and the mesh agree.
      const local = [0, -rr[3] * 1.05, -ll[2] * 0.5];
      const a2 = fitJoint(f.joints[2], local, -1.95, -0.1, 0);
      curl[2] = -a2;
      fingers.push(curl);
      const p = new THREE.Vector3();
      gapAt(f.joints[2], local[0], local[1], local[2], p);
      contacts.push(p);
    }

    /**
     * ---- thumb: over the top and down the FAR side --------------------------
     *
     * THE THUMB BASE IS SOLVED TOO, and it has to be.
     *
     * MEASURED on the shipped build by walking the real transform chain: the four
     * fingertips landed 0.4-0.7 mm off the handguard — a genuine grip — and the
     * THUMB TIP was 13.5 mm clear of it. The thumb is the part of the support hand
     * that lies across the top of the handguard and therefore the part the camera
     * sees most of in the hipfire pose, so that 13.5 mm was most of "fingers do not
     * wrap the grip, they float beside it with a visible gap".
     *
     * The cause is that the two flexion joints were being fitted against a base
     * rotation that was AUTHORED, not solved. The thumb's carpometacarpal joint is
     * a saddle with two useful degrees of freedom and the authored abduction was
     * aimed for a different contact clock angle; with the metacarpal pointing past
     * the tube, 68 mm of thumb flexing on two hinges cannot reach it, and the scan
     * just parks both joints at their limits.
     *
     * So the base's Y (abduction — the axis that swings the thumb across the palm)
     * is scanned first, coarsely, for the value that brings the tip closest, and
     * only then are the two flexion joints fitted. One extra degree of freedom,
     * 24 samples, build time only.
     */
    const thumbBase = (base.thumbBase ?? [0, 0, 0]).slice();
    const thumb = (base.thumb ?? [0.3, 0.24]).slice();
    this.thumb.root.rotation.fromArray(thumbBase);
    this.thumb.joints[0].rotation.x = -thumb[0];
    this.thumb.joints[1].rotation.x = -thumb[1];
    const tr = THUMB.r2 * this.scale;
    const tlen = THUMB.l1 * this.scale;
    const tLocal = [0, -tr * 1.05, -tlen * 0.55];
    {
      // Mid-flex the two hinges while the base is searched, so the scan measures
      // where a naturally curled thumb would land rather than where a straight
      // one would.
      this.thumb.joints[0].rotation.x = -0.55;
      this.thumb.joints[1].rotation.x = -0.45;
      const y0 = thumbBase[1];
      const z0 = thumbBase[2];
      let bestY = y0;
      let bestZ = z0;
      let bestCost = Infinity;
      // Two axes, not one. MEASURED: scanning abduction alone still left the tip
      // 13.2 mm clear, because from a metacarpal root sitting 40-55 mm off a 54 mm
      // tube a 68 mm thumb only reaches if it is aimed at the surface in BOTH the
      // across-the-palm and the up-off-the-palm sense. 21 x 15 samples, build time.
      for (let i = 0; i <= 20; i++) {
        const yy = y0 - 1.3 + (2.6 * i) / 20;
        for (let k = 0; k <= 14; k++) {
          const zz = z0 - 0.9 + (1.8 * k) / 14;
          this.thumb.root.rotation.y = yy;
          this.thumb.root.rotation.z = zz;
          const g = gapAt(this.thumb.joints[1], tLocal[0], tLocal[1], tLocal[2]);
          // Prefer just-touching; punish burying much harder than standing off, and
          // add a small pull toward the authored pose so the solve stays plausible.
          const cost =
            Math.abs(g - clearance) +
            (g < -0.002 ? (-g - 0.002) * 10 : 0) +
            (Math.abs(yy - y0) + Math.abs(zz - z0)) * 0.0009;
          if (cost < bestCost) {
            bestCost = cost;
            bestY = yy;
            bestZ = zz;
          }
        }
      }
      this.thumb.root.rotation.y = bestY;
      this.thumb.root.rotation.z = bestZ;
      thumbBase[1] = bestY;
      thumbBase[2] = bestZ;
    }
    const a0 = fitJoint(
      this.thumb.joints[0],
      [0, 0, -THUMB.l0 * this.scale],
      -1.45,
      -0.02,
      THUMB.r1 * this.scale
    );
    thumb[0] = -a0;
    const a1 = fitJoint(this.thumb.joints[1], tLocal, -1.6, -0.05, 0);
    thumb[1] = -a1;
    const tp = new THREE.Vector3();
    gapAt(this.thumb.joints[1], tLocal[0], tLocal[1], tLocal[2], tp);
    contacts.push(tp);

    this.poses[poseName] = { fingers, thumb, thumbBase };
    this.pose = poseName;
    return contacts;
  }

  /**
   * BAKE CURVATURE MASKS ON THE WHOLE LIMB.
   *
   * This is the fix for "a huge UNTEXTURED tan tube" and "a rounded mitten of
   * stacked extruded ring segments".
   *
   * Every weapon mesh has had wear/grime/AO vertex masks baked since the first
   * build (see Viewmodel.addWeapon) — the arms never did. Their `color`
   * attribute was absent, so the shader read vColor = (0,0,0) and the wear,
   * grime and cavity-AO layers of `sleeve`, `glove`, `glove_pad` and
   * `glove_seam` were ALL switched off. Every one of those materials carries a
   * carefully tuned wear amplitude, a grime colour and an AO term that had
   * literally no effect on a single pixel: the arm was a flat albedo under a
   * smooth specular lobe, which is exactly what "untextured tube" means.
   *
   * Amplitudes are per surface class, because cloth, moulded TPR and a stitched
   * seam weather in completely different ways:
   *   cloth   broad, soft. The exponent stays LOW (1.6) so the mask spreads off
   *           the fold crease and dusts the whole crown — on fabric the dirt is
   *           not confined to the outer millimetre the way it is on a chamfer.
   *   pads    harder: a TPR knuckle cap polishes on its dome and collects grime
   *           in the flex gap around it, so wear is high and tight.
   *   seams   a proud sewn edge is the FIRST thing to go pale, so it takes the
   *           most wear of anything on the hand at the tightest exponent.
   *
   * @param {(geo: THREE.BufferGeometry, o: object) => void} bake   materials.bakeMasks
   * @param {(geo: THREE.BufferGeometry, o: object) => void} shape  mask re-shaper
   * @param {object} rng
   */
  bakeSurfaceMasks(bake, shape, rng = null) {
    if (!bake) return this;
    const m = this._mats ?? {};
    const CLOTH = { wearAmp: 0.5, wearExp: 1.6, grimeAmp: 1.0, grimeExp: 1.15, aoAmp: 0.9, aoExp: 1.1 };
    const SLEEVE = { wearAmp: 0.62, wearExp: 1.5, grimeAmp: 1.0, grimeExp: 1.0, aoAmp: 0.95, aoExp: 1.0 };
    const PAD = { wearAmp: 0.85, wearExp: 2.2, grimeAmp: 0.95, grimeExp: 1.4, aoAmp: 1.0, aoExp: 1.2 };
    const SEAM = { wearAmp: 1.0, wearExp: 2.6, grimeAmp: 0.7, grimeExp: 1.6, aoAmp: 0.8, aoExp: 1.2 };
    const done = new Set();
    this.root.traverse((o) => {
      if (!o.isMesh || done.has(o.geometry)) return;
      done.add(o.geometry);
      const prof =
        o.material === m.sleeve ? SLEEVE
          : o.material === m.pad ? PAD
            : o.material === m.seam ? SEAM
              : CLOTH;
      // A lower edge threshold than the weapon's 0.16: the limb is all lathes and
      // blobs, so its creases are gentle and a hard-edge threshold finds nothing.
      bake(o.geometry, { wear: 1, grime: 1, ao: 1, edgeThreshold: 0.09, rng });
      shape(o.geometry, prof);
    });
    return this;
  }

  /**
   * Bake a contact-AO gradient into the GLOVE side of each contact.
   *
   * Geometric contact alone does not read as contact: two surfaces can be 0.5 mm
   * apart and still look like two floating objects, because nothing in the
   * lighting says they occlude each other. The cheap, correct cue is ambient
   * occlusion in the crevice — so the glove gets the same 0.55 multiply over a
   * 12 mm falloff that the handguard gets (see Viewmodel.addWeapon).
   *
   * The mask goes in vColor.b, which `materials/shader.js` uses as
   * `orm.r *= 1.0 - vColor.b * wear[2]`. The glove geometry carries no colour
   * attribute today, so the shader sees (0,0,0) — wear and grime OFF. Writing
   * (0, 0, ao) preserves that exactly and only lights up the AO term.
   *
   * @param {THREE.Vector3[]} contacts  contact points in arm-root space
   */
  bakeContactAO(contacts, radius = 0.012, peak = 0.9) {
    if (!contacts?.length) return this;
    this.root.updateMatrixWorld(true);
    _fitInv.copy(this.root.matrixWorld).invert();
    const r2 = radius * radius;
    this.glove.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry;
      const pos = geo.getAttribute('position');
      if (!pos) return;
      let col = geo.getAttribute('color');
      if (!col || col.itemSize !== 3) {
        col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
        geo.setAttribute('color', col);
      }
      _fitM.multiplyMatrices(_fitInv, o.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        _fitP.fromBufferAttribute(pos, i).applyMatrix4(_fitM);
        let closest = Infinity;
        for (const c of contacts) {
          const d2 = _fitP.distanceToSquared(c);
          if (d2 < closest) closest = d2;
        }
        if (closest > r2) continue;
        const t = 1 - Math.sqrt(closest) / radius;
        // smootherstep so the gradient has no visible terminator
        const s = t * t * t * (t * (t * 6 - 15) + 10);
        col.array[i * 3 + 2] = Math.max(col.array[i * 3 + 2], peak * s);
      }
      col.needsUpdate = true;
    });
    return this;
  }

  /** Static finger poses. The trigger finger is driven separately. */
  setPose(name) {
    const P = this.poses?.[name] ?? HAND_POSES[name] ?? HAND_POSES.wrap;
    for (let i = 0; i < 4; i++) {
      const curl = P.fingers[i];
      for (let j = 0; j < 3; j++) this.fingers[i].joints[j].rotation.x = -curl[j];
    }
    this.thumb.joints[0].rotation.x = -P.thumb[0];
    this.thumb.joints[1].rotation.x = -P.thumb[1];
    if (P.thumbBase) this.thumb.root.rotation.fromArray(P.thumbBase);
    this.pose = name;
    return this;
  }

  /** Trigger-finger curl, 0 = off the trigger, 1 = fully pressed. */
  setTrigger(t) {
    const f = this.fingers[0];
    // Rest pose matches HAND_POSES.grip.fingers[0]: the finger is already ON the
    // trigger with the slack taken up, not standing off it straight.
    f.joints[0].rotation.x = -(0.55 + t * 0.3);
    f.joints[1].rotation.x = -(0.72 + t * 0.42);
    f.joints[2].rotation.x = -(0.34 + t * 0.3);
  }

  /**
   * Solve the two-bone chain so the hand lands exactly on `targetPos` with
   * orientation `targetQuat`, elbow swung toward the pole.
   */
  solve(targetPos, targetQuat) {
    this.hand.position.copy(targetPos);
    this.hand.quaternion.copy(targetQuat);

    _t.copy(targetPos).sub(this.shoulder);
    let d = _t.length();
    const maxD = (this.l1 + this.l2) * 0.995;
    const minD = Math.abs(this.l1 - this.l2) * 1.05 + 1e-4;
    if (d > maxD) {
      _t.multiplyScalar(maxD / d);
      d = maxD;
    } else if (d < minD) {
      if (d < 1e-5) _t.set(0, 0, -minD);
      else _t.multiplyScalar(minD / d);
      d = minD;
    }
    _dir.copy(_t).divideScalar(d);

    // Circle of possible elbow positions; pick the point toward the pole.
    const a = (this.l1 * this.l1 - this.l2 * this.l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.l1 * this.l1 - a * a));
    _pole.copy(this.pole);
    _perp.copy(_pole).addScaledVector(_dir, -_pole.dot(_dir));
    if (_perp.lengthSq() < 1e-8) {
      _perp.set(this.side, -1, 0).addScaledVector(_dir, 0);
      _perp.addScaledVector(_dir, -_perp.dot(_dir));
    }
    _perp.normalize();
    _elbow.copy(this.shoulder).addScaledVector(_dir, a).addScaledVector(_perp, h);

    // Upper arm: shoulder -> elbow. The elbow pad sits on the bone's +Y, which
    // must end up on the OUTSIDE of the bend — that is the pole side.
    this.upperPivot.position.copy(this.shoulder);
    _hp.copy(_elbow).sub(this.shoulder);
    if (_hp.lengthSq() > 1e-12) aimBone(this.upperPivot.quaternion, _hp, _perp);

    // Forearm: elbow -> wrist, rolled with the back of the hand so the cuff and
    // the wrist line up with the glove.
    this.forePivot.position.copy(_elbow);
    _up.set(0, 1, 0).applyQuaternion(targetQuat);
    _hp.copy(targetPos).sub(_elbow);
    if (_hp.lengthSq() > 1e-12) aimBone(this.forePivot.quaternion, _hp, _up);
    return this;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}

/**
 * Finger curls per pose, in radians per joint (proximal, middle, distal).
 * These are read straight off reference photos of a firing grip: the little
 * finger curls hardest, the index rides the trigger, the thumb wraps high.
 */
export const HAND_POSES = {
  /** Firing grip on a pistol grip. */
  grip: {
    /**
     * Firing grip on the pistol grip. The three lower fingers wrap ~180 deg of a
     * 31 x 34 mm grip section, which is 2.9-3.2 rad of total flexion — with the
     * MCP carrying the most, because that is the joint that gets the finger round
     * the front strap. The index is the trigger finger and is driven separately
     * by setTrigger(); the value here is its rest pose, taking up the slack on
     * the trigger face.
     */
    fingers: [
      [0.55, 0.72, 0.34],
      [1.15, 1.2, 0.62],
      [1.2, 1.25, 0.65],
      [1.22, 1.28, 0.66],
    ],
    thumb: [0.5, 0.34],
    thumbBase: [0.15, -1.02, -0.62],
  },
  /** Support hand wrapped around a handguard. */
  wrap: {
    fingers: [
      [1.18, 1.05, 0.45],
      [1.26, 1.12, 0.5],
      [1.3, 1.16, 0.55],
      [1.34, 1.2, 0.6],
    ],
    thumb: [0.42, 0.3],
    thumbBase: [0.1, -1.15, -0.35],
  },
  /**
   * C-clamp on a handguard: the modern support grip, and the only one whose
   * knuckle line turns toward the camera.
   *
   * The proximal curls are what decide whether the hand CLOSES. Summed over the
   * three joints each finger has to sweep the arc from the contact clock angle,
   * round the tube, to the far side: for a 47 mm handguard gripped 14 mm off the
   * surface that is 150-165 deg, i.e. 2.6-2.9 rad total. Anything less and the
   * fingertips stop in mid-air short of the far side, which is the "detached grey
   * slabs with daylight between them and the handguard" failure.
   *
   * The little finger curls hardest (it is shortest and has the least tube to
   * cross); the index sits proudest because it is closest to the thumb web.
   */
  clamp: {
    /**
     * SOLVED, per joint, against the rifle's 47 mm handguard.
     *
     * A uniform curl ratio cannot wrap a cylinder: it traces a spiral, so if the
     * middle joint touches, the fingertip stands 20 mm off. These numbers come
     * out of a per-joint bisection that puts the PIP, the DIP and the fingertip
     * all exactly 8.2 mm from the handguard surface — one finger radius, i.e. the
     * glove skin in contact with a 0-1 mm interpenetration the whole way round.
     *
     * The distribution that falls out (MCP ~0.6, PIP ~1.2, DIP ~0.8) is also what
     * a real hand does on a tube: the middle joint carries most of the wrap. And
     * the LONGEST finger curls most, not the little one — the "little finger
     * curls hardest" rule is a tapered-pistol-grip rule and is wrong here.
     */
    fingers: [
      [0.612, 1.059, 0.797],
      [0.731, 1.286, 0.863],
      [0.73, 1.268, 0.808],
      [0.601, 1.105, 0.684],
    ],
    // Thumb laid ACROSS the top of the handguard rather than forward into space.
    // The thumb root sits at the heel of the palm, which on a C-clamp stands ~50
    // mm off a 47 mm tube (unavoidable: a 98 mm palm tangent to a 23.5 mm radius
    // diverges), so a forward-pointing thumb hangs in mid-air. Aimed at the tube
    // it bridges that gap and closes the silhouette.
    thumb: [0.3, 0.24],
    thumbBase: [0.04, 0.76, -0.05],
  },
  /** Two-handed pistol grip: support hand cups the shooting hand. */
  cup: {
    fingers: [
      [1.05, 0.95, 0.4],
      [1.12, 1.0, 0.44],
      [1.16, 1.04, 0.48],
      [1.2, 1.08, 0.52],
    ],
    thumb: [0.28, 0.2],
    thumbBase: [0.0, -1.25, -0.2],
  },
  /** Open hand: mag grab, charging handle, inspect. */
  open: {
    fingers: [
      [0.35, 0.28, 0.14],
      [0.32, 0.26, 0.12],
      [0.34, 0.28, 0.14],
      [0.4, 0.32, 0.16],
    ],
    thumb: [0.12, 0.1],
    thumbBase: [0.1, -0.8, -0.35],
  },
  /** Pinch: holding the charging handle or a magazine by its spine. */
  pinch: {
    fingers: [
      [0.95, 0.85, 0.55],
      [1.0, 0.9, 0.6],
      [0.7, 0.6, 0.35],
      [0.6, 0.5, 0.3],
    ],
    thumb: [0.62, 0.55],
    thumbBase: [0.25, -0.75, -0.7],
  },
};
