/**
 * The ensemble, synthesised in the browser: no samples, nothing to license
 * or download.
 *
 *  - Drums are struck membranes: a few sine partials with a pitch envelope
 *    (the bayan's rising ghe, the dhol's thump) over a filtered noise
 *    attack. Each drum is a table of bols, so a composition writes
 *    "dha ge na ti" and gets the strokes.
 *  - Plucked strings (tumbi, dotara, veena, santoor, the tanpura) are
 *    Karplus–Strong: a noise burst circulating in a tuned delay line,
 *    rendered once per pitch into a buffer. A little saturation in the loop
 *    gives the tanpura its jawari buzz.
 *  - Reeds, flute, harmonium and sarangi are held voices: an oscillator
 *    through vocal-tract formants, with vibrato, meend (slides) and gamaka
 *    (oscillations) written as automation.
 *  - The modern low end: a kick and a sub-bass, dry and centred.
 */

import { swaraHz, type Swara } from "./theory";

export type Ctx = BaseAudioContext;

/* ---------------- plumbing ---------------- */

export type Channel = { input: GainNode; dispose(): void };

/** An instrument's strip: level, pan, and a send to the room. */
export function channel(ctx: Ctx, dry: AudioNode, wet: AudioNode, o: { level?: number; pan?: number; send?: number }): Channel {
  const input = ctx.createGain();
  input.gain.value = o.level ?? 1;
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan ?? 0;
  const send = ctx.createGain();
  send.gain.value = o.send ?? 0.2;
  input.connect(pan);
  pan.connect(dry);
  pan.connect(send);
  send.connect(wet);
  return {
    input,
    dispose() {
      input.disconnect();
      pan.disconnect();
      send.disconnect();
    },
  };
}

const noiseCache = new WeakMap<Ctx, AudioBuffer>();
function noise(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, b);
  }
  return b;
}

/** A burst of filtered noise: a drum's slap, a clap, a breath. */
function noiseHit(ctx: Ctx, out: AudioNode, t: number, hz: number, q: number, gain: number, decay: number, type: BiquadFilterType = "bandpass") {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  // A random stretch of the buffer, so repeated strokes aren't identical.
  src.start(t, (hz * 7.31 + t * 13.7) % 1.5);
  src.stop(t + decay + 0.02);
}

/* ---------------- membranes ---------------- */

type Partial = { r: number; g: number; d: number };
export type Membrane = {
  hz: number;
  /** Pitch at the end of `glide` seconds, as a ratio of `hz` (>1 rises, like the bayan's ghe). */
  to?: number;
  glide?: number;
  partials: Partial[];
  noise?: { hz: number; q: number; g: number; d: number };
};

function strike(ctx: Ctx, out: AudioNode, t: number, m: Membrane, vel: number) {
  for (const p of m.partials) {
    const o = ctx.createOscillator();
    o.type = "sine";
    const f0 = m.hz * p.r;
    o.frequency.setValueAtTime(f0, t);
    if (m.to && m.glide) o.frequency.exponentialRampToValueAtTime(f0 * m.to, t + m.glide);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.g * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.d);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + p.d + 0.02);
  }
  if (m.noise) noiseHit(ctx, out, t, m.noise.hz, m.noise.q, m.noise.g * vel, m.noise.d);
}

/** A drum as bols: each bol is one or more strokes on its heads. */
export type Kit = (ctx: Ctx, out: AudioNode, t: number, bol: string, vel: number) => void;

function kit(table: Record<string, (sa: number) => Membrane[]>, extra?: Record<string, (ctx: Ctx, out: AudioNode, t: number, vel: number) => void>) {
  return (sa: number): Kit =>
    (ctx, out, t, bol, vel) => {
      const custom = extra?.[bol];
      if (custom) return custom(ctx, out, t, vel);
      const strokes = table[bol];
      if (!strokes) throw new Error(`no bol "${bol}"`);
      for (const m of strokes(sa)) strike(ctx, out, t, m, vel);
    };
}

