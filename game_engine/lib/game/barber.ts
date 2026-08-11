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
 * What the fascia actually reads, in the district's own script — the way these
 * boards are lettered on the street. Romanised gloss rides underneath in small
 * type so a non-reader still knows what the building is.
 */
export const BARBER_SHOP_SIGN: Record<LangCode, { native: string; roman: string }> = {
  "hi-IN": { native: "नाई की दुकान", roman: "NAAI KI DUKAAN" },
  "ta-IN": { native: "முடிதிருத்தும் நிலையம்", roman: "MUDI THIRUTHUM NILAYAM" },
  "te-IN": { native: "క్షౌరశాల", roman: "KSHOURASHALA" },
  "kn-IN": { native: "ಕ್ಷೌರದ ಅಂಗಡಿ", roman: "KSHOURADA ANGADI" },
  "ml-IN": { native: "ബാർബർ ഷോപ്പ്", roman: "BARBER SHOPPU" },
  "mr-IN": { native: "केशकर्तनालय", roman: "KESHKARTANALAYA" },
  "gu-IN": { native: "વાળંદની દુકાન", roman: "VAALANDNI DUKAAN" },
  "bn-IN": { native: "নাপিতের দোকান", roman: "NAPITER DOKAN" },
  "pa-IN": { native: "ਨਾਈ ਦੀ ਦੁਕਾਨ", roman: "NAAI DI DUKAAN" },
  "od-IN": { native: "ନାପିତ ଦୋକାନ", roman: "NAPITA DOKANA" },
  "en-IN": { native: "BARBER SHOP", roman: "SINCE 1972" },
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
 * The shop's radio.
 *
 * Driven by explicit video ids rather than a `list=` playlist id. The source
 * playlist refuses to embed — YouTube answers "This video is unavailable" for
 * any `list=PLTJ1PnzCWyFw`, while all 70 of its videos embed fine individually
 * (a known-public control playlist embeds fine from the same page, so this is a
 * property of that playlist, not of the embed). Handing the player an explicit
 * id queue sidesteps it entirely.
 */
export function barberTracks(): readonly string[] {
  return BARBER_TRACKS;
}

/** Where the "YT Music" link in the cutscene corner points. */
export function barberPlaylistUrl(): string {
  return `https://music.youtube.com/playlist?list=${BARBER_SOURCE_PLAYLIST}`;
}

const BARBER_SOURCE_PLAYLIST = "PLTJ1PnzCWyFw";
