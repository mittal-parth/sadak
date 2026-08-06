/**
 * ROZNAMCHA voice relay (workstream A).
 *
 * browser <--ws:8787--> relay <--wss--> api.sarvam.ai
 *
 * Holds SARVAM_API_KEY. Implements the wire protocol in roznamcha/CONTRACT.md
 * and roznamcha/lib/types.ts exactly:
 *
 *   browser -> relay: start | audio | stop | say | shutup
 *   relay -> browser: ready | speech_start | speech_end | partial | final |
 *                      tts_chunk | tts_done | error
 *
 * Sarvam frame shapes (confirmed against docs.sarvam.ai, verified live via
 * probe.mjs):
 *
 *   STT connect:  wss://api.sarvam.ai/speech-to-text/ws
 *                 ?language-code=hi-IN&model=saaras:v4&mode=transcribe
 *                 &sample_rate=16000&vad_signals=true&high_vad_sensitivity=true
 *                 &input_audio_codec=pcm_s16le
 *                 header: Api-Subscription-Key
 *   STT send:     {"audio":{"data":"<b64 pcm_s16le>","sample_rate":"16000","encoding":"audio/wav"}}
 *                 (yes: "encoding" must literally be "audio/wav" even though the
 *                 bytes are raw pcm_s16le -- confirmed live, the server rejects
 *                 "pcm_s16le" there with a pydantic validation error. Also:
 *                 sample_rate only accepts 8000 or 16000, NOT 22050.)
 *   STT transcript: {"type":"data","data":{"transcript":"...", ...}}
 *   STT vad event:  {"type":"events","data":{"event_type":"vad_event","signal_type":"START_SPEECH"|"END_SPEECH"}}
 *
 *   TTS connect:  wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4
 *                 header: Api-Subscription-Key
 *   TTS config:   {"type":"config","data":{"target_language_code":"hi-IN","speaker":"priya",
 *                   "model":"bulbul:v4","speech_sample_rate":"22050",
 *                   "output_audio_codec":"linear16","output_audio_bitrate":"128k"}}
 *   TTS text:     {"type":"text","data":{"text":"..."}}
 *   TTS flush:    {"type":"flush"}
 *   TTS audio:    {"type":"audio","data":{"audio":"<b64>","content_type":"audio/pcm","request_id":"..."}}
 *   TTS done:     {"type":"event","data":{"event_type":"final"}}   (NOT "completion" as docs suggest)
 *
 * BUT the docs are known to be occasionally stale, so every handler below is
 * written defensively: it accepts both the nested `{type, data:{...}}`
 * envelope and a flat `{...}` envelope, and logs (once per distinct shape)
 * anything it doesn't already understand. Check the console when iterating.
 *
 * Barge-in ("shutup"): there is no server-side TTS cancel. We kill the socket
 * with `.terminate()` (immediate TCP-level teardown, no close handshake) and
 * bump a per-connection generation counter so any frames already in flight
 * from the dying socket are dropped instead of reaching the browser. This is
 * idempotent -- calling shutup with no active TTS socket is a harmless no-op.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * .env loading (works whether or not the process was started with
 * `node --env-file=.env`)
 * ------------------------------------------------------------------ */

