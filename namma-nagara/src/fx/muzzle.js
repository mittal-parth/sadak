import { P } from './atlas.js';
import { resetSpawn } from './particles.js';
import { V, C, C2, basis, blackbody, clampCone, cone, towardHemi, COS55 } from './util.js';

/**
 * Muzzle flash.
 *
 * A real flash is burning propellant leaving the bore: a small incandescent
 * core at the crown, an asymmetric set of lobes thrown by whatever device is on
 * the muzzle, a forward gas jet, unburnt powder grains, and then half a second
 * of smoke that drifts off the barrel. All of it varies shot to shot — CoD's
 * flashes never repeat, and neither do these: lobe count, roll, scale, colour
 * temperature and jet length are all re-rolled every trigger pull.
 *
 * Shape rules learnt the hard way, because breaking any of them turns the flash
 * back into the cartoon 7-petal sticker this file used to draw:
 *
 *   - The FLASH_LOBE sprite is ONE one-sided tongue (root at its -X edge), never
 *     a radial star. Stacking stars on stars is what makes a flower.
 *   - Every lobe gets an independent roll about the bore and a 15-40 deg pitch
 *     off it, so the composite silhouette is lopsided and never repeats.
 *   - The core is small, tight and blinding; the gas around it is an order of
 *     magnitude dimmer and deeply tinted, so only the core clips to white.
 *   - The whole burning phase lasts 2-3 frames at 60 Hz. What lingers is smoke.
 *
 * The flash also drives a real point light for two or three frames, a haze
 * puff, and (through the caller) recoil-side smoke that lingers.
 */

const TWO_PI = Math.PI * 2;

/** Bore-axis frame + the lobe direction, reused every shot (never allocate). */
const BORE = { tx: 0, ty: 0, tz: 0, bx: 0, by: 0, bz: 0 };
const LOBE = { x: 0, y: 0, z: 0 };

/**
 * The FLASH_LOBE sprite runs root(-X) -> tip(+X) in its own texture space and is
 * a screen-space billboard, so a lobe only points the right way if we hand it
 * the *view-space* angle of its world direction. Roll about the bore therefore
 * shows up as sprite rotation, which is exactly what we want: each lobe leaves
 * the crown in its own direction and the composite silhouette is irregular.
 */
export function screenAngle(fx, view, dx, dy, dz) {
  const cam = view ? fx.ctx.viewCamera : fx.ctx.camera;
  if (!cam) return 0;
  cam.updateMatrixWorld();
  const m = cam.matrixWorldInverse.elements;
  const vx = m[0] * dx + m[4] * dy + m[8] * dz;
  const vy = m[1] * dx + m[5] * dy + m[9] * dz;
  return Math.atan2(vy, vx);
}

/**
 * Per-weapon-class signature. Anything unknown is treated as a rifle.
 *
 * `light` is peak candela. 200 for a rifle, not the 90 this used to carry: at
 * 90 cd with a 50 ms duration and a decay of 30 the light was at 37 % after a
 * single 33 ms frame, so by the time the capture harness pressed the shutter
 * there was no warm gradient anywhere — not on the handguard, not on the
 * sandbags 2 m away, not on the ground. 200 cd for 90 ms with a decay of 16
 * puts a visible pool on the street and a legible rim on the weapon.
 */
export const MUZZLE_PROFILES = {
  rifle: { scale: 1.0, lobes: 3, jet: 1.0, light: 200, smoke: 1.0, temp: 1.0, sparks: 8 },
  carbine: { scale: 0.92, lobes: 3, jet: 0.9, light: 175, smoke: 0.9, temp: 1.02, sparks: 7 },
  smg: { scale: 0.78, lobes: 3, jet: 0.75, light: 135, smoke: 0.7, temp: 1.05, sparks: 6 },
  pistol: { scale: 0.66, lobes: 2, jet: 0.6, light: 100, smoke: 0.55, temp: 1.06, sparks: 5 },
  shotgun: { scale: 1.5, lobes: 4, jet: 1.35, light: 330, smoke: 1.8, temp: 0.92, sparks: 14 },
  sniper: { scale: 1.35, lobes: 3, jet: 1.6, light: 290, smoke: 1.4, temp: 0.95, sparks: 10 },
  lmg: { scale: 1.15, lobes: 4, jet: 1.1, light: 235, smoke: 1.2, temp: 0.98, sparks: 9 },
  suppressed: { scale: 0.34, lobes: 2, jet: 0.4, light: 36, smoke: 1.6, temp: 1.1, sparks: 2 },
};

