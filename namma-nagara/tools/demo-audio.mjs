#!/usr/bin/env node
/**
 * OFFLINE SOUNDTRACK — synthesizes a WAV from the recorded gameplay event log.
 *
 * Why not capture the game's own audio: `src/audio` synthesizes everything into a
 * live WebAudio graph on the wall clock, but the video is recorded in lockstep at
 * roughly 13 frames per second of real time with `time.scale` dipping to 0.28 for
 * slow motion. There is no wall-clock recording of that session which lines up
 * with the finished video — the two timebases are unrelated. What IS exact is the
 * event log: every round, impact, kill and explosion is stamped with the engine
 * frame it happened on, and one engine frame is exactly one video frame. So the
 * track is built from frame numbers, and every transient lands on the frame that
 * caused it.
 *
 * Everything is synthesized here with plain arithmetic: no samples, no external
 * assets, no dependencies — matching the project's rule that the game ships no
 * external audio.
 *
 * Usage:
 *   node tools/demo-audio.mjs --events=.tmp-demo/events.json --frames=1200 --out=track.wav
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const SR = 48000;
const FPS = Number(args.fps ?? 60);
const FRAMES = Number(args.frames ?? 1200);
const OUT = resolve(args.out ?? 'track.wav');
const events = JSON.parse(readFileSync(resolve(args.events), 'utf8'));

const TAIL = 1.2; // let the last explosion ring out
const N = Math.ceil((FRAMES / FPS + TAIL) * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

/* --------------------------------------------------------------- helpers --- */

/** Deterministic white noise — a plain LCG, so two runs produce one master. */
let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000 * 2 - 1;
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Mix a mono voice in at `t` seconds with equal-power panning.
 * `pan` is -1..1. Samples past the end of the buffer are dropped.
 */
function mix(t, len, pan, gen) {
  const i0 = Math.round(t * SR);
  const n = Math.round(len * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    const s = gen(i / SR, i / n);
    L[j] += s * gl;
    R[j] += s * gr;
  }
}

/** One-pole lowpass state factory, for coloured noise. */
function lp(cut) {
  const a = Math.exp((-2 * Math.PI * cut) / SR);
  let z = 0;
  return (x) => (z = x * (1 - a) + z * a);
}

/** Exponential decay envelope. */
const dec = (t, tau) => Math.exp(-t / tau);

/* ---------------------------------------------------------------- voices --- */

/**
 * Rifle report. Three layers, which is what makes a gunshot read as a gunshot:
 * a click transient for the mechanism, a body from filtered noise plus a
 * detuned low sine for the muzzle blast, and a long room tail.
 */
function shot(t, pan, dist, gain) {
  const near = clamp(1 - dist / 60, 0.12, 1);
  const g = gain * near;
  const f1 = lp(4200);
  const f2 = lp(900);
  mix(t, 0.28, pan, (s) => {
    const crack = f1(rand()) * dec(s, 0.011) * 1.5;
    const body = f2(rand()) * dec(s, 0.05) * 1.1;
    const thump = Math.sin(2 * Math.PI * 88 * s) * dec(s, 0.045) * 0.7;
    const mech = s < 0.004 ? rand() * 0.5 : 0;
    return (crack + body + thump + mech) * g * 0.5;
  });
  // Slap-back off the buildings. Distance-dependent, so the street has depth.
  const tail = lp(1500);
  mix(t + 0.055 + dist * 0.0009, 0.75, -pan * 0.6, (s) =>
    tail(rand()) * dec(s, 0.16) * g * 0.16
  );
}

/** Enemy fire: same shape, softer and duller — it is not at your ear. */
function distantShot(t, pan, dist) {
  const near = clamp(1 - dist / 70, 0.06, 1);
  const f = lp(1100 + 2200 * near);
  mix(t, 0.36, pan, (s) => {
    const body = f(rand()) * dec(s, 0.035) * 1.0;
    const thump = Math.sin(2 * Math.PI * 74 * s) * dec(s, 0.06) * 0.5;
    return (body + thump) * near * 0.34;
  });
  const tail = lp(900);
  mix(t + 0.07 + dist * 0.0012, 0.9, -pan * 0.5, (s) => tail(rand()) * dec(s, 0.22) * near * 0.14);
}

/** Bullet hitting a surface: a short bright tick plus surface-coloured grit. */
const SURFACE = {
  concrete: { cut: 5200, tau: 0.02, g: 1.0 },
  plaster: { cut: 4200, tau: 0.024, g: 0.9 },
  metal: { cut: 7200, tau: 0.05, g: 1.15, ring: 2400 },
  wood: { cut: 2600, tau: 0.03, g: 0.85 },
  dirt: { cut: 1400, tau: 0.035, g: 0.7 },
  sand: { cut: 1200, tau: 0.04, g: 0.6 },
  glass: { cut: 9000, tau: 0.06, g: 1.0, ring: 5200 },
  flesh: { cut: 900, tau: 0.02, g: 0.8 },
  fabric: { cut: 1100, tau: 0.02, g: 0.55 },
  foliage: { cut: 3000, tau: 0.03, g: 0.5 },
  water: { cut: 1800, tau: 0.05, g: 0.7 },
  rubber: { cut: 1300, tau: 0.025, g: 0.6 },
};

