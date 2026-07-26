import { NextResponse } from "next/server";
import { sarvamTTS, type LangCode } from "@/lib/sarvam";
import { districtById } from "@/lib/game/districts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Voice is a separate round trip from the dialogue so subtitles can appear in
 * well under a second while Bulbul renders the audio behind them. Folding TTS
 * into /api/talk made every line take five seconds to show up.
 */
export async function POST(req: Request) {
  let body: { districtId: string; npcId: string; text: string };
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
  if (!body.text?.trim()) {
    return NextResponse.json({ audio: null });
  }

  const audio = await sarvamTTS(body.text, district.language as LangCode, npc.speaker);
  return NextResponse.json({ audio });
}
