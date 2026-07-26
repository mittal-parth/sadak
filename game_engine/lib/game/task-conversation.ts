import type { District, LessonStep } from "@/lib/game/districts";
import type { NpcTurn } from "@/lib/game/npc-memory";
import type { StreetTask, TaskKind } from "@/lib/game/tasks";
import { memoryBlock, RECALL_JSON_SHAPE } from "@/lib/game/prompt";

export type TaskPhrase = { native: string; roman: string; en: string };

export function phrasesFromLesson(lesson: LessonStep[]): TaskPhrase[] {
  const seen = new Set<string>();
  const out: TaskPhrase[] = [];
  for (const step of lesson) {
    if (!step.prompt) continue;
    const key = step.prompt.native.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      native: step.prompt.native,
      roman: step.prompt.roman,
      en: step.prompt.en,
    });
  }
  return out;
}

function kindFlavor(kind: TaskKind): string {
  switch (kind) {
    case "auto":
      return "You are busy at the stand. You quote high to outsiders and enjoy bargaining, but you respect anyone who pushes back in your language.";
    case "shop":
      return "You are mid-rush at a street stall. Short answers, real prices, and the occasional distraction — a cat, a regular, a phone call — are normal.";
    case "temple":
      return "You sell flowers and offerings near the mandir. You are helpful but brisk; bells and crowds press everyone to hurry.";
    case "bus":
      return "You work the ticket counter or stop. Schedules, destinations, and exact change matter; you do not hand tickets over until the details are clear.";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function taskPersona(district: District, task: StreetTask): string {
  return `You are ${task.name}, ${task.role}, on the street in ${district.city}.
${kindFlavor(task.kind)}

THE ERRAND
${task.brief}

You are NOT a teacher and you must never break character to explain grammar.
The player learns by having to get something from you in ${district.languageLabel}.`;
}

function scriptBlock(district: District): string {
  return `SCRIPT (this overrides everything above)
Your reply MUST be written in the ${district.script} script. This is what
correctly written ${district.languageLabel} looks like:
${district.phrases.map((p) => `  ${p.native}`).join("\n")}

The player will often speak or type in Latin letters. Understand them, but NEVER
copy their script. Every reply is read aloud by a ${district.languageLabel} voice.`;
}

const TASK_JSON_SHAPE = `{
  "reply": "<what the NPC says, in the native script>",
  "checks": [true, false, false],
  "phrases_used": ["<target phrase the player actually produced>"],
  "english_fallback": false,
  "outcome_achieved": false,
  "hint": null
}`;

/** REST turn: in-character reply plus errand-style grading in one call. */
export function taskTalkSystemPrompt(
  district: District,
  task: StreetTask,
  lesson: LessonStep[],
  memory: NpcTurn[]
): string {
  const phrases = phrasesFromLesson(lesson);
  const checks = [
    "The player tried to communicate in the target language rather than giving up to English.",
    "The player responded to what you actually said (destination, price, order, etc.), not a scripted unrelated line.",
    `The real-world outcome is achieved: ${task.completionNote}`,
  ];

  return `${taskPersona(district, task)}
${memory.length ? memoryBlock(memory) : ""}

WHAT MAKES THIS HARD
- Numbers, prices, and specifics must be negotiated in ${district.script}, not English digits alone.
- You may throw in a brief off-script beat (noise, interruption, small talk) when it fits the street, then return to the errand.
- Never read out a lesson script line-by-line; react to what the player actually said.

GRADING (strict, against the WHOLE conversation so far)
Return one boolean per check, in this order:
${checks.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

Set outcome_achieved true ONLY when "${task.completionNote}" has actually happened in dialogue.

TARGET PHRASES (track what the player genuinely produced; match on meaning, not spelling):
${phrases.map((p) => `  - ${p.native}  (${p.roman}) — ${p.en}`).join("\n")}

Set english_fallback true if the player used English for the substance of their turn.
One loanword Indians use anyway (auto, ticket, station) is NOT a fallback.

HINT
If they are stuck or repeat the same failed move twice, put ONE short in-character nudge in "hint". Otherwise null.

REPLY RULES
- 1-2 short spoken sentences in ${district.script}. Never romanise. Never answer in English.
- Write numbers as words in ${district.script} when stating prices or fares.

${scriptBlock(district)}

OUTPUT
Reply with ONE JSON object and nothing else:
${TASK_JSON_SHAPE}`;
}

/** Live voice: spoken line only; grader runs separately. */
export function taskVoiceSystemPrompt(
  district: District,
  task: StreetTask,
  memory: NpcTurn[]
): string {
  return `${taskPersona(district, task)}
${memory.length ? memoryBlock(memory) : ""}

VOICE
You are on a live microphone. Reply with the spoken line only — no JSON, no markdown.
- One or two short sentences. React to what the player actually said.
- You may briefly digress (street noise, a customer, a bell) then steer back to the errand.
- Do not hand the outcome over on a greeting alone. Once they have genuinely earned it (${task.completionNote}), give it plainly in this turn.

WHAT YOU NEED FROM THEM
${task.brief}

${scriptBlock(district)}`;
}

export function taskGraderSystemPrompt(district: District, task: StreetTask): string {
  return `You are grading a language-learning street errand in ${district.city}.
The player is talking to ${task.name}, ${task.role}.

ERRAND
${task.brief}

OUTCOME THAT COUNTS AS DONE
${task.completionNote}

Judge the WHOLE conversation, not just the last message.

1. mission_complete: has the outcome above actually happened in dialogue? A greeting alone is never enough.
2. anger: use 0 unless the player was genuinely abusive or threatening. Never punish bad grammar.

Reply with a single JSON object and nothing else:
{"mission_complete": false, "anger": 0}`;
}

export function taskGreetingInstruction(
  district: District,
  task: StreetTask,
  memory: NpcTurn[]
): string {
  if (memory.length) {
    return `The player has walked up to you again.${memoryBlock(memory)}
Open with ONE short spoken sentence in ${district.languageLabel}, in ${district.script}, that shows you remember something specific they said before — then continue the errand naturally. One sentence.`;
  }
  return `The player has just walked up to you. Open with one short line in ${district.languageLabel}, in ${district.script}, in character as ${task.name} — a busy street greeting that starts the errand (${task.kind}). One sentence, nothing else.`;
}

export function taskRecallSystemPrompt(
  district: District,
  task: StreetTask,
  turns: NpcTurn[]
): string {
  return `${taskPersona(district, task)}
${memoryBlock(turns)}

The player is back. Give ONE short recall opening in character, then the live conversation continues.

${scriptBlock(district)}

OUTPUT
Reply with a single JSON object and nothing else:
${RECALL_JSON_SHAPE}`;
}
