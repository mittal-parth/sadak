/**
 * Each district's music: the raga, tala, ensemble and form of its city's
 * own tradition, over a modern low end (a kick and a sub-bass).
 *
 *   Amritsar     Bhangra        Khamaj     chaal (4×3)    dhol, chimta, tumbi, algoza
 *   Delhi        Qawwali        Kafi       keherwa (8)    tabla, claps, harmonium, sarangi
 *   Mumbai       Lavani         Bilawal    keherwa (8)    dholki, dhol-tasha, harmonium, shehnai
 *   Kolkata      Baul           Bhairavi   dadra (6)      khamak, ghungroo, dotara, ektara, bansuri
 *   Hyderabad    Deccani ghazal Yaman      dadra (6)      tabla, sarangi, santoor
 *   Chennai      Periya melam   Mohanam    adi (8)        thavil, talam, nadaswaram, sruti
 *   Bengaluru    Carnatic       Hamsadhwani adi (8)       mridangam, dollu, veena, flute
 *   Kochi        Chenda melam   Madhyamavati panchari (6) chenda, ilathalam, kuzhal, kombu
 *   Ahmedabad    Garba          Pahadi     garba (2×6/8)  dhol, dandiya, harmonium, shehnai
 *   Bhubaneswar  Odissi         Bhairav    ektali (4×4)   mardala, manjira, bansuri, veena
 *
 * Phrases and patterns are written in the notation in theory.ts, one token
 * per step of the tala; a melodic phrase spans one or more whole cycles.
 */

import type { HeldName, KitName, PluckName, Space } from "./instruments";
import type { Raga, Tala } from "./theory";

export type Section = "intro" | "a" | "b" | "break";

export type MelodicPart = {
  voice: PluckName | HeldName | "sub";
  /** Octave from Sa: leads 1, the sub-bass -1. */
  octave: number;
  level: number;
  pan?: number;
  send?: number;
  phrases: Partial<Record<Section, string[]>>;
};

export type DrumPart = {
  kit: KitName;
  level: number;
  pan?: number;
  send?: number;
  /** One cycle each; the first is played most, the rest are variations. */
  patterns: Partial<Record<Section, string[]>>;
  /** Replaces the last cycle of a section: a tihai landing on sam. */
  fill?: string;
};

export type Composition = {
  id: string;
  name: string;
  /** MIDI note of Sa. */
  sa: number;
  raga: Raga;
  tala: Tala;
  bpm: number;
  space: Space;
  drone?: "tanpura" | "sruti";
  parts: MelodicPart[];
  drums: DrumPart[];
  /** The first section plays once; the rest loop. */
  form: { section: Section; cycles: number }[];
};

const FORM: Composition["form"] = [
  { section: "intro", cycles: 2 },
  { section: "a", cycles: 6 },
  { section: "b", cycles: 4 },
  { section: "break", cycles: 2 },
  { section: "a", cycles: 4 },
  { section: "b", cycles: 4 },
];

/* ---------------- Amritsar: bhangra ---------------- */