/** The `light` a rifle carries, i.e. the reference the view flash is scaled on. */
const REF_LIGHT = MUZZLE_PROFILES.rifle.light;

function profileFor(weapon) {
  if (!weapon) return MUZZLE_PROFILES.rifle;
  const key = typeof weapon === 'string' ? weapon : weapon.class ?? weapon.kind ?? weapon.name;
  if (!key) return MUZZLE_PROFILES.rifle;
  const k = String(key).toLowerCase();
  for (const name in MUZZLE_PROFILES) if (k.includes(name)) return MUZZLE_PROFILES[name];
  return MUZZLE_PROFILES.rifle;
}

/**
 * @param {object} fx     the FxSystem (provides emit helpers, rng, now)
 * @param {object} o
 * @param {{x,y,z}} o.position   muzzle crown, world space
 * @param {{x,y,z}} o.direction  bore axis, unit
 * @param {string|object} [o.weapon]
 * @param {number} [o.intensity] extra scale (ADS/first shot)
 * @param {number} [o.scale]     geometric size multiplier, independent of the
 *   radiance. An enemy flash has to be the right SIZE to read as a flash at
 *   20 m while being an order of magnitude dimmer than the player's, and one
 *   number cannot do both: scaling `intensity` alone shrank the enemy's core to
 *   three millimetres and it vanished.
 * @param {number} [o.light]     light-only multiplier, independent of the
 *   sprites. An enemy stands 0.6 m from his own crown, so at player strength the
 *   punctual flash puts more irradiance on his chest than the midday sun does
 *   and he reads as a glowing billboard; `ai` uses this to keep the flash a
 *   highlight in daylight while the sprites stay legible.
 * @param {boolean} [o.view]     emit into the viewmodel layers instead
 */
