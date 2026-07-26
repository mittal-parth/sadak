import { NextResponse } from "next/server";
import { sarvamChat } from "@/lib/sarvam";
import { getVisit, applyExtraction } from "@/roznamcha/lib/store/store";
import { buildExtractionPrompt, parseExtraction } from "@/roznamcha/lib/store/extract";
import type { LangCode } from "@/roznamcha/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  ref: string;
  utterance: string;
  language: LangCode;
  /** Stable id for this conversational turn; makes retries idempotent. */
  turnId?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { ref, utterance, language } = body ?? ({} as Body);
  if (!ref || typeof ref !== "string") {
    return NextResponse.json({ error: "ref is required" }, { status: 400 });
  }
  if (!utterance || typeof utterance !== "string") {
    return NextResponse.json({ error: "utterance is required" }, { status: 400 });
  }

  const record = getVisit(ref);
  if (!record) {
    return NextResponse.json({ error: `unknown ref: ${ref}` }, { status: 404 });
  }

  const lang = language ?? record.language;
  const { system, user } = buildExtractionPrompt(record, utterance, lang);

  let raw: string;
  try {
    raw = await sarvamChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        temperature: 0.2,
        maxTokens: 500,
        responseFormat: { type: "json_object" },
        reasoningEffort: null,
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Sarvam chat failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  let extraction;
  try {
    extraction = parseExtraction(raw);
  } catch (err) {
    return NextResponse.json(
      { error: `could not parse extraction JSON: ${err instanceof Error ? err.message : String(err)}`, raw },
      { status: 502 }
    );
  }

  // turnId makes a retried turn idempotent even when the audio re-transcribes
  // to a slightly different string.
  const updated = applyExtraction(ref, extraction, utterance, body.turnId);

  return NextResponse.json({ record: updated, extraction });
}