function impact(t, pan, dist, surface) {
  const s0 = SURFACE[surface] ?? SURFACE.concrete;
  const near = clamp(1 - dist / 45, 0.05, 1);
  const f = lp(s0.cut);
  mix(t, 0.18, pan, (s) => {
    let v = f(rand()) * dec(s, s0.tau);
    if (s0.ring) v += Math.sin(2 * Math.PI * s0.ring * s) * dec(s, s0.tau * 1.6) * 0.35;
    return v * s0.g * near * 0.28;
  });
}

/** Explosion: a hard crack, a body thump, a sub sweep, and a long debris tail. */
function boom(t, pan, dist, radius) {
  const near = clamp(1 - dist / 55, 0.18, 1);
  const f = lp(2400);
  mix(t, 1.6, pan, (s) => {
    const crack = f(rand()) * dec(s, 0.035) * 1.6;
    // Downward sub sweep, 120 -> 34 Hz: the chest hit.
    const sub = Math.sin(2 * Math.PI * (34 + 86 * dec(s, 0.11)) * s) * dec(s, 0.34) * 1.5;
    const body = Math.sin(2 * Math.PI * 62 * s) * dec(s, 0.16) * 0.8;
    return (crack + sub + body) * near * 0.55;
  });
  const rub = lp(1200);
  mix(t + 0.09, 1.7, -pan * 0.4, (s) => rub(rand()) * dec(s, 0.5) * near * 0.22);
  // Debris ticks scattered through the tail.
  for (let k = 0; k < 22; k++) {
    const dt = 0.16 + (k / 22) * 1.1 + rand() * 0.04;
    impact(t + dt, clamp(pan + rand() * 0.8, -1, 1), dist + 4, k % 3 === 0 ? 'metal' : 'concrete');
  }
  void radius;
}

/** Hitmarker: the confirmation click. Headshots get a brighter, higher one. */
function hitmarker(t, hs) {
  const f0 = hs ? 1760 : 1180;
  mix(t, 0.09, 0, (s) => {
    const a = Math.sin(2 * Math.PI * f0 * s) * dec(s, 0.016);
    const b = Math.sin(2 * Math.PI * f0 * 1.5 * s) * dec(s, 0.01) * 0.5;
    return (a + b) * (hs ? 0.2 : 0.13);
  });
}

/** Kill confirm: a short two-note rise, sitting under the hitmarker. */
function killChime(t) {
  mix(t, 0.5, 0, (s, u) => {
    const f = u < 0.35 ? 523.25 : 784;
    return Math.sin(2 * Math.PI * f * s) * dec(s, 0.19) * 0.075;
  });
}

/** Player being hit: a dull impact plus a brief tinnitus-ish tone. */
function hurt(t) {
  const f = lp(700);
  mix(t, 0.4, 0, (s) => f(rand()) * dec(s, 0.07) * 0.3);
  mix(t, 0.55, 0, (s) => Math.sin(2 * Math.PI * 2100 * s) * dec(s, 0.16) * 0.035);
}

/** Magazine out / in / bolt. */
function reload(t, phase) {
  const spec = {
    start: [2600, 0.012, 0.1],
    magout: [1500, 0.02, 0.16],
    magin: [1100, 0.03, 0.2],
    end: [3200, 0.02, 0.18],
  }[phase] ?? [1800, 0.02, 0.12];
  const f = lp(spec[0]);
  mix(t, 0.16, -0.12, (s) => f(rand()) * dec(s, spec[1]) * spec[2]);
  if (phase === 'magin' || phase === 'end') {
    mix(t + 0.012, 0.12, -0.1, (s) => Math.sin(2 * Math.PI * 320 * s) * dec(s, 0.03) * 0.09);
  }
}

/** Brass on stone. */
function shell(t, pan) {
  for (let k = 0; k < 3; k++) {
    const f = lp(6000);
    mix(t + k * 0.075 + Math.abs(rand()) * 0.03, 0.1, pan, (s) => {
      const ring = Math.sin(2 * Math.PI * (3200 + k * 900) * s) * dec(s, 0.03);
      return (ring + f(rand()) * 0.5) * dec(s, 0.02) * 0.055 * (1 - k * 0.28);
    });
  }
}

function footstep(t, running) {
  const f = lp(running ? 1600 : 1100);
  mix(t, 0.16, rand() * 0.4, (s) => f(rand()) * dec(s, running ? 0.035 : 0.05) * (running ? 0.1 : 0.055));
}