export function muzzleFlash(fx, o) {
  const rng = fx.rng;
  const prof = profileFor(o.weapon);
  const p = o.position;
  const d = o.direction;
  const gain = (o.intensity ?? 1) * (0.86 + rng.float() * 0.28); // shot-to-shot
  const lightGain = gain * (o.light ?? 1);
  // Embers are the one element that used to ignore `gain` entirely, so a 5 %
  // enemy flash still threw player-strength white streaks all over his chest.
  const emberGain = 0.22 + 0.78 * Math.min(1, gain);
  // Size jitter is rolled ONCE here; `gain` already carries its own roll for the
  // radiance, and multiplying the two made the flash size vary by +-30 %.
  const sc = prof.scale * (o.scale ?? (o.intensity ?? 1)) * (0.88 + rng.float() * 0.24);
  const view = o.view === true;
  const emitAdd = view ? fx.emitViewAdd : fx.emitAdd;
  const emitLit = view ? fx.emitViewLit : fx.emitLit;
  const temp = prof.temp * (0.96 + rng.float() * 0.09);
  // COLOUR is a real blackbody ramp, not a hand-picked pale tint. Burning
  // propellant at the crown runs 3800-4400 K — warm white with a strong red
  // bias, never a neutral ball — and the gas has cooled to ~2200 K deep orange
  // by the time it reaches the tips of the lobes. Rolling the core temperature
  // per shot is what stops consecutive frames of automatic fire matching.
  const coreK = 3800 + rng.float() * 600;
  blackbody(C, coreK * temp);
  const cr = C.r;
  const cg = C.g;
  const cb = C.b;
  blackbody(C, coreK * 0.62 * temp); // ~2400 K: the choked gas around the core
  const gr = C.r;
  const gg = C.g;
  const gb = C.b;
  blackbody(C2, 2200); // the shredding, burnt-out lobe tips
  const tr = C2.r;
  const tg = C2.g;
  const tb = C2.b;

  // --- incandescent core at the crown --------------------------------------
  // Two nested sprites, both sitting ON the bore axis with no lead offset: the
  // flash has to look welded to the crown, and every centimetre of forward
  // offset is a visible gap by the time the sprite is drawn two frames later.
  //
  // Radiance is authored in the 20-60 band: that clips hard past display white
  // and drives the bloom, while staying low enough that the *shape* of the
  // petals around it survives instead of fusing into one white ball. The old
  // 135 bleached the whole crown and the lobes with it.
  let s = resetSpawn();
  // WELDED to the bore crown: no lead offset at all. Every centimetre of
  // forward offset is a visible gap between the flash and the barrel two frames
  // later, and the previous 6 mm of lead is what left the flash reading as a
  // pale ball floating clear of the muzzle. `p` is the muzzle transform the
  // caller handed us, so the flash follows the pose exactly.
  s.x = p.x;
  s.y = p.y;
  s.z = p.z;
  s.tile = P.FLASH_CORE;
  // 0.085 -> 0.135 m. At 0.032 m the core was a ~40 px ball at 80 deg FOV: too
  // small to read as burning gas and far too small to be the source of a light
  // that is supposed to wash the handguard.
  s.size0 = 0.085 * sc;
  s.size1 = 0.135 * sc;
  s.sizeCurve = 0.35;
  // 50 ms: three frames at 60 Hz. A real flash is ~2 ms, but a sprite that dies
  // inside one frame is a flash the player only ever sees half the time — and
  // the automatic-fire cadence is 50 ms, so this is exactly "always one lit".
  s.life = 0.062;
  s.drag = 10;
  s.r0 = gr; s.g0 = gg; s.b0 = gb; s.i0 = 17 * gain;
  // i1 is NOT zero: the last third of the burn is cooling gas, still bright
  // enough to read as fire. With a zero tail and a 50 ms auto-fire cadence, one
  // frame in three caught the flash mid-fade and showed nothing but sparks.
  s.r1 = tr; s.g1 = tg; s.b1 = tb; s.i1 = 4.5 * gain;
  s.alphaCurve = 0.7;
  s.soft = 0.15;
  s.rot = rng.float() * TWO_PI; // per-shot roll: the churn never repeats
  s.spin = rng.signed() * 3.0;
  s.seed = rng.float();
  emitAdd(s);
  // the white-hot heart: a third of the diameter, twice the radiance, gone first
  s = resetSpawn();
  s.x = p.x;
  s.y = p.y;
  s.z = p.z;
  s.tile = P.FLASH_CORE;
  s.size0 = 0.036 * sc;
  s.size1 = 0.056 * sc;
  s.sizeCurve = 0.4;
  s.life = 0.046;
  s.drag = 12;
  s.r0 = cr; s.g0 = cg; s.b0 = cb; s.i0 = 38 * gain;
  s.r1 = gr; s.g1 = gg; s.b1 = gb; s.i1 = 6 * gain;
  s.alphaCurve = 0.6;
  s.soft = 0.12;
  s.rot = rng.float() * TWO_PI;
  s.spin = rng.signed() * 4.0;
  s.seed = rng.float();
  emitAdd(s);

  // --- petals: one tongue of burning gas per muzzle-device port -------------
  // A brake with three ports throws three petals, every shot, in the same
  // places — that is what makes a flash read as *this weapon's* flash rather
  // than as a random puff. The per-shot randomness lives in the roll of the
  // whole set, the length of each tongue and which port is choked this time,
  // not in the count.
  basis(BORE, d.x, d.y, d.z);
  // 3-4 tongues, re-rolled every shot in count AND in the roll of the whole set,
  // and deliberately unevenly spaced: an evenly spoked set of equal petals is the
  // cartoon starburst this file exists to avoid.
  const ports = Math.min(4, Math.max(3, prof.lobes + (rng.float() < 0.45 ? 1 : 0)));
  const rollBase = rng.float() * TWO_PI;
  const weak = rng.int(0, ports - 1); // one port always gets less gas
  const big = rng.int(0, ports - 1); // and one always gets the long tongue
  for (let i = 0; i < ports; i++) {
    const roll = rollBase + (i / ports) * TWO_PI + rng.signed() * 0.55;
    const pitch = rng.range(0.40, 0.85); // 23-49 degrees off the bore
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const rc = Math.cos(roll) * sp;
    const rs = Math.sin(roll) * sp;
    LOBE.x = d.x * cp + BORE.tx * rc + BORE.bx * rs;
    LOBE.y = d.y * cp + BORE.ty * rc + BORE.by * rs;
    LOBE.z = d.z * cp + BORE.tz * rc + BORE.bz * rs;
    const choke =
      i === weak ? rng.range(0.4, 0.62) : i === big ? rng.range(1.1, 1.35) : rng.range(0.78, 1.0);
    const push = rng.range(0.6, 2.2) * choke;
    s = resetSpawn();
    s.tile = P.FLASH_LOBE;
    s.size0 = (0.06 + 0.05 * rng.float()) * sc * choke;
    // 0.18-0.32 m, skewed: mostly mid-length with the odd long tongue. At the old
    // 0.10-0.23 the lobes were shorter than the barrel is wide and the whole
    // flash read as a 40 px ball floating clear of the muzzle.
    s.size1 = (0.18 + 0.14 * Math.pow(rng.float(), 1.5)) * sc * choke;
    // The sprite's root is at its -X edge, so slide the centre out along the
    // petal direction to sit that root exactly on the crown.
    const off = 0.34 * s.size1;
    s.x = p.x + LOBE.x * off;
    s.y = p.y + LOBE.y * off;
    s.z = p.z + LOBE.z * off;
    s.vx = LOBE.x * push;
    s.vy = LOBE.y * push;
    s.vz = LOBE.z * push;
    s.sizeCurve = 0.35;
    s.life = 0.040 + rng.float() * 0.020; // 2.5-3.5 frames at 60 Hz
    s.drag = 12;
    s.rot = screenAngle(fx, view, LOBE.x, LOBE.y, LOBE.z) + rng.signed() * 0.1;
    s.spin = rng.signed() * 1.6; // a lazy curl, not a spinning pinwheel
    // Deep orange and an order of magnitude under the core: the core owns the
    // white, the gas around it stays fire-coloured. Only a strong channel
    // *ratio* survives the tone curve as amber rather than as more white.
    s.r0 = gr; s.g0 = gg; s.b0 = gb; s.i0 = (8 + rng.float() * 6) * gain * choke;
    s.r1 = tr; s.g1 = tg; s.b1 = tb; s.i1 = 1.6 * gain * choke;
    s.alphaCurve = 0.75;
    s.soft = 0.15;
    s.seed = rng.float();
    emitAdd(s);
  }

  // --- forward gas jet: velocity-aligned, so it stretches down the bore ----
  s = resetSpawn();
  s.x = p.x + d.x * 0.04;
  s.y = p.y + d.y * 0.04;
  s.z = p.z + d.z * 0.04;
  s.vx = d.x * 7; s.vy = d.y * 7; s.vz = d.z * 7;
  s.tile = P.STREAK;
  s.size0 = 0.045 * sc * prof.jet;
  s.size1 = 0.018 * sc * prof.jet;
  // Short: a long velocity-aligned streak off the crown reads as a hard spike.
  s.stretch = 0.28 * prof.jet;
  s.life = 0.044;
  s.drag = 14;
  s.r0 = 1; s.g0 = 0.8; s.b0 = 0.5; s.i0 = 9 * gain;
  s.r1 = 1; s.g1 = 0.4; s.b1 = 0.1; s.i1 = 0;
  s.alphaCurve = 0.6;
  s.soft = 0.12;
  s.seed = rng.float();
  emitAdd(s);

  // --- unburnt powder: tiny embers thrown DOWN-BORE -------------------------
  // Every grain is constrained to the forward hemisphere: burning powder leaves
  // the crown with the gas, so a grain travelling back toward the shooter is a
  // bug, not variety. Colour is a real blackbody ramp — 2500 K leaving the bore,
  // 1200 K by the time it lands — and the streak length comes out of the
  // velocity, so the fast ones are long and the tumbling ones are specks.
  const nSpark = Math.round(prof.sparks * fx.pScale);
  blackbody(C, 2600 * temp);
  blackbody(C2, 1200);
  for (let i = 0; i < nSpark; i++) {
    cone(V, rng, d.x, d.y, d.z, 0.55, 1.4);
    towardHemi(V, d.x, d.y, d.z, 0.25);
    // Hard +-55 deg cone about the BORE: burning powder leaves the crown with the
    // gas, so a grain heading sideways past the shooter's face is a bug.
    clampCone(V, d.x, d.y, d.z, COS55);
    const sp = rng.range(2.5, 8.5);
    s = resetSpawn();
    s.x = p.x + d.x * 0.012;
    s.y = p.y + d.y * 0.012;
    s.z = p.z + d.z * 0.012;
    s.vx = V.x * sp; s.vy = V.y * sp; s.vz = V.z * sp;
    s.tile = P.STREAK;
    s.size0 = rng.range(0.005, 0.011);
    s.size1 = s.size0 * 0.4;
    // Length ∝ velocity (the shader multiplies by |view velocity|), with a
    // slightly super-linear coefficient so a fast grain reads as a streak and a
    // slow one as an ember rather than everything being the same capsule.
    s.stretch = 0.16 + sp * 0.045;
    s.life = rng.range(0.1, 0.4);
    s.drag = 3.2;
    s.gravity = -11;
    s.r0 = C.r; s.g0 = C.g; s.b0 = C.b; s.i0 = rng.range(5, 11) * emberGain;
    s.r1 = C2.r; s.g1 = C2.g; s.b1 = C2.b; s.i1 = 0.15;
    s.flags = 1;
    s.alphaCurve = 0.5;
    s.soft = 0.05;
    s.seed = rng.float();
    emitAdd(s);
  }

  // --- crown puff: powder smoke that leaves the bore still incandescent ----
  // DECOUPLED from the light: the puff is delayed by a frame and starts small,
  // so the frame the flash is lit shows fire, and the frame after shows smoke.
  // Co-timing them is what turned the whole thing into one beige cloud with a
  // pale core indistinguishable from a dust puff.
  const nPuff = Math.max(2, Math.round(3 * fx.pScale));
  for (let i = 0; i < nPuff; i++) {
    cone(V, rng, d.x, d.y, d.z, 0.7, 0.9);
    towardHemi(V, d.x, d.y, d.z, 0.1);
    const sp = rng.range(0.6, 1.9);
    const px = p.x + d.x * 0.018 + V.x * 0.008;
    const py = p.y + d.y * 0.018 + V.y * 0.008;
    const pz = p.z + d.z * 0.018 + V.z * 0.008;
    const vx = V.x * sp;
    const vy = V.y * sp + 0.12;
    const vz = V.z * sp;
    const size0 = (0.018 + 0.016 * rng.float()) * sc;
    const size1 = (0.075 + 0.07 * rng.float()) * sc * (0.7 + prof.smoke * 0.5);
    const tile = i % 2 ? P.SMOKE_B : P.WISP;
    const rot = rng.float() * TWO_PI;
    const spin = rng.signed() * 2.2;
    const seed = rng.float();
    const delay = 0.012 + rng.float() * 0.022;

    s = resetSpawn();
    s.x = px; s.y = py; s.z = pz;
    s.vx = vx; s.vy = vy; s.vz = vz;
    s.tile = tile;
    s.size0 = size0 * 0.9;
    s.size1 = size1 * 0.75;
    s.sizeCurve = 0.5;
    s.life = 0.05 + rng.float() * 0.03;
    s.drag = 7;
    s.rot = rot;
    s.spin = spin;
    s.r0 = 1; s.g0 = 0.5; s.b0 = 0.17; s.i0 = (0.5 + rng.float() * 0.7) * gain;
    s.r1 = 1; s.g1 = 0.26; s.b1 = 0.05; s.i1 = 0;
    s.alphaCurve = 1.1;
    s.soft = 0.2;
    s.seed = seed;
    emitAdd(s);

    s = resetSpawn();
    s.x = px; s.y = py; s.z = pz;
    s.vx = vx; s.vy = vy; s.vz = vz;
    s.tile = tile;
    s.size0 = size0;
    s.size1 = size1;
    s.sizeCurve = 0.5;
    s.life = rng.range(0.3, 0.55) * (0.7 + prof.smoke * 0.5);
    s.delay = delay;
    s.drag = 7;
    s.gravity = 0.5;
    s.rot = rot;
    s.spin = spin;
    // warm, lit by its own flash while it is still hot -> plain grey as it cools
    s.r0 = 0.62; s.g0 = 0.57; s.b0 = 0.52;
    s.r1 = 0.44; s.g1 = 0.44; s.b1 = 0.44;
    s.alpha = rng.range(0.26, 0.44) * (0.7 + prof.smoke * 0.4) * emberGain;
    s.alphaCurve = 1.35;
    s.soft = 0.22;
    s.turb = 0.05;
    s.turbFreq = 2.4;
    s.seed = seed;
    emitLit(s);
  }

  // --- barrel smoke: rolls off the crown and lingers -----------------------
  const nSmoke = Math.round((2 + prof.smoke * 3) * fx.pScale * (0.4 + 0.6 * Math.min(1, gain)));
  for (let i = 0; i < nSmoke; i++) {
    cone(V, rng, d.x, d.y, d.z, 1.0, 0.7);
    const sp = rng.range(0.4, 2.2) * prof.smoke;
    s = resetSpawn();
    s.x = p.x + d.x * rng.range(0.0, 0.09);
    s.y = p.y + d.y * rng.range(0.0, 0.09);
    s.z = p.z + d.z * rng.range(0.0, 0.09);
    s.vx = V.x * sp; s.vy = V.y * sp + 0.28; s.vz = V.z * sp;
    s.tile = i % 2 ? P.WISP : P.SMOKE_A;
    s.size0 = rng.range(0.03, 0.055) * prof.smoke;
    s.size1 = rng.range(0.16, 0.32) * prof.smoke;
    s.sizeCurve = 0.55;
    s.life = rng.range(0.5, 1.15) * (0.6 + prof.smoke * 0.6);
    s.delay = rng.range(0, 0.05);
    s.drag = 2.6;
    s.gravity = 0.36;
    s.rot = rng.float() * TWO_PI;
    s.spin = rng.signed() * 1.6;
    s.r0 = 0.5; s.g0 = 0.49; s.b0 = 0.47;
    s.r1 = 0.42; s.g1 = 0.41; s.b1 = 0.4;
    s.alpha = rng.range(0.10, 0.20) * (0.6 + prof.smoke * 0.5) * emberGain;
    s.alphaCurve = 1.8;
    s.soft = 0.25;
    s.turb = 0.06;
    s.turbFreq = 1.6;
    s.seed = rng.float();
    emitLit(s);
  }

  // --- muzzle light: 3-4 frames of real illumination ----------------------
  // The WORLD light lives in ctx.scene and lights the street.
  //
  // RANGE IS THE WHOLE PROBLEM HERE. The brief asks for "a warm pool on the
  // ground within 3 m", and three.js windows a punctual light as
  // (1-(d/cutoff)^4)^2 / d^2 — so with a 14 m cutoff the window is still 0.97
  // at 5 m and 0.55 at 10 m, i.e. the cutoff does almost nothing over the
  // distances that matter and 200 cd was landing ~2x the sun on geometry 5 m
  // away and ~25 % of it 10 m down the street. Measured: the whole near half of
  // the frame clipped to white (sandbags 100 -> 254, mid-street 72 -> 200).
  // A 5 m cutoff puts the window at 0.76 by 3 m and 0.12 by 4.5 m, which is a
  // pool rather than a floodlight; the peak comes down with it so the pool is
  // ~4x the sun at 1.5 m, ~0.75x at 3 m and gone by 5 m. Measured on the
  // `muzzle` shot: with 200 cd / 14 m the market stall and sandbags 3-5 m out
  // clipped to 249-254 flat white; with 36 cd / 5 m they take a warm lift and
  // keep their texture.
  //
  // The DURATION and DECAY matter more than the peak. At 0.05 s / decay 30 the
  // light was down to 37 % after one 33 ms frame and to nothing by the second, so
  // the frame the harness photographs had no spill in it at all. 0.09 s / decay 16
  // still reads at ~50 % one frame later and ~26 % two frames later.
  if (fx.lights) {
    const lp = o.lightPos ?? p;
    fx.lights.flash(
      lp.x + d.x * 0.1,
      lp.y + d.y * 0.1,
      lp.z + d.z * 0.1,
      cr, cg, cb,
      prof.light * lightGain * 0.18,
      0.09,
      16,
      5 * sc,
      2
    );
  }

  // --- the same flash, mirrored into the viewmodel scene -------------------
  // The weapon does not live in ctx.scene, so the world light above cannot
  // touch it: without this the handguard, mount and glove 20 cm from a 90 cd
  // source stayed exactly as neutral as they were between shots.
  if (view) {
    fx.viewFlash(
      p.x + d.x * 0.03,
      p.y + d.y * 0.03,
      p.z + d.z * 0.03,
      cr, cg, cb,
      lightGain * (prof.light / REF_LIGHT)
    );
  }

  // --- hot gas refraction --------------------------------------------------
  fx.haze(p.x + d.x * 0.1, p.y + d.y * 0.1, p.z + d.z * 0.1, 0.1 * sc, 3.0, 0.1, 0.7 * sc, P.SMOKE_B);

  return prof;
}
