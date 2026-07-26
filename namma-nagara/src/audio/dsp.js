/**
 * AUDIO / DSP TOOLKIT
 *
 * Low-level Web Audio helpers shared by every synthesis voice in this
 * directory. Everything here is written against `BaseAudioContext` so the exact
 * same code path renders in an `OfflineAudioContext` (see selftest.js) as in
 * the live `AudioContext` — that is how this subsystem is verified without a
 * user gesture or a speaker.
 *
 * Rules honoured here:
 *  - no randomness except through an injected `Rng` (ctx.rng.fork())
 *  - buffers and curve tables are built once and shared
 *  - every node a voice creates hangs off a single top gain so the caller can
 *    disconnect the whole voice in one call when its tail has decayed
 */

export const SPEED_OF_SOUND = 343; // m/s, 20 C dry air

/* ------------------------------------------------------------------ */
/* Noise                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fill a Float32Array with one of the classic noise colours.
 *  white  — flat spectrum, the raw material of cracks and hiss
 *  pink   — -3 dB/oct (Paul Kellet's economy filter), city beds, tails
 *  brown  — -6 dB/oct leaky integrator, wind and rumble
 *  crackle— sparse impulsive grains, debris and foliage
 */
export function fillNoise(out, kind, rng) {
  const n = out.length;
  switch (kind) {
    case 'pink': {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = rng.signed();
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      break;
    }
    case 'brown': {
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = rng.signed();
        last = (last + 0.019 * w) * 0.9985;
        out[i] = last * 5.2;
      }
      break;
    }
    case 'crackle': {
      out.fill(0);
      // Poisson-ish grain train; each grain is a decaying two-pole ping so the
      // buffer already has material character rather than pure clicks.
      let i = 0;
      while (i < n) {
        i += 12 + ((rng.u32() % 260) | 0);
        if (i >= n) break;
        const amp = rng.range(0.25, 1) * (rng.float() < 0.12 ? 1.8 : 0.7);
        const w = rng.range(0.05, 0.45); // radians/sample
        const dec = Math.exp(-rng.range(0.004, 0.05));
        let a = amp;
        for (let k = 0; k < 220 && i + k < n; k++) {
          out[i + k] += Math.sin(w * k) * a;
          a *= dec;
          if (a < 1e-4) break;
        }
      }
      // Keep the peak sane; grains overlap.
      let peak = 1e-6;
      for (let k = 0; k < n; k++) peak = Math.max(peak, Math.abs(out[k]));
      const g = 0.9 / peak;
      for (let k = 0; k < n; k++) out[k] *= g;
      break;
    }
    default:
      for (let i = 0; i < n; i++) out[i] = rng.signed();
  }
  return out;
}

/**
 * A small library of long noise buffers. Voices take a random slice at a random
 * playback rate, which is what keeps automatic fire from sounding like a loop
 * while costing nothing at runtime.
 */
export class NoiseBank {
  constructor(actx, rng, seconds = 2.2) {
    this.actx = actx;
    this.buffers = {};
    for (const kind of ['white', 'pink', 'brown', 'crackle']) {
      const len = Math.max(1, Math.floor(actx.sampleRate * seconds));
      const buf = actx.createBuffer(2, len, actx.sampleRate);
      // Two decorrelated channels so wide beds get real stereo width.
      fillNoise(buf.getChannelData(0), kind, rng);
      fillNoise(buf.getChannelData(1), kind, rng);
      this.buffers[kind] = buf;
    }
  }

  /** A one-shot source reading from a random offset. Caller starts/stops it. */
  source(kind, rng, rate = 1, loop = false) {
    const src = this.actx.createBufferSource();
    const buf = this.buffers[kind] ?? this.buffers.white;
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.loop = loop;
    if (loop) {
      src.loopStart = 0;
      src.loopEnd = buf.duration;
    }
    src._offset = rng ? rng.range(0, buf.duration * 0.7) : 0;
    return src;
  }

  dispose() {
    this.buffers = {};
  }
}

/* ------------------------------------------------------------------ */
/* Envelopes                                                          */
/* ------------------------------------------------------------------ */

const FLOOR = 1e-4;

/**
 * Guard: eleven subsystems can reach audio, and one NaN position turns into a
 * non-finite schedule time that throws inside Web Audio. Envelopes refuse
 * garbage instead of taking the whole frame down with them.
 */
function ok(t0, peak) {
  return Number.isFinite(t0) && Number.isFinite(peak) && t0 >= 0;
}

/** Instant-attack exponential decay — the workhorse for transients. */
export function hit(param, t0, peak, decay) {
  if (!ok(t0, peak)) return t0;
  const p = Math.max(peak, FLOOR * 4);
  param.setValueAtTime(p, t0);
  param.exponentialRampToValueAtTime(FLOOR, t0 + decay);
  param.setValueAtTime(0, t0 + decay + 0.002);
  return t0 + decay + 0.002;
}

/** Attack/decay with an exponential contour on both halves. */
export function ad(param, t0, peak, attack, decay) {
  if (!ok(t0, peak)) return t0;
  const p = Math.max(peak, FLOOR * 4);
  param.setValueAtTime(FLOOR, t0);
  if (attack > 0.0008) param.exponentialRampToValueAtTime(p, t0 + attack);
  else param.setValueAtTime(p, t0 + 0.0004);
  param.exponentialRampToValueAtTime(FLOOR, t0 + attack + decay);
  param.setValueAtTime(0, t0 + attack + decay + 0.002);
  return t0 + attack + decay + 0.002;
}

