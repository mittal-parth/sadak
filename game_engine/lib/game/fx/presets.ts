/**
 * Per-district cinematic grading presets for the render pipeline.
 *
 * Every district is a different hour and a different palette, so the render
 * pipeline needs its own bloom/grade/haze recipe per district rather than one
 * generic look slapped over all of them. Numbers here were tuned by eye
 * against lib/game/fx/preview.mjs renders, not derived analytically.
 *
 * The whole set targets a bright, vibrant, stylized look: saturated colour,
 * crisp shadows, and haze used only as a depth cue. See the house-style note
 * above DELHI_PRESET before changing any of these numbers.
 */

export type QualityTier = "high" | "medium" | "low";

export type RenderPreset = {
  /** Human label, shown nowhere in-game yet but useful in logs/debugging. */
  name: string;

  bloom: {
    /** Overall bloom intensity. Keep low for flat/overcast light. */
    strength: number;
    /** Blur spread. Larger reads as a hazier, more "atmospheric" glow. */
    radius: number;
    /** Luminance threshold above which pixels bloom. Raise to avoid the
     *  whole frame blooming under bright preset exposures. */
    threshold: number;
  };

  grade: {
    /** Lift/gamma/gain, applied per RGB channel, classic colourist controls.
     *  lift touches shadows, gamma the midtones, gain the highlights. */
    lift: [number, number, number];
    gamma: [number, number, number];
    gain: [number, number, number];
    /** 0 = greyscale, 1 = neutral, >1 = punchier colour. */
    saturation: number;
    /** -1 (cold/blue) .. +1 (warm/amber) white-balance push. */
    temperature: number;
    vignette: {
      /** 0 = no vignette, ~0.4 is a strong but not distracting one. */
      strength: number;
      /** Fraction of the frame radius left untouched before darkening. */
      radius: number;
    };
  };

  /** Screen-space depth haze: denser and warmer near the horizon so distant
   *  buildings recede instead of popping at full contrast. */
  haze: {
    color: [number, number, number];
    /** Exponential-squared density against linear view-space distance. */
    density: number;
    /** How strongly the haze warms/thickens toward the screen-space horizon
     *  band, independent of the distance term. */
    horizonBoost: number;
  };

  /** Film grain amount, 0..1, kept subtle (0.02-0.05 typical). */
  grain: number;
  /** Chromatic aberration strength in UV units, biased to frame edges. */
  chromaticAberration: number;
};

/**
 * House style, so the ten presets below stay a family rather than ten
 * unrelated guesses:
 *
 *   - Haze is a *depth cue*, not weather. Density stays at 0.0015-0.003 and
 *     the colour is always a high-value neighbour of that district's sky, so
 *     distant buildings recede without the frame going milky.
 *   - Grain and chromatic aberration are 0 everywhere. Both were reading as
 *     dirt rather than as film character. The uniforms and the shader
 *     branches are deliberately kept alive so a future gritty district can
 *     dial them back up without a shader change.
 *   - No gain channel ever drops below 1.0. Pulling a channel down to fake a
 *     colour cast is what made the old grades look washed; the cast comes
 *     from `temperature` and from the district palette instead.
 *   - Vignette is 0.10-0.16 at radius 0.78+ — enough to keep the eye centred,
 *     not enough to read as a dark border.
 *
 * District identity is carried by hue and by the palettes in districts.ts,
 * never by desaturation.
 */

export const DELHI_PRESET: RenderPreset = {
  name: "Purani Sadak — bright golden afternoon",
  bloom: { strength: 0.34, radius: 0.5, threshold: 0.85 },
  grade: {
    lift: [0.012, 0.008, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.08, 1.04, 1.0],
    saturation: 1.32,
    temperature: 0.12,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.88, 0.9, 0.94], density: 0.0022, horizonBoost: 0.16 },
  grain: 0,
  chromaticAberration: 0,
};

export const CHENNAI_PRESET: RenderPreset = {
  name: "Marina Nagar — clear coastal noon",
  bloom: { strength: 0.36, radius: 0.45, threshold: 0.86 },
  grade: {
    lift: [0.0, 0.004, 0.01],
    gamma: [1.0, 1.0, 0.99],
    gain: [1.06, 1.07, 1.08],
    saturation: 1.28,
    temperature: 0.0,
    vignette: { strength: 0.1, radius: 0.85 },
  },
  haze: { color: [0.84, 0.91, 0.97], density: 0.0018, horizonBoost: 0.14 },
  grain: 0,
  chromaticAberration: 0,
};