// Tabla: the dayan tuned to Sa, the bayan below with its rising ghe.
const na = (sa: number): Membrane => ({
  hz: sa * 2,
  partials: [
    { r: 1, g: 0.5, d: 0.55 },
    { r: 2, g: 0.28, d: 0.35 },
    { r: 3, g: 0.14, d: 0.22 },
    { r: 4.1, g: 0.07, d: 0.15 },
  ],
  noise: { hz: 3200, q: 1.1, g: 0.22, d: 0.025 },
});
const tin = (sa: number): Membrane => ({ hz: sa * 2, partials: [{ r: 1, g: 0.32, d: 0.4 }, { r: 2, g: 0.12, d: 0.25 }], noise: { hz: 2600, q: 1, g: 0.1, d: 0.02 } });
const te = (sa: number): Membrane => ({ hz: sa * 2, partials: [{ r: 1, g: 0.18, d: 0.06 }], noise: { hz: 2400, q: 0.9, g: 0.3, d: 0.035 } });
const ge = (): Membrane => ({ hz: 88, to: 1.28, glide: 0.18, partials: [{ r: 1, g: 0.9, d: 0.5 }, { r: 2.02, g: 0.12, d: 0.2 }], noise: { hz: 320, q: 1, g: 0.12, d: 0.03 } });
const ke = (): Membrane => ({ hz: 130, partials: [{ r: 1, g: 0.35, d: 0.06 }], noise: { hz: 900, q: 0.8, g: 0.45, d: 0.045 } });

export const TABLA = kit({
  na: (s) => [na(s)],
  ta: (s) => [na(s)],
  tin: (s) => [tin(s)],
  ti: (s) => [te(s)],
  te: (s) => [te(s)],
  re: (s) => [te(s)],
  tun: (s) => [{ hz: s * 2, partials: [{ r: 1, g: 0.5, d: 0.9 }] }],
  ge: () => [ge()],
  ghe: () => [ge()],
  ke: () => [ke()],
  ka: () => [ke()],
  dha: (s) => [na(s), ge()],
  dhi: (s) => [tin(s), ge()],
  dhin: (s) => [tin(s), ge()],
});

// Dhol: the dagga's boom on the bass head, the tihli's crack on the treble.
const dagga = (): Membrane => ({ hz: 72, to: 0.78, glide: 0.1, partials: [{ r: 1, g: 1, d: 0.42 }, { r: 1.58, g: 0.25, d: 0.2 }], noise: { hz: 220, q: 0.9, g: 0.35, d: 0.05 } });
const tihli = (): Membrane => ({ hz: 430, partials: [{ r: 1, g: 0.22, d: 0.08 }, { r: 1.7, g: 0.1, d: 0.05 }], noise: { hz: 3600, q: 1.3, g: 0.55, d: 0.045 } });
export const DHOL = kit({
  D: () => [dagga()],
  dha: () => [dagga(), tihli()],
  t: () => [tihli()],
  ta: () => [tihli()],
  g: () => [{ ...dagga(), partials: [{ r: 1, g: 0.35, d: 0.25 }] }],
});

// Dholki: smaller and higher, the lavani and qawwali drum.
export const DHOLKI = kit({
  dha: (s) => [{ hz: 118, to: 0.85, glide: 0.08, partials: [{ r: 1, g: 0.75, d: 0.3 }] }, { ...na(s), hz: s * 2.4 }],
  na: (s) => [{ ...na(s), hz: s * 2.4 }],
  ti: (s) => [{ ...te(s), hz: s * 2.4 }],
  ta: (s) => [{ ...te(s), hz: s * 2.4 }],
  ge: () => [{ hz: 115, to: 1.15, glide: 0.12, partials: [{ r: 1, g: 0.75, d: 0.32 }] }],
  ke: () => [ke()],
});

// Mridangam: the valanthalai rings at Sa; the thoppi thuds without a bend.
const thoppi = (): Membrane => ({ hz: 105, partials: [{ r: 1, g: 0.8, d: 0.3 }, { r: 1.9, g: 0.15, d: 0.12 }], noise: { hz: 400, q: 1, g: 0.2, d: 0.03 } });
export const MRIDANGAM = kit({
  tha: () => [thoppi()],
  nam: (s) => [na(s)],
  dhi: (s) => [tin(s)],
  ta: (s) => [te(s)],
  ka: () => [ke()],
  ki: (s) => [te(s)],
  mi: (s) => [{ ...tin(s), partials: [{ r: 1, g: 0.2, d: 0.2 }] }],
  thom: (s) => [thoppi(), na(s)],
  dhom: (s) => [thoppi(), tin(s)],
});