/** Full ADSR for sustained material (voices, wind gusts). */
export function adsr(param, t0, peak, a, d, s, sustainLevel, r) {
  if (!ok(t0, peak)) return t0;
  const p = Math.max(peak, FLOOR * 4);
  const sl = Math.max(p * sustainLevel, FLOOR * 4);
  param.setValueAtTime(FLOOR, t0);
  param.exponentialRampToValueAtTime(p, t0 + a);
  param.exponentialRampToValueAtTime(sl, t0 + a + d);
  param.setValueAtTime(sl, t0 + a + d + s);
  param.exponentialRampToValueAtTime(FLOOR, t0 + a + d + s + r);
  param.setValueAtTime(0, t0 + a + d + s + r + 0.002);
  return t0 + a + d + s + r + 0.002;
}

/** Exponential parameter sweep, guarded against zero/negative targets. */
export function sweep(param, t0, from, to, dur) {
  if (!ok(t0, from) || !Number.isFinite(to) || !Number.isFinite(dur)) return t0;
  param.setValueAtTime(Math.max(from, 1e-3), t0);
  param.exponentialRampToValueAtTime(Math.max(to, 1e-3), t0 + Math.max(dur, 0.001));
  return t0 + dur;
}

/* ------------------------------------------------------------------ */
/* Nodes                                                              */
/* ------------------------------------------------------------------ */

export function biquad(actx, type, freq, Q = 0.7071, gainDb = 0) {
  const f = actx.createBiquadFilter();
  f.type = type;
  f.frequency.value = clamp(freq, 10, Math.min(20000, actx.sampleRate * 0.48));
  f.Q.value = Q;
  f.gain.value = gainDb;
  return f;
}

export function gain(actx, value = 1) {
  const g = actx.createGain();
  g.gain.value = value;
  return g;
}

export function osc(actx, type, freq, detune = 0) {
  const o = actx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

/** Connect a list of nodes head-to-tail; returns the last one. */
export function series(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/* ------------------------------------------------------------------ */
/* Waveshaping                                                        */
/* ------------------------------------------------------------------ */

const CURVE_CACHE = new Map();

/**
 * tanh-style saturation. `drive` 0 is nearly clean, 20 is aggressive.
 * `asym` adds even harmonics — that is what gives a muzzle blast its "chuff"
 * rather than a symmetric fuzz-pedal buzz.
 */
export function saturationCurve(drive = 4, asym = 0) {
  const key = `${drive.toFixed(2)}:${asym.toFixed(2)}`;
  let c = CURVE_CACHE.get(key);
  if (c) return c;
  const n = 2048;
  c = new Float32Array(n);
  const k = 1 + drive;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const xa = x + asym * x * x * (x < 0 ? -1 : 1) * 0.5;
    c[i] = Math.tanh(k * xa) / norm;
  }
  CURVE_CACHE.set(key, c);
  return c;
}

/** Hard-knee-free soft clip for the very last stage of the master bus. */
export function limiterCurve() {
  let c = CURVE_CACHE.get('__limit');
  if (c) return c;
  const n = 4096;
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // Cubic soft clip up to 0.66, then tanh — transparent below -6 dBFS.
    const a = Math.abs(x);
    let y;
    if (a < 0.66) y = x;
    else y = Math.sign(x) * (0.66 + (1 - 0.66) * Math.tanh((a - 0.66) / (1 - 0.66)));
    c[i] = y * 0.985;
  }
  CURVE_CACHE.set('__limit', c);
  return c;
}

export function shaper(actx, curve, oversample = '2x') {
  const w = actx.createWaveShaper();
  w.curve = curve;
  w.oversample = oversample;
  return w;
}

/* ------------------------------------------------------------------ */
/* Resonators                                                         */
/* ------------------------------------------------------------------ */

/**
 * Excite a bank of high-Q bandpasses with a short noise burst: the cheapest
 * convincing model of a struck metal/glass/wood object. Returns the sum node.
 * `partials` = [{ f, q, g, decay }]
 */
export function struckResonator(actx, bank, rng, t0, partials, exciteDur = 0.004, exciteKind = 'white') {
  const out = gain(actx, 1);
  const src = bank.source(exciteKind, rng, rng.range(0.85, 1.2));
  const exc = gain(actx, 0);
  hit(exc.gain, t0, 1, exciteDur);
  src.connect(exc);
  for (const p of partials) {
    const q = p.q ?? 22;
    const bp = biquad(actx, 'bandpass', p.f, q);
    const vg = gain(actx, 0);
    // A bandpass only passes f/Q of the excitation's bandwidth, so a high-Q
    // partial fed a 2 ms noise burst is ~20 dB quieter than a low-Q one. Without
    // this makeup every metallic sound in the game sits inaudibly low in the mix.
    hit(vg.gain, t0, (p.g ?? 0.5) * Math.sqrt(q) * 0.85, p.decay ?? 0.12);
    exc.connect(bp);
    bp.connect(vg);
    vg.connect(out);
  }
  src.start(t0, src._offset, exciteDur + 0.02);
  return out;
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

/** Semitone ratio — pitch jitter is expressed musically, not as a raw factor. */
export function semis(n) {
  return Math.pow(2, n / 12);
}

/** Air absorption: how much high end survives `dist` metres of atmosphere. */
export function airCutoff(dist) {
  // ~ -1.5 dB/100 m at 1 kHz, far more at 8 kHz. Tuned by ear against real
  // long-range gunfire recordings: 50 m still bright, 300 m is all boom.
  return clamp(20500 / (1 + dist * 0.055), 260, 20000);
}