export const BENGALURU_PRESET: RenderPreset = {
  name: "Majestic Cross — garden-city morning",
  bloom: { strength: 0.3, radius: 0.45, threshold: 0.86 },
  grade: {
    // Was the dull one: saturation 0.72 with every gain channel at or below
    // 1.0, i.e. a grade that actively drained the frame. Now the greenest,
    // freshest district rather than the greyest.
    lift: [0.004, 0.01, 0.008],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.04, 1.08, 1.04],
    saturation: 1.34,
    temperature: -0.04,
    vignette: { strength: 0.12, radius: 0.82 },
  },
  haze: { color: [0.86, 0.92, 0.9], density: 0.002, horizonBoost: 0.14 },
  grain: 0,
  chromaticAberration: 0,
};

export const KOLKATA_PRESET: RenderPreset = {
  name: "Park Gully — pink-gold late afternoon",
  bloom: { strength: 0.4, radius: 0.55, threshold: 0.84 },
  grade: {
    lift: [0.014, 0.006, 0.012],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.1, 1.03, 1.02],
    saturation: 1.36,
    temperature: 0.16,
    vignette: { strength: 0.16, radius: 0.78 },
  },
  haze: { color: [0.94, 0.87, 0.86], density: 0.0025, horizonBoost: 0.18 },
  grain: 0,
  chromaticAberration: 0,
};

export const HYDERABAD_PRESET: RenderPreset = {
  name: "Charminar Lane — warm violet afternoon",
  bloom: { strength: 0.36, radius: 0.52, threshold: 0.84 },
  grade: {
    lift: [0.01, 0.006, 0.014],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.08, 1.02, 1.05],
    saturation: 1.34,
    temperature: 0.1,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.92, 0.88, 0.94], density: 0.0024, horizonBoost: 0.16 },
  grain: 0,
  chromaticAberration: 0,
};

export const KOCHI_PRESET: RenderPreset = {
  name: "Fort Kochi — humid backwater green",
  // Pushed away from Chennai's hard white coast: greener midtones, a touch
  // more bloom for the humidity, and a haze that leans teal rather than blue.
  bloom: { strength: 0.42, radius: 0.55, threshold: 0.82 },
  grade: {
    lift: [0.0, 0.012, 0.008],
    gamma: [1.0, 0.99, 1.0],
    gain: [1.02, 1.09, 1.05],
    saturation: 1.34,
    temperature: -0.1,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.8, 0.93, 0.9], density: 0.0026, horizonBoost: 0.18 },
  grain: 0,
  chromaticAberration: 0,
};

export const MUMBAI_PRESET: RenderPreset = {
  name: "Dadar Chowk — bright coastal midday",
  bloom: { strength: 0.36, radius: 0.5, threshold: 0.85 },
  grade: {
    lift: [0.006, 0.006, 0.01],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.07, 1.06, 1.06],
    saturation: 1.28,
    temperature: 0.04,
    vignette: { strength: 0.12, radius: 0.82 },
  },
  haze: { color: [0.86, 0.91, 0.96], density: 0.002, horizonBoost: 0.15 },
  grain: 0,
  chromaticAberration: 0,
};

export const AHMEDABAD_PRESET: RenderPreset = {
  name: "Manek Chowk — saffron afternoon",
  bloom: { strength: 0.38, radius: 0.52, threshold: 0.84 },
  grade: {
    lift: [0.014, 0.008, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.1, 1.05, 1.0],
    saturation: 1.36,
    temperature: 0.16,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.95, 0.91, 0.86], density: 0.0024, horizonBoost: 0.17 },
  grain: 0,
  chromaticAberration: 0,
};

export const AMRITSAR_PRESET: RenderPreset = {
  name: "Hall Bazaar — golden hour, clear",
  bloom: { strength: 0.42, radius: 0.55, threshold: 0.83 },
  grade: {
    lift: [0.014, 0.01, 0.0],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.11, 1.07, 1.0],
    saturation: 1.34,
    temperature: 0.18,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.96, 0.92, 0.85], density: 0.0025, horizonBoost: 0.18 },
  grain: 0,
  chromaticAberration: 0,
};

export const BHUBANESWAR_PRESET: RenderPreset = {
  name: "Lingaraj Lane — warm sandstone light",
  bloom: { strength: 0.34, radius: 0.5, threshold: 0.85 },
  grade: {
    lift: [0.012, 0.008, 0.004],
    gamma: [1.0, 1.0, 1.0],
    gain: [1.08, 1.04, 1.01],
    saturation: 1.3,
    temperature: 0.12,
    vignette: { strength: 0.14, radius: 0.8 },
  },
  haze: { color: [0.93, 0.9, 0.87], density: 0.0022, horizonBoost: 0.16 },
  grain: 0,
  chromaticAberration: 0,
};

/** Keyed by districts.ts `District.id`, so callers can do
 *  `RENDER_PRESETS[district.id]` without a switch statement.
 *
 *  Every shipped district must appear here. render.ts falls back to the first
 *  entry when a key is missing, which is how the six seed districts silently
 *  rendered through Delhi's grade — Fort Kochi's coastal-blue theme included. */
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
