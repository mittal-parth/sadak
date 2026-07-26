/**
 * AUDIO / PROCEDURAL IMPULSE RESPONSES
 *
 * There are no .wav files in this project, so every reverb is a synthesized
 * impulse response rendered into an AudioBuffer at load time and handed to a
 * ConvolverNode.
 *
 * An IR here is built from three physically motivated parts:
 *   1. discrete early reflections  — computed from a box-ish room's image
 *      sources, each one filtered by the absorption of the wall it bounced off.
 *      These are what tell you the size and shape of a room.
 *   2. a diffuse late field        — noise whose density ramps in and whose
 *      envelope decays exponentially, with a *frequency dependent* decay so the
 *      high end dies first (real rooms always do).
 *   3. a slap/flutter component    — for streets and corridors, regular-ish
 *      repeats that give a gunshot its characteristic "crack-tack-tack" tail.
 *
 * Rendering cost is a few ms per IR and it happens once, lazily, after the
 * first user gesture.
 */

import { clamp } from './dsp.js';

/**
 * @typedef {object} IRSpec
 * @property {number} seconds      total length
 * @property {number} rt60         -60 dB time of the diffuse field
 * @property {number} predelay     seconds before the first reflection
 * @property {number} hfDamp       0..1, how much faster the high end decays
 * @property {number} bright       0..1, spectral tilt of the whole tail
 * @property {number} diffusion    0..1, 0 = discrete taps only, 1 = dense wash
 * @property {number} width        0..1, inter-channel decorrelation
 * @property {number[]} taps       early reflection delays in seconds
 * @property {number} tapGain      overall early reflection level
 * @property {number} slaps        number of regular flutter repeats
 * @property {number} slapTime     spacing of the flutter repeats
 */

/** The blendable space names, in a fixed order. */
export const SPACE_KEYS = ['tight', 'room', 'street', 'tunnel', 'open'];

/** Scratch for the median probe; classifySpace runs every 0.45 s, allocation-free. */
const SORT = new Float64Array(16);

/** The five spaces the probe can blend between. */
export const IR_SPECS = {
  /** Small hard room: bathroom-tile slap, almost no tail. Indoors, tight. */
  tight: {
    seconds: 0.5, rt60: 0.34, predelay: 0.0022, hfDamp: 0.45, bright: 0.62,
    diffusion: 0.55, width: 0.4, taps: [0.0035, 0.0061, 0.0092, 0.0134, 0.0177, 0.0231, 0.0288],
    tapGain: 0.85, slaps: 0, slapTime: 0,
  },
  /** Concrete room / warehouse interior. */
  room: {
    seconds: 1.5, rt60: 1.05, predelay: 0.006, hfDamp: 0.55, bright: 0.5,
    diffusion: 0.8, width: 0.6, taps: [0.009, 0.0143, 0.021, 0.0296, 0.0381, 0.0492, 0.0613, 0.078],
    tapGain: 0.6, slaps: 0, slapTime: 0,
  },
  /** Street canyon: two parallel façades — slapback plus a medium tail. */
  street: {
    seconds: 2.0, rt60: 1.45, predelay: 0.012, hfDamp: 0.42, bright: 0.56,
    diffusion: 0.62, width: 0.85, taps: [0.017, 0.029, 0.046, 0.063, 0.088, 0.112, 0.147, 0.19, 0.24],
    tapGain: 0.72, slaps: 7, slapTime: 0.058,
  },
  /** Long corridor / tunnel: strong flutter echo, dark. */
  tunnel: {
    seconds: 2.2, rt60: 1.8, predelay: 0.004, hfDamp: 0.7, bright: 0.3,
    diffusion: 0.5, width: 0.35, taps: [0.006, 0.012, 0.019, 0.027, 0.037, 0.049, 0.064],
    tapGain: 0.9, slaps: 12, slapTime: 0.031,
  },
  /** Open ground: only far, dark, sparse returns — the rolling boom. */
  open: {
    seconds: 2.8, rt60: 1.15, predelay: 0.05, hfDamp: 0.9, bright: 0.16,
    diffusion: 0.9, width: 1.0, taps: [0.07, 0.115, 0.18, 0.26, 0.35, 0.48, 0.62],
    tapGain: 0.3, slaps: 0, slapTime: 0,
  },
};

