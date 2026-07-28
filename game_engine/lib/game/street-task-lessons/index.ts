import type { StreetTaskLessons } from "./types";
import { LESSONS as bengali } from "./bengali";
import { LESSONS as gujarati } from "./gujarati";
import { LESSONS as hindi } from "./hindi";
import { LESSONS as kannada } from "./kannada";
import { LESSONS as malayalam } from "./malayalam";
import { LESSONS as marathi } from "./marathi";
import { LESSONS as odia } from "./odia";
import { LESSONS as punjabi } from "./punjabi";
import { LESSONS as tamil } from "./tamil";
import { LESSONS as telugu } from "./telugu";

export type { StreetTaskLessons } from "./types";

/** Graded street-errand dialogue (#40): easy 3 / medium 5 / hard 7 steps, causal order. */
export const STREET_TASK_LESSONS: Record<string, StreetTaskLessons> = {
  ...hindi,
  ...tamil,
  ...kannada,
  ...bengali,
  ...telugu,
  ...malayalam,
  ...marathi,
  ...gujarati,
  ...punjabi,
  ...odia,
};

export function streetLessonsFor(taskId: string): StreetTaskLessons {
  const lessons = STREET_TASK_LESSONS[taskId];
  if (!lessons) {
    throw new Error(`Missing street lessons for task ${taskId}`);
  }
  return lessons;
}
