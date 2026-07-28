import type { LangCode } from "@/lib/sarvam";
import { resolveSpeaker } from "@/lib/sarvam";
import { SEED_DISTRICTS } from "@/lib/game/districts";
import {
  resolveTaskLesson,
  SEED_TASK_PACKS,
  type StreetTask,
} from "@/lib/game/tasks";
import { streetLessonsFor } from "@/lib/game/street-task-lessons";
import type { ComfortLevel, LessonTier } from "@/lib/game/levels";
import { ttsLookupKey } from "@/lib/tts/cache-keys";

export type TtsCacheEntry = {
  lang: LangCode;
  speaker: string;
  text: string;
  key: string;
};

const TIERS: LessonTier[] = ["easy", "medium", "hard"];

function pushEntry(
  seen: Set<string>,
  out: TtsCacheEntry[],
  lang: LangCode,
  speaker: string,
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const sp = resolveSpeaker(speaker);
  const key = ttsLookupKey(lang, sp, trimmed);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ lang, speaker: sp, text: trimmed, key });
}

/** All static lesson NPC lines across seed districts (warm script). */
export function collectAllLessonTtsEntries(): TtsCacheEntry[] {
  const seen = new Set<string>();
  const out: TtsCacheEntry[] = [];

  for (const district of SEED_DISTRICTS) {
    const pack = SEED_TASK_PACKS.find((p) => p.districtId === district.id);
    if (!pack) continue;
    const lang = district.language;

    for (const task of pack.tasks) {
      const lessons = streetLessonsFor(task.id);
      for (const tier of TIERS) {
        for (const step of lessons[tier]) {
          pushEntry(seen, out, lang, task.speaker, step.npc.native);
        }
      }
    }
  }

  return out;
}

/** Lesson NPC lines for one district at the player's comfort tier (runtime prefetch). */
export function collectDistrictLessonTtsEntries(
  language: LangCode,
  tasks: StreetTask[],
  comfort: ComfortLevel,
): TtsCacheEntry[] {
  const seen = new Set<string>();
  const out: TtsCacheEntry[] = [];

  for (const task of tasks) {
    const lesson = resolveTaskLesson(task, comfort, tasks);
    for (const step of lesson) {
      pushEntry(seen, out, language, task.speaker, step.npc.native);
    }
  }

  return out;
}
