/**
 * Server-only Sarvam AI client.
 *
 * Base URL + auth header per https://docs.sarvam.ai/api/getting-started/quickstart.md
 *   chat : POST /v1/chat/completions   (sarvam-105b | sarvam-30b)
 *   tts  : POST /text-to-speech        (bulbul:v3)
 *   stt  : POST /speech-to-text        (saaras:v3, multipart)
 *
 * The TTS shape here follows the pattern already proven in Kahani.
 */

import { DEFAULT_RETRY_OPTS, withRetry } from "@/lib/retry";

const BASE = "https://api.sarvam.ai";
const TTS_MODEL = process.env.SARVAM_TTS_MODEL || "bulbul:v3";
const CHAT_MODEL = process.env.SARVAM_CHAT_MODEL || "sarvam-105b";

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY is not set. Copy .env.example to .env and add your key.");
  return k;
}

export type LangCode =
  | "hi-IN" | "ta-IN" | "te-IN" | "kn-IN" | "ml-IN"
  | "mr-IN" | "gu-IN" | "bn-IN" | "pa-IN" | "od-IN" | "en-IN";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * bulbul:v3 speakers. NOT interchangeable with the v2 set
 * (anushka / manisha / vidya / arya / abhilash / karun / hitesh), passing a v2
 * name to v3 is rejected by the API.
 */
export const V3_SPEAKERS = [
  "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan",
  "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun",
  "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand",
  "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani",
  "mohit", "kavitha", "rehan", "soham", "rupali",
] as const;

export const DEFAULT_SPEAKER = "priya";

export function resolveSpeaker(voice?: string): string {
  if (!voice) return DEFAULT_SPEAKER;
  const lower = voice.toLowerCase();
  return (V3_SPEAKERS as readonly string[]).includes(lower) ? lower : DEFAULT_SPEAKER;
}

/** Mirrors the OpenAI-compatible `response_format` the Sarvam chat API accepts. */
export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: { name: string; strict?: boolean; schema: unknown };
    };

/**
 * Thinking mode is ON by default on sarvam-30b/105b, and its tokens count
 * against max_tokens. For a one-line NPC reply the model will happily spend the
 * entire budget reasoning about how to say hello, come back with
 * finish_reason "length" and content null. We disable it by default: replies
 * land in well under a second instead of timing out empty.
 */
export type ReasoningEffort = "low" | "medium" | "high" | null;

export async function sarvamChat(
  messages: ChatMessage[],
  opts: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: ResponseFormat;
    reasoningEffort?: ReasoningEffort;
  } = {}
): Promise<string> {
  const json = await withRetry(async () => {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "api-subscription-key": key(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? CHAT_MODEL,
        messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 300,
        reasoning_effort: opts.reasoningEffort ?? null,
        ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
      }),
    });

    if (!res.ok) {
      const err = new Error(`Sarvam chat ${res.status}: ${await res.text()}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }

    return res.json();
  }, DEFAULT_RETRY_OPTS);

  const choice = json?.choices?.[0];
  const content = choice?.message?.content;

  // Empty content with finish_reason "length" means the token budget was spent
  // before any answer was produced. Surface it rather than returning "".
  if (!content) {
    throw new Error(
      `Sarvam chat returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"}).`
    );
  }

  return content;
}

export type SpeechOpts = { pace?: number; temperature?: number };

type TtsResponse = { request_id?: string | null; audios: string[] };

/**
 * Synthesizes speech via Bulbul. Returns a `data:audio/wav` URL, or null when
 * voice is unavailable, callers fall back to subtitles rather than failing.
 */
export async function sarvamTTS(
  text: string,
  language: LangCode,
  speaker?: string,
  opts: SpeechOpts = {}
): Promise<string | null> {
  // Bulbul caps a single request at 2500 characters.
  const clipped = text.slice(0, 2400);
  if (!clipped) return null;

  try {
    const res = await withRetry(async () => {
      const response = await fetch(`${BASE}/text-to-speech`, {
        method: "POST",
        headers: {
          "api-subscription-key": key(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: clipped,
          model: TTS_MODEL,
          target_language_code: language,
          speaker: resolveSpeaker(speaker),
          pace: opts.pace ?? 1.0,
          temperature: opts.temperature ?? 0.6,
          output_audio_codec: "wav",
          speech_sample_rate: 24000,
        }),
      });

      if (!response.ok) {
        const err = new Error(
          `Sarvam TTS ${response.status}: ${await response.text()}`
        ) as Error & { status: number };
        err.status = response.status;
        throw err;
      }

      return (await response.json()) as TtsResponse;
    }, DEFAULT_RETRY_OPTS);

    // Long text comes back as several chunks, concatenating is required, or
    // the line gets cut off mid-sentence.
    const combined = res.audios?.join("") ?? "";
    return combined ? `data:audio/wav;base64,${combined}` : null;
  } catch (err) {
    console.error("[sarvamTTS] voice unavailable:", err);
    return null;
  }
}

/**
 * Transcribes a recorded audio blob. `mode` "transcribe" keeps the source script.
 *
 * `opts.retry === false` skips the usual retry-with-backoff wrapper. Used by the
 * live-partial path in useVoice: a partial is superseded by the next slice ~900ms
 * later regardless, so paying the retry backoff for a transient 500 just delays a
 * response that's about to be thrown away.
 */
export async function sarvamSTT(
  audio: Blob,
  opts: {
    language?: LangCode;
    mode?: "transcribe" | "translate" | "codemix";
    retry?: boolean;
  } = {}
): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "speech.webm");
  form.append("model", "saaras:v3");
  form.append("mode", opts.mode ?? "transcribe");
  if (opts.language) form.append("language_code", opts.language);

  const call = async () => {
    const res = await fetch(`${BASE}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": key() },
      body: form,
    });

    if (!res.ok) {
      const err = new Error(`Sarvam STT ${res.status}: ${await res.text()}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }

    return res.json();
  };

  const json = opts.retry === false ? await call() : await withRetry(call, DEFAULT_RETRY_OPTS);

  return json?.transcript ?? json?.text ?? "";
}
