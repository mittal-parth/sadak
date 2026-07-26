import { NextResponse } from "next/server";
import { sarvamTTS, type LangCode } from "@/lib/sarvam";
import { districtById } from "@/lib/game/districts";
import { taskById } from "@/lib/game/tasks";

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
  const task = taskById(body.npcId);
  const npc = district.npcs.find((n) => n.id === body.npcId);
  const speaker = task?.speaker ?? npc?.speaker;
  if (!speaker) {
    return NextResponse.json({ error: `Unknown voice "${body.npcId}".` }, { status: 404 });
  }
  if (task && task.districtId !== district.id) {
    return NextResponse.json({ error: `Task not in this district.` }, { status: 404 });
  }
  if (!body.text?.trim()) {
    return NextResponse.json({ audio: null });
  }

  const audio = await sarvamTTS(body.text, district.language as LangCode, speaker);
  return NextResponse.json({ audio });
}