// Thavil: the nadaswaram's drum, a thick right head and a stick that cracks.
export const THAVIL = kit({
  tha: () => [{ hz: 165, to: 0.85, glide: 0.06, partials: [{ r: 1, g: 0.8, d: 0.28 }, { r: 2.3, g: 0.2, d: 0.1 }], noise: { hz: 600, q: 1, g: 0.3, d: 0.04 } }],
  dhi: () => [{ hz: 240, partials: [{ r: 1, g: 0.5, d: 0.35 }, { r: 2, g: 0.15, d: 0.2 }] }],
  ki: () => [{ hz: 920, partials: [{ r: 1, g: 0.25, d: 0.05 }], noise: { hz: 2800, q: 1.4, g: 0.8, d: 0.04 } }],
  ta: () => [{ hz: 820, partials: [{ r: 1, g: 0.18, d: 0.04 }], noise: { hz: 2500, q: 1.3, g: 0.6, d: 0.035 } }],
});

// Chenda: sticks on a tight goat-skin head, sharp enough to cut a temple crowd.
export const CHENDA = kit({
  ta: () => [{ hz: 640, partials: [{ r: 1, g: 0.3, d: 0.12 }, { r: 1.52, g: 0.12, d: 0.07 }], noise: { hz: 1900, q: 1.1, g: 0.75, d: 0.06 } }],
  ti: () => [{ hz: 640, partials: [{ r: 1, g: 0.15, d: 0.08 }], noise: { hz: 2100, q: 1.2, g: 0.4, d: 0.04 } }],
  tha: () => [{ hz: 95, to: 0.8, glide: 0.08, partials: [{ r: 1, g: 0.8, d: 0.35 }], noise: { hz: 260, q: 1, g: 0.3, d: 0.05 } }],
});

// Mardala: Odissi's barrel drum, a deep dough-loaded left head.
export const MARDALA = kit({
  dha: (s) => [{ hz: 78, partials: [{ r: 1, g: 0.85, d: 0.45 }] }, { ...na(s), hz: s * 1.5 }],
  ta: (s) => [{ ...na(s), hz: s * 1.5 }],
  tin: (s) => [{ ...tin(s), hz: s * 1.5 }],
  na: (s) => [{ ...te(s), hz: s * 1.5 }],
  ghe: () => [{ hz: 78, to: 1.1, glide: 0.2, partials: [{ r: 1, g: 0.85, d: 0.5 }] }],
  ke: () => [ke()],
});

// Dollu: Karnataka's big barrel drums, hit together.
export const DOLLU = kit({
  D: () => [{ hz: 62, to: 0.8, glide: 0.12, partials: [{ r: 1, g: 1, d: 0.55 }, { r: 1.5, g: 0.3, d: 0.25 }], noise: { hz: 180, q: 0.8, g: 0.5, d: 0.07 } }],
  t: () => [{ hz: 300, partials: [{ r: 1, g: 0.3, d: 0.1 }], noise: { hz: 1500, q: 1, g: 0.5, d: 0.05 } }],
});

/** Metal, wood and hands. */
function inharmonic(ctx: Ctx, out: AudioNode, t: number, hzs: number[], g: number, d: number) {
  hzs.forEach((hz, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(g / (1 + i * 0.6), t + 0.002);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + d / (1 + i * 0.25));
    o.connect(gg);
    gg.connect(out);
    o.start(t);
    o.stop(t + d + 0.05);
  });
}

