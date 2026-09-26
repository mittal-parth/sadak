/**
 * How the player's body moves: speed built up and bled off at the rate feet
 * can push, turns that carve at speed instead of snapping, a jump with a
 * wind-up, more height for holding the button and a landing that sinks into
 * the knees. Pure, so it can be stepped in tests; the engine owns collisions.
 */

export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 9.5;

/** m/s^2 pushing off, and braking (feet planted, or turning back). */
const ACCEL = 16;
const SPRINT_ACCEL = 11;
const BRAKE = 26;
/** Share of ground control left in the air. */
const AIR_CONTROL = 0.3;

export const JUMP_SPEED = 5.4;
const GRAVITY = 16;
/** Rising with the button held floats a little; falling drops faster. */
const HOLD_GRAVITY = 0.62;
const FALL_GRAVITY = 1.3;
/** The crouch before take-off, seconds. */
const WINDUP = 0.07;
/** A press this long before landing still jumps on landing. */
const BUFFER = 0.14;

/** Body turn rate limits, rad/s: brisk from a standstill, wider at a sprint. */
const TURN_SLOW = 14;
const TURN_FAST = 6;

export type Body = {
  vx: number;
  vz: number;
  /** Height of the feet above the ground, and vertical speed. */
  y: number;
  vy: number;
  /** Heading of the body (not the camera), radians; +z at 0. */
  facing: number;
  /** Seconds left in the take-off crouch, 0 when not winding up. */
  windup: number;
  /** Seconds since the jump button was pressed, for buffering. */
  buffered: number;
  /** 0..1 squash from the last landing, decaying. */
  land: number;
};

export type MoveInput = {
  /** Desired direction in the world (unit, or zero to stop). */
  dx: number;
  dz: number;
  sprint: boolean;
  /** The jump button went down this frame; is held. */
  jumpPressed: boolean;
  jumpHeld: boolean;
  /** 0 with no control (knocked aside), 1 normally. */
  control: number;
};

export type MoveResult = {
  /** Forward acceleration along the body's heading, m/s^2. */
  accel: number;
  /** Body turn rate, rad/s. */
  turn: number;
  /** 0..1 crouch for the animator: take-off wind-up or landing squash. */
  crouch: number;
  /** True on the frame the feet leave the ground, and touch it again. */
  tookOff: boolean;
  landed: boolean;
};

export function newBody(facing = 0): Body {
  return { vx: 0, vz: 0, y: 0, vy: 0, facing, windup: 0, buffered: Infinity, land: 0 };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function stepBody(b: Body, input: MoveInput, dt: number): MoveResult {
  const grounded = b.y <= 0 && b.vy <= 0;
  const speedBefore = Math.hypot(b.vx, b.vz);
  const fwdBefore = b.vx * Math.sin(b.facing) + b.vz * Math.cos(b.facing);

  /* ---- ground speed ---- */
  const top = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  const tx = input.dx * top * input.control;
  const tz = input.dz * top * input.control;
  // Pushing toward the target: accelerate along it, brake what points away.
  const wantMove = Math.hypot(tx, tz) > 0.01;
  const along = wantMove ? (b.vx * tx + b.vz * tz) / Math.hypot(tx, tz) : 0;
  const reversing = wantMove && along < -0.5;
  let rate = !wantMove || reversing ? BRAKE : speedBefore > WALK_SPEED ? SPRINT_ACCEL : ACCEL;
  if (!grounded) rate *= AIR_CONTROL;
  // Sinking into a landing costs a moment's push.
  rate *= 1 - b.land * 0.5;
  let ex = tx - b.vx;
  let ez = tz - b.vz;
  const e = Math.hypot(ex, ez);
  const maxDv = rate * dt;
  if (e > maxDv) {
    ex *= maxDv / e;
    ez *= maxDv / e;
  }
  b.vx += ex;
  b.vz += ez;

  /* ---- facing: turn toward travel, at a rate that narrows with speed ---- */
  const speed = Math.hypot(b.vx, b.vz);
  let turn = 0;
  const heading = speed > 0.15 ? Math.atan2(b.vx, b.vz) : wantMove ? Math.atan2(tx, tz) : b.facing;
  const want = wrap(heading - b.facing);
  const maxTurn = (TURN_SLOW + (TURN_FAST - TURN_SLOW) * Math.min(1, speed / SPRINT_SPEED)) * dt;
  const step = Math.max(-maxTurn, Math.min(maxTurn, want));
  b.facing = wrap(b.facing + step);
  turn = step / Math.max(dt, 1e-4);

  /* ---- jump ---- */
  let tookOff = false;
  let landed = false;
  b.buffered = input.jumpPressed ? 0 : b.buffered + dt;
  if (grounded && b.windup <= 0 && b.buffered <= BUFFER && input.control > 0.5) {
    b.windup = WINDUP;
    b.buffered = Infinity;
  }
  if (b.windup > 0) {
    b.windup -= dt;
    if (b.windup <= 0) {
      b.windup = 0;
      b.vy = JUMP_SPEED;
      b.y = 1e-4;
      tookOff = true;
    }
  }
  if (b.y > 0 || b.vy > 0) {
    const g = GRAVITY * (b.vy > 0 ? (input.jumpHeld ? HOLD_GRAVITY : 1) : FALL_GRAVITY);
    const vyBefore = b.vy;
    b.vy -= g * dt;
    b.y += b.vy * dt;
    if (b.y <= 0) {
      b.y = 0;
      b.vy = 0;
      landed = true;
      // The harder the fall, the deeper the knees go and the more speed the
      // landing eats.
      b.land = Math.min(1, Math.abs(vyBefore) / 9);
      const keep = 1 - b.land * 0.3;
      b.vx *= keep;
      b.vz *= keep;
    }
  }
  b.land = Math.max(0, b.land - dt * 3.5);

  const fwdAfter = b.vx * Math.sin(b.facing) + b.vz * Math.cos(b.facing);
  const crouch = b.windup > 0 ? 1 - b.windup / WINDUP : b.land;
  return { accel: (fwdAfter - fwdBefore) / Math.max(dt, 1e-4), turn, crouch, tookOff, landed };
}
