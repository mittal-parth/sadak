/**
 * Painted shop signboards in the district's own script.
 *
 * A blank coloured bar over a shutter reads as a placeholder; a board that
 * says ಬೇಕರಿ / BAKERY is what makes the street read as Bengaluru. Every board
 * in a district is one cell of a single canvas atlas, so two hundred
 * signboards cost one texture and share one material.
 *
 * Lettering follows real Indian signage: the local-script name large, an
 * English line small underneath, on a flat enamel colour with a border.
 */

import * as THREE from "three";
import type { LangCode } from "@/lib/sarvam";
import { mulberry32 } from "./props";

export type ShopSign = { native: string; en: string };

/** What each board in a language's list sells, by position: every list
 *  runs grocer, chemist, sweets, tea, tailor, eating house, mobiles, bakery. */
export const SIGN_TRADES = ["grocer", "chemist", "sweets", "tea", "tailor", "food", "mobile", "bakery"] as const;
export type SignTrade = (typeof SIGN_TRADES)[number];

/**
 * Eight everyday shop types per language, keyed by the district's
 * `language` code. Deliberately common words only (grocer, chemist,
 * sweets...), since these are the boards you see on every Indian street.
 * Typed against LangCode, so adding a district language without signs is a
 * compile error rather than a blank street.
 */