const bhangra: Composition = {
  id: "hall-bazaar",
  name: "Bhangra",
  sa: 50,
  raga: { name: "Khamaj", swaras: ["S", "R", "G", "m", "P", "D", "n", "N"] },
  tala: { name: "chaal", beats: 4, sub: 3 },
  bpm: 100,
  space: "open",
  parts: [
    {
      voice: "tumbi",
      octave: 1,
      level: 0.8,
      pan: 0.15,
      send: 0.15,
      phrases: {
        a: [
          "P _ S' | S' _ R' | S' N D | P _ _",
          "P _ S' | S' _ R' | G' R' S' | R' _ _",
          "S' _ S' | S' R' S' | n D P | D _ _",
          "(S' S') _ S' | R' _ S' | N _ D | P _ _",
        ],
        b: ["G' _ G' | G' m' G' | R' S' N | S' _ _", "P' _ m' | G' _ R' | S' N D | P _ _"],
      },
    },
    {
      // Algoza, the twin flute, played here on one.
      voice: "bansuri",
      octave: 1,
      level: 0.7,
      pan: -0.25,
      send: 0.3,
      phrases: {
        intro: ["S - - - - - | R - - G - - | m - - - G R | S - - - - -"],
        b: ["S' - - N - - | D - - P - - | m - G R - - | S - - - - -", "G - m P - - | D - n D - P | m - G R - S | R - - - - -"],
      },
    },
    {
      voice: "sub",
      octave: -1,
      level: 0.9,
      phrases: {
        a: ["S - - - - - S - - P, - -", "S - - - - - m, - - P, - -"],
        b: ["S - - S - - G - - P, - -"],
      },
    },
  ],
  drums: [
    {
      kit: "dhol",
      level: 0.95,
      send: 0.12,
      patterns: {
        intro: ["D _ _ _ _ _ D _ _ _ _ _"],
        a: ["D _ t D _ t D _ t D t t", "D _ t D t t D _ t D _ t"],
        b: ["dha _ t D _ t dha _ t D t t"],
        break: ["D t t D t t D t t D t t"],
      },
      fill: "dha t t dha t t dha t t dha _ _",
    },
    { kit: "perc", level: 0.6, pan: 0.3, send: 0.2, patterns: { a: ["_ _ j _ _ j _ _ j _ _ j"], b: ["_ _ j _ _ j _ _ j _ _ j"], break: ["_ _ j _ _ j _ _ j _ _ j"] } },
    { kit: "kick", level: 0.85, send: 0, patterns: { a: ["K _ _ _ _ _ K _ _ _ _ _"], b: ["K _ _ K _ _ K _ _ K _ _"] } },
  ],
  form: [
    { section: "intro", cycles: 2 },
    { section: "a", cycles: 8 },
    { section: "b", cycles: 4 },
    { section: "break", cycles: 2 },
    { section: "a", cycles: 8 },
    { section: "b", cycles: 4 },
  ],
};

/* ---------------- Delhi: qawwali ---------------- */

