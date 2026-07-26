import { DEG } from './mathx.js';

/**
 * Weapon data.
 *
 * Ballistics are real: 5.56x45 leaves a 14.5" barrel at ~880 m/s, 9x19 from a
 * 4.5" barrel at ~360 m/s, and both drop under gravity on the way to the
 * target. Rates of fire, magazine capacities and ADS times are the real ones
 * too (an M4A1 is 800 rpm and reaches the optic in about 220 ms).
 *
 * Recoil is split in two, exactly as a modern shooter does it:
 *   - `pattern`  a DETERMINISTIC per-shot camera climb a player can memorise
 *                and counter. Generated once from a fixed seed.
 *   - `spread`   a random cone that grows with sustained fire and shrinks when
 *                aiming, crouched or still. This is the part you cannot learn.
 */

export const WEAPON_DEFS = {
  rifle: {
    id: 'rifle',
    label: 'M4A1',
    class: 'carbine',
    caliber: '5.56x45',
    /* --- fire control --- */
    rpm: 800,
    modes: ['auto', 'burst', 'semi'],
    burstCount: 3,
    burstRpm: 950,
    burstDelay: 0.16,
    /* --- ammunition --- */
    magSize: 30,
    reserve: 210,
    /* --- terminal ballistics --- */
    muzzleVelocity: 880,
    damage: 33,
    penetration: 1.0,
    dropoff: 0.62,
    maxRange: 420,
    dragK: 0.28,
    tracerEvery: 3,
    /* --- accuracy (degrees) --- */
    spreadHip: 2.05,
    spreadAds: 0.24,
    spreadPerShot: 0.3,
    spreadMax: 3.4,
    spreadDecay: 3.6,
    /* --- recoil --- */
    recoil: {
      pitch: 0.0085, // radians of camera climb per shot
      yaw: 0.0022,
      kickBack: 0.019, // metres the viewmodel travels rearward
      kickUp: 0.0072,
      roll: 0.032,
      punch: 0.35,
      freq: 8.5,
      damping: 0.42,
      patternLength: 30,
      patternSeed: 0x4d34a1,
      climbShape: [1.45, 1.3, 1.15, 1.05, 1.0], // first-shots multiplier
      drift: 0.55, // how much the pattern wanders horizontally
    },
    /* --- handling (seconds) --- */
    adsTime: 0.22,
    adsFov: 0.74,
    viewFov: 0.86,
    reloadTac: 2.1,
    reloadEmpty: 2.9,
    inspectTime: 3.2,
    drawTime: 0.62,
    holsterTime: 0.4,
    /* --- pose ---
     * Weapon-local origin is the web of the shooting hand (top of the grip).
     * The butt pad is at z=+0.245, the muzzle crown at z=-0.502, the optic
     * ocular at (0, 0.142, +0.006) and the mag floorplate ~150 mm below origin.
     *
     * SOLVED FROM THE BORE AXIS, not from where the optic happens to land.
     *
     * The previous pose (hipPos [0.081,-0.192,-0.215], hipRot [-0.026,0.076,
     * 0.055]) was derived by putting the OPTIC at a chosen screen position, and
     * that is the wrong constraint: it left the bore 1.5 deg nose-down with the
     * weapon only 215 mm from the eye, so the whole barrel forward of the
     * receiver ran off the top-left of the frame and the muzzle crown — where
     * the flash spawns — projected onto empty street. What reads as "the gun
     * points at the crosshair" is the MUZZLE being visible, up-left of the
     * receiver, on the way to the centre of the screen.
     *
     * Constraints, in order:
     *   1. bore axis 4.0 deg LEFT of view-forward (converging on the crosshair)
     *      and 2.9 deg nose-down:  rx = -0.050, ry = +0.070
     *   2. rolled 7.7 deg so the LEFT flank of the receiver (the side that
     *      carries the rollmark, the bolt catch and the port) faces the camera
     *      and the rail deck turns edge-on instead of presenting its lit top
     *      face:  rz = -0.135
     *   3. muzzle crown inside x 1050-1300, y 620-780 at 1920x1080
     *   4. optic ocular below and right of screen centre
     *   5. magazine + pistol grip in the lower-right frame
     *
     * With the rotation above the muzzle offset is (-0.025, +0.049, -0.505) and
     * the ocular offset (+0.019, +0.141, -0.003), so at a 60 deg vertical view
     * FOV (half-height 0.5774|z|, half-width 1.0264|z|):
     *   muzzle -> (1064, 698)   ocular -> (1374, 677)   magwell mouth -> (1268, 870)
     * i.e. the muzzle is 300 px up-LEFT of the optic and heading for the middle
     * of the frame, which is the read that was missing.
     *
     * z = -0.30 (was -0.215) is what makes the weapon small enough for the mag
     * and grip to enter the frame at all: the gun's vertical extent from optic
     * to floorplate is 291 mm, and at 215 mm from the eye that is 93% of the
     * frame height. It is also the limit — the support hand is then 620 mm
     * downrange of a shoulder 200 mm off the eye, and a 572 mm arm has nothing
     * left. The butt pad ends up 60 mm in FRONT of the eye but 140 mm off axis,
     * so it is outside the frustum rather than clipped by the near plane. */
    hipPos: [0.118, -0.185, -0.3],
    hipRot: [-0.05, 0.081, -0.135],
    adsCant: [0, 0, 0.004],
    /* Eye to the rear lens.
     *
     * MEASURED FROM THE ADS FRAME, not chosen for realism. Two numbers have to
     * come out right and they pull in opposite directions:
     *
     *   housing size     the 31 mm tube's outer rim subtends rOuter/relief. At
     *                    0.078 that was 256 px of radius — a 512 px ring, HALF
     *                    the frame height, and every critic called the optic
     *                    oversized. 0.115 puts it at 168 px (336 px across,
     *                    31% of frame height), which is where a modern shooter
     *                    frames a tube sight.
     *   sight picture    is stopped by the objective bore at (relief + len), so a
     *                    LONGER relief improves the picture-to-housing ratio:
     *                    (relief)/(relief+len) goes from 0.53 to 0.69.
     *
     * So both wanted the same thing and the old value was simply too close. With
     * the 52 mm tube and the flared bore (see parts.js buildOptic) this lands the
     * clear aperture at 115 px against a 168 px housing. */
    eyeRelief: 0.115,
    /* Sprint: gun dropped and angled across the body, muzzle down-left.
     * Carried over by the same delta as the hip pose so the blend does not
     * translate the weapon 90 mm sideways on the way into a sprint. */
    sprintPos: [0.09, -0.262, -0.275],
    sprintRot: [-0.4, 0.6, 0.2],
    lowReadyPos: [0.112, -0.28, -0.289],
    lowReadyRot: [-0.46, 0.125, -0.09],
    swayScale: 1,
    bobScale: 1,
    magLen: 0.212,
  },

  smg: {
    id: 'smg',
    label: 'MPX-9',
    class: 'smg',
    caliber: '9x19',
    rpm: 950,
    modes: ['auto', 'semi'],
    burstCount: 2,
    burstRpm: 1100,
    burstDelay: 0.14,
    magSize: 32,
    reserve: 224,
    muzzleVelocity: 400,
    damage: 24,
    penetration: 0.45,
    dropoff: 0.48,
    maxRange: 240,
    dragK: 0.42,
    tracerEvery: 4,
    spreadHip: 2.5,
    spreadAds: 0.4,
    spreadPerShot: 0.26,
    spreadMax: 3.9,
    spreadDecay: 4.4,
    recoil: {
      pitch: 0.0058,
      yaw: 0.0026,
      kickBack: 0.0135,
      kickUp: 0.0052,
      roll: 0.026,
      punch: 0.24,
      freq: 10.5,
      damping: 0.4,
      patternLength: 32,
      patternSeed: 0x9ac31f,
      climbShape: [1.3, 1.18, 1.08, 1.0],
      drift: 0.8,
    },
    adsTime: 0.185,
    adsFov: 0.78,
    viewFov: 0.88,
    reloadTac: 1.85,
    reloadEmpty: 2.5,
    inspectTime: 2.9,
    drawTime: 0.52,
    holsterTime: 0.34,
    /* Solved from the bore axis exactly as the rifle's is (see there): 4.1 deg of
     * convergence, 2.9 deg nose-down, 7.5 deg of outboard roll, and far enough
     * out that the muzzle of a 210 mm barrel is on screen up-left of the optic. */
    hipPos: [0.111, -0.163, -0.288],
    hipRot: [-0.05, 0.072, -0.131],
    adsCant: [0, 0, 0.005],
    /* Same aperture-budget derivation as the rifle (see there): the 27.6 mm tube's
     * outer rim wants to land near 165 px of radius and the 44 mm bore wants the
     * eye far enough back that the objective is not the stop. */
    eyeRelief: 0.104,
    sprintPos: [0.088, -0.24, -0.262],
    sprintRot: [-0.38, 0.58, 0.19],
    lowReadyPos: [0.108, -0.252, -0.276],
    lowReadyRot: [-0.44, 0.125, -0.085],
    swayScale: 0.92,
    bobScale: 0.95,
    magLen: 0.192,
  },

  pistol: {
    id: 'pistol',
    label: 'P-19',
    class: 'pistol',
    caliber: '9x19',
    rpm: 460,
    modes: ['semi'],
    burstCount: 1,
    burstRpm: 460,
    burstDelay: 0.1,
    magSize: 17,
    reserve: 68,
    muzzleVelocity: 360,
    damage: 28,
    penetration: 0.35,
    dropoff: 0.42,
    maxRange: 180,
    dragK: 0.46,
    tracerEvery: 5,
    spreadHip: 3.1,
    spreadAds: 0.5,
    spreadPerShot: 0.42,
    spreadMax: 4.6,
    spreadDecay: 5.2,
    recoil: {
      pitch: 0.0125,
      yaw: 0.0032,
      kickBack: 0.012,
      kickUp: 0.0105,
      roll: 0.018,
      punch: 0.3,
      freq: 9.0,
      damping: 0.45,
      patternLength: 17,
      patternSeed: 0x1f77bc,
      climbShape: [1.0],
      drift: 1.2,
    },
    adsTime: 0.16,
    adsFov: 0.86,
    viewFov: 0.92,
    reloadTac: 1.6,
    reloadEmpty: 2.2,
    inspectTime: 2.6,
    drawTime: 0.42,
    holsterTime: 0.3,
    /* A pistol is held out on the arms rather than braced on the shoulder, so
     * the hip pose is FURTHER from the eye than a carbine's and the ADS eye
     * relief is most of an arm's length. 0.34 m keeps both elbows visibly bent;
     * past ~0.40 m the two-bone solve hits full extension and they lock. */
    hipPos: [0.115, -0.15, -0.34],
    hipRot: [-0.05, 0.066, -0.115],
    adsCant: [0, 0, 0.003],
    eyeRelief: 0.34,
    sprintPos: [0.09, -0.25, -0.28],
    sprintRot: [-0.42, 0.5, 0.14],
    lowReadyPos: [0.1, -0.26, -0.32],
    lowReadyRot: [-0.44, 0.105, -0.07],
    swayScale: 1.15,
    bobScale: 1.1,
    magLen: 0.108,
  },
};