export const SHOP_SIGNS: Record<LangCode, ShopSign[]> = {
  "en-IN": [
    { native: "General Store", en: "DAILY NEEDS" },
    { native: "Medical Store", en: "OPEN 24 HRS" },
    { native: "Sweet House", en: "PURE GHEE" },
    { native: "Tea Stall", en: "CUTTING CHAI" },
    { native: "Tailors", en: "LADIES & GENTS" },
    { native: "Restaurant", en: "VEG & NON-VEG" },
    { native: "Mobile Point", en: "RECHARGE HERE" },
    { native: "Bakery", en: "FRESH DAILY" },
  ],
  "hi-IN": [
    { native: "किराना स्टोर", en: "KIRANA STORE" },
    { native: "मेडिकल स्टोर", en: "MEDICAL STORE" },
    { native: "मिठाई भंडार", en: "SWEETS" },
    { native: "चाय की दुकान", en: "TEA STALL" },
    { native: "दर्ज़ी", en: "TAILORS" },
    { native: "भोजनालय", en: "RESTAURANT" },
    { native: "मोबाइल", en: "MOBILE SHOP" },
    { native: "बेकरी", en: "BAKERY" },
  ],
  "mr-IN": [
    { native: "किराणा माल", en: "KIRANA STORE" },
    { native: "औषधालय", en: "MEDICAL STORE" },
    { native: "मिठाई", en: "SWEETS" },
    { native: "चहा", en: "TEA STALL" },
    { native: "शिंपी", en: "TAILORS" },
    { native: "उपहारगृह", en: "RESTAURANT" },
    { native: "मोबाईल", en: "MOBILE SHOP" },
    { native: "बेकरी", en: "BAKERY" },
  ],
  "ta-IN": [
    { native: "மளிகை கடை", en: "PROVISION STORE" },
    { native: "மருந்தகம்", en: "PHARMACY" },
    { native: "இனிப்பகம்", en: "SWEETS" },
    { native: "டீ கடை", en: "TEA STALL" },
    { native: "தையல் கடை", en: "TAILORS" },
    { native: "உணவகம்", en: "RESTAURANT" },
    { native: "மொபைல்ஸ்", en: "MOBILES" },
    { native: "பேக்கரி", en: "BAKERY" },
  ],
  "kn-IN": [
    { native: "ದಿನಸಿ ಅಂಗಡಿ", en: "PROVISION STORE" },
    { native: "ಔಷಧಾಲಯ", en: "PHARMACY" },
    { native: "ಸಿಹಿ ತಿಂಡಿ", en: "SWEETS" },
    { native: "ಟೀ ಅಂಗಡಿ", en: "TEA STALL" },
    { native: "ಟೈಲರ್ಸ್", en: "TAILORS" },
    { native: "ಹೋಟೆಲ್", en: "HOTEL" },
    { native: "ಮೊಬೈಲ್ಸ್", en: "MOBILES" },
    { native: "ಬೇಕರಿ", en: "BAKERY" },
  ],
  "bn-IN": [
    { native: "মুদিখানা", en: "GROCERY" },
    { native: "ঔষধালয়", en: "PHARMACY" },
    { native: "মিষ্টান্ন ভাণ্ডার", en: "SWEETS" },
    { native: "চায়ের দোকান", en: "TEA STALL" },
    { native: "দর্জি", en: "TAILORS" },
    { native: "হোটেল", en: "HOTEL" },
    { native: "মোবাইল", en: "MOBILE SHOP" },
    { native: "বেকারি", en: "BAKERY" },
  ],
  "te-IN": [
    { native: "కిరాణా దుకాణం", en: "KIRANA STORE" },
    { native: "మందుల షాపు", en: "MEDICAL SHOP" },
    { native: "స్వీట్స్", en: "SWEETS" },
    { native: "టీ స్టాల్", en: "TEA STALL" },
    { native: "టైలర్స్", en: "TAILORS" },
    { native: "హోటల్", en: "HOTEL" },
    { native: "మొబైల్స్", en: "MOBILES" },
    { native: "బేకరీ", en: "BAKERY" },
  ],
  "ml-IN": [
    { native: "പലചരക്ക് കട", en: "PROVISION STORE" },
    { native: "മെഡിക്കൽസ്", en: "MEDICALS" },
    { native: "സ്വീറ്റ്സ്", en: "SWEETS" },
    { native: "ചായക്കട", en: "TEA SHOP" },
    { native: "തയ്യൽക്കട", en: "TAILORS" },
    { native: "ഹോട്ടൽ", en: "HOTEL" },
    { native: "മൊബൈൽസ്", en: "MOBILES" },
    { native: "ബേക്കറി", en: "BAKERY" },
  ],
  "gu-IN": [
    { native: "કરિયાણા સ્ટોર", en: "KIRANA STORE" },
    { native: "મેડિકલ સ્ટોર", en: "MEDICAL STORE" },
    { native: "મીઠાઈ", en: "SWEETS" },
    { native: "ચા ની કીટલી", en: "TEA STALL" },
    { native: "દરજી", en: "TAILORS" },
    { native: "ભોજનાલય", en: "RESTAURANT" },
    { native: "મોબાઇલ", en: "MOBILE SHOP" },
    { native: "બેકરી", en: "BAKERY" },
  ],
  "pa-IN": [
    { native: "ਕਰਿਆਨਾ ਸਟੋਰ", en: "KIRANA STORE" },
    { native: "ਮੈਡੀਕਲ ਸਟੋਰ", en: "MEDICAL STORE" },
    { native: "ਮਿਠਾਈ", en: "SWEETS" },
    { native: "ਚਾਹ ਦੀ ਦੁਕਾਨ", en: "TEA STALL" },
    { native: "ਦਰਜ਼ੀ", en: "TAILORS" },
    { native: "ਢਾਬਾ", en: "DHABA" },
    { native: "ਮੋਬਾਈਲ", en: "MOBILE SHOP" },
    { native: "ਬੇਕਰੀ", en: "BAKERY" },
  ],
  "od-IN": [
    { native: "କିରାଣା ଦୋକାନ", en: "KIRANA STORE" },
    { native: "ଔଷଧାଳୟ", en: "MEDICAL STORE" },
    { native: "ମିଠା ଦୋକାନ", en: "SWEETS" },
    { native: "ଚା ଦୋକାନ", en: "TEA STALL" },
    { native: "ଦରଜି", en: "TAILORS" },
    { native: "ହୋଟେଲ", en: "HOTEL" },
    { native: "ମୋବାଇଲ", en: "MOBILE SHOP" },
    { native: "ବେକେରୀ", en: "BAKERY" },
  ],
};

/** Enamel board colours: [background, lettering]. The classic palette of
 *  hand-painted Indian signage, high contrast so it reads across the road. */