export const PERC = kit(
  {},
  {
    // Manjira: small bronze cymbals, a bright ringing "ching".
    m: (ctx, out, t, v) => {
      inharmonic(ctx, out, t, [2130, 3350, 5170, 6820], 0.35 * v, 1.1);
      noiseHit(ctx, out, t, 7000, 0.7, 0.3 * v, 0.02, "highpass");
    },
    // Ilathalam: Kerala's heavier cymbals.
    i: (ctx, out, t, v) => {
      inharmonic(ctx, out, t, [1640, 2870, 4110, 5330], 0.4 * v, 0.9);
      noiseHit(ctx, out, t, 5000, 0.6, 0.5 * v, 0.05, "highpass");
    },
    // Chimta: fire-tongs with jingles, bhangra's shimmer.
    j: (ctx, out, t, v) => {
      for (let k = 0; k < 3; k++) inharmonic(ctx, out, t + k * 0.012, [4100 + k * 610, 6200 - k * 330], 0.26 * v, 0.18);
      noiseHit(ctx, out, t, 6500, 0.8, 0.6 * v, 0.06, "highpass");
    },
    // Ghungroo: ankle bells, a shaken hiss of tiny jingles.
    s: (ctx, out, t, v) => {
      for (let k = 0; k < 4; k++) noiseHit(ctx, out, t + k * 0.009, 7500, 1.2, 0.22 * v, 0.05, "highpass");
    },
    // Temple bell: long, inharmonic, swinging.
    b: (ctx, out, t, v) => inharmonic(ctx, out, t, [262, 523, 619, 788, 1046, 1316], 0.35 * v, 4),
    // Clap: a group's hands, a few palms a few milliseconds apart.
    c: (ctx, out, t, v) => {
      for (const [dt, g] of [[0, 1], [0.008, 0.7], [0.017, 0.8], [0.026, 0.4]]) noiseHit(ctx, out, t + dt, 1400, 0.9, 3.6 * g * v, 0.04);
    },
    // Dandiya: two sticks clacked together.
    k: (ctx, out, t, v) => {
      noiseHit(ctx, out, t, 2600, 3, 1.6 * v, 0.03);
      inharmonic(ctx, out, t, [1180, 2460], 0.3 * v, 0.05);
    },
    // Tasha: the procession's snare, rolled.
    r: (ctx, out, t, v) => {
      noiseHit(ctx, out, t, 2300, 0.7, 1 * v, 0.07);
      inharmonic(ctx, out, t, [330], 0.3 * v, 0.05);
    },
    // Khamak: a plucked drum string, squeezed so it bends down ("gub").
    g: (ctx, out, t, v) => strike(ctx, out, t, { hz: 190, to: 0.62, glide: 0.18, partials: [{ r: 1, g: 1, d: 0.3 }, { r: 2, g: 0.4, d: 0.2 }], noise: { hz: 1200, q: 1, g: 0.3, d: 0.02 } }, v),
    G: (ctx, out, t, v) => strike(ctx, out, t, { hz: 150, to: 1.35, glide: 0.15, partials: [{ r: 1, g: 1, d: 0.3 }, { r: 2, g: 0.4, d: 0.2 }] }, v),
  }
);

/** The modern low end: a kick, felt more than heard. */
export const KICK = kit(
  {},
  {
    K: (ctx, out, t, v) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.95 * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.5);
      noiseHit(ctx, out, t, 3000, 1, 0.12 * v, 0.006);
    },
    k: (ctx, out, t, v) => KICK(0)(ctx, out, t, "K", v * 0.55),
  }
);

/** Each kit's level against the rest, from measured stems. */
export const KIT_GAIN: Record<string, number> = { tabla: 1.9, dhol: 2.1, dholki: 2, mridangam: 2, thavil: 4.2, chenda: 1.8, mardala: 1.8, dollu: 1.5, perc: 1, kick: 1.2 };

export const KITS = { tabla: TABLA, dhol: DHOL, dholki: DHOLKI, mridangam: MRIDANGAM, thavil: THAVIL, chenda: CHENDA, mardala: MARDALA, dollu: DOLLU, perc: PERC, kick: KICK };
export type KitName = keyof typeof KITS;

/** Every bol each kit knows, for checking compositions. */
export const KIT_BOLS: Record<KitName, string[]> = {
  tabla: ["na", "ta", "tin", "ti", "te", "re", "tun", "ge", "ghe", "ke", "ka", "dha", "dhi", "dhin"],
  dhol: ["D", "dha", "t", "ta", "g"],
  dholki: ["dha", "na", "ti", "ta", "ge", "ke"],
  mridangam: ["tha", "nam", "dhi", "ta", "ka", "ki", "mi", "thom", "dhom"],
  thavil: ["tha", "dhi", "ki", "ta"],
  chenda: ["ta", "ti", "tha"],
  mardala: ["dha", "ta", "tin", "na", "ghe", "ke"],
  dollu: ["D", "t"],
  perc: ["m", "i", "j", "s", "b", "c", "k", "r", "g", "G"],
  kick: ["K", "k"],
};

/* ---------------- plucked strings ---------------- */

