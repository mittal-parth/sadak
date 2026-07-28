import type { LessonStep } from "@/lib/game/districts";
import type { LessonTier } from "@/lib/game/levels";

export type StreetTaskLessons = Record<LessonTier, LessonStep[]>;

export function s(
  nNative: string,
  nRoman: string,
  nEn: string,
  pNative: string,
  pRoman: string,
  pEn: string,
): LessonStep {
  return {
    npc: { native: nNative, roman: nRoman, en: nEn },
    prompt: { native: pNative, roman: pRoman, en: pEn },
  };
}