const BOARD_COLOURS: [string, string][] = [
  ["#c8272d", "#fff4d6"],
  ["#1f4e9c", "#ffffff"],
  ["#f2c230", "#8a1a1a"],
  ["#1d7a46", "#fff8e0"],
  ["#f7f1e1", "#b3261e"],
  ["#e8702a", "#ffffff"],
  ["#262a33", "#f5c542"],
  ["#7a2a6e", "#fff1f7"],
];

/** UV rectangle of one atlas cell: [u0, v0, u1, v1]. */
export type UvRect = [number, number, number, number];

export type SignAtlas = {
  texture: THREE.CanvasTexture;
  /** Generic boards (grocer, chemist...) to pick from at random. */
  cells: number;
  rect(i: number): UvRect;
  /** What the shop under generic board `i` sells. */
  trade(i: number): SignTrade;
  /** The board lettered with a real shop's own name, if the atlas has it. */
  named(name: string): UvRect | null;
  dispose(): void;
};

const COLS = 2;
const ROWS = 8;
const CELL_W = 512;
const CELL_H = 128;

/**
 * The Noto family app/globals.css loads for each script, so boards letter in
 * the same face as the rest of the UI. OS script fonts follow as a fallback
 * for the frame before the webfont arrives.
 */
const SCRIPT_FONT: Record<LangCode, string | null> = {
  "hi-IN": "Noto Sans Devanagari",
  "mr-IN": "Noto Sans Devanagari",
  "ta-IN": "Noto Sans Tamil",
  "kn-IN": "Noto Sans Kannada",
  "bn-IN": "Noto Sans Bengali",
  "te-IN": "Noto Sans Telugu",
  "ml-IN": "Noto Sans Malayalam",
  "gu-IN": "Noto Sans Gujarati",
  "pa-IN": "Noto Sans Gurmukhi",
  "od-IN": "Noto Sans Oriya",
  "en-IN": null,
};

const SYSTEM_STACK =
  '"Nirmala UI", "Kohinoor Devanagari", "Tamil Sangam MN", "Kannada Sangam MN", ' +
  '"Bangla Sangam MN", "Telugu Sangam MN", "Malayalam Sangam MN", "Gujarati Sangam MN", ' +
  '"Gurmukhi MN", "Oriya Sangam MN", system-ui, sans-serif';

/** globals.css loads 400-600; asking for 700 gets a synthesised smear. */
const WEIGHT = "600";

export function signsFor(language: LangCode): ShopSign[] {
  return SHOP_SIGNS[language];
}

