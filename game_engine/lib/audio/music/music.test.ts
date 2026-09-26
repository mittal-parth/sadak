import test from "node:test";
import assert from "node:assert/strict";
import { COMPOSITIONS, DISTRICT_MUSIC } from "./cities";
import { karplus, KIT_BOLS, PLUCKS } from "./instruments";
import { chimeNotes } from "./chime";
import { parsePattern, parsePhrase, stepsPerCycle, SWARA_RATIO } from "./theory";
import { SEED_DISTRICTS } from "../../game/districts";

test("the notation: holds, rests, splits, octaves, meend and gamaka", () => {
  const p = parsePhrase("S - R (G m) | ~P* _ S' N,");
  assert.equal(p.steps, 8);
  assert.deepEqual(
    p.events.map((e) => [e.at, e.len, e.swara, e.octave, e.slide, e.gamaka]),
    [
      [0, 2, "S", 0, false, false],
      [2, 1, "R", 0, false, false],
      [3, 0.5, "G", 0, false, false],
      [3.5, 0.5, "m", 0, false, false],
      [4, 1, "P", 0, true, true],
      [6, 1, "S", 1, false, false],
      [7, 1, "N", -1, false, false],
    ]
  );
  assert.throws(() => parsePhrase("S X"), /not a swara/);
  assert.throws(() => parsePhrase("- S"), /nothing to hold/);
  const d = parsePattern("dha . (te re) ge");
  assert.equal(d.steps, 4);
  assert.deepEqual(d.strokes.map((s) => [s.at, s.bol]), [[0, "dha"], [2, "te"], [2.5, "re"], [3, "ge"]]);
});

test("every district has its own music, each in a different raga", () => {
  for (const d of SEED_DISTRICTS) assert.ok(DISTRICT_MUSIC[d.id], `${d.id}: no music`);
  const ragas = COMPOSITIONS.map((c) => c.raga.name);
  assert.equal(new Set(ragas).size, ragas.length, ragas.join(", "));
});

test("compositions are well formed: every phrase in its raga and whole cycles, every pattern one cycle of known bols", () => {
  for (const c of COMPOSITIONS) {
    const steps = stepsPerCycle(c.tala);
    assert.equal(c.form[0].section, "intro", `${c.id}: form starts with the intro`);
    assert.ok(c.bpm >= 60 && c.bpm <= 240, `${c.id}: ${c.bpm} bpm`);
    const cyclesIn = (section: string) => c.form.filter((f) => f.section === section).map((f) => f.cycles);
    for (const part of c.parts) {
      for (const [section, list] of Object.entries(part.phrases)) {
        assert.ok(cyclesIn(section).length, `${c.id} ${part.voice}: "${section}" is not in the form`);
        for (const src of list!) {
          const p = parsePhrase(src);
          assert.equal(p.steps % steps, 0, `${c.id} ${part.voice} ${section}: "${src}" is ${p.steps} steps, not whole ${steps}-step cycles`);
          const span = p.steps / steps;
          for (const n of cyclesIn(section)) assert.equal(n % span, 0, `${c.id} ${part.voice}: a ${span}-cycle phrase in a ${n}-cycle ${section}`);
          for (const e of p.events) assert.ok(c.raga.swaras.includes(e.swara), `${c.id} ${part.voice}: ${e.swara} is not in ${c.raga.name} ("${src}")`);
        }
      }
    }
    for (const d of c.drums) {
      const all = [...Object.values(d.patterns).flat(), ...(d.fill ? [d.fill] : [])];
      for (const src of all) {
        const p = parsePattern(src!);
        assert.equal(p.steps, steps, `${c.id} ${d.kit}: "${src}" is ${p.steps} steps, the cycle is ${steps}`);
        for (const s of p.strokes) assert.ok(KIT_BOLS[d.kit].includes(s.bol), `${c.id} ${d.kit}: no bol "${s.bol}"`);
      }
      for (const section of Object.keys(d.patterns)) assert.ok(cyclesIn(section).length, `${c.id} ${d.kit}: "${section}" is not in the form`);
    }
    // The modern low end is in every city: a kick and a sub-bass.
    assert.ok(c.drums.some((d) => d.kit === "kick"), `${c.id}: no kick`);
    assert.ok(c.parts.some((p) => p.voice === "sub"), `${c.id}: no sub-bass`);
  }
});

/** Fundamental by autocorrelation over a stretch after the attack. */
function pitch(x: Float32Array, sr: number): number {
  const start = Math.floor(sr * 0.1);
  const n = Math.floor(sr * 0.1);
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.floor(sr / 1500); lag < Math.floor(sr / 50); lag++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[start + i] * x[start + i + lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  // Parabolic refinement around the peak.
  const r = (lag: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[start + i] * x[start + i + lag];
    return s;
  };
  const a = r(bestLag - 1);
  const b = r(bestLag);
  const c = r(bestLag + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return sr / (bestLag + shift);
}

test("plucked strings are in tune, stay bounded and ring down (the tanpura's buzz included)", () => {
  const sr = 48000;
  for (const [name, hz] of [["tumbi", 587.3], ["veena", 349.2], ["dotara", 220], ["tanpura", 110], ["santoor", 784]] as const) {
    const x = karplus(sr, hz, PLUCKS[name]);
    const cents = 1200 * Math.log2(pitch(x, sr) / hz);
    assert.ok(Math.abs(cents) < 8, `${name} at ${hz}Hz is ${cents.toFixed(1)} cents out`);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= 0.8001 && peak > 0.5, `${name}: peak ${peak}`);
    const rms = (from: number, to: number) => Math.sqrt(x.slice(from, to).reduce((a, v) => a + v * v, 0) / (to - from));
    const early = rms(Math.floor(sr * 0.05), Math.floor(sr * 0.15));
    const late = rms(x.length - Math.floor(sr * 0.2), x.length - Math.floor(sr * 0.1));
    assert.ok(late < early / 2, `${name} doesn't decay: ${early.toFixed(3)} → ${late.toFixed(3)}`);
  }
});

test("the location chime rises through the city's raga", () => {
  assert.deepEqual(chimeNotes(["S", "R", "G", "m", "P", "D", "N"]), [["S", 1], ["G", 1], ["P", 1], ["S", 2]]);
  // Mohanam has no ma; Madhyamavati no ga: the chime keeps to the raga.
  for (const c of COMPOSITIONS) for (const [s] of chimeNotes(c.raga.swaras)) assert.ok(c.raga.swaras.includes(s), `${c.id}: ${s}`);
  assert.ok(SWARA_RATIO.P === 1.5);
});
