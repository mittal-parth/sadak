import { NextResponse } from "next/server";
import { sarvamChat, type ChatMessage } from "@/lib/sarvam";
import { districtById } from "@/lib/game/districts";
import type { NpcTurn } from "@/lib/game/npc-memory";
import { looksLikeTargetScript, recallSystemPrompt } from "@/lib/game/prompt";
import { taskById } from "@/lib/game/tasks";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  districtId: string;
  taskId: string;
  memory: NpcTurn[];
};

function parseReply(raw: string): string | null {
  const shape = (parsed: Record<string, unknown>): string | null => {
    if (typeof parsed?.reply !== "string") return null;
    const reply = parsed.reply.trim();
    return reply || null;
  };

  try {
    const hit = shape(JSON.parse(raw));
    if (hit) return hit;
  } catch {
    /* fall through */
  }

  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) {
    try {
      const hit = shape(JSON.parse(braced[0]));
      if (hit) return hit;
    } catch {
      /* fall through */
    }
  }

  const trimmed = raw.replace(/```/g, "").trim();
  return trimmed || null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const memory = body.memory ?? [];
  if (!memory.length) {
    return NextResponse.json({ error: "memory is required and must be non-empty." }, { status: 400 });
  }

  const district = districtById(body.districtId);
  const task = taskById(body.taskId);
  if (!task) {
    return NextResponse.json({ error: `Unknown task "${body.taskId}".` }, { status: 404 });
  }
  if (task.districtId !== district.id) {
    return NextResponse.json({ error: "Task not in this district." }, { status: 404 });
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: recallSystemPrompt(district, task, memory),
    },
    {
      role: "user",
      content: "The player is in front of you again. Give your one-line recall opening.",
    },
  ];

  let reply: string | null = null;
  // One retry if the model ignores the "reply only in {script}" instruction
  // and answers in English (issue #23) — cheap, since it only fires on an
  // already-rare failure, and it recovers the recall line most of the time.
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    let raw: string;
    try {
      raw = await sarvamChat(messages, {
        temperature: 0.85,
        maxTokens: 200,
        responseFormat: { type: "json_object" },
      });
    } catch (err) {
      console.error("recall chat failed", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Chat request failed." },
        { status: 502 }
      );
    }

    const candidate = parseReply(raw);
    if (candidate && looksLikeTargetScript(candidate, district.script)) {
      reply = candidate;
      break;
    }

    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `That was in English. Reply again, in ${district.script} script only.`,
      }
    );
  }

  if (!reply) {
    // Dialogue.tsx treats a non-ok response as "no recall line" and falls
    // through to the normal lesson opening, so this degrades silently
    // rather than ever showing the player a broken English line.
    return NextResponse.json({ error: "Recall reply failed the script check." }, { status: 502 });
  }

  return NextResponse.json({ reply });
}
