import { NextResponse } from "next/server";
import { sarvamChat, sarvamDecisions, type ChatMessage } from "@/lib/sarvam";
import { loadDistrictById } from "@/lib/game/load-district";
import { missionQuestions, readMissionVerdict } from "@/lib/game/mission-grade";
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

function replyFrom(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { reply?: unknown };
    if (typeof parsed?.reply === "string" && parsed.reply.trim()) return parsed.reply.trim();
  } catch {
    // json_object should make this unreachable, but a stray fence or a
    // truncated response shouldn't lose the player's turn.
  }
  return null;
}

function parseReply(raw: string): string {
  const direct = replyFrom(raw);
  if (direct) return direct;

  const braced = raw.match(/\{[\s\S]*\}/);
  if (braced) {
    const salvaged = replyFrom(braced[0]);
    if (salvaged) return salvaged;
  }

  return raw.replace(/```/g, "").trim();
}

/** PLAYER/NPC lines, including the reply just generated, which is where the clue lands. */
function transcriptOf(
  history: { role: "user" | "assistant"; content: string }[],
  playerText: string,
  reply: string
): string {
  const prior = history.slice(-8).map((turn) =>
    `${turn.role === "user" ? "PLAYER" : "NPC"}: ${turn.content}`
  );
  return [...prior, `PLAYER: ${playerText}`, `NPC: ${reply}`].join("\n");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const loaded = await loadDistrictById(body.districtId);
  if (!loaded) {
    return NextResponse.json({ error: `Unknown district "${body.districtId}".` }, { status: 404 });
  }
  const district = loaded.district;
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

  const reply = parseReply(raw);

  // Grade the transcript that includes this reply. The clue is usually spoken
  // in it, so scoring the history alone would pass the mission a turn late.
  // A missed grade costs nothing: the line still goes out.
  let missionComplete = false;
  let anger = 0;
  if (reply) {
    try {
      const answers = await sarvamDecisions(
        transcriptOf(history, body.playerText, reply),
        missionQuestions(npc, district.languageLabel)
      );
      const verdict = readMissionVerdict(answers);
      if (verdict) {
        missionComplete = verdict.missionComplete;
        anger = verdict.anger;
      }
    } catch (err) {
      console.error("prism grade failed", err);
    }
  }

  // A greeting must never pass a mission. The first exchange can't score.
  missionComplete = missionComplete && history.length >= 2;

  // Audio is fetched separately via /api/speak so the subtitle lands first.
  return NextResponse.json({
    reply,
    missionComplete,
    anger,
    reward: missionComplete ? npc.mission.reward : 0,
    clue: missionComplete ? npc.clue : null,
  });
}
