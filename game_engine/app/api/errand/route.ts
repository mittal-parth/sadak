import { NextResponse } from "next/server";
import { sarvamChat, type ChatMessage } from "@/lib/sarvam";
import { errandById, type Errand, type ErrandId } from "@/lib/game/errands";
import { loadDistrictById } from "@/lib/game/load-district";

export const runtime = "nodejs";
export const maxDuration = 60;

type Turn = { who: "player" | "npc"; text: string };

type Body = {
  errandId: ErrandId;
  playerText: string;
  transcript: Turn[];
  turnId?: string;
};

/**
 * Two jobs in one call: stay in character, and grade the errand against its
 * real-world outcome. Grading lives here rather than in a second call because
 * the model needs the same conversational context for both, and a second
 * round trip would double the latency of every turn.
 */
const SHAPE = `{
  "reply": "<what the NPC says, in the native script>",
  "checks": [true, false, false],
  "phrases_used": ["<target phrase the player actually produced>"],
  "english_fallback": false,
  "outcome_achieved": false,
  "hint": null
}`;

type Graded = {
  reply: string;
  checks: boolean[];
  phrasesUsed: string[];
  englishFallback: boolean;
  outcomeAchieved: boolean;
  hint: string | null;
};

function parse(raw: string, checkCount: number): Graded {
  const attempt = (text: string): Graded | null => {
    try {
      const p = JSON.parse(text);
      if (typeof p?.reply !== "string") return null;
      const checks = Array.isArray(p.checks)
        ? p.checks.slice(0, checkCount).map(Boolean)
        : [];
      while (checks.length < checkCount) checks.push(false);
      return {
        reply: p.reply.trim(),
        checks,
        phrasesUsed: Array.isArray(p.phrases_used) ? p.phrases_used.map(String) : [],
        englishFallback: p.english_fallback === true,
        outcomeAchieved: p.outcome_achieved === true,
        hint: typeof p.hint === "string" && p.hint.trim() ? p.hint.trim() : null,
      };
    } catch {
      return null;
    }
  };

  const direct = attempt(raw.trim());
  if (direct) return direct;

  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) {
    const salvaged = attempt(braced[0]);
    if (salvaged) return salvaged;
  }

  // Never lose the turn: the player still gets a line back.
  return {
    reply: raw.replace(/```/g, "").trim(),
    checks: new Array(checkCount).fill(false),
    phrasesUsed: [],
    englishFallback: false,
    outcomeAchieved: false,
    hint: null,
  };
}

async function buildSystem(errand: Errand): Promise<string> {
  const loaded = await loadDistrictById(errand.district);
  if (!loaded) {
    throw new Error(`Unknown district: ${errand.district}`);
  }
  const district = loaded.district;
  // The errand carries its own persona. The district bible's version of this
  // NPC belongs to a different story and bleeds into the negotiation.
  const persona = errand.persona;
  const script = district.script;
  const lang = district.languageLabel;

  return `${persona.trim()}

THE ERRAND
The player is a learner trying to complete a real errand in ${lang}: ${errand.brief}
The real-world outcome that counts as done: ${errand.outcome}

You are NOT a teacher and you must never break character to explain grammar.
You are the shopkeeper / driver / constable. The player learns by having to get
something from you.

WHAT MAKES THIS HARD (lean into it, this is the point)
${errand.difficulty}

GRADING (be strict and be honest)
Judge these, in this exact order, against the WHOLE conversation so far and not
just the last message. Return one boolean per check:
${errand.checks.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

Set outcome_achieved true ONLY when the real-world outcome above has actually
happened in the conversation. Being friendly is not the outcome. A price must
actually be agreed, an order actually placed, a number actually given.

TARGET PHRASES
Report in phrases_used any of these the player genuinely produced themselves,
matching loosely on meaning rather than exact spelling:
${errand.teaches.map((t) => `  - ${t.native}  (${t.roman})`).join("\n")}

Set english_fallback true if the player gave up and used English for the
substance of their turn. A single English loanword that Indians use anyway
(auto, ticket, station, medicine) is NOT a fallback.

HINT
If the player is stuck, or has failed the same thing twice, put ONE short nudge
in "hint", phrased as something the NPC would plausibly say to help them along.
Otherwise null. Never put grammar explanations in the reply itself.

REPLY RULES
- 1-2 short spoken sentences, in ${script} script. This is read aloud.
- Never romanise. Never answer in English.
- Write NUMBERS in ${script} words too: "डेढ़ सौ", not "150" and never
  "one fifty". The numbers are the hardest part of this errand and the whole
  point of it, so writing them in English defeats the exercise.
- Stay in character even when the player is struggling.

OUTPUT
Reply with ONE JSON object and nothing else:
${SHAPE}`;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const errand = errandById(body.errandId);
  if (!errand) {
    return NextResponse.json(
      { error: `unknown errand: ${body.errandId}` },
      { status: 404 }
    );
  }
  if (!body.playerText?.trim()) {
    return NextResponse.json({ error: "playerText is required" }, { status: 400 });
  }

  const history: ChatMessage[] = (body.transcript ?? []).slice(-10).map((t) => ({
    role: t.who === "player" ? ("user" as const) : ("assistant" as const),
    content: t.text,
  }));

  let raw: string;
  let system: string;
  try {
    system = await buildSystem(errand);
  } catch (err) {
    console.error("errand district load", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "District load failed." },
      { status: 502 },
    );
  }
  try {
    raw = await sarvamChat(
      [
        { role: "system", content: system },
        ...history,
        { role: "user", content: body.playerText },
      ],
      { temperature: 0.8, maxTokens: 400, responseFormat: { type: "json_object" } }
    );
  } catch (err) {
    console.error("errand chat failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed." },
      { status: 502 }
    );
  }

  const graded = parse(raw, errand.checks.length);

  // A one-turn errand is not an errand. The outcome cannot land before the
  // player has actually had an exchange, whatever the model claims.
  const turns = (body.transcript ?? []).filter((t) => t.who === "player").length;
  const outcomeAchieved = graded.outcomeAchieved && turns >= 1;

  const missed = errand.teaches
    .filter((t) => !graded.phrasesUsed.some((p) => p.includes(t.native.slice(0, 6))))
    .map((t) => t.native);

  return NextResponse.json({
    reply: graded.reply,
    checks: graded.checks,
    checksPassed: graded.checks.filter(Boolean).length,
    checksTotal: errand.checks.length,
    phrasesUsed: graded.phrasesUsed,
    phrasesMissed: missed,
    englishFallback: graded.englishFallback,
    outcomeAchieved,
    hint: graded.hint,
    reward: outcomeAchieved ? errand.reward : 0,
  });
}