const qawwali: Composition = {
  id: "purani-sadak",
  name: "Qawwali",
  sa: 49,
  raga: { name: "Kafi", swaras: ["S", "R", "g", "m", "P", "D", "n"] },
  tala: { name: "keherwa", beats: 8, sub: 2 },
  bpm: 116,
  space: "hall",
  drone: "tanpura",
  parts: [
    {
      voice: "harmonium",
      octave: 1,
      level: 0.75,
      pan: -0.1,
      send: 0.25,
      phrases: {
        intro: ["S - - - R - - - | g - - - - - R - | m - - - g - R - | S - - - - - - -"],
        a: [
          "P - m - g - R - | S - R - g - - -",
          "m - P - D - n - | D - P - m - - -",
          "S' - n - D - P - | m - g - R - S -",
          "R - g - m - P - | g - R - S - - -",
        ],
        b: ["S' R' g' R' S' n D P | m P D n S' - - -", "g' - R' - S' - n - | D P m g R - S -"],
      },
    },
    {
      voice: "sarangi",
      octave: 1,
      level: 0.55,
      pan: 0.3,
      send: 0.35,
      phrases: { b: ["_ _ _ _ ~P - - - | _ _ _ _ ~m - g -", "_ _ _ _ ~S' - n - | _ _ _ _ D - P -"] },
    },
    {
      voice: "sub",
      octave: -1,
      level: 0.85,
      phrases: { a: ["S - - - - - - - | m, - - - P, - - -"], b: ["S - - - S - - - | g - - - m - - -"] },
    },
  ],
  drums: [
    {
      kit: "tabla",
      level: 0.9,
      pan: 0.1,
      send: 0.18,
      patterns: {
        a: ["dha _ ge _ na _ ti _ | na _ ke _ dhi _ na _", "dha ge na ti na ke dhi na | dha ge na ti na ke dhi na"],
        b: ["dha _ ge na ti na ke _ | dha _ ge na dhi na ke _"],
        break: ["dha ge na ti na ke dhi na | dha ge na ti na ke dhi na"],
      },
      fill: "(dha ti) dha _ (dha ti) dha _ (dha ti) dha _ | dha _ _ ke _ _ _",
    },
    {
      kit: "perc",
      level: 0.55,
      pan: -0.2,
      send: 0.3,
      patterns: { a: ["c _ _ _ c _ _ _ | c _ _ _ c _ _ _"], b: ["c _ c _ c _ c _ | c _ c _ c _ c c"], break: ["c _ c _ c _ c _ | c _ c _ c _ c c"] },
    },
    { kit: "kick", level: 0.8, send: 0, patterns: { a: ["K _ _ _ _ _ _ _ | K _ _ _ _ _ _ _"], b: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Mumbai: lavani and dhol-tasha ---------------- */

const lavani: Composition = {
  id: "dadar-chowk",
  name: "Lavani",
  sa: 52,
  raga: { name: "Bilawal", swaras: ["S", "R", "G", "m", "P", "D", "N"] },
  tala: { name: "keherwa", beats: 8, sub: 2 },
  bpm: 128,
  space: "open",
  parts: [
    {
      voice: "harmonium",
      octave: 1,
      level: 0.7,
      pan: -0.15,
      send: 0.2,
      phrases: {
        a: [
          "G - G - m - G - | R - S - R - G -",
          "P - P - D - P - | m - G - R - S -",
          "S' - N - D - P - | m G R G m - - -",
          "G - m - P - D - | P - m - G - R -",
        ],
      },
    },
    {
      voice: "shehnai",
      octave: 1,
      level: 0.6,
      pan: 0.2,
      send: 0.3,
      phrases: {
        intro: ["S - - - G - - - | P - - - - - G - | m - G - R - - - | S - - - - - - -"],
        b: ["G P D P G P D S' | N D P m G R S -", "S' - S' N D - P - | m - G - R - S -"],
      },
    },
    {
      voice: "tuntuna",
      octave: 1,
      level: 0.45,
      pan: 0.35,
      send: 0.1,
      phrases: { a: ["S _ S S _ S _ S | S _ S S _ S S _"], b: ["S _ S S _ S _ S | S _ S S _ S S _"] },
    },
    {
      voice: "sub",
      octave: -1,
      level: 0.9,
      phrases: { a: ["S - - - S - - - | P, - - - P, - - -"], b: ["S - - - m - - - | P, - - - S - - -"], break: ["S - - - S - - - | P, - - - P, - - -"] },
    },
  ],
  drums: [
    {
      kit: "dholki",
      level: 0.85,
      pan: 0.05,
      send: 0.12,
      patterns: {
        a: ["dha _ na dha _ na ti na | dha _ na dha _ ge na _", "dha na ti na dha na ti na | dha _ ge na dha ge na _"],
        b: ["dha _ na dha _ na ti na | dha _ na dha _ ge na _"],
      },
      fill: "dha ti dha _ dha ti dha _ | dha ti dha _ dha _ _ _",
    },
    { kit: "dhol", level: 0.8, send: 0.12, patterns: { intro: ["D _ _ _ D _ _ _ | D _ _ D _ _ D _"], b: ["D _ _ _ D _ _ _ | D _ _ D _ _ D _"], break: ["D _ _ _ D _ _ _ | D _ _ D _ _ D _"] } },
    {
      kit: "perc",
      level: 0.45,
      pan: -0.3,
      send: 0.15,
      patterns: {
        intro: ["(r r) (r r) (r r) (r r) (r r) (r r) (r r) (r r) | (r r r) (r r r) (r r r) (r r r) r _ r _"],
        b: ["_ _ r _ _ _ r _ | _ _ r _ _ r r _"],
        break: ["(r r) (r r) (r r) (r r) (r r) (r r) (r r) (r r) | (r r r) (r r r) (r r r) (r r r) r _ r _"],
      },
    },
    { kit: "kick", level: 0.85, send: 0, patterns: { a: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"], b: ["K _ _ _ K _ _ _ | K _ _ _ K _ K _"], break: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Kolkata: baul ---------------- */

const baul: Composition = {
  id: "park-gully",
  name: "Baul",
  sa: 45,
  raga: { name: "Bhairavi", swaras: ["S", "r", "g", "m", "P", "d", "n"] },
  tala: { name: "dadra", beats: 6, sub: 2 },
  bpm: 100,
  space: "room",
  parts: [
    {
      voice: "dotara",
      octave: 1,
      level: 0.85,
      pan: -0.15,
      send: 0.2,
      phrases: {
        intro: ["S - - - - - | r - - g - - | m - - g - r | S - - - - -"],
        a: ["S - r - g - | m - g - r -", "P - d - P - | m - g - r S", "g - m - P - | d - P - m g", "S - g - m - | P - m - g r"],
      },
    },
    { voice: "ektara", octave: 1, level: 0.5, pan: 0.3, send: 0.15, phrases: { intro: ["S _ S S _ _ | S _ S _ S _"], a: ["S _ S S _ _ | S _ S _ S _"], b: ["S _ S S _ _ | S _ S _ S _"] } },
    {
      voice: "bansuri",
      octave: 1,
      level: 0.6,
      pan: 0.15,
      send: 0.35,
      phrases: { b: ["S' - - n - - | d - - P - - | m - g - r - | S - - - - -", "P - d - n - | S' - - - n d | P - m - g - | r - - S - -"] },
    },
    { voice: "sub", octave: -1, level: 0.8, phrases: { a: ["S - - - - - | S - - P, - -"], b: ["S - - - - - | m - - P, - -"], break: ["S - - - - - | S - - P, - -"] } },
  ],
  drums: [
    {
      kit: "perc",
      level: 0.7,
      pan: 0.1,
      send: 0.2,
      patterns: {
        a: ["g _ g G _ _ | g _ G _ g _", "g _ g G _ _ | g _ G _ g _"],
        b: ["g g G _ g _ | g _ G g G _"],
        break: ["g _ g G _ _ | g _ G _ g _"],
      },
    },
    { kit: "perc", level: 0.45, pan: -0.35, send: 0.2, patterns: { a: ["s _ s _ s _ | s _ s _ s _"], b: ["s _ s _ s _ | s _ s _ s _"], break: ["s _ s _ s _ | s _ s _ s _"] } },
    { kit: "dholki", level: 0.6, send: 0.15, patterns: { b: ["dha _ na dha _ na | dha _ na ge _ na"] }, fill: "dha na dha _ dha na | dha _ dha _ _ _" },
    { kit: "kick", level: 0.8, send: 0, patterns: { a: ["K _ _ _ _ _ | K _ _ _ _ _"], b: ["K _ _ _ _ _ | K _ _ _ _ _"], break: ["K _ _ _ _ _ | K _ _ _ _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Hyderabad: Deccani ghazal ---------------- */

const ghazal: Composition = {
  id: "charminar-lane",
  name: "Deccani ghazal",
  sa: 43,
  raga: { name: "Yaman", swaras: ["S", "R", "G", "M", "P", "D", "N"] },
  tala: { name: "dadra", beats: 6, sub: 2 },
  bpm: 90,
  space: "hall",
  drone: "tanpura",
  parts: [
    {
      voice: "sarangi",
      octave: 1,
      level: 0.8,
      pan: -0.1,
      send: 0.35,
      phrases: {
        intro: ["S - - - - - | N, - R - G - | M - - - G R | S - - - - -"],
        a: ["N, - R - G - | M - G - R -", "G - M - D - | N - D - P -", "M - D - N - | S' - - - N D", "P - M - G - | R - S - - -"],
        b: ["S' - N - D - | P - M - G -", "R - G - M - | G - R - S -"],
      },
    },
    {
      voice: "santoor",
      octave: 2,
      level: 0.5,
      pan: 0.3,
      send: 0.3,
      phrases: { b: ["N, R G M D N | S' N D P M G", "(S G) (P N) (S' N) (D P) (M G) R | (G M) (D N) S' - - -"], break: ["N, R G M D N | S' N D P M G"] },
    },
    { voice: "sub", octave: -1, level: 0.8, phrases: { a: ["S - - - - - | P, - - - - -"], b: ["S - - - - - | G - - M - -"], break: ["S - - - - - | P, - - - - -"] } },
  ],
  drums: [
    {
      kit: "tabla",
      level: 0.85,
      pan: 0.1,
      send: 0.2,
      patterns: { a: ["dha _ dhi _ na _ | dha _ ti _ na _", "dha dhi na dha ti na | dha dhi na dha ti na"], b: ["dha _ dhi na dhi na | dha _ ti na ti na"] },
      fill: "(dha ti) dha _ (dha ti) dha _ | (dha ti) dha _ dha _ _",
    },
    { kit: "kick", level: 0.75, send: 0, patterns: { a: ["K _ _ _ _ _ | _ _ _ _ _ _"], b: ["K _ _ _ _ _ | K _ _ _ _ _"], break: ["K _ _ _ _ _ | K _ _ _ _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Chennai: periya melam ---------------- */

const periyaMelam: Composition = {
  id: "marina-nagar",
  name: "Periya melam",
  sa: 51,
  raga: { name: "Mohanam", swaras: ["S", "R", "G", "P", "D"] },
  tala: { name: "adi", beats: 8, sub: 2 },
  bpm: 104,
  space: "temple",
  drone: "sruti",
  parts: [
    {
      voice: "nadaswaram",
      octave: 1,
      level: 0.8,
      send: 0.3,
      phrases: {
        intro: ["S - - - - - - - | R - G* - - - - - | P - D - G* - - - | R - S - - - - -"],
        a: [
          "S - R - G* - P - | D - P - G* - R -",
          "G - P - D - S' - | D - P - G - - -",
          "P - D - S' - R' - | G'* - R' - S' - - -",
          "D, - S - R - G - | P - G - R - S -",
        ],
        b: [
          "(S' R') (G' R') (S' D) (P G) (R S) (R G) (P D) S' | D - P - G* - R -",
          "G* - - - P - D - | S' - D - P - G -",
          "(G P) (D S') (R' G') R' S' D P - | (G P) D S' - D P G -",
        ],
      },
    },
    { voice: "sub", octave: -1, level: 0.85, phrases: { a: ["S - - - - - - - | P, - - - - - - -"], b: ["S - - - G - - - | P, - - - D, - - -"], break: ["S - - - - - - - | P, - - - - - - -"] } },
  ],
  drums: [
    {
      kit: "thavil",
      level: 0.9,
      pan: 0.1,
      send: 0.22,
      patterns: {
        a: ["tha _ ki ta tha _ ki ta | dhi _ ta _ dhi _ ta _", "tha ki ta ki tha _ ki ta | dhi ta ki ta dhi _ ta _"],
        b: ["tha ki ta ki tha ki ta ki | dhi ki ta ki dhi ki ta ki"],
        break: ["tha ki ta ki tha ki ta ki | dhi ki ta ki dhi ki ta ki"],
      },
      fill: "(tha ki) ta _ (tha ki) ta _ (tha ki) ta _ | tha _ _ _ _ _ _",
    },
    { kit: "perc", level: 0.4, pan: -0.25, send: 0.3, patterns: { a: ["m _ _ _ m _ _ _ | m _ _ _ m _ _ _"], b: ["m _ _ _ m _ _ _ | m _ _ _ m _ _ _"], break: ["m _ _ _ m _ _ _ | m _ _ _ m _ _ _"] } },
    { kit: "kick", level: 0.8, send: 0, patterns: { a: ["K _ _ _ _ _ _ _ | K _ _ _ K _ _ _"], b: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"], break: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Bengaluru: veena and dollu ---------------- */

const carnatic: Composition = {
  id: "majestic-cross",
  name: "Carnatic",
  sa: 53,
  raga: { name: "Hamsadhwani", swaras: ["S", "R", "G", "P", "N"] },
  tala: { name: "adi", beats: 8, sub: 2 },
  bpm: 116,
  space: "hall",
  drone: "tanpura",
  parts: [
    {
      voice: "veena",
      octave: 1,
      level: 0.85,
      pan: -0.1,
      send: 0.25,
      phrases: {
        intro: ["S - - - - - - - | R - G - - - - - | P - N - S' - - - | N - P - G - R -"],
        a: [
          "S - R - G - P - | N - P - G - R -",
          "G - P - N - S' - | R' - S' - N - P -",
          "P - N - S' - R' - | G' - R' - S' - - -",
          "N, - S - R - G - | P - G - R - S -",
        ],
        b: ["(S' N) (P G) (R S) (R G) (P N) (S' R') (G' R') S' | N - P - G* - R -", "G* - - - P - N - | S' - N - P - G -"],
      },
    },
    { voice: "bansuri", octave: 1, level: 0.55, pan: 0.3, send: 0.35, phrases: { b: ["_ _ _ _ G' - - - | R' - S' - N - - -", "_ _ _ _ P - N - | S' - - - - - - -"] } },
    { voice: "sub", octave: -1, level: 0.9, phrases: { a: ["S - - - S - - - | P, - - - P, - - -"], b: ["S - - - R - - - | G - - - P, - - -"], break: ["S - - - S - - - | P, - - - P, - - -"] } },
  ],
  drums: [
    {
      kit: "mridangam",
      level: 0.85,
      pan: 0.1,
      send: 0.2,
      patterns: {
        a: ["tha _ dhi _ thom _ nam _ | tha ka dhi mi tha _ nam _", "tha ka dhi mi nam _ dhi _ | thom _ ka dhi mi _ nam _"],
        b: ["tha ka dhi mi nam _ dhi _ | thom _ ka dhi mi _ nam _"],
      },
      fill: "(tha ka) dhi _ (tha ka) dhi _ (tha ka) dhi _ | thom _ _ _ _ _ _",
    },
    { kit: "dollu", level: 0.8, send: 0.18, patterns: { b: ["D _ _ D _ _ D _ | D _ D _ D D D _"], break: ["D _ _ D _ _ D _ | D _ D _ D D D _"] } },
    { kit: "kick", level: 0.85, send: 0, patterns: { a: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"], b: ["K _ _ _ K _ _ _ | K _ _ _ K _ K _"], break: ["K _ _ _ K _ _ _ | K _ _ _ K _ K _"] } },
  ],
  form: FORM,
};

/* ---------------- Kochi: chenda melam ---------------- */

const chendaMelam: Composition = {
  id: "fort-kochi",
  name: "Chenda melam",
  sa: 49,
  raga: { name: "Madhyamavati", swaras: ["S", "R", "m", "P", "n"] },
  tala: { name: "panchari", beats: 6, sub: 2 },
  bpm: 104,
  space: "temple",
  drone: "sruti",
  parts: [
    {
      voice: "kuzhal",
      octave: 1,
      level: 0.75,
      send: 0.3,
      phrases: {
        a: ["S - R - m - | P - m - R -", "P - n - S' - | n - P - m -", "m - P - n - | P - m - R S", "R - m - P - | n - P - m R"],
        b: ["S' - n - P - | m - R - S -", "R' - S' - n - | P - n - S' -"],
      },
    },
    {
      voice: "kombu",
      octave: 0,
      level: 0.55,
      pan: 0.35,
      send: 0.4,
      phrases: { intro: ["S - - - - - | ~P - - - - - | ~S' - - - - - | _ _ _ _ _ _"], break: ["~P - - - - - | ~S' - - - - -"] },
    },
    { voice: "sub", octave: -1, level: 0.85, phrases: { a: ["S - - - - - | P, - - - - -"], b: ["S - - m - - | n, - - P, - -"], break: ["S - - - - - | P, - - - - -"] } },
  ],
  drums: [
    {
      kit: "chenda",
      level: 0.85,
      pan: -0.1,
      send: 0.25,
      patterns: {
        intro: ["ta _ _ _ _ _ | ta _ _ ta _ _"],
        a: ["ta _ ta ti ta _ | ta _ ti ta ti _", "ta ti ta ti ta _ | (ta ta) ti ta ti ta _"],
        b: ["(ta ta) ta (ta ta) ta (ta ta) ta | (ta ta) ta (ta ta) ta (ta ta) ta"],
        break: ["(ta ta) ta (ta ta) ta (ta ta) ta | (ta ta) ta (ta ta) ta (ta ta) ta"],
      },
      fill: "(ta ta ta) (ta ta ta) ta _ (ta ta ta) ta | tha _ _ tha _ tha",
    },
    // The valanthala chendas keep the beat underneath.
    { kit: "chenda", level: 0.7, pan: 0.15, send: 0.2, patterns: { a: ["tha _ _ tha _ _ | tha _ _ tha _ _"], b: ["tha _ _ tha _ _ | tha _ _ tha _ _"], break: ["tha _ _ tha _ _ | tha _ _ tha _ _"] } },
    { kit: "perc", level: 0.5, pan: 0.3, send: 0.35, patterns: { intro: ["i _ _ i _ _ | i _ _ i _ _"], a: ["i _ _ i _ _ | i _ _ i _ _"], b: ["i _ _ i _ _ | i _ _ i _ _"], break: ["i _ _ i _ _ | i _ _ i _ _"] } },
    { kit: "kick", level: 0.8, send: 0, patterns: { a: ["K _ _ _ _ _ | K _ _ K _ _"], b: ["K _ _ K _ _ | K _ _ K _ _"], break: ["K _ _ K _ _ | K _ _ K _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Ahmedabad: garba ---------------- */

const garba: Composition = {
  id: "manek-chowk",
  name: "Garba",
  sa: 47,
  raga: { name: "Pahadi", swaras: ["S", "R", "G", "m", "P", "D", "n"] },
  tala: { name: "garba", beats: 12, sub: 1 },
  bpm: 220,
  space: "open",
  parts: [
    {
      voice: "harmonium",
      octave: 1,
      level: 0.7,
      pan: -0.15,
      send: 0.2,
      phrases: { a: ["S - R - G - | m - G - R -", "G - m - P - | D - P - m -", "P - D - n - | D - P - m G", "G - - m P - | G - R - S -"] },
    },
    {
      voice: "shehnai",
      octave: 1,
      level: 0.6,
      pan: 0.2,
      send: 0.3,
      phrases: {
        intro: ["S - - - - - | G - - - m - | P - - - G - | R - - S - -"],
        b: ["S' - - n D P | m - G - R -", "P - D - n - | S' - - - - -", "G - m - P - | G - R - S -"],
      },
    },
    { voice: "sub", octave: -1, level: 0.85, phrases: { a: ["S - - - - - | P, - - - - -"], b: ["S - - G - - | P, - - S - -"], break: ["S - - - - - | P, - - - - -"] } },
  ],
  drums: [
    {
      kit: "dhol",
      level: 0.9,
      send: 0.12,
      patterns: {
        intro: ["D _ _ _ _ _ | D _ _ _ _ _"],
        a: ["D _ t t D _ | D _ t t D t", "D _ t t D _ | D t t D t t"],
        b: ["dha _ t t D t | dha _ t t D t"],
        break: ["D _ t t D _ | D t t D t t"],
      },
      fill: "D t t D t t | D t t D _ _",
    },
    { kit: "perc", level: 0.55, pan: 0.3, send: 0.2, patterns: { a: ["_ _ k _ _ k | _ _ k _ _ k"], b: ["_ _ k _ _ k | _ _ k _ _ k"], break: ["k _ k k _ k | k _ k k _ k"] } },
    { kit: "perc", level: 0.5, pan: -0.3, send: 0.3, patterns: { b: ["c _ _ c _ _ | c _ _ c _ _"] } },
    { kit: "kick", level: 0.8, send: 0, patterns: { a: ["K _ _ K _ _ | K _ _ K _ _"], b: ["K _ _ K _ _ | K _ _ K _ _"], break: ["K _ _ K _ _ | K _ _ K _ _"] } },
  ],
  form: FORM,
};

/* ---------------- Bhubaneswar: Odissi ---------------- */

const odissi: Composition = {
  id: "lingaraj-lane",
  name: "Odissi",
  sa: 50,
  raga: { name: "Bhairav", swaras: ["S", "r", "G", "m", "P", "d", "N"] },
  tala: { name: "ektali", beats: 4, sub: 4 },
  bpm: 72,
  space: "temple",
  drone: "tanpura",
  parts: [
    {
      voice: "bansuri",
      octave: 1,
      level: 0.75,
      send: 0.35,
      phrases: {
        intro: ["S - - - - - - - | r - - - G - - - | m - - - P - d - | P - m - G - r -"],
        a: ["S - r - G - m - | P - - - m G r -", "G - m - d - - - | P - m - G - - -", "m - P - d - N - | S' - - - N d P -", "d - - - P - m - | G - r - S - - -"],
        b: ["S' - - - N - d - | P - - - - - - -", "G - m - d - - - | N - S' - - - - -"],
      },
    },
    {
      voice: "veena",
      octave: 1,
      level: 0.6,
      pan: 0.3,
      send: 0.3,
      phrases: { b: ["S' - N - d - P - | m - G - r - S -", "(r G) (m P) d - N - S' - | d - P - m G r S"] },
    },
    { voice: "sub", octave: -1, level: 0.8, phrases: { a: ["S - - - - - - - | P, - - - - - - -"], b: ["S - - - r - - - | G - - - P, - - -"], break: ["S - - - - - - - | P, - - - - - - -"] } },
  ],
  drums: [
    {
      kit: "mardala",
      level: 0.85,
      pan: -0.1,
      send: 0.25,
      patterns: {
        a: ["dha _ ta ke ghe _ ta _ | dha _ tin _ na _ ghe _", "dha ta ghe ta tin _ na _ | dha _ ghe ta tin na ke _"],
        b: ["dha ta ke ta ghe ta ke ta | dha ta ke ta tin na ghe _"],
        break: ["dha ta ke ta ghe ta ke ta | dha ta ke ta tin na ghe _"],
      },
      fill: "(dha ta) ghe _ (dha ta) ghe _ (dha ta) ghe _ | dha _ _ _ _ _ _",
    },
    {
      kit: "perc",
      level: 0.45,
      pan: 0.3,
      send: 0.35,
      patterns: {
        intro: ["b _ _ _ _ _ _ _ | _ _ _ _ _ _ _ _"],
        a: ["m _ _ _ m _ _ _ | m _ _ _ m _ _ _"],
        b: ["m _ _ _ m _ _ _ | m _ _ _ m _ _ _"],
        break: ["b _ _ _ m _ _ _ | m _ _ _ m _ _ _"],
      },
    },
    { kit: "kick", level: 0.75, send: 0, patterns: { a: ["K _ _ _ _ _ _ _ | K _ _ _ _ _ _ _"], b: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"], break: ["K _ _ _ K _ _ _ | K _ _ _ K _ _ _"] } },
  ],
  form: FORM,
};

export const COMPOSITIONS: Composition[] = [bhangra, qawwali, lavani, baul, ghazal, periyaMelam, carnatic, chendaMelam, garba, odissi];

/** Each district's music, by district id. */
export const DISTRICT_MUSIC: Record<string, Composition> = Object.fromEntries(COMPOSITIONS.map((c) => [c.id, c]));
