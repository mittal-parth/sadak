export type ComfortLevel = "easy" | "medium" | "hard";
export type LessonTier = "easy" | "medium" | "hard";

/** errandIndex 0..3 matches auto, shop, temple, bus in tasks pack order */
const TIER_BY_COMFORT_AND_ERRAND: Record<
  ComfortLevel,
  [LessonTier, LessonTier, LessonTier, LessonTier]
> = {
  easy: ["easy", "easy", "medium", "medium"],
  medium: ["easy", "medium", "medium", "hard"],
  hard: ["medium", "medium", "hard", "hard"],
};

export function lessonTierFor(comfort: ComfortLevel, errandIndex: number): LessonTier {
  const idx = Math.max(0, Math.min(3, errandIndex));
  return TIER_BY_COMFORT_AND_ERRAND[comfort][idx];
}

export function errandLevelNumber(errandIndex: number): number {
  return Math.max(1, Math.min(4, errandIndex + 1));
}

export function lessonTierLabel(tier: LessonTier): string {
  switch (tier) {
    case "easy":
      return "Easy lesson";
    case "medium":
      return "Medium lesson";
    case "hard":
      return "Hard lesson";
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}