/* ------------------------------------------------------------------- bed --- */

/**
 * Score bed: a slow sub pulse on the beat, a held minor drone, and a noise
 * riser that tracks how much is happening on screen. It is not a tune — it is
 * the thing that keeps 20 seconds of gunfire from sounding like a test harness.
 */
function bed() {
  const dur = FRAMES / FPS;
  const bpm = 84;
  const beat = 60 / bpm;

  // Intensity envelope from event density: 1 s boxcar over shots and explosions.
  const bins = Math.ceil(dur) + 2;
  const density = new Float32Array(bins);
  for (const e of events) {
    const t = e.f / FPS;
    const w = e.name === 'boom' ? 6 : e.name === 'fire' ? 1 : e.name === 'ai:fire' ? 0.5 : 0;
    if (w) density[Math.min(bins - 1, Math.floor(t))] += w;
  }
  let peak = 1;
  for (const d of density) peak = Math.max(peak, d);
  const intensity = (t) => {
    const i = clamp(Math.floor(t), 0, bins - 1);
    const j = clamp(i + 1, 0, bins - 1);
    const u = t - Math.floor(t);
    return clamp(((density[i] * (1 - u) + density[j] * u) / peak) ** 0.6, 0, 1);
  };

  // Drone: D minor-ish stack, detuned, slowly beating against itself.
  const roots = [73.42, 110.0, 146.83, 174.61, 220.0];
  const drone = lp(2200);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fade = clamp(t / 2.2, 0, 1) * clamp((dur + TAIL - t) / 2.5, 0, 1);
    const inten = intensity(t);
    let v = 0;
    for (let k = 0; k < roots.length; k++) {
      const f = roots[k] * (1 + 0.0016 * Math.sin(2 * Math.PI * (0.07 + k * 0.031) * t));
      v += Math.sin(2 * Math.PI * f * t + k) * (k === 0 ? 0.5 : 0.16 / (1 + k * 0.5));
    }
    // Beat pulse, hardening as the fight intensifies.
    const ph = (t % beat) / beat;
    const pulse = Math.sin(2 * Math.PI * 48 * t) * dec(ph * beat, 0.09) * (0.22 + 0.5 * inten);
    // Air: filtered noise that rises with intensity.
    const air = drone(rand()) * (0.006 + 0.05 * inten);
    const s = (v * (0.11 + 0.1 * inten) + pulse + air) * fade * 0.5;
    L[i] += s;
    R[i] += s * 0.96; // a hair of width
  }
}

/* -------------------------------------------------------------- assemble --- */

bed();

let counts = {};
for (const e of events) {
  const t = e.f / FPS;
  counts[e.name] = (counts[e.name] ?? 0) + 1;
  // Deterministic pseudo-pan from the frame index: transients need to be spread
  // across the stereo field or a firefight collapses into a mono smear.
  const pan = Math.sin(e.f * 0.7331) * 0.55;
  switch (e.name) {
    case 'fire':
      shot(t, pan * 0.25, 0, 1);
      break;
    case 'ai:fire':
      distantShot(t, pan, e.d ?? 20);
      break;
    case 'impact':
      impact(t, pan, e.d ?? 15, e.surface);
      break;
    case 'boom':
      boom(t, pan * 0.4, e.d ?? 12, e.r ?? 8);
      break;
    case 'hit':
      hitmarker(t, !!e.hs);
      break;
    case 'kill':
      killChime(t);
      break;
    case 'hurt':
      hurt(t);
      break;
    case 'reload':
      reload(t, e.phase);
      break;
    case 'shell':
      shell(t, pan * 0.5 + 0.2);
      break;
    case 'step':
      footstep(t, !!e.run);
      break;
    case 'land':
      footstep(t, true);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------ master bus --- */

// Soft-knee limiter. A firefight stacks 20 voices on one frame; without this the
// explosions clip into buzz and everything else ducks under them.
let over = 0;
for (let i = 0; i < N; i++) {
  const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
  if (a > over) over = a;
}
const pre = over > 0 ? Math.min(1, 0.92 / over) : 1;
const soft = (x) => Math.tanh(x * 1.25) * 0.8;
for (let i = 0; i < N; i++) {
  L[i] = soft(L[i] * pre);
  R[i] = soft(R[i] * pre);
}

/* -------------------------------------------------------------- wav out --- */

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(2, 22); // stereo
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); // byte rate
buf.writeUInt16LE(4, 32); // block align
buf.writeUInt16LE(16, 34); // bits
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4);
}
writeFileSync(OUT, buf);

console.log(
  `[audio] ${(N / SR).toFixed(2)}s stereo @${SR} -> ${OUT}  ` +
    `peak ${over.toFixed(2)} (pre-gain ${pre.toFixed(2)})`
);
console.log(
  '[audio] voices: ' +
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
);
