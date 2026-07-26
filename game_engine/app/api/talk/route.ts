import { NextResponse } from "next/server";
import { sarvamChat, type ChatMessage } from "@/lib/sarvam";
import { districtById } from "@/lib/game/districts";
import { talkSystemPrompt } from "@/lib/game/prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  districtId: string;
  npcId: string;
  playerText: string;
  history: { role: "user" | "assistant"; content: string }[];
  /** Clues the player already holds, used to gate the final NPC. */
  clues: string[];
};

type Parsed = { reply: string; missionComplete: boolean; anger: number };

function shape(parsed: Record<string, unknown>): Parsed | null {
  if (typeof parsed?.reply !== "string") return null;
  const raw = Number(parsed.anger ?? 0);
  return {
    reply: parsed.reply.trim(),
    missionComplete: parsed.mission_complete === true,
    // Clamped: one bad turn should never jump the player straight to busted.
    anger: Number.isFinite(raw) ? Math.max(0, Math.min(2, Math.round(raw))) : 0,
  };
}

function parseReply(raw: string): Parsed {
  try {
    const hit = shape(JSON.parse(raw));
    if (hit) return hit;
  } catch {
    // json_object should make this unreachable, but a stray fence or a
    // truncated response shouldn't lose the player's turn.
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

  return { reply: raw.replace(/```/g, "").trim(), missionComplete: false, anger: 0 };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const district = districtById(body.districtId);
  const npc = district.npcs.find((n) => n.id === body.npcId);
  if (!npc) {
    return NextResponse.json({ error: `Unknown NPC "${body.npcId}".` }, { status: 404 });
  }

  const clues = body.clues ?? [];
  if (npc.requiresClues && clues.length < npc.requiresClues) {
    return NextResponse.json(
      {
        error: `${npc.name} won't talk until you have ${npc.requiresClues} clue${
          npc.requiresClues === 1 ? "" : "s"
        }. You have ${clues.length}.`,
        locked: true,
      },
      { status: 403 }
    );
  }

  const system: ChatMessage = {
    role: "system",
    content: talkSystemPrompt(district, npc, clues),
  };

  const history = body.history ?? [];

  const messages: ChatMessage[] = [
    system,
    ...history.slice(-8),
    { role: "user", content: body.playerText },
  ];

  let raw: string;
  try {
    raw = await sarvamChat(messages, {
      temperature: 0.85,
      maxTokens: 300,
      responseFormat: { type: "json_object" },
    });
  } catch (err) {
    console.error("chat failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed." },
      { status: 502 }
    );
  }

  const parsed = parseReply(raw);
  const reply = parsed.reply;

  // The model will sometimes grant the objective on a bare greeting. Every
  // mission here needs a real exchange, so the first turn can never pass.
  const missionComplete = parsed.missionComplete && history.length >= 2;

  // Audio is fetched separately via /api/speak so the subtitle lands first.
  return NextResponse.json({
    reply,
    missionComplete,
    anger: parsed.anger,
    reward: missionComplete ? npc.mission.reward : 0,
    clue: missionComplete ? npc.clue : null,
  });
}