function loadDotEnv() {
  if (process.env.SARVAM_API_KEY) return;
  const candidates = [
    path.resolve(__dirname, "..", "..", ".env"), // sarvam-hackathon/.env
    path.resolve(__dirname, "..", ".env"), // roznamcha/.env
    path.resolve(process.cwd(), ".env"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
    if (process.env.SARVAM_API_KEY) return;
  }
}

loadDotEnv();

const API_KEY = process.env.SARVAM_API_KEY;
if (!API_KEY) {
  console.error(
    "[relay] SARVAM_API_KEY is not set. Put it in sarvam-hackathon/.env"
  );
  process.exit(1);
}

const PORT = 8787;
const SARVAM_HOST = "api.sarvam.ai";
const TTS_SAMPLE_RATE = 22050;

/* ------------------------------------------------------------------ *
 * Shape logging: print each distinct Sarvam message signature once.
 * Never logs the API key.
 * ------------------------------------------------------------------ */

const seenShapes = new Set();
function logShape(tag, obj) {
  let sig;
  try {
    const top = Object.keys(obj ?? {}).sort().join(",");
    const inner = Object.keys(obj?.data ?? {}).sort().join(",");
    sig = `${tag}:type=${obj?.type}:top=[${top}]:data=[${inner}]`;
  } catch {
    sig = `${tag}:unparseable`;
  }
  if (!seenShapes.has(sig)) {
    seenShapes.add(sig);
    console.log(`[sarvam:${tag}] NEW SHAPE ${sig}`);
    console.log(`[sarvam:${tag}]   sample: ${JSON.stringify(obj).slice(0, 300)}`);
  }
}

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function logHandshakeFailure(tag, res) {
  let body = "";
  res.on("data", (c) => (body += c));
  res.on("end", () => {
    console.error(
      `[sarvam:${tag}] handshake failed: HTTP ${res.statusCode} ${res.statusMessage || ""}`
    );
    if (body) console.error(`[sarvam:${tag}] body: ${body.slice(0, 500)}`);
  });
}

/* ------------------------------------------------------------------ *
 * STT (speech-to-text) side
 * ------------------------------------------------------------------ */

function openSttSocket(browserWs, state, language, sampleRate) {
  const qs = new URLSearchParams({
    "language-code": language,
    model: "saaras:v4",
    mode: "transcribe",
    sample_rate: String(sampleRate || 16000),
    vad_signals: "true",
    high_vad_sensitivity: "true",
    input_audio_codec: "pcm_s16le",
  });
  const url = `wss://${SARVAM_HOST}/speech-to-text/ws?${qs.toString()}`;
  console.log(`[stt] connecting ${url}`);

  const sock = new WebSocket(url, {
    headers: { "Api-Subscription-Key": API_KEY },
  });

  sock.on("unexpected-response", (_req, res) => logHandshakeFailure("stt", res));

  sock.on("open", () => {
    console.log("[stt] socket open");
    safeSend(browserWs, { t: "ready" });
    if (state.audioBuffer.length) {
      for (const b64 of state.audioBuffer) sendAudioFrame(sock, b64, sampleRate);
      state.audioBuffer.length = 0;
    }
  });

  sock.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.log(`[stt] non-JSON message: ${raw.toString().slice(0, 200)}`);
      return;
    }
    logShape("stt", msg);
    handleSttMessage(browserWs, msg);
  });

  sock.on("error", (err) => {
    console.error(`[stt] socket error: ${err.message}`);
    safeSend(browserWs, { t: "error", message: `STT error: ${err.message}` });
  });

  sock.on("close", (code, reason) => {
    console.log(`[stt] socket closed code=${code} reason=${reason}`);
    if (state.sttSocket === sock) state.sttSocket = null;
  });

  return sock;
}

function sendAudioFrame(sock, b64, sampleRate) {
  if (sock.readyState !== WebSocket.OPEN) return;
  sock.send(
    JSON.stringify({
      audio: {
        data: b64,
        sample_rate: String(sampleRate || 16000),
        // Confirmed live: the server's pydantic model only accepts the
        // literal enum value "audio/wav" here, even though the bytes we
        // send are raw pcm_s16le (the `input_audio_codec` query param is
        // what actually tells it how to decode the payload). Passing
        // "pcm_s16le" here gets rejected with a validation error.
        encoding: "audio/wav",
      },
    })
  );
}

/** Defensive: accept both {type:"events",data:{signal_type}} and a flat {signal_type}. */
function handleSttMessage(browserWs, msg) {
  const type = msg.type;
  const data = msg.data ?? msg;

  const signal = data?.signal_type ?? msg.signal_type;
  if (signal === "START_SPEECH") {
    safeSend(browserWs, { t: "speech_start" });
    return;
  }
  if (signal === "END_SPEECH") {
    safeSend(browserWs, { t: "speech_end" });
    return;
  }

  // Defensive: accept both data.transcript and a flat transcript field.
  const transcript = data?.transcript ?? msg.transcript;
  if (typeof transcript === "string") {
    // No documented interim/final flag as of writing; treat explicit
    // `is_final: false` / `type: "partial"` as interim, everything else
    // (including the common case) as final so downstream extraction fires.
    const isPartial =
      data?.is_final === false || msg.is_final === false || type === "partial";
    safeSend(browserWs, { t: isPartial ? "partial" : "final", text: transcript });
    return;
  }

  if (type === "error" || msg.error) {
    safeSend(browserWs, {
      t: "error",
      message: String(data?.message ?? msg.error ?? "STT error"),
    });
  }
}

