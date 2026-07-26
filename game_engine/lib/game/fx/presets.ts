/**
 * Per-district cinematic grading presets for the render pipeline.
 *
 * Every district in districts.ts is a different time of day, so the render
 * pipeline needs a different bloom/grade/haze recipe per district rather than
 * one generic "cinematic" look slapped over all four. Numbers here were tuned
 * by eye against lib/game/fx/preview.mjs renders, not derived analytically.
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

export const DELHI_PRESET: RenderPreset = {
  name: "Purani Sadak — golden dusty afternoon",
  bloom: { strength: 0.55, radius: 0.55, threshold: 0.82 },
  grade: {
    lift: [0.02, 0.014, 0.0],
    gamma: [1.0, 1.0, 1.06],
    gain: [1.08, 1.0, 0.84],
    saturation: 1.15,
    temperature: 0.35,
    vignette: { strength: 0.35, radius: 0.62 },
  },
  haze: { color: [0.86, 0.62, 0.36], density: 0.008, horizonBoost: 0.45 },
  grain: 0.035,
  chromaticAberration: 0.0015,
};

export const CHENNAI_PRESET: RenderPreset = {
  name: "Marina Nagar — hard coastal noon",
  bloom: { strength: 0.38, radius: 0.4, threshold: 0.92 },
  grade: {
    lift: [0.0, 0.0, 0.012],
    gamma: [1.0, 1.0, 0.98],
    gain: [1.05, 1.05, 1.02],
    saturation: 1.05,
    temperature: 0.05,
    vignette: { strength: 0.2, radius: 0.72 },
  },
  haze: { color: [0.76, 0.83, 0.88], density: 0.006, horizonBoost: 0.5 },
  grain: 0.02,
  chromaticAberration: 0.001,
};

export const BENGALURU_PRESET: RenderPreset = {
  name: "Majestic Cross — monsoon overcast",
  bloom: { strength: 0.08, radius: 0.3, threshold: 0.96 },
  grade: {
    lift: [0.012, 0.012, 0.018],
    gamma: [1.02, 1.02, 1.0],
    gain: [0.95, 0.97, 1.0],
    saturation: 0.72,
    temperature: -0.25,
    vignette: { strength: 0.3, radius: 0.6 },
  },
  haze: { color: [0.56, 0.59, 0.61], density: 0.012, horizonBoost: 0.3 },
  grain: 0.03,
  chromaticAberration: 0.0008,
};

export const KOLKATA_PRESET: RenderPreset = {
  name: "Park Gully — rain-washed dusk",
  bloom: { strength: 0.6, radius: 0.65, threshold: 0.78 },
  grade: {
    lift: [0.016, 0.006, 0.02],
    gamma: [1.05, 1.0, 1.02],
    gain: [1.1, 0.95, 0.9],
    saturation: 1.2,
    temperature: 0.3,
    vignette: { strength: 0.4, radius: 0.58 },
  },
  haze: { color: [0.76, 0.46, 0.36], density: 0.010, horizonBoost: 0.55 },
  grain: 0.045,
  chromaticAberration: 0.0018,
};

/** Keyed by districts.ts `District.id`, so callers can do
 *  `RENDER_PRESETS[district.id]` without a switch statement. */
export const RENDER_PRESETS: Record<string, RenderPreset> = {
  "purani-sadak": DELHI_PRESET,
  "marina-nagar": CHENNAI_PRESET,
  "majestic-cross": BENGALURU_PRESET,
  "park-gully": KOLKATA_PRESET,
};
