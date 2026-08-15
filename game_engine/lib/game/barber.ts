import type { LangCode } from "@/lib/sarvam";
import { BARBER_TRACKS } from "./barber-tracks";

/**
 * Offset from CHOWK centre. This sits mid-block on the north face of the block
 * south of the chowk, so the shopfront addresses the z=0 street head-on rather
 * than sitting diagonally on a junction corner. The z is set back far enough
 * that the corrugated sheet stops just inside the kerb rather than hanging over
 * the carriageway. It reads as one more shop in the terrace row, just a low one
 * set back far enough for its awning.
 */
export const BARBER_POS: [number, number] = [0, -35.6];

/** Rotation about Y so the door faces the road. Model fronts along +z. */
export const BARBER_FACING = 0;

/**
 * Footprint the terrace row must leave clear, as a half-extent in metres.
 * city.ts skips any plot that would land on top of this so the shop slots into
 * a real gap instead of clipping through a five-storey party wall.
 */
export const BARBER_PLOT = { hw: 3.2, hd: 2.4 };

export const BARBER_ENTER_RADIUS = 4.5;

export const BARBER_SIGN_LABEL = "BARBER";

/**
 * What the fascia actually reads.
 *
 * Real boards do not say "barber shop" — they say a name, almost always an
 * aspirational word next to a local-script spelling of "saloon". Each district
 * gets one with a hook a local would catch: Shahjahanabad's imperial past,
 * Thalaivar (Rajinikanth's title, and literally "head-man"), Bengaluru's own
 * Majestic, Kairali for Kerala, Bombay slang, Ahmedabad's Navrang cinema,
 * Kalinga for Odisha.
 *
 * The building still reads as a barber shop without the word: the pole is on
 * the facade, the chair is visible through the open front, and the prompt says
 * so. Romanisation rides underneath in small type.
 */
export const BARBER_SHOP_SIGN: Record<LangCode, { native: string; roman: string }> = {
  // Shahi — "imperial". Old Delhi is Shahjahanabad.
  "hi-IN": { native: "शाही सैलून", roman: "SHAHI SALOON" },
  // Thalaivar — Rajinikanth's title, and literally "the head one".
  "ta-IN": { native: "தலைவர் சலூன்", roman: "THALAIVAR SALOON" },
  // Nawab — the Nizam's Hyderabad.
  "te-IN": { native: "నవాబ్ సెలూన్", roman: "NAWAB SALOON" },
  // Named for Majestic itself, the district it stands in.
  "kn-IN": { native: "ಮೆಜೆಸ್ಟಿಕ್ ಸಲೂನ್", roman: "MAJESTIC SALOON" },
  // Kairali — Kerala personified, on half the shopfronts in the state.
  "ml-IN": { native: "കൈരളി സലൂൺ", roman: "KAIRALI SALOON" },
  // Zakaas — Bombay slang for "superb".
  "mr-IN": { native: "झकास सलून", roman: "ZAKAAS SALOON" },
  // Navrang — "nine colours", and an Ahmedabad cinema everyone knows.
  "gu-IN": { native: "નવરંગ સલૂન", roman: "NAVRANG SALOON" },
  // Shoukhin — the Bengali word for a man of refined taste.
  "bn-IN": { native: "সৌখিন সেলুন", roman: "SHOUKHIN SELUN" },
  // Shaan — Punjabi for pride, glory.
  "pa-IN": { native: "ਸ਼ਾਨ ਸਲੂਨ", roman: "SHAAN SALOON" },
  // Kalinga — ancient Odisha, and the default prefix for anything Odia.
  "od-IN": { native: "କଳିଙ୍ଗ ସେଲୁନ୍", roman: "KALINGA SALOON" },
  "en-IN": { native: "DELUXE SALOON", roman: "SINCE 1972" },
};

const FALLBACK_SIGN = BARBER_SHOP_SIGN["en-IN"];

export function barberSignFor(language: LangCode): { native: string; roman: string } {
  return BARBER_SHOP_SIGN[language] ?? FALLBACK_SIGN;
}

export const BARBER_INTERACT_LABEL = "Ask for a haircut";

/** Task id for a district's haircut. Derived, never stored in the task pack. */
export function barberTaskId(districtId: string): string {
  return `${districtId}-barber`;
}

/**
 * XP for talking your way through a haircut. No cash and no completion slot:
 * this is optional, so it must not gate finishing a city.
 */
export const BARBER_XP = 120;

/** The barber behind the chair, one per city. */
type BarberNpc = { name: string; role: string; speaker: string; brief: string };

const BARBER_NPCS: Record<string, BarberNpc> = {
  "purani-sadak": {
    name: "Iqbal Bhai",
    role: "Naai",
    speaker: "ashutosh",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "marina-nagar": {
    name: "Murugan",
    role: "Saloon Barber",
    speaker: "gokul",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "majestic-cross": {
    name: "Shivanna",
    role: "Kshourika",
    speaker: "vijay",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "park-gully": {
    name: "Bikash Da",
    role: "Napit",
    speaker: "soham",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "charminar-lane": {
    name: "Yousuf Bhai",
    role: "Kshourakudu",
    speaker: "aayan",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "fort-kochi": {
    name: "Baiju Chettan",
    role: "Barber",
    speaker: "manan",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "dadar-chowk": {
    name: "Prakash Kaka",
    role: "Nhavi",
    speaker: "sumit",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "manek-chowk": {
    name: "Jayesh Bhai",
    role: "Vaaland",
    speaker: "tarun",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "hall-bazaar": {
    name: "Gurpreet Veerji",
    role: "Naai",
    speaker: "kabir",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
  "lingaraj-lane": {
    name: "Sanjay Bhai",
    role: "Napita",
    speaker: "advait",
    brief: "Ask for a haircut, then ask how long the wait is.",
  },
};

const FALLBACK_NPC: BarberNpc = {
  name: "Barber",
  role: "Barber",
  speaker: "ashutosh",
  brief: "Ask for a haircut, then ask how long the wait is.",
};

export function barberNpcFor(districtId: string): BarberNpc {
  return BARBER_NPCS[districtId] ?? FALLBACK_NPC;
}

/** Extensions accepted for dropped-in cutscene art, in preference order. */
const CUTSCENE_EXTS = ["png", "jpg", "jpeg", "webp"] as const;

/**
 * Backdrop candidates for the post-haircut cutscene, best first: the district's
 * own art from public/cutscenes/barber/ (see the README there) in whichever
 * format it was saved as, then its cover art as a stand-in.
 *
 * Every extension is offered rather than one hardcoded guess — art arrives as
 * whatever the tool exported, and pinning this to .jpg meant a dropped-in .png
 * was silently ignored. BarberShop probes the list in order and paints the
 * first that actually decodes.
 */
export function barberCutsceneCandidates(districtId: string, coverImage?: string): string[] {
  const art = CUTSCENE_EXTS.map((ext) => `/cutscenes/barber/${districtId}.${ext}`);
  return coverImage ? [...art, coverImage] : art;
}

/**
 * The shop's radio for a district.
 *
 * Explicit video ids, not a `list=` playlist id — see barber-tracks.ts. Only
 * Delhi has a long block; the rest are hand-picked per language, so they loop
 * sooner. That is fine for a cutscene that lasts a minute.
 */
export function barberTracks(language: LangCode): readonly string[] {
  const picked = BARBER_TRACKS[language];
  return picked && picked.length > 0 ? picked : BARBER_TRACKS["hi-IN"];
}

/** Where the corner link points: whatever is playing, on YouTube. */
export function barberTrackUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
