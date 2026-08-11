import { NextResponse } from "next/server";
import type { LangCode } from "@/lib/sarvam";
import { loadDistrictById } from "@/lib/game/load-district";
import type { ComfortLevel } from "@/lib/game/levels";
import { collectDistrictLessonTtsEntries } from "@/lib/tts/entries";
import { publicTtsUrl } from "@/lib/tts/cache";

export const runtime = "nodejs";

/** Resolve public Storage URLs for lesson NPC lines (no synthesis). */
export async function POST(req: Request) {
  let body: { districtId: string; comfort?: ComfortLevel };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const comfort = body.comfort ?? "medium";
  if (comfort !== "easy" && comfort !== "medium" && comfort !== "hard") {
    return NextResponse.json({ error: "Invalid comfort level." }, { status: 400 });
  }

  const loaded = await loadDistrictById(body.districtId);
  if (!loaded) {
    return NextResponse.json({ error: `Unknown district "${body.districtId}".` }, { status: 404 });
  }

  const lang = loaded.district.language as LangCode;
  const entries = collectDistrictLessonTtsEntries(lang, loaded.tasks, comfort, loaded.id);

  return NextResponse.json({
    items: entries.map((entry) => ({
      key: entry.key,
      text: entry.text,
      speaker: entry.speaker,
      lang: entry.lang,
      url: publicTtsUrl(entry.lang, entry.speaker, entry.text),
    })),
  });
}
