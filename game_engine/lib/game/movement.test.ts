import { test } from "node:test";
import assert from "node:assert/strict";
import { newBody, stepBody, WALK_SPEED, SPRINT_SPEED, JUMP_SPEED, type MoveInput } from "./movement";

const DT = 1 / 60;
const go = (dx: number, dz: number, extra: Partial<MoveInput> = {}): MoveInput => ({
  dx,
  dz,
  sprint: false,
  jumpPressed: false,
  jumpHeld: false,
  control: 1,
  ...extra,
});
const run = (b: ReturnType<typeof newBody>, input: MoveInput, seconds: number) => {
  let last = stepBody(b, input, DT);
  for (let t = DT; t < seconds; t += DT) last = stepBody(b, { ...input, jumpPressed: false }, DT);
  return last;
};
const speed = (b: ReturnType<typeof newBody>) => Math.hypot(b.vx, b.vz);

test("speed builds up and bleeds off over a moment, not instantly", () => {
  const b = newBody();
  stepBody(b, go(0, 1), DT);
  assert.ok(speed(b) < 0.5, "full speed on the first frame");
  run(b, go(0, 1), 0.5);
  assert.ok(Math.abs(speed(b) - WALK_SPEED) < 0.05, `walk top speed ${speed(b)}`);
  run(b, go(0, 0), 0.08);
  assert.ok(speed(b) > 1 && speed(b) < WALK_SPEED, "stopped dead");
  run(b, go(0, 0), 0.4);
  assert.equal(speed(b), 0);
});

test("sprinting takes longer to reach a higher top speed", () => {
  const b = newBody();
  run(b, go(0, 1, { sprint: true }), 0.4);
  assert.ok(speed(b) < SPRINT_SPEED - 1, "sprint top speed at once");
  run(b, go(0, 1, { sprint: true }), 1.5);
  assert.ok(Math.abs(speed(b) - SPRINT_SPEED) < 0.05);
});

test("turning back brakes through a stop instead of flipping velocity", () => {
  const b = newBody();
  run(b, go(0, 1), 0.6);
  let slowest = Infinity;
  for (let t = 0; t < 0.6; t += DT) {
    stepBody(b, go(0, -1), DT);
    slowest = Math.min(slowest, speed(b));
  }
  assert.ok(slowest < 0.6, `never slowed down (min ${slowest.toFixed(2)})`);
  assert.ok(b.vz < -WALK_SPEED * 0.5, "not going the new way");
});

test("the body turns toward travel at a limited rate, faster when slow", () => {
  const b = newBody(0);
  run(b, go(0, 1), 0.6);
  const r = stepBody(b, go(1, 0), DT);
  assert.ok(Math.abs(b.facing) < 0.3, "snapped round in a frame");
  assert.ok(r.turn > 0, "turned the wrong way");
  run(b, go(1, 0), 0.8);
  assert.ok(Math.abs(b.facing - Math.PI / 2) < 0.05, `facing ${b.facing}`);
});

test("a jump winds up, rises higher when held, and lands in a crouch", () => {
  const tap = newBody();
  const r0 = stepBody(tap, go(0, 0, { jumpPressed: true }), DT);
  assert.equal(tap.y, 0, "left the ground before the wind-up");
  assert.ok(r0.crouch > 0, "no wind-up crouch");
  let peakTap = 0;
  let landed = false;
  for (let t = 0; t < 1.5 && !landed; t += DT) {
    const r = stepBody(tap, go(0, 0), DT);
    peakTap = Math.max(peakTap, tap.y);
    landed = r.landed;
  }
  assert.ok(landed, "never came down");
  assert.ok(tap.land > 0.3, "no landing squash");

  const held = newBody();
  stepBody(held, go(0, 0, { jumpPressed: true, jumpHeld: true }), DT);
  let peakHeld = 0;
  for (let t = 0; t < 1.5; t += DT) {
    stepBody(held, go(0, 0, { jumpHeld: true }), DT);
    peakHeld = Math.max(peakHeld, held.y);
  }
  assert.ok(peakHeld > peakTap * 1.2, `held ${peakHeld.toFixed(2)} vs tapped ${peakTap.toFixed(2)}`);
  assert.ok(peakTap > (JUMP_SPEED * JUMP_SPEED) / (2 * 16) * 0.9, "a tap barely hops");
});

test("a press just before landing jumps again on landing", () => {
  const b = newBody();
  stepBody(b, go(0, 0, { jumpPressed: true }), DT);
  // Fall until just before touchdown, then press.
  for (let t = 0; t < 2; t += DT) {
    stepBody(b, go(0, 0), DT);
    if (b.vy < 0 && b.y < 0.1) break;
  }
  stepBody(b, go(0, 0, { jumpPressed: true }), DT);
  let again = false;
  for (let t = 0; t < 0.4; t += DT) if (stepBody(b, go(0, 0), DT).tookOff) again = true;
  assert.ok(again, "buffered jump was dropped");
});

test("no control while knocked aside: the body coasts to a stop", () => {
  const b = newBody();
  run(b, go(0, 1), 0.6);
  run(b, go(0, 1, { control: 0 }), 0.5);
  assert.equal(speed(b), 0);
  stepBody(b, go(0, 0, { jumpPressed: true, control: 0 }), DT);
  assert.equal(b.windup, 0, "jumped while stumbling");
});