/* ------------------------------------------------------------------ *
 * TTS (text-to-speech) side
 * ------------------------------------------------------------------ */

/** Immediately, idempotently kills any in-flight TTS socket for this connection. */
function stopTts(state, reason) {
  state.ttsGeneration++;
  if (state.ttsSocket) {
    try {
      state.ttsSocket.terminate();
    } catch {
      /* already dead */
    }
    console.log(`[tts] stopped (${reason})`);
  }
  state.ttsSocket = null;
}

// How long to wait after the last audio chunk before declaring the turn done,
// used only as a fallback for when Sarvam doesn't send its completion event
// (observed live: it doesn't always arrive). Kept short since a real TTS
// stream sends chunks steadily; 2.5s of silence means it's finished or stuck.
const TTS_IDLE_DONE_MS = 2500;

/**
 * Pace per conversational moment. The Voice Experience ladder asks for pacing
 * that "varies for the moment": careful when the worker must verify numbers,
 * brisk on a throwaway confirmation. Bulbul takes `pace` per request, so this
 * is the whole mechanism.
 *
 * Values are multipliers: below 1 is slower.
 */
const PACE = {
  readback: 0.82,   // reading values back for verification: slow enough to interrupt
  question: 1.0,
  confirm: 1.12,    // "theek hai" does not need to be laboured
  correction: 0.9,  // acknowledging a fix: deliberate
  decline: 0.88,    // refusing a clinical question: calm, never brisk
};
const DEFAULT_PACE = 1.0;

function openTtsSocket(browserWs, state, { text, speaker, language, moment }) {
  stopTts(state, "new-say"); // only one active TTS turn per connection
  const gen = state.ttsGeneration;
  let finished = false;
  let idleTimer = null;

  const pace = PACE[moment] ?? DEFAULT_PACE;
  console.log(`[tts] moment=${moment ?? "default"} pace=${pace}`);

  const qs = new URLSearchParams({ model: "bulbul:v4" });
  const url = `wss://${SARVAM_HOST}/text-to-speech/ws?${qs.toString()}`;
  console.log(`[tts] connecting ${url}`);

  const sock = new WebSocket(url, {
    headers: { "Api-Subscription-Key": API_KEY },
  });
  state.ttsSocket = sock;

  function finalize(reason) {
    if (finished || gen !== state.ttsGeneration) return;
    finished = true;
    clearTimeout(idleTimer);
    console.log(`[tts] done (${reason})`);
    safeSend(browserWs, { t: "tts_done" });
    if (state.ttsSocket === sock) {
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      state.ttsSocket = null;
    }
  }

  function bumpIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => finalize("idle timeout, no completion event"), TTS_IDLE_DONE_MS);
  }

  sock.on("unexpected-response", (_req, res) => logHandshakeFailure("tts", res));

  sock.on("open", () => {
    if (gen !== state.ttsGeneration) return; // superseded before it even opened
    console.log("[tts] socket open");
    sock.send(
      JSON.stringify({
        type: "config",
        data: {
          target_language_code: language,
          speaker,
          model: "bulbul:v4",
          speech_sample_rate: String(TTS_SAMPLE_RATE),
          output_audio_codec: "linear16",
          output_audio_bitrate: "128k",
          pace,
        },
      })
    );
    sock.send(JSON.stringify({ type: "text", data: { text } }));
    sock.send(JSON.stringify({ type: "flush" }));
    bumpIdleTimer(); // in case no audio ever arrives at all
  });

  sock.on("message", (raw) => {
    if (gen !== state.ttsGeneration) return; // stale: a shutup/new-say already fired
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.log(`[tts] non-JSON message: ${raw.toString().slice(0, 200)}`);
      return;
    }
    logShape("tts", msg);
    handleTtsMessage(browserWs, msg, { bumpIdleTimer, finalize });
  });

  sock.on("error", (err) => {
    console.error(`[tts] socket error: ${err.message}`);
    if (gen === state.ttsGeneration && !finished) {
      safeSend(browserWs, { t: "error", message: `TTS error: ${err.message}` });
      finalize("socket error");
    }
  });

  sock.on("close", (code, reason) => {
    console.log(`[tts] socket closed code=${code} reason=${reason}`);
    finalize(`socket closed code=${code}`);
  });

  return sock;
}

