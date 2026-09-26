/**
 * Per-district look for the cel render pipeline.
 *
 * Every district is a different hour and a different palette, so each gets
 * its own ink, tone, grade and haze recipe rather than one generic look over
 * all ten. Numbers were tuned by eye against in-engine renders, not derived.
 *
 * House style, so the ten presets stay a family rather than ten guesses:
 *
 *   - The look is an illustrated street: flat cel bands, a dark warm ink line
 *     on silhouettes and creases, shadows that shift toward a cool violet
 *     instead of going grey. Identity comes from hue and the district
 *     palette in districts.ts, never from desaturation.
 *   - Haze is a *depth cue*, not weather. Density stays at 0.0015-0.003 and
 *     the colour is a high-value neighbour of that district's sky, so the far
 *     end of a street recedes without the frame going milky.
 *   - Ink fades out between ~40m and ~110m. Lines on the far skyline turn to
 *     scribble at screen resolution, so the background is left to the haze.
 *   - No gain channel drops below 1.0. Pulling a channel down to fake a cast
 *     is what made older grades look washed; the cast comes from
 *     `temperature`, the split tone and the palette instead.
 *   - Vignette is 0.10-0.16 at radius 0.78+.
 */

export type QualityTier = "high" | "medium" | "low";

type RGB = [number, number, number];

export type RenderPreset = {
  /** Human label, useful in logs. */
  name: string;

  /** Hue the cel shadow bands on every material shift toward (sRGB hex).
   *  A mid-value violet/blue; darker values deepen the form shadows. */
  celShadowTint: number;

  ink: {
    /** Line colour, linear RGB. Warm near-black reads as drawn, pure black
     *  as a wireframe. */
    color: RGB;
    /** 0 disables the line pass entirely. */
    strength: number;
    /** View distance (m) where lines start to fade, and where they are gone. */
    fadeStart: number;
    fadeEnd: number;
  };

  tone: {
    /** Linear exposure multiplier ahead of the highlight shoulder. */
    exposure: number;
    /** Split-tone multipliers, linear RGB: darks, then lights. */
    splitShadow: RGB;
    splitLight: RGB;
    /** Added to the darks so shadow detail never crushes. */
    shadowLift: number;
  };

  grade: {
    /** Lift/gamma/gain per RGB channel. */
    lift: RGB;
    gamma: RGB;
    gain: RGB;
    /** 0 = greyscale, 1 = neutral, >1 = punchier colour. */
    saturation: number;
    /** -1 (cold/blue) .. +1 (warm/amber) white-balance push. */
    temperature: number;
    vignette: { strength: number; radius: number };
  };

  /** Screen-space depth haze, linear RGB. */
  haze: {
    color: RGB;
    /** Exponential-squared density against linear view distance. */
    density: number;
    /** Extra thickening toward the screen-space horizon band. */
    horizonBoost: number;
  };
};

const INK: RenderPreset["ink"] = {
  color: [0.045, 0.03, 0.05],
  strength: 1,
  fadeStart: 42,
  fadeEnd: 115,
};

const TONE: RenderPreset["tone"] = {
  exposure: 1.06,
  splitShadow: [0.86, 0.84, 1.0],
  splitLight: [1.0, 0.985, 0.95],
  shadowLift: 0.018,
};

type Overrides = Omit<RenderPreset, "ink" | "tone"> & {
  ink?: Partial<RenderPreset["ink"]>;
  tone?: Partial<RenderPreset["tone"]>;
};

function preset(o: Overrides): RenderPreset {
  return { ...o, ink: { ...INK, ...o.ink }, tone: { ...TONE, ...o.tone } };
}

export const DELHI_PRESET = preset({
  name: "Chandni Chowk — bright golden afternoon",
  celShadowTint: 0x8a7fb8,
  tone: { splitLight: [1.0, 0.97, 0.9] },
  grade: {
    lift: [0.012, 0.008, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.06, 1.03, 1.0],
    saturation: 1.18,
    temperature: 0.12,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.88, 0.9, 0.94], density: 0.0022, horizonBoost: 0.16 },
});

export const CHENNAI_PRESET = preset({
  name: "Triplicane — clear coastal noon",
  celShadowTint: 0x7f8fc4,
  tone: { splitShadow: [0.84, 0.88, 1.0] },
  grade: {
    lift: [0.0, 0.004, 0.01],
    gamma: [1.0, 1.0, 0.99],
    gain: [1.04, 1.05, 1.06],
    saturation: 1.14,
    temperature: 0.0,
    vignette: { strength: 0.1, radius: 0.85 },
  },
  haze: { color: [0.84, 0.91, 0.97], density: 0.0018, horizonBoost: 0.14 },
});

export const BENGALURU_PRESET = preset({
  name: "Majestic — bright garden-city morning",
  celShadowTint: 0x7c93b8,
  tone: { splitShadow: [0.84, 0.9, 0.98] },
  grade: {
    lift: [0.0, 0.006, 0.008],
    gamma: [1.0, 1.0, 0.99],
    gain: [1.04, 1.06, 1.03],
    saturation: 1.16,
    temperature: 0.02,
    vignette: { strength: 0.1, radius: 0.85 },
  },
  haze: { color: [0.84, 0.92, 0.94], density: 0.0018, horizonBoost: 0.14 },
});