export type PluckPreset = { bright: number; damp: number; seconds: number; buzz: number; doubled?: number; gain: number };

export const PLUCKS = {
  // Tumbi: one high steel string, bright and short, bhangra's hook.
  tumbi: { bright: 0.92, damp: 0.991, seconds: 0.9, buzz: 0.25, gain: 2.2 },
  // Dotara and ektara: Baul's gut-and-metal strings.
  dotara: { bright: 0.6, damp: 0.995, seconds: 1.4, buzz: 0.12, gain: 1.4 },
  ektara: { bright: 0.55, damp: 0.994, seconds: 1.2, buzz: 0.3, gain: 1.4 },
  // Veena: warm, long, for gamakas.
  veena: { bright: 0.45, damp: 0.9985, seconds: 2.4, buzz: 0.1, gain: 1.4 },
  // Santoor: hammered, doubled strings a hair apart.
  santoor: { bright: 0.85, damp: 0.9975, seconds: 1.8, buzz: 0, doubled: 1.003, gain: 1.4 },
  // Tuntuna: lavani's one-string drone-rhythm.
  tuntuna: { bright: 0.7, damp: 0.992, seconds: 0.7, buzz: 0.22, gain: 1.4 },
  // Tanpura: long, with the jawari's buzz.
  tanpura: { bright: 0.5, damp: 0.9996, seconds: 5, buzz: 0.55, gain: 1.75 },
} satisfies Record<string, PluckPreset>;
export type PluckName = keyof typeof PLUCKS;

/**
 * Karplus–Strong: a noise burst (brightness sets how filtered) circulating
 * in a delay line of one period, averaged and damped each pass. `buzz`
 * saturates the loop a little, the jawari's rattle. Pure, so testable.
 */
