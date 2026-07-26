import { P } from './atlas.js';
import { resetSpawn } from './particles.js';

/**
 * Tracers.
 *
 * A tracer is a burning pellet in the base of the round, so what you see is a
 * short, very bright, velocity-aligned streak that *travels* — the fact that it
 * takes time to cross the street is most of the read. Real muzzle velocity
 * (~900 m/s) crosses a 30 m street in 33 ms, i.e. two frames, so like every
 * shipped shooter we clamp the visual speed into a range that reads on screen
 * while keeping the departure and arrival times honest.
 *
 * Three sprites: a hot head, the streak core (HDR, blooms), and a longer, dimmer
 * afterglow behind it.
 */

const MIN_SPEED = 55;
const MAX_SPEED = 340;

export function spawnTracer(fx, from, to, speed, opts) {
  const rng = fx.rng;
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  let dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.35) return;
  dx /= dist;
  dy /= dist;
  dz /= dist;
  const v = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed || 260));
  const life = dist / v;
  const warm = opts?.warm ?? 1;
  // Start a little out of the bore so the tracer is not born inside the flash.
  const ox = from.x + dx * 0.25;
  const oy = from.y + dy * 0.25;
  const oz = from.z + dz * 0.25;

  // core streak
  let s = resetSpawn();
  s.x = ox; s.y = oy; s.z = oz;
  s.vx = dx * v; s.vy = dy * v; s.vz = dz * v;
  s.tile = P.STREAK;
  s.size0 = 0.055;
  s.size1 = 0.04;
  s.stretch = 0.26;
  s.life = life;
  s.drag = 0.02;
  s.gravity = -1.2;
  s.r0 = 1; s.g0 = 0.52 * warm; s.b0 = 0.18 * warm; s.i0 = 26;
  s.r1 = 1; s.g1 = 0.4 * warm; s.b1 = 0.12 * warm; s.i1 = 16;
  s.alphaCurve = 0.25;
  s.soft = 0.1;
  s.seed = rng.float();
  fx.emitAdd(s);

  // afterglow: longer, dimmer, sits behind the core
  s = resetSpawn();
  s.x = ox; s.y = oy; s.z = oz;
  s.vx = dx * v; s.vy = dy * v; s.vz = dz * v;
  s.tile = P.STREAK;
  s.size0 = 0.09;
  s.size1 = 0.07;
  s.stretch = 0.6;
  s.life = life;
  s.drag = 0.02;
  s.gravity = -1.2;
  s.r0 = 1; s.g0 = 0.33 * warm; s.b0 = 0.1 * warm; s.i0 = 5.5;
  s.r1 = 1; s.g1 = 0.24 * warm; s.b1 = 0.06 * warm; s.i1 = 2.5;
  s.alphaCurve = 0.3;
  s.soft = 0.14;
  s.seed = rng.float();
  fx.emitAdd(s);

  // incandescent head
  s = resetSpawn();
  s.x = ox; s.y = oy; s.z = oz;
  s.vx = dx * v; s.vy = dy * v; s.vz = dz * v;
  s.tile = P.SPARK;
  s.size0 = 0.05;
  s.size1 = 0.042;
  s.life = life;
  s.drag = 0.02;
  s.gravity = -1.2;
  s.r0 = 1; s.g0 = 0.85; s.b0 = 0.6; s.i0 = 30;
  s.r1 = 1; s.g1 = 0.6; s.b1 = 0.3; s.i1 = 18;
  s.alphaCurve = 0.2;
  s.soft = 0.08;
  s.seed = rng.float();
  fx.emitAdd(s);
}