export const KOLKATA_PRESET = preset({
  name: "Park Street — pink-gold late afternoon",
  celShadowTint: 0x9a7cb4,
  tone: { splitShadow: [0.9, 0.82, 0.98], splitLight: [1.0, 0.95, 0.9] },
  grade: {
    lift: [0.014, 0.006, 0.012],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.08, 1.02, 1.02],
    saturation: 1.2,
    temperature: 0.16,
    vignette: { strength: 0.16, radius: 0.78 },
  },
  haze: { color: [0.94, 0.87, 0.86], density: 0.0025, horizonBoost: 0.18 },
});

export const HYDERABAD_PRESET = preset({
  name: "Charminar — warm violet afternoon",
  celShadowTint: 0x9178bc,
  tone: { splitShadow: [0.88, 0.82, 1.0], splitLight: [1.0, 0.96, 0.92] },
  grade: {
    lift: [0.01, 0.006, 0.014],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.06, 1.02, 1.04],
    saturation: 1.18,
    temperature: 0.1,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.92, 0.88, 0.94], density: 0.0024, horizonBoost: 0.16 },
});

export const KOCHI_PRESET = preset({
  name: "Fort Kochi — humid backwater green",
  // Pushed away from Chennai's hard white coast: greener midtones and a haze
  // that leans teal rather than blue.
  celShadowTint: 0x6f98a8,
  tone: { splitShadow: [0.82, 0.92, 0.94] },
  grade: {
    lift: [0.0, 0.012, 0.008],
    gamma: [1.0, 0.99, 1.0],
    gain: [1.02, 1.07, 1.04],
    saturation: 1.18,
    temperature: -0.1,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.8, 0.93, 0.9], density: 0.0026, horizonBoost: 0.18 },
});

export const MUMBAI_PRESET = preset({
  name: "Dadar — bright coastal midday",
  celShadowTint: 0x8488c0,
  grade: {
    lift: [0.006, 0.006, 0.01],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.05, 1.04, 1.04],
    saturation: 1.14,
    temperature: 0.04,
    vignette: { strength: 0.12, radius: 0.82 },
  },
  haze: { color: [0.86, 0.91, 0.96], density: 0.002, horizonBoost: 0.15 },
});

export const AHMEDABAD_PRESET = preset({
  name: "Manek Chowk — saffron afternoon",
  celShadowTint: 0x9a80b0,
  tone: { splitLight: [1.0, 0.96, 0.88] },
  grade: {
    lift: [0.014, 0.008, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.08, 1.04, 1.0],
    saturation: 1.2,
    temperature: 0.16,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.95, 0.91, 0.86], density: 0.0024, horizonBoost: 0.17 },
});

export const AMRITSAR_PRESET = preset({
  name: "Golden Temple — golden hour, clear",
  celShadowTint: 0x9a7fb0,
  tone: { splitLight: [1.0, 0.95, 0.86] },
  grade: {
    lift: [0.014, 0.01, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.08, 1.05, 1.0],
    saturation: 1.18,
    temperature: 0.18,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.96, 0.92, 0.85], density: 0.0025, horizonBoost: 0.18 },
});

export const BHUBANESWAR_PRESET = preset({
  name: "Old Town — warm sandstone light",
  celShadowTint: 0x9280b4,
  tone: { splitLight: [1.0, 0.97, 0.9] },
  grade: {
    lift: [0.012, 0.008, 0.004],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.06, 1.03, 1.01],
    saturation: 1.16,
    temperature: 0.12,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.93, 0.9, 0.87], density: 0.0022, horizonBoost: 0.16 },
});

/** Keyed by districts.ts `District.id`.
 *
 *  Every shipped district must appear here. render.ts falls back to the first
 *  entry when a key is missing, which is how the six seed districts once
 *  silently rendered through Delhi's grade. */
export const RENDER_PRESETS: Record<string, RenderPreset> = {
  "purani-sadak": DELHI_PRESET,
  "marina-nagar": CHENNAI_PRESET,
  "majestic-cross": BENGALURU_PRESET,
  "park-gully": KOLKATA_PRESET,
  "charminar-lane": HYDERABAD_PRESET,
  "fort-kochi": KOCHI_PRESET,
  "dadar-chowk": MUMBAI_PRESET,
  "manek-chowk": AHMEDABAD_PRESET,
  "hall-bazaar": AMRITSAR_PRESET,
  "lingaraj-lane": BHUBANESWAR_PRESET,
};

/** Preset for a district id, falling back (with a dev warning) to the first. */
export function presetFor(districtId: string): RenderPreset {
  const p = RENDER_PRESETS[districtId];
  if (p) return p;
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[render] No preset for district "${districtId}" — falling back. Add one to fx/presets.ts.`
    );
  }
  return Object.values(RENDER_PRESETS)[0];
}