export function karplus(sampleRate: number, hz: number, p: PluckPreset): Float32Array<ArrayBuffer> {
  const n = Math.floor(sampleRate * p.seconds);
  const out = new Float32Array(new ArrayBuffer(n * 4));
  // The loop averages the samples L and L-1 back (a delay of L - 0.5); an
  // allpass makes up the fractional rest, so every note is in tune.
  const period = sampleRate / hz + 0.5;
  let L = Math.floor(period);
  let frac = period - L;
  if (frac < 0.1) {
    L -= 1;
    frac += 1;
  }
  L = Math.max(2, L);
  const C = (1 - frac) / (1 + frac);
  const line = new Float32Array(L);
  let seed = Math.floor(hz * 1000) | 1;
  let prev = 0;
  for (let i = 0; i < L; i++) {
    seed = (seed * 16807) % 2147483647;
    const w = (seed / 2147483647) * 2 - 1;
    // One-pole lowpass on the excitation: brightness.
    prev = prev + p.bright * (w - prev);
    line[i] = prev;
  }
  let idx = 0;
  let apX = 0;
  let apY = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = line[idx];
    const avg = p.damp * 0.5 * (a + line[(idx + 1) % L]);
    const ap = C * avg + apX - C * apY;
    apX = avg;
    apY = ap;
    // Buzz: a gain-neutral soft clip, harmonics without feedback growth.
    const y = p.buzz ? (1 - p.buzz) * ap + p.buzz * 0.5 * Math.tanh(2 * ap) : ap;
    line[idx] = y;
    out[i] = a;
    peak = Math.max(peak, Math.abs(a));
    idx = (idx + 1) % L;
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
  // Fade the tail so a cut buffer doesn't click.
  const fade = Math.min(n, Math.floor(sampleRate * 0.05));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

const pluckCache = new WeakMap<Ctx, Map<string, AudioBuffer>>();
function pluckBuffer(ctx: Ctx, name: PluckName, hz: number): AudioBuffer {
  let m = pluckCache.get(ctx);
  if (!m) pluckCache.set(ctx, (m = new Map()));
  const key = `${name}:${hz.toFixed(2)}`;
  let b = m.get(key);
  if (!b) {
    const data = karplus(ctx.sampleRate, hz, PLUCKS[name]);
    b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel(data, 0);
    m.set(key, b);
  }
  return b;
}

/* ---------------- voices ---------------- */

export type NoteOpts = { hz: number; dur: number; vel: number; slideFrom?: number; gamaka?: boolean; upHz?: number };
export type Voice = { note(t: number, n: NoteOpts): void; dispose(t: number): void };

export function pluck(ctx: Ctx, out: AudioNode, name: PluckName): Voice {
  const p: PluckPreset = PLUCKS[name];
  return {
    note(t, n) {
      const strings = p.doubled ? [1, p.doubled] : [1];
      for (const d of strings) {
        const src = ctx.createBufferSource();
        src.buffer = pluckBuffer(ctx, name, n.hz * d);
        const g = ctx.createGain();
        g.gain.value = (n.vel * p.gain) / strings.length;
        const rate = src.playbackRate;
        if (n.slideFrom) {
          rate.setValueAtTime(n.slideFrom / n.hz, t);
          rate.exponentialRampToValueAtTime(1, t + Math.min(0.22, n.dur * 0.6));
        }
        if (n.gamaka && n.upHz) {
          const up = n.upHz / n.hz;
          const period = 0.16;
          for (let k = 0; k * period < n.dur; k++) rate.setTargetAtTime(k % 2 ? 1 : up, t + k * period * 0.5 + 0.04, period / 6);
          rate.setTargetAtTime(1, t + n.dur * 0.9, 0.02);
        }
        src.connect(g);
        g.connect(out);
        src.start(t);
      }
    },
    dispose() {},
  };
}

export type HeldPreset = {
  waves: { type: OscillatorType; ratio: number; gain: number; detune?: number }[];
  formants: [number, number, number][];
  lowpass: number;
  attack: number;
  release: number;
  vibrato: [number, number];
  breath?: number;
  /** A harmonium's reeds can't bend: slides and gamakas are played straight. */
  fixed?: boolean;
  tremolo?: [number, number];
  level: number;
};

export const HELD = {
  shehnai: {
    waves: [{ type: "sawtooth", ratio: 1, gain: 0.7 }, { type: "square", ratio: 1, gain: 0.3, detune: 4 }],
    formants: [[900, 4, 1], [1850, 5, 0.8], [3200, 6, 0.5]],
    lowpass: 5200, attack: 0.03, release: 0.07, vibrato: [5.8, 0.007], breath: 0.03, level: 0.5,
  },
  nadaswaram: {
    waves: [{ type: "sawtooth", ratio: 1, gain: 0.8 }, { type: "square", ratio: 1, gain: 0.35, detune: -3 }],
    formants: [[720, 3.5, 1], [1500, 4.5, 0.9], [2900, 5, 0.6]],
    lowpass: 6200, attack: 0.03, release: 0.08, vibrato: [5.2, 0.01], breath: 0.03, level: 0.5,
  },
  kuzhal: {
    waves: [{ type: "sawtooth", ratio: 1, gain: 0.8 }, { type: "square", ratio: 1, gain: 0.3, detune: 5 }],
    formants: [[1000, 4, 1], [2200, 5, 0.8], [3600, 6, 0.5]],
    lowpass: 6500, attack: 0.025, release: 0.06, vibrato: [6, 0.008], breath: 0.04, level: 0.45,
  },
  kombu: {
    waves: [{ type: "sawtooth", ratio: 1, gain: 1 }],
    formants: [[520, 3, 1], [1150, 4, 0.6], [2400, 4, 0.3]],
    lowpass: 2600, attack: 0.12, release: 0.3, vibrato: [4.5, 0.004], level: 0.45,
  },
  sarangi: {
    waves: [{ type: "sawtooth", ratio: 1, gain: 1 }, { type: "sawtooth", ratio: 1, gain: 0.4, detune: 7 }],
    formants: [[620, 3, 1], [1350, 4, 0.8], [2700, 5, 0.45]],
    lowpass: 4200, attack: 0.09, release: 0.16, vibrato: [6.2, 0.009], breath: 0.015, level: 0.6,
  },
  bansuri: {
    waves: [{ type: "sine", ratio: 1, gain: 0.8 }, { type: "triangle", ratio: 2, gain: 0.12 }],
    formants: [],
    lowpass: 3600, attack: 0.06, release: 0.12, vibrato: [5, 0.005], breath: 0.12, level: 0.6,
  },
  harmonium: {
    waves: [
      { type: "sawtooth", ratio: 1, gain: 0.5, detune: -5 },
      { type: "sawtooth", ratio: 1, gain: 0.5, detune: 5 },
      { type: "square", ratio: 2, gain: 0.22 },
    ],
    formants: [],
    lowpass: 2400, attack: 0.02, release: 0.05, vibrato: [0, 0], fixed: true, tremolo: [4.6, 0.07], level: 0.67,
  },
} satisfies Record<string, HeldPreset>;
export type HeldName = keyof typeof HELD;

/**
 * A held, monophonic voice: oscillators always running, shaped by a VCA
 * and pitch automation, so a slide or a gamaka is one continuous sound.
 */
export function held(ctx: Ctx, out: AudioNode, name: HeldName): Voice {
  const p: HeldPreset = HELD[name];
  const vca = ctx.createGain();
  vca.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = p.lowpass;
  const mix = ctx.createGain();
  mix.gain.value = 1;
  // Formants in parallel over a little of the dry source.
  if (p.formants.length) {
    const dry = ctx.createGain();
    dry.gain.value = 0.25;
    mix.connect(dry);
    dry.connect(lp);
    for (const [hz, q, g] of p.formants) {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = hz;
      f.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = g * 1.6;
      mix.connect(f);
      f.connect(fg);
      fg.connect(lp);
    }
  } else {
    mix.connect(lp);
  }
  lp.connect(vca);
  // The bellows' tremolo rides after the gate, so it never leaks between notes.
  const swell = ctx.createGain();
  swell.gain.value = 1;
  vca.connect(swell);
  swell.connect(out);

  const oscs = p.waves.map((w) => {
    const o = ctx.createOscillator();
    o.type = w.type;
    o.detune.value = w.detune ?? 0;
    const g = ctx.createGain();
    g.gain.value = w.gain;
    o.connect(g);
    g.connect(mix);
    return { o, ratio: w.ratio };
  });
  // Vibrato: one LFO into every oscillator's pitch (depth set per note).
  const lfo = ctx.createOscillator();
  lfo.frequency.value = p.vibrato[0] || 5;
  const depths = oscs.map(({ o }) => {
    const d = ctx.createGain();
    d.gain.value = 0;
    lfo.connect(d);
    d.connect(o.frequency);
    return d;
  });
  let trem: GainNode | null = null;
  let tremLfo: OscillatorNode | null = null;
  if (p.tremolo) {
    tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = p.tremolo[0];
    trem = ctx.createGain();
    trem.gain.value = p.tremolo[1];
    tremLfo.connect(trem);
    trem.connect(swell.gain);
  }
  // Breath: noise near the upper formant, riding the VCA.
  let breathSrc: AudioBufferSourceNode | null = null;
  if (p.breath) {
    breathSrc = ctx.createBufferSource();
    breathSrc.buffer = noise(ctx);
    breathSrc.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = name === "bansuri" ? 2600 : 3000;
    bf.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.value = p.breath;
    breathSrc.connect(bf);
    bf.connect(bg);
    bg.connect(vca);
  }
  const t0 = ctx.currentTime;
  for (const { o } of oscs) o.start(t0);
  lfo.start(t0);
  tremLfo?.start(t0);
  breathSrc?.start(t0);

  return {
    note(t, n) {
      const slide = !p.fixed && n.slideFrom;
      oscs.forEach(({ o, ratio }, i) => {
        const f = o.frequency;
        const hz = n.hz * ratio;
        if (slide) {
          f.setValueAtTime(n.slideFrom! * ratio, t);
          f.exponentialRampToValueAtTime(hz, t + Math.min(0.25, n.dur * 0.5));
        } else {
          f.setTargetAtTime(hz, t, p.fixed ? 0.003 : 0.012);
        }
        if (n.gamaka && !p.fixed && n.upHz) {
          const up = n.upHz * ratio;
          const period = 0.17;
          for (let k = 1; k * period * 0.5 < n.dur * 0.85; k++) f.setTargetAtTime(k % 2 ? up : hz, t + k * period * 0.5, period / 5);
          f.setTargetAtTime(hz, t + n.dur * 0.88, 0.02);
        }
        // Vibrato blooms after the note has settled.
        const depth = depths[i].gain;
        const amount = p.vibrato[1] * hz;
        depth.setTargetAtTime(0, t, 0.02);
        if (amount > 0 && n.dur > 0.3) depth.setTargetAtTime(amount, t + Math.min(0.25, n.dur * 0.4), 0.12);
      });
      const level = p.level * n.vel;
      vca.gain.setTargetAtTime(level, t, p.attack / 3);
      vca.gain.setTargetAtTime(0, t + n.dur - Math.min(0.03, n.dur * 0.2), p.release / 3);
    },
    dispose(t) {
      vca.gain.setTargetAtTime(0, t, 0.1);
      const end = t + 1;
      for (const { o } of oscs) o.stop(end);
      lfo.stop(end);
      tremLfo?.stop(end);
      breathSrc?.stop(end);
    },
  };
}

/** Sub-bass: a sine and its octave, warm and centred, under everything. */
export function sub(ctx: Ctx, out: AudioNode): Voice {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6);
  }
  shaper.curve = curve;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 230;
  shaper.connect(lp);
  lp.connect(out);
  return {
    note(t, n) {
      for (const [type, ratio, g] of [["sine", 1, 0.28], ["triangle", 2, 0.07]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime((n.slideFrom ?? n.hz) * ratio, t);
        if (n.slideFrom) o.frequency.exponentialRampToValueAtTime(n.hz * ratio, t + 0.12);
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(g * n.vel, t + 0.012);
        vg.gain.setTargetAtTime(g * n.vel * 0.7, t + 0.05, 0.2);
        vg.gain.setTargetAtTime(0, t + Math.max(0.06, n.dur - 0.05), 0.03);
        o.connect(vg);
        vg.connect(shaper);
        o.start(t);
        o.stop(t + n.dur + 0.3);
      }
    },
    dispose() {},
  };
}