/** Largest font size (px) at which `text` fits `maxW`, capped at `start`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, start: number, maxW: number, stack: string) {
  let size = start;
  ctx.font = `${WEIGHT} ${size}px ${stack}`;
  while (size > 12 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${WEIGHT} ${size}px ${stack}`;
  }
  return size;
}

function paintAtlas(ctx: CanvasRenderingContext2D, signs: ShopSign[], stack: string, seed: number, names: string[] = []) {
  const rand = mulberry32(seed);
  const cells = COLS * ROWS;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Real names below the generic boards: one line, as big as it fits.
  names.forEach((name, k) => {
    const i = cells + k;
    const [bg, fg] = BOARD_COLOURS[(k * 5 + 2) % BOARD_COLOURS.length];
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 9, y + 9, CELL_W - 18, CELL_H - 18);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, name, 64, CELL_W - 60, stack);
    ctx.fillText(name, x + CELL_W / 2, y + CELL_H * 0.52);
  });

  for (let i = 0; i < cells; i++) {
    const sign = signs[i % signs.length];
    // Second pass through the list gets different colours, so two bakeries
    // on one street are not twins.
    const [bg, fg] = BOARD_COLOURS[(i + Math.floor(i / signs.length) * 3) % BOARD_COLOURS.length];
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;

    ctx.fillStyle = bg;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    // Painted border, inset.
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 9, y + 9, CELL_W - 18, CELL_H - 18);

    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, sign.native, 60, CELL_W - 60, stack);
    ctx.fillText(sign.native, x + CELL_W / 2, y + CELL_H * 0.43);
    fitFont(ctx, sign.en, 22, CELL_W - 90, stack);
    ctx.fillText(sign.en, x + CELL_W / 2, y + CELL_H * 0.8);

    // A little sun-fade on some boards: lighter wash over the top half.
    if (rand() > 0.6) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y, CELL_W, CELL_H * 0.5);
    }
  }
}

export function createSignAtlas(language: LangCode, seed = 1, shopNames: string[] = []): SignAtlas {
  const signs = signsFor(language);
  const family = SCRIPT_FONT[language];
  const stack = family ? `"${family}", ${SYSTEM_STACK}` : SYSTEM_STACK;
  const names = [...new Set(shopNames)];

  const canvas = document.createElement("canvas");
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * (ROWS + Math.ceil(names.length / COLS));
  const ctx = canvas.getContext("2d")!;
  const cells = COLS * ROWS;
  const rows = canvas.height / CELL_H;
  const cellRect = (c: number): UvRect => {
    const col = c % COLS;
    const row = Math.floor(c / COLS);
    // Canvas rows run top-down; texture v runs bottom-up.
    return [col / COLS, 1 - (row + 1) / rows, (col + 1) / COLS, 1 - row / rows];
  };

  paintAtlas(ctx, signs, stack, seed, names);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  // Canvas text never waits for a webfont: if the district's Noto face has
  // not been used on the page yet, the first paint falls back to an OS font.
  // Ask for it explicitly and repaint once it is in.
  let disposed = false;
  if (family && document.fonts) {
    const sample = signs.map((s) => s.native).join("");
    document.fonts
      .load(`${WEIGHT} 60px "${family}"`, sample)
      .then((faces) => {
        if (disposed) return;
        if (faces.length === 0) {
          console.warn(`[signage] "${family}" did not load; signboards use the OS script font`);
          return;
        }
        paintAtlas(ctx, signs, stack, seed, names);
        texture.needsUpdate = true;
      })
      .catch((err: unknown) => {
        console.warn(`[signage] loading "${family}" failed; signboards use the OS script font`, err);
      });
  }

  return {
    texture,
    cells,
    rect(i) {
      return cellRect(((i % cells) + cells) % cells);
    },
    trade(i) {
      // paintAtlas letters cell i with signs[i % signs.length].
      return SIGN_TRADES[(((i % cells) + cells) % cells) % signs.length];
    },
    named(name) {
      const k = names.indexOf(name);
      return k < 0 ? null : cellRect(cells + k);
    },
    dispose() {
      disposed = true;
      texture.dispose();
    },
  };
}

/* ------------------------------------------------------------------ *
 * Film hoardings
 * ------------------------------------------------------------------ */

/** Four made-up film titles per language, one word each, the way a
 *  mass-release hoarding shouts its title. */
const FILM_TITLES: Record<LangCode, string[]> = {
  "hi-IN": ["शेर", "तूफ़ान", "बादशाह", "दिलवाला"],
  "mr-IN": ["वादळ", "राजा", "दादा", "प्रेम"],
  "ta-IN": ["புலி", "தலைவன்", "காதல்", "மெரினா"],
  "kn-IN": ["ಹುಲಿ", "ಬೆಂಕಿ", "ರಾಜ", "ಪ್ರೀತಿ"],
  "bn-IN": ["বাঘ", "ঝড়", "রাজা", "প্রেম"],
  "te-IN": ["సింహం", "రాజు", "ప్రేమ", "తుఫాను"],
  "ml-IN": ["കടുവ", "കടൽ", "രാജാവ്", "പ്രണയം"],
  "gu-IN": ["વાઘ", "તોફાન", "રાજા", "પ્રેમ"],
  "pa-IN": ["ਸ਼ੇਰ", "ਤੂਫ਼ਾਨ", "ਜੱਟ", "ਪਿਆਰ"],
  "od-IN": ["ବାଘ", "ଝଡ଼", "ରାଜା", "ପ୍ରେମ"],
  "en-IN": ["TIGER", "STORM", "KING", "LOVE"],
};