/**
 * Render one IR. Stereo, decorrelated channels, peak-normalised then trimmed to
 * a sane send level so swapping spaces never changes perceived loudness much.
 */
export function generateIR(actx, rng, spec) {
  const sr = actx.sampleRate;
  const len = Math.max(64, Math.floor(spec.seconds * sr));
  const buf = actx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Channel-specific jitter gives width without comb filtering the centre.
    const wob = 1 + (ch === 0 ? -1 : 1) * spec.width * 0.06;

    /* ---- diffuse late field ------------------------------------- */
    // Two one-pole lowpasses in series, whose cutoff falls with time, model a
    // frequency-dependent RT60 much more cheaply than a filterbank.
    let lp1 = 0, lp2 = 0, hp = 0, hpPrev = 0;
    const decayK = Math.log(1e-3) / (spec.rt60 * sr); // per-sample ln amplitude
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Build-up: energy ramps in over the predelay + a few ms of diffusion.
      const build = clamp((t - spec.predelay) / (0.004 + spec.diffusion * 0.05), 0, 1);
      const env = Math.exp(decayK * i) * build * build;
      if (env < 1e-6) {
        d[i] = 0;
        continue;
      }
      let x = rng.signed();
      // Sparse early / dense late: thin the noise out near the onset.
      if (rng.float() > 0.25 + 0.75 * clamp(t / (spec.rt60 * 0.5), 0, 1)) x *= 0.25;
      // Falling cutoff -> high end dies first.
      const norm = clamp(t / spec.rt60, 0, 1.4);
      const a = clamp(0.9 * (1 - spec.hfDamp * norm) * spec.bright + 0.06, 0.02, 0.95);
      lp1 += a * (x - lp1);
      lp2 += a * (lp1 - lp2);
      // Gentle DC/rumble removal so the convolver never pumps the sub bus.
      const y = lp2;
      hp = y - hpPrev + 0.995 * hp;
      hpPrev = y;
      d[i] = hp * env * spec.diffusion;
    }

    /* ---- discrete early reflections ------------------------------ */
    for (let k = 0; k < spec.taps.length; k++) {
      const tt = (spec.predelay + spec.taps[k]) * wob * rng.range(0.97, 1.03);
      const idx = Math.floor(tt * sr);
      if (idx >= len - 8) continue;
      // 1/r falloff plus per-bounce wall absorption.
      const g = (spec.tapGain / (1 + k * 0.55)) * rng.range(0.65, 1) * (rng.float() < 0.5 ? -1 : 1);
      // Smear each tap over a few samples: real walls are not mirrors.
      const smear = 3 + Math.floor(spec.diffusion * 22);
      let acc = 0;
      for (let s = 0; s < smear && idx + s < len; s++) {
        acc = acc * 0.6 + rng.signed() * 0.4;
        const w = 1 - s / smear;
        d[idx + s] += g * (s === 0 ? 1 : acc * w * w);
      }
    }

    /* ---- flutter / slapback -------------------------------------- */
    for (let k = 1; k <= spec.slaps; k++) {
      const tt = (spec.predelay + spec.slapTime * k * rng.range(0.985, 1.015)) * wob;
      const idx = Math.floor(tt * sr);
      if (idx >= len - 64) continue;
      const g = 0.55 * Math.pow(0.68, k) * (rng.float() < 0.5 ? -1 : 1);
      // Slaps are band-limited: a street echo is mid-heavy, never a click.
      let s1 = 0, s2 = 0;
      for (let s = 0; s < 400 && idx + s < len; s++) {
        const x = rng.signed() * Math.exp(-s / 90);
        s1 += 0.35 * (x - s1);
        s2 += 0.35 * (s1 - s2);
        d[idx + s] += g * s2 * 3.2;
      }
    }
  }

  normalise(buf, 0.42);
  return buf;
}

