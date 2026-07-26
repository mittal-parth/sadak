import { NextResponse } from "next/server";
import { sarvamChat, type ChatMessage } from "@/lib/sarvam";
import { districtById } from "@/lib/game/districts";

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

/**
 * We use json_object rather than a strict json_schema: under json_schema this
 * model satisfies the required keys and then pads whitespace until it hits
 * max_tokens, leaving the object unterminated. json_object closes cleanly.
 */
const JSON_SHAPE =
  `{"reply": "<your line>", "mission_complete": false, "anger": 0}`;

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

  const known = clues.length
    ? `\nWHAT THE PLAYER ALREADY KNOWS (they may raise any of this):\n${clues.map((c) => `- ${c}`).join("\n")}`
    : "";

  const system: ChatMessage = {
    role: "system",
    content: `${npc.persona}

SETTING
${district.premise.trim()}

You are a character on the street in ${district.city}. The player has walked up
to you and is talking to you.${known}

RULES
- Reply ONLY in ${district.languageLabel}, written in the ${district.script}
  script. Never romanise it: "gaadi mera hai" is WRONG, the ${district.script}
  spelling is the only acceptable form. Never reply in English.
- The player may write to you in Latin letters or in broken ${district.languageLabel}.
  Understand them anyway, and still answer in ${district.script}.
- 1-2 short spoken sentences per reply. This is street conversation, not a
  monologue, and it will be read aloud, so write how people actually speak.
- Stay in character. Never mention being an AI, never break the fourth wall,
  never narrate your own actions in brackets.

OBJECTIVE
"${npc.mission.successCriteria}"

Judge this honestly at the end of every turn, against the whole conversation so
far and not just the player's last message:
- A greeting alone is never enough, and you should not hand it over cheaply.
- But the moment the criterion IS satisfied, you MUST set mission_complete to
  true on that same turn. Do not withhold it once it has genuinely been earned,
  and do not wait for the player to ask again.

TROUBLE
These things provoke you: ${npc.provokes}
Rate how badly the player's last message crossed that line, as "anger":
  0 = fine, normal conversation, or merely clumsy
  1 = genuinely rude, insulting, or pushy
  2 = outrageous. A bribe, a threat, or open contempt
Most turns are 0. Be strict about 2, and never punish someone for speaking your
language badly. Fumbling the grammar is not rudeness.

SCRIPT (this overrides everything above)
Your "reply" MUST be written in the ${district.script} script. This is what
correctly written ${district.languageLabel} looks like:
${district.phrases.map((p) => `  ${p.native}`).join("\n")}

The player will often type to you in Latin letters, like "${
      district.phrases[0].roman
    }". Understand them, but NEVER copy their script. Answering
"${district.phrases[0].roman}" instead of "${district.phrases[0].native}" is a
failure. Every reply is rendered as ${district.script} text and read aloud by a
${district.languageLabel} voice, so Latin letters break it.

OUTPUT
Reply with a single JSON object and nothing else:
${JSON_SHAPE}`,
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
