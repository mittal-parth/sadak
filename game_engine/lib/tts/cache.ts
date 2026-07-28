import { createHash } from "node:crypto";
import type { LangCode } from "@/lib/sarvam";
import { resolveSpeaker } from "@/lib/sarvam";
import { getSupabaseUrl } from "@/lib/supabase/env";
import {
  TTS_BUCKET,
  TTS_CACHE_VERSION,
  normalizeTtsText,
  ttsLookupKey,
} from "@/lib/tts/cache-keys";

export { TTS_BUCKET, TTS_CACHE_VERSION, normalizeTtsText, ttsLookupKey } from "@/lib/tts/cache-keys";

export function ttsContentHash(lang: string, speaker: string, text: string): string {
  const payload = ttsLookupKey(lang, speaker, text);
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Object path inside bucket `tts` (no leading slash). */
export function ttsObjectPath(lang: LangCode, speaker: string, text: string): string {
  const sp = resolveSpeaker(speaker);
  const hash = ttsContentHash(lang, sp, normalizeTtsText(text));
  return `${TTS_CACHE_VERSION}/${lang}/${sp}/${hash}.wav`;
}

export function publicTtsUrl(lang: LangCode, speaker: string, text: string): string {
  const path = ttsObjectPath(lang, speaker, text);
  const base = getSupabaseUrl().replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${TTS_BUCKET}/${path}`;
}

export async function ttsObjectExists(publicUrl: string): Promise<boolean> {
  try {
    const res = await fetch(publicUrl, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
