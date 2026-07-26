import { NextResponse } from "next/server";
import { sarvamSTT, type LangCode } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  const language = form.get("language");

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "No audio supplied." }, { status: 400 });
  }

  try {
    const transcript = await sarvamSTT(audio, {
      language: typeof language === "string" ? (language as LangCode) : undefined,
      mode: "transcribe",
    });
    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("stt failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed." },
      { status: 502 }
    );
  }
}
