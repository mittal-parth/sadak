import { NextResponse } from "next/server";
import { sarvamTTS, type LangCode } from "@/lib/sarvam";
import { findTaskInLoaded, loadDistrictById } from "@/lib/game/load-district";
import { publicTtsUrl, ttsObjectExists } from "@/lib/tts/cache";
import { clampTtsPace, DEFAULT_TTS_PACE } from "@/lib/tts/pace";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Voice is a separate round trip from the dialogue so subtitles can appear in
 * well under a second while Bulbul renders the audio behind them. Folding TTS
 * into /api/talk made every line take five seconds to show up.
 *
 * Static lesson lines are served from Supabase Storage when warmed; cache
 * misses still call Sarvam live (no upload — run warm-tts-cache to populate).
 */
export async function POST(req: Request) {
  let body: { districtId: string; npcId: string; text: string; pace?: number };
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
  const task = findTaskInLoaded(loaded, body.npcId);
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

  const lang = district.language as LangCode;
  const pace = clampTtsPace(body.pace);

  if (pace === DEFAULT_TTS_PACE) {
    const cachedUrl = publicTtsUrl(lang, speaker, body.text);
    if (await ttsObjectExists(cachedUrl)) {
      return NextResponse.json({ audio: cachedUrl, cached: true });
    }
  }

  const audio = await sarvamTTS(body.text, lang, speaker, { pace });
  return NextResponse.json({ audio, cached: false });
}
