import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { districtById } from "@/lib/game/districts";
import { resolveSpeaker } from "@/lib/sarvam";
import { greetingPrompt, graderSystemPrompt, voiceSystemPrompt } from "@/lib/game/prompt";

export const runtime = "nodejs";

/**
 * Mints a LiveKit token for one conversation with one NPC.
 *
 * The whole character brief travels in the participant's metadata, so the
 * Python worker in ../../../agent.py stays a generic voice pipeline and the
 * bible in lib/game/districts.ts stays the only copy. The agent reads this on
 * join, configures Saaras / sarvam-105b / Bulbul from it, and grades against it.
 *
 * 503 here is not a failure: the client falls back to the push-to-talk REST
 * path (/api/stt → /api/talk → /api/speak) and the game plays on.
 */

type Body = { districtId: string; npcId: string; clues?: string[] };

/** Read by agent.py. Bump `v` if the shape changes under a running worker. */
export type AgentBrief = {
  v: 1;
  npc: { id: string; name: string; role: string };
  district: { id: string; city: string; language: string; script: string; label: string };
  instructions: string;
  greeting: string;
  voice: { speaker: string; language: string };
  grader: { system: string; minUserTurns: number };
};

export async function POST(req: Request) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          "Live voice is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.",
        unavailable: true,
      },
      { status: 503 }
    );
  }

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

  // Same gate as /api/talk: a locked NPC must not even get a room.
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

  const brief: AgentBrief = {
    v: 1,
    npc: { id: npc.id, name: npc.name, role: npc.role },
    district: {
      id: district.id,
      city: district.city,
      language: district.language,
      script: district.script,
      label: district.languageLabel,
    },
    instructions: voiceSystemPrompt(district, npc, clues),
    greeting: greetingPrompt(district, npc),
    voice: { speaker: resolveSpeaker(npc.speaker), language: district.language },
    grader: {
      system: graderSystemPrompt(district, npc),
      // A greeting must never pass a mission, so the first exchange can't score.
      minUserTurns: 2,
    },
  };

  // One room per conversation: walking away and coming back is a fresh scene,
  // and two players never land in the same NPC's room.
  const suffix = Math.random().toString(36).slice(2, 8);
  const room = `sadak-${district.id}-${npc.id}-${suffix}`;
  const identity = `player-${suffix}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: "Player",
    metadata: JSON.stringify(brief),
    ttl: "20m",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({ url, token: await at.toJwt(), room, identity });
}
