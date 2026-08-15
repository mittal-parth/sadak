import { resolveSpeaker } from "@/lib/sarvam";

export const TTS_CACHE_VERSION = "v2";
export const TTS_BUCKET = "tts";

export function normalizeTtsText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** In-memory dedupe / prefetch map key (same inputs as storage hash). */
export function ttsLookupKey(lang: string, speaker: string, text: string): string {
  const sp = resolveSpeaker(speaker);
  return `${lang}|${sp}|${normalizeTtsText(text)}`;
}
