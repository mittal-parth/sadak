import { NextResponse } from "next/server";
import { sarvamChat, type ChatMessage } from "@/lib/sarvam";
import { findTaskInLoaded, loadDistrictById } from "@/lib/game/load-district";
import { taskTalkSystemPrompt } from "@/lib/game/task-conversation";
import type { LessonStep } from "@/lib/game/districts";
import type { NpcTurn } from "@/lib/game/npc-memory";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Turn = { who: "player" | "npc"; text: string };

type Body = {
  districtId: string;
  taskId: string;
  /** Omit on the opening beat; required on player turns. */
  playerText?: string;
  transcript?: Turn[];
  /** Tier lesson used for phrase targets and difficulty hints. */
  lesson?: LessonStep[];
  memory?: NpcTurn[];
};

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

  return {
    reply: raw.replace(/```/g, "").trim(),
    checks: new Array(checkCount).fill(false),
    phrasesUsed: [],
    englishFallback: false,
    outcomeAchieved: false,
    hint: null,
  };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const loaded = await loadDistrictById(body.districtId);
  if (!loaded) {
    return NextResponse.json({ error: `unknown district: ${body.districtId}` }, { status: 404 });
  }
  const district = loaded.district;
  const task = findTaskInLoaded(loaded, body.taskId);
  if (!task) {
    return NextResponse.json({ error: `unknown task: ${body.taskId}` }, { status: 404 });
  }
  if (task.districtId !== district.id) {
    return NextResponse.json({ error: "Task not in this district." }, { status: 404 });
  }

  const lesson = body.lesson ?? [];
  const memory = body.memory ?? [];
  const transcript = body.transcript ?? [];
  const checkCount = 3;

  const system = taskTalkSystemPrompt(district, task, lesson, memory);

  const history: ChatMessage[] = transcript.slice(-10).map((t) => ({
    role: t.who === "player" ? ("user" as const) : ("assistant" as const),
    content: t.text,
  }));

  const playerText = body.playerText?.trim();
  const isOpening = !playerText && transcript.length === 0;

  if (!isOpening && !playerText) {
    return NextResponse.json({ error: "playerText is required after the opening." }, { status: 400 });
  }

  const userContent = isOpening
    ? "The player has just walked up to you. Open with one short in-character line that starts this errand."
    : playerText!;

  let raw: string;
  try {
    raw = await sarvamChat(
      [{ role: "system", content: system }, ...history, { role: "user", content: userContent }],
      { temperature: 0.85, maxTokens: 450, responseFormat: { type: "json_object" } }
    );
  } catch (err) {
    console.error("task-talk failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed." },
      { status: 502 }
    );
  }

  const graded = parse(raw, checkCount);
  const playerTurns = transcript.filter((t) => t.who === "player").length + (playerText ? 1 : 0);
  const outcomeAchieved = graded.outcomeAchieved && playerTurns >= 1;

  if (outcomeAchieved) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: "anonymous",
      event: "errand_outcome_achieved",
      properties: {
        district_id: body.districtId,
        task_id: body.taskId,
        player_turns: playerTurns,
        checks_passed: graded.checks.filter(Boolean).length,
        checks_total: checkCount,
        phrases_used_count: graded.phrasesUsed.length,
        reward: task.reward,
        english_fallback: graded.englishFallback,
      },
    });
    await posthog.flush();
  }

  return NextResponse.json({
    reply: graded.reply,
    opening: isOpening,
    checks: graded.checks,
    checksPassed: graded.checks.filter(Boolean).length,
    checksTotal: checkCount,
    phrasesUsed: graded.phrasesUsed,
    englishFallback: graded.englishFallback,
    outcomeAchieved,
    hint: graded.hint,
    reward: outcomeAchieved ? task.reward : 0,
  });
}
