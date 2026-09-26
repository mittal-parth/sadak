export type ComfortLevel = "easy" | "medium" | "hard";
export type LessonTier = "easy" | "medium" | "hard";

/** errandIndex 0..4 matches auto, shop, temple, bus, then the city's own errand, in tasks pack order */
const TIER_BY_COMFORT_AND_ERRAND: Record<
  ComfortLevel,
  [LessonTier, LessonTier, LessonTier, LessonTier, LessonTier]
> = {
  easy: ["easy", "easy", "medium", "medium", "medium"],
  medium: ["easy", "medium", "medium", "hard", "hard"],
  hard: ["medium", "medium", "hard", "hard", "hard"],
};

export function lessonTierFor(comfort: ComfortLevel, errandIndex: number): LessonTier {
  const idx = Math.max(0, Math.min(4, errandIndex));
  return TIER_BY_COMFORT_AND_ERRAND[comfort][idx];
}

export function errandLevelNumber(errandIndex: number): number {
  return Math.max(1, Math.min(5, errandIndex + 1));
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
