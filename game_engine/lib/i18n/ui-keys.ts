import type { LessonTier } from "@/lib/game/levels";

/** Dialogue-only UI chrome; English value is the catalog lookup key. */
export type UiKey =
  | "objective"
  | "you"
  | "learning"
  | "remembersYou"
  | "youSaid"
  | "didntCatch"
  | "sayAgainReady"
  | "tryAgain"
  | "continue"
  | "errandComplete"
  | "done"
  | "holdToSpeak"
  | "listening"
  | "transcribing"
  | "holdToSpeakLine"
  | "speaking"
  | "level"
  | "words"
  | "linesScored"
  | "hearPronunciation"
  | "playingPronunciation"
  | "close"
  | "easyLesson"
  | "mediumLesson"
  | "hardLesson";

export const UI_KEY_TO_ENGLISH: Record<UiKey, string> = {
  objective: "Objective",
  you: "You",
  learning: "learning",
  remembersYou: "· remembers you",
  youSaid: "You said:",
  didntCatch: "Didn't catch that — try again.",
  sayAgainReady: "Say it again when you're ready.",
  tryAgain: "Try again",
  continue: "Continue →",
  errandComplete: "Errand complete",
  done: "Done",
  holdToSpeak: "Hold to speak",
  listening: "Listening…",
  transcribing: "Transcribing…",
  holdToSpeakLine: "Hold to speak the line above",
  speaking: "🔊 speaking…",
  level: "Level",
  words: "words",
  linesScored: "lines scored · average accuracy",
  hearPronunciation: "Hear correct pronunciation",
  playingPronunciation: "Playing pronunciation",
  close: "Close",
  easyLesson: "Easy lesson",
  mediumLesson: "Medium lesson",
  hardLesson: "Hard lesson",
};

export function lessonTierUiKey(tier: LessonTier): UiKey {
  switch (tier) {
    case "easy":
      return "easyLesson";
    case "medium":
      return "mediumLesson";
    case "hard":
      return "hardLesson";
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}