/** Peak-normalise both channels together to `target`. */
function normalise(buf, target) {
  let peak = 1e-9;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  const g = target / peak;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

/**
 * Classify the space around the listener from a set of raycast distances and
 * turn it into blend weights over IR_SPECS.
 *
 * `hits` is a flat array of ray distances (Infinity/maxDist when nothing was
 * hit), in the order produced by PROBE_DIRS: 8 around the horizon, 1 up.
 */
export function classifySpace(hits, maxDist, out) {
  const horiz = hits.length - 1;
  let sum = 0, close = 0, minD = maxDist, maxD = 0;
  for (let i = 0; i < horiz; i++) {
    const d = Math.min(hits[i], maxDist);
    sum += d;
    if (d < 12) close++;
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
  }
  const mean = sum / horiz;
  const ceil = Math.min(hits[horiz], maxDist);
  const closeSides = close / horiz;

  // Median horizontal distance: the characteristic size of the space. The mean
  // is useless here because a single ray escaping through a doorway drags it
  // from 3 m to 8 m and a small room stops reading as small.
  for (let i = 0; i < horiz; i++) SORT[i] = Math.min(hits[i], maxDist);
  for (let i = 1; i < horiz; i++) {
    const v = SORT[i];
    let j = i - 1;
    while (j >= 0 && SORT[j] > v) { SORT[j + 1] = SORT[j]; j--; }
    SORT[j + 1] = v;
  }
  const median = horiz & 1 ? SORT[horiz >> 1] : (SORT[horiz / 2 - 1] + SORT[horiz / 2]) * 0.5;

  // A ceiling within a few metres is the single most reliable indoor signal:
  // outdoors that ray goes to the sky. Everything else only decides *which*
  // kind of space it is.
  const roofed = 1 - clamp((ceil - 2.8) / 7, 0, 1);
  // Relative spread of the horizon: a corridor is long one way, tight the other.
  const elong = clamp((maxD - minD) / Math.max(maxD, 1), 0, 1);
  const small = clamp(1 - median / 9, 0, 1);

  // Weights deliberately overlap: real spaces are blends, and blending the
  // convolvers is also what stops an audible switch in a doorway.
  const w = out ?? { tight: 0, room: 0, street: 0, tunnel: 0, open: 0 };
  const indoor = roofed;
  const outdoor = 1 - indoor;
  // Eight rays cannot reliably tell a corridor from a room with an open door, so
  // flutter is capped: it colours the tail, it never owns it. Getting this wrong
  // is far more audible than under-reading a real corridor.
  const tunnel = indoor * Math.pow(elong, 2) * 0.55;
  const rest = Math.max(indoor - tunnel, 0);
  w.tunnel = tunnel;
  w.tight = rest * small;
  w.room = rest * (1 - small);
  w.street = outdoor * clamp(closeSides * 2.2, 0, 1);
  w.open = outdoor * clamp(1 - closeSides * 1.8, 0.06, 1);

  // Normalise over the space weights ONLY — `out` is reused across frames and
  // also carries the enclosure/meanFree/ceiling readouts.
  let tot = 0;
  for (const k of SPACE_KEYS) tot += w[k];
  if (tot < 1e-4) {
    w.open = 1;
    tot = 1;
  }
  for (const k of SPACE_KEYS) w[k] /= tot;
  // Readouts for the ambience bed and the debug overlay.
  w.enclosure = clamp(roofed * (0.45 + 0.55 * closeSides), 0, 1);
  w.meanFree = mean;
  w.ceiling = ceil;
  w.closeSides = closeSides;
  w.median = median;
  return w;
}
