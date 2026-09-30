/** Bulbul default; warmed NPC lesson cache is keyed at this pace. */
export const DEFAULT_TTS_PACE = 1.0;

/** EdTech hear-pronunciation pace (Sarvam guide: 0.85–0.9). */
export const LESSON_PRONUNCIATION_PACE = 0.87;

const PACE_MIN = 0.5;
const PACE_MAX = 2.0;

export function clampTtsPace(pace: number | undefined): number {
  if (pace === undefined || Number.isNaN(pace)) return DEFAULT_TTS_PACE;
  return Math.min(PACE_MAX, Math.max(PACE_MIN, pace));
}
