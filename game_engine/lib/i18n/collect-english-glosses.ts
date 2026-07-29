import type { LessonStep } from "@/lib/game/districts";
import { SEED_DISTRICTS } from "@/lib/game/districts";
import { SEED_TASK_PACKS } from "@/lib/game/tasks";
import { STREET_TASK_LESSONS } from "@/lib/game/street-task-lessons";
import { UI_KEY_TO_ENGLISH, type UiKey } from "@/lib/i18n/ui-keys";

function addLineStrings(set: Set<string>, line: { en: string } | undefined) {
  if (!line?.en.trim()) return;
  set.add(line.en.trim());
}

function addStepStrings(set: Set<string>, step: LessonStep) {
  addLineStrings(set, step.npc);
  addLineStrings(set, step.prompt);
}

/** Unique English strings that appear as lesson glosses or mission copy. */
export function collectEnglishGlossSources(): string[] {
  const set = new Set<string>();

  for (const key of Object.keys(UI_KEY_TO_ENGLISH) as UiKey[]) {
    set.add(UI_KEY_TO_ENGLISH[key]);
  }

  for (const d of SEED_DISTRICTS) {
    for (const p of d.phrases) {
      if (p.en.trim()) set.add(p.en.trim());
    }
    for (const npc of d.npcs) {
      if (npc.mission.brief.trim()) set.add(npc.mission.brief.trim());
      if (npc.role.trim()) set.add(npc.role.trim());
      for (const step of npc.lesson) {
        addStepStrings(set, step);
      }
    }
    if (d.finale.title.trim()) set.add(d.finale.title.trim());
    if (d.finale.text.trim()) set.add(d.finale.text.trim());
  }

  for (const pack of SEED_TASK_PACKS) {
    if (pack.finale.title.trim()) set.add(pack.finale.title.trim());
    if (pack.finale.text.trim()) set.add(pack.finale.text.trim());
    for (const task of pack.tasks) {
      if (task.title.trim()) set.add(task.title.trim());
      if (task.brief.trim()) set.add(task.brief.trim());
      if (task.completionNote.trim()) set.add(task.completionNote.trim());
      if (task.role.trim()) set.add(task.role.trim());
    }
  }

  for (const lessons of Object.values(STREET_TASK_LESSONS)) {
    for (const tier of ["easy", "medium", "hard"] as const) {
      for (const step of lessons[tier]) {
        addStepStrings(set, step);
      }
    }
  }

  return [...set].sort((a, b) => a.localeCompare(b));
}