/**
 * Generate the deterministic recoil pattern for a weapon.
 *
 * The shape is what a player learns: a strong vertical climb for the first few
 * shots, then the vertical settles while the muzzle starts to wander sideways
 * in a smooth, repeatable S. Everything comes from one fixed seed so the same
 * weapon always kicks the same way — including in capture mode.
 *
 * @returns {Float32Array} pairs of [pitch, yaw] in radians, length n*2.
 */
export function buildRecoilPattern(def, Rng) {
  const r = def.recoil;
  const n = r.patternLength;
  const rng = new Rng(r.patternSeed);
  const out = new Float32Array(n * 2);
  // Two out-of-phase wanders make the horizontal read as a learnable snake
  // rather than as noise.
  const phase = rng.float() * Math.PI * 2;
  const phase2 = rng.float() * Math.PI * 2;
  const bias = rng.signed() * 0.35;
  for (let i = 0; i < n; i++) {
    const shot = i;
    const climb = r.climbShape[Math.min(shot, r.climbShape.length - 1)];
    // Vertical: strong early, tapering, with a per-shot signature bump.
    const sig = 0.88 + rng.float() * 0.24;
    out[i * 2] = r.pitch * climb * sig;
    // Horizontal: a smooth snake plus a fixed per-shot signature.
    const t = i / Math.max(1, n - 1);
    const snake =
      Math.sin(phase + t * Math.PI * 2.6) * 0.75 + Math.sin(phase2 + t * Math.PI * 5.1) * 0.35;
    out[i * 2 + 1] = r.yaw * (snake * r.drift * 3.2 + bias + rng.signed() * 0.25);
  }
  return out;
}

export const SPREAD_MODS = {
  crouch: 0.78,
  prone: 0.6,
  still: 0.82,
  walking: 1.15,
  sprinting: 2.2,
  airborne: 2.0,
  hipfire: 1,
};

export const DEG2RAD = DEG;