/** Defensive: accept both {type:"audio",data:{audio}} and a flat {audio}. */
function handleTtsMessage(browserWs, msg, { bumpIdleTimer, finalize }) {
  const type = msg.type;
  const data = msg.data ?? msg;
  const audioB64 = data?.audio ?? msg.audio;

  if (audioB64 && (type === "audio" || type === undefined)) {
    const contentType = data?.content_type ?? "";
    const codec = contentType.includes("mp3") ? "mp3" : "linear16";
    safeSend(browserWs, {
      t: "tts_chunk",
      b64: audioB64,
      codec,
      sampleRate: TTS_SAMPLE_RATE,
    });
    bumpIdleTimer();
    return;
  }

  if (
    type === "completion" ||
    type === "done" ||
    data?.event_type === "completion" ||
    // Observed live: {"type":"event","data":{"event_type":"final"}} -- this
    // is the real completion signal; docs describe a "completion" type that
    // was never actually seen.
    (type === "event" && data?.event_type === "final")
  ) {
    finalize("completion event");
    return;
  }

  if (type === "error" || msg.error) {
    safeSend(browserWs, {
      t: "error",
      message: String(data?.message ?? msg.error ?? "TTS error"),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Browser-facing server
 * ------------------------------------------------------------------ */

const wss = new WebSocketServer({ port: PORT });
console.log(`[relay] listening on ws://localhost:${PORT}`);

wss.on("connection", (browserWs) => {
  console.log("[relay] browser connected");

  const state = {
    sttSocket: null,
    ttsSocket: null,
    ttsGeneration: 0,
    audioBuffer: [], // frames queued while sttSocket is still connecting
  };

  browserWs.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      safeSend(browserWs, { t: "error", message: "Invalid JSON from client" });
      return;
    }

    switch (msg.t) {
      case "start": {
        if (state.sttSocket) {
          try {
            state.sttSocket.terminate();
          } catch {
            /* ignore */
          }
          state.sttSocket = null;
        }
        state.audioBuffer.length = 0;
        state.sttSocket = openSttSocket(
          browserWs,
          state,
          msg.language,
          msg.sampleRate
        );
        break;
      }

      case "audio": {
        if (!msg.b64) break;
        if (state.sttSocket && state.sttSocket.readyState === WebSocket.OPEN) {
          sendAudioFrame(state.sttSocket, msg.b64);
        } else if (state.sttSocket) {
          // still connecting: buffer, capped so a runaway stream can't OOM us
          state.audioBuffer.push(msg.b64);
          if (state.audioBuffer.length > 200) state.audioBuffer.shift();
        } else {
          safeSend(browserWs, {
            t: "error",
            message: "Received audio before start",
          });
        }
        break;
      }

      case "stop": {
        const sock = state.sttSocket;
        if (sock && sock.readyState === WebSocket.OPEN) {
          try {
            sock.send(JSON.stringify({ type: "flush" }));
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            if (state.sttSocket === sock) {
              try {
                sock.close();
              } catch {
                /* ignore */
              }
              state.sttSocket = null;
            }
          }, 800);
        }
        break;
      }

      case "say": {
        if (!msg.text || !msg.speaker || !msg.language) {
          safeSend(browserWs, {
            t: "error",
            message: "say requires text, speaker, language",
          });
          break;
        }
        openTtsSocket(browserWs, state, {
          text: msg.text,
          speaker: msg.speaker,
          language: msg.language,
          moment: msg.moment,
        });
        break;
      }

      case "shutup": {
        // Highest-value behaviour in the project: must be instant and safe
        // to call even with no active TTS turn.
        stopTts(state, "shutup");
        break;
      }

      default:
        safeSend(browserWs, {
          t: "error",
          message: `Unknown message type: ${msg.t}`,
        });
    }
  });

  browserWs.on("close", () => {
    console.log("[relay] browser disconnected, cleaning up");
    if (state.sttSocket) {
      try {
        state.sttSocket.terminate();
      } catch {
        /* ignore */
      }
      state.sttSocket = null;
    }
    stopTts(state, "browser-disconnected");
  });

  browserWs.on("error", (err) => {
    console.error(`[relay] browser socket error: ${err.message}`);
  });
});