/* ---------------- drones ---------------- */

export type Drone = { cycle(t: number, len: number): void; dispose(t: number): void };

/** Tanpura: Pa, Sa', Sa', Sa, round and round, the raga's ground. */
export function tanpura(ctx: Ctx, out: AudioNode, saHz: number, fifth: Swara = "P"): Drone {
  const v = pluck(ctx, out, "tanpura");
  const notes: [Swara, number][] = [[fifth, -1], ["S", 0], ["S", 0], ["S", -1]];
  return {
    cycle(t, len) {
      // Four plucks a cycle, whatever the tala, as a player keeps their own pace.
      const gap = len / 4;
      notes.forEach(([s, o], k) => v.note(t + k * gap, { hz: swaraHz(saHz, s, o), dur: gap * 4, vel: k === 3 ? 0.9 : 0.7 }));
    },
    dispose() {},
  };
}

/** Sruti box: a reed drone on Sa and Pa, held. */
export function sruti(ctx: Ctx, out: AudioNode, saHz: number): Drone {
  const g = ctx.createGain();
  g.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1300;
  g.connect(lp);
  lp.connect(out);
  const oscs = [saHz / 2, (saHz * 3) / 4, saHz].map((hz, i) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz;
    o.detune.value = [-2, 1, 3][i];
    const og = ctx.createGain();
    og.gain.value = [0.35, 0.22, 0.2][i];
    o.connect(og);
    og.connect(g);
    return o;
  });
  let started = false;
  return {
    cycle(t) {
      if (started) return;
      started = true;
      for (const o of oscs) o.start(t);
      g.gain.setTargetAtTime(0.55, t, 0.8);
    },
    dispose(t) {
      g.gain.setTargetAtTime(0, t, 0.2);
      if (started) for (const o of oscs) o.stop(t + 1.2);
    },
  };
}

/* ---------------- rooms ---------------- */

export type Space = "room" | "hall" | "temple" | "open";

/** A generated impulse response: decaying stereo noise, darker as it goes. */
export function impulse(ctx: Ctx, space: Space): AudioBuffer {
  const secs = { room: 0.9, hall: 1.8, temple: 3.2, open: 1.2 }[space];
  const damp = { room: 0.35, hall: 0.25, temple: 0.18, open: 0.45 }[space];
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  let seed = 99991;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      seed = (seed * 16807 + ch) % 2147483647;
      const w = (seed / 2147483647) * 2 - 1;
      const x = i / n;
      // The tail loses its highs faster than its lows.
      const a = Math.max(0.02, 1 - damp - x * 0.7);
      lp += a * (w - lp);
      d[i] = lp * Math.pow(1 - x, 2.2) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
  }
  return b;
}
