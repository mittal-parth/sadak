/**
 * Swaras, ragas and talas, and the notation the city compositions are
 * written in.
 *
 * Notation, one token per step of the tala (its beats times their
 * subdivisions); bar lines "|" are ignored:
 *
 *   S r R g G m M P d D n N   the twelve swaras (komal lower case, tivra M)
 *   S' S''  S, S,,            an octave (two) above / below
 *   -                         hold the previous note one more step
 *   _                         rest one step
 *   (S R G)                   split one step evenly between the notes
 *   ~P                        meend: slide into P from the note before
 *   G*                        gamaka: oscillate G against the note above
 *
 * Drum patterns use the same steps with bols (dha, ge, na, …) in place of
 * swaras, "_" or "." as a rest, and "(te re)" to split a step.
 */

export type Swara = "S" | "r" | "R" | "g" | "G" | "m" | "M" | "P" | "d" | "D" | "n" | "N";

/** Just intonation from Sa, as a tanpura's overtones tune the ear. */
export const SWARA_RATIO: Record<Swara, number> = {
  S: 1,
  r: 16 / 15,
  R: 9 / 8,
  g: 6 / 5,
  G: 5 / 4,
  m: 4 / 3,
  M: 45 / 32,
  P: 3 / 2,
  d: 8 / 5,
  D: 5 / 3,
  n: 9 / 5,
  N: 15 / 8,
};

const SWARAS = new Set(Object.keys(SWARA_RATIO));

export type Raga = { name: string; swaras: Swara[] };
export type Tala = { name: string; beats: number; sub: number };

export const stepsPerCycle = (t: Tala) => t.beats * t.sub;

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function swaraHz(saHz: number, s: Swara, octave: number): number {
  return saHz * SWARA_RATIO[s] * Math.pow(2, octave);
}

export type NoteEvent = {
  /** Start, in steps from the phrase's start (fractional inside a split). */
  at: number;
  /** Length in steps, holds included. */
  len: number;
  swara: Swara;
  octave: number;
  slide: boolean;
  gamaka: boolean;
};

export type Phrase = { events: NoteEvent[]; steps: number };

/** Split notation into tokens, keeping "(…)" groups whole. */
function tokens(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\n" || c === "\t" || c === "|") {
      i++;
      continue;
    }
    if (c === "(") {
      const j = src.indexOf(")", i);
      if (j < 0) throw new Error(`unclosed "(" in "${src}"`);
      out.push(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < src.length && !" \n\t|(".includes(src[j])) j++;
    out.push(src.slice(i, j));
    i = j;
  }
  return out;
}

function parseNote(tok: string, src: string): Omit<NoteEvent, "at" | "len"> {
  let t = tok;
  const slide = t.startsWith("~");
  if (slide) t = t.slice(1);
  const gamaka = t.endsWith("*");
  if (gamaka) t = t.slice(0, -1);
  const s = t[0];
  if (!SWARAS.has(s)) throw new Error(`"${tok}" is not a swara in "${src}"`);
  let octave = 0;
  for (const c of t.slice(1)) {
    if (c === "'") octave++;
    else if (c === ",") octave--;
    else throw new Error(`"${tok}" in "${src}"`);
  }
  return { swara: s as Swara, octave, slide, gamaka };
}

export function parsePhrase(src: string): Phrase {
  const events: NoteEvent[] = [];
  let step = 0;
  let last: NoteEvent | null = null;
  for (const tok of tokens(src)) {
    if (tok === "-") {
      if (!last) throw new Error(`hold with nothing to hold in "${src}"`);
      last.len += 1;
    } else if (tok === "_") {
      last = null;
    } else if (tok.startsWith("(")) {
      const inner = tokens(tok.slice(1, -1));
      if (!inner.length) throw new Error(`empty "()" in "${src}"`);
      const part = 1 / inner.length;
      inner.forEach((t, k) => {
        if (t === "_") {
          last = null;
          return;
        }
        if (t === "-") {
          if (!last) throw new Error(`hold with nothing to hold in "${src}"`);
          last.len += part;
          return;
        }
        last = { at: step + k * part, len: part, ...parseNote(t, src) };
        events.push(last);
      });
    } else {
      last = { at: step, len: 1, ...parseNote(tok, src) };
      events.push(last);
    }
    step += 1;
  }
  return { events, steps: step };
}

export type Stroke = { at: number; len: number; bol: string };
export type Pattern = { strokes: Stroke[]; steps: number };

export function parsePattern(src: string): Pattern {
  const strokes: Stroke[] = [];
  let step = 0;
  for (const tok of tokens(src)) {
    if (tok.startsWith("(")) {
      const inner = tokens(tok.slice(1, -1));
      inner.forEach((b, k) => {
        if (b !== "_" && b !== ".") strokes.push({ at: step + k / inner.length, len: 1 / inner.length, bol: b });
      });
    } else if (tok !== "_" && tok !== ".") {
      strokes.push({ at: step, len: 1, bol: tok });
    }
    step += 1;
  }
  return { strokes, steps: step };
}

/** Seeded PRNG (mulberry32), so an offline render is the same every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
