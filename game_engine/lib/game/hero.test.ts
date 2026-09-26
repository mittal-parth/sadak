import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeHero, HeroAnimator, type HeroMotion, type HeroRig } from "./hero";

const still: HeroMotion = { dt: 1 / 60, t: 0, speed: 0, accel: 0, turn: 0, air: 0, vy: 0, crouch: 0, stumble: 0, look: 0 };

function lowest(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root).min.y;
}

test("the hero has a full rig and stands on the ground, about 1.75m tall", () => {
  const hero = makeHero();
  const rig = hero.userData.hero as HeroRig;
  for (const k of ["pelvis", "spine", "chest", "neck", "head", "elbowL", "wristR", "kneeL", "ankleR", "bag", "scarfL"] as const) {
    assert.ok(rig[k] instanceof THREE.Group, `no ${k}`);
  }
  new HeroAnimator(rig).update(still);
  const box = new THREE.Box3().setFromObject(hero);
  assert.ok(Math.abs(box.min.y) < 0.05, `feet at ${box.min.y.toFixed(3)}`);
  const h = box.max.y - box.min.y;
  assert.ok(h > 1.65 && h < 1.85, `height ${h.toFixed(2)}`);
});

test("walking swings the legs in opposition, the arms against them, feet near the ground", () => {
  const hero = makeHero();
  const rig = hero.userData.hero as HeroRig;
  const anim = new HeroAnimator(rig);
  let opposite = 0;
  let steps = 0;
  for (let i = 0; i < 120; i++) {
    anim.update({ ...still, t: i / 60, speed: 3 });
    const l = rig.hipL.rotation.x;
    const r = rig.hipR.rotation.x;
    if (Math.abs(l) > 0.1) {
      steps++;
      if (Math.sign(l) === -Math.sign(r)) opposite++;
      // Same-side arm and leg never swing together.
      assert.ok(Math.sign(rig.shoulderL.rotation.x) !== Math.sign(l) || Math.abs(rig.shoulderL.rotation.x) < 0.05);
    }
    assert.ok(lowest(hero) > -0.12, `a foot sinks ${lowest(hero).toFixed(2)}m into the ground`);
  }
  assert.ok(steps > 20 && opposite === steps, "legs swing together");
});

test("a human cadence: about 2 steps a second walking, never more than 4.5", () => {
  for (const speed of [1.4, 3, 4.6, 7, 9.5]) {
    const stepsPerSecond = speed / HeroAnimator.stepLength(speed);
    assert.ok(stepsPerSecond > 1.5 && stepsPerSecond < 4.6, `${stepsPerSecond.toFixed(1)} steps/s at ${speed} m/s`);
  }
});

test("one knee lifts while the other leg carries the body, never both at once", () => {
  for (const speed of [1.4, 4.6, 9.5]) {
    const rig = makeHero().userData.hero as HeroRig;
    const anim = new HeroAnimator(rig);
    let lifted = 0;
    for (let i = 0; i < 240; i++) {
      anim.update({ ...still, t: i / 60, speed });
      const l = rig.kneeL.rotation.x;
      const r = rig.kneeR.rotation.x;
      assert.ok(Math.min(l, r) < 0.45, `both knees bent (${l.toFixed(2)}, ${r.toFixed(2)}) at ${speed} m/s`);
      if (Math.max(l, r) > 0.5) lifted++;
      // The standing foot stays about level.
      const standing = l < r ? rig.ankleL : rig.ankleR;
      const hip = l < r ? rig.hipL : rig.hipR;
      const knee = l < r ? rig.kneeL : rig.kneeR;
      const pitch = hip.rotation.x + knee.rotation.x + standing.rotation.x;
      assert.ok(Math.abs(pitch) < 0.45, `standing foot pitched ${pitch.toFixed(2)} at ${speed} m/s`);
    }
    assert.ok(lifted > 60, `the knees barely lift at ${speed} m/s`);
  }
});

test("a crouch lowers the hips, a stumble throws the arms up, sitting folds the legs", () => {
  const rig = makeHero().userData.hero as HeroRig;
  const anim = new HeroAnimator(rig);
  anim.update(still);
  const standY = rig.pelvis.position.y;
  anim.update({ ...still, crouch: 1 });
  assert.ok(rig.pelvis.position.y < standY - 0.15);
  anim.update({ ...still, stumble: 1 });
  // Arms up: the shoulder turns the hand forward and above the shoulder.
  assert.ok(rig.shoulderL.rotation.x < -1.5);
  anim.update({ ...still, sit: 1 });
  assert.ok(rig.hipL.rotation.x < -1.3 && rig.kneeL.rotation.x > 1.3);
});

test("the head turns toward what is near, gradually", () => {
  const rig = makeHero().userData.hero as HeroRig;
  const anim = new HeroAnimator(rig);
  anim.update({ ...still, look: 1 });
  const first = rig.head.rotation.y;
  for (let i = 0; i < 90; i++) anim.update({ ...still, look: 1 });
  assert.ok(first < rig.head.rotation.y, "snapped to it");
  assert.ok(rig.head.rotation.y > 0.4, "never looked");
});
