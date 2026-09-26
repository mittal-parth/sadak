import type { StreetTaskLessons } from "./types";

/** Words in a lesson line, ignoring punctuation (a lone "!" or "?" is not a word). */
export function wordCount(text: string): number {
  return text
    .split(/[\s\-–—]+/)
    .map((w) => w.replace(/[\p{P}\p{S}]/gu, ""))
    .filter(Boolean).length;
}

export interface WordCountMismatch {
  taskId: string;
  tier: keyof StreetTaskLessons;
  step: number;
  side: "npc" | "prompt";
  native: string;
  roman: string;
}

/**
 * Lines whose native script and roman transliteration have different word
 * counts — a sign they drifted into different sentences. Every lesson line
 * transliterates word for word, so any difference is flagged.
 */
export function wordCountMismatches(lessons: Record<string, StreetTaskLessons>): WordCountMismatch[] {
  const out: WordCountMismatch[] = [];
  for (const [taskId, tiers] of Object.entries(lessons)) {
    for (const tier of ["easy", "medium", "hard"] as const) {
      tiers[tier].forEach((step, i) => {
        for (const side of ["npc", "prompt"] as const) {
          const { native, roman } = step[side];
          if (wordCount(native) !== wordCount(roman)) {
            out.push({ taskId, tier, step: i + 1, side, native, roman });
          }
        }
      });
    }
  }
  return out;
}
