import { NextResponse } from "next/server";
import { sarvamSTT, type LangCode } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Substrings in Sarvam STT 400 bodies that mean unreadable / bad audio. */
const STT_AUDIO_FORMAT_MARKERS = [
  "failed to read the file",
  "audio format",
] as const;

function sttStatus(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  const language = form.get("language");
  // Set by useVoice's live-partial requests (900ms MediaRecorder slices) so this
  // handler can skip the retry-with-backoff wrapper for them — see sarvamSTT.
  const partial = form.get("partial") === "true";

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "No audio supplied." }, { status: 400 });
  }

  try {
    const transcript = await sarvamSTT(audio, {
      language: typeof language === "string" ? (language as LangCode) : undefined,
      mode: "transcribe",
      retry: !partial,
    });
    return NextResponse.json({ transcript });
  } catch (err) {
    const status = sttStatus(err);

    // Live partials are display-only. Mid-stream WebM often fails Sarvam's
    // decoder; the next slice (or the final send) is what matters. Soft-fail
    // so the server log stays quiet and the client keeps the last good partial.
    if (partial) {
      return NextResponse.json({ transcript: "" });
    }

    console.error("stt failed", err);

    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const formatError =
      status === 400 && STT_AUDIO_FORMAT_MARKERS.some((marker) => msg.includes(marker));

    return NextResponse.json(
      {
        error: formatError
          ? "Couldn't process that audio - hold the mic and try again."
          : err instanceof Error
            ? err.message
            : "Transcription failed.",
      },
      { status: 502 }
    );
  }
}
