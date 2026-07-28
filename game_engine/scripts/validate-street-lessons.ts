/**
 * Validates street lesson step counts and price-adjacency rules (#40).
 * Run from game_engine: npx tsx scripts/validate-street-lessons.ts
 */
import { STREET_TASK_LESSONS } from "../lib/game/street-task-lessons";
import type { LessonTier } from "../lib/game/levels";

const EXPECTED: Record<LessonTier, number> = { easy: 3, medium: 5, hard: 7 };

const PRICE_QUESTION_EN = [
  "how much",
  "what do i owe",
  "how much is it",
];
const PRICE_STATEMENT_EN = [
  "rupees",
  "rupee",
  "taka",
  "take it for",
];

function looksLikePriceQuestion(en: string): boolean {
  const lower = en.toLowerCase();
  return PRICE_QUESTION_EN.some((p) => lower.includes(p));
}

function looksLikePriceStatement(en: string): boolean {
  const lower = en.toLowerCase();
  return PRICE_STATEMENT_EN.some((p) => lower.includes(p));
}

let failed = false;

for (const [taskId, tiers] of Object.entries(STREET_TASK_LESSONS)) {
  for (const tier of ["easy", "medium", "hard"] as const) {
    const steps = tiers[tier];
    const want = EXPECTED[tier];
    if (steps.length !== want) {
      console.error(`${taskId} ${tier}: expected ${want} steps, got ${steps.length}`);
      failed = true;
    }
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const npcEn = step.npc.en;
      const promptEn = step.prompt.en;
      if (looksLikePriceStatement(npcEn) && looksLikePriceQuestion(promptEn)) {
        console.error(`${taskId} ${tier} step ${i + 1}: price statement → price question`);
        failed = true;
      }
    }
    if (tier !== "easy") {
      const hasAskBeforeQuote = steps.some((step, i) => {
        if (!looksLikePriceQuestion(step.prompt.en)) return false;
        const next = steps[i + 1];
        return next !== undefined && looksLikePriceStatement(next.npc.en);
      });
      const hasPriceBeat = steps.some((step) => looksLikePriceStatement(step.npc.en));
      if (hasPriceBeat && !hasAskBeforeQuote) {
        console.error(`${taskId} ${tier}: has price quote but no ask-before-quote beat`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log("All street lessons passed validation.");