const POSTER_W = 512;
const POSTER_H = 224;
const POSTER_SKIES: [string, string][] = [
  ["#ff5e3a", "#ffcf3a"],
  ["#1d2b64", "#f8cdda"],
  ["#c31432", "#240b36"],
  ["#11998e", "#38ef7d"],
];

function paintPosters(ctx: CanvasRenderingContext2D, titles: string[], stack: string, seed: number) {
  const rand = mulberry32(seed);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * POSTER_W;
    const y = Math.floor(i / 2) * POSTER_H;
    const [a, b] = POSTER_SKIES[i];
    const grad = ctx.createLinearGradient(x, y, x, y + POSTER_H);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, POSTER_W, POSTER_H);
    // Sunburst behind the hero.
    const cx = x + POSTER_W * 0.3;
    const cy = y + POSTER_H * 0.55;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    for (let k = 0; k < 14; k++) {
      const t0 = (k / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(t0) * 400, cy + Math.sin(t0) * 400);
      ctx.lineTo(cx + Math.cos(t0 + 0.12) * 400, cy + Math.sin(t0 + 0.12) * 400);
      ctx.closePath();
      ctx.fill();
    }
    // Hero and heroine, shoulders up, in silhouette.
    const figure = (fx: number, s: number, hex: string) => {
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(fx, y + POSTER_H - 118 * s, 34 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(fx, y + POSTER_H + 10 * s, 78 * s, 82 * s, 0, Math.PI, 0);
      ctx.fill();
    };
    figure(x + POSTER_W * 0.24, 1.25, "#1b1b24");
    figure(x + POSTER_W * 0.42, 0.95, "#3a1f2e");
    // Title: big, gold with a dark outline, the English strap small.
    const title = titles[i % titles.length];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, title, 96, POSTER_W * 0.42, stack);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#1b1b24";
    ctx.strokeText(title, x + POSTER_W * 0.75, y + POSTER_H * 0.42);
    ctx.fillStyle = rand() < 0.5 ? "#ffd23f" : "#ffffff";
    ctx.fillText(title, x + POSTER_W * 0.75, y + POSTER_H * 0.42);
    ctx.font = `${WEIGHT} 20px ${SYSTEM_STACK}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("NOW SHOWING", x + POSTER_W * 0.75, y + POSTER_H * 0.78);
    // Frame.
    ctx.strokeStyle = "#f4efe4";
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 3, y + 3, POSTER_W - 6, POSTER_H - 6);
  }
}

export type PosterAtlas = { texture: THREE.CanvasTexture; rect(i: number): UvRect; dispose(): void };

/** Four film hoardings in one texture, lettered in the district's script. */
export function createFilmPosters(language: LangCode, seed = 5): PosterAtlas {
  const titles = FILM_TITLES[language];
  const family = SCRIPT_FONT[language];
  const stack = family ? `"${family}", ${SYSTEM_STACK}` : SYSTEM_STACK;
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_W * 2;
  canvas.height = POSTER_H * 2;
  const ctx = canvas.getContext("2d")!;
  paintPosters(ctx, titles, stack, seed);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let disposed = false;
  if (family && document.fonts) {
    document.fonts
      .load(`${WEIGHT} 96px "${family}"`, titles.join(""))
      .then((faces) => {
        if (disposed) return;
        if (faces.length === 0) {
          console.warn(`[signage] "${family}" did not load; hoardings use the OS script font`);
          return;
        }
        paintPosters(ctx, titles, stack, seed);
        texture.needsUpdate = true;
      })
      .catch((err: unknown) => {
        console.warn(`[signage] loading "${family}" failed; hoardings use the OS script font`, err);
      });
  }
  return {
    texture,
    rect(i) {
      const c = ((i % 4) + 4) % 4;
      const u0 = (c % 2) / 2;
      const v1 = 1 - Math.floor(c / 2) / 2;
      return [u0, v1 - 0.5, u0 + 0.5, v1];
    },
    dispose() {
      disposed = true;
      texture.dispose();
    },
  };
}
