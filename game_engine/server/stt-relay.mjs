/**
 * Game STT relay — browser ↔ Sarvam streaming speech-to-text.
 *
 * Separate from roznamcha. Holds SARVAM_API_KEY; proxies PCM frames to
 * wss://api.sarvam.ai/speech-to-text/ws (saaras:v3, transcribe).
 *
 * Browser protocol:
 *   → start { language, sampleRate? }
 *   → audio { b64 }
 *   → flush
 *   → stop
 *   ← ready | partial | final | error
 *
 * Run: npm run stt-relay   (default ws://localhost:8788)
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  if (process.env.SARVAM_API_KEY) return;
  const candidates = [
    path.resolve(__dirname, "..", ".env"),
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
  console.error("[stt-relay] SARVAM_API_KEY is not set. Add it to game_engine/.env");
  process.exit(1);
}

const PORT = Number(process.env.STT_RELAY_PORT || 8788);
const SARVAM_HOST = "api.sarvam.ai";

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function logHandshakeFailure(tag, res) {
  let body = "";
  res.on("data", (c) => (body += c));
  res.on("end", () => {
    console.error(`[stt-relay:${tag}] handshake HTTP ${res.statusCode}`);
    if (body) console.error(`[stt-relay:${tag}] body: ${body.slice(0, 500)}`);
  });
}

function sendAudioFrame(sock, b64, sampleRate) {
  if (sock.readyState !== WebSocket.OPEN) return;
  sock.send(
    JSON.stringify({
      audio: {
        data: b64,
        sample_rate: String(sampleRate || 16000),
        encoding: "audio/wav",
      },
    })
  );
}

function handleSttMessage(browserWs, msg) {
  const type = msg.type;
  const data = msg.data ?? msg;

  const transcript = data?.transcript ?? msg.transcript;
  if (typeof transcript === "string") {
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

function openSttSocket(browserWs, state, language, sampleRate) {
  const qs = new URLSearchParams({
    "language-code": language,
    model: "saaras:v3",
    mode: "transcribe",
    sample_rate: String(sampleRate || 16000),
    vad_signals: "true",
    high_vad_sensitivity: "true",
    flush_signal: "true",
    input_audio_codec: "pcm_s16le",
  });
  const url = `wss://${SARVAM_HOST}/speech-to-text/ws?${qs.toString()}`;
  console.log(`[stt-relay] Sarvam connect ${url}`);

  const sock = new WebSocket(url, {
    headers: { "Api-Subscription-Key": API_KEY },
  });

  sock.on("unexpected-response", (_req, res) => logHandshakeFailure("stt", res));

  sock.on("open", () => {
    console.log("[stt-relay] Sarvam socket open");
    safeSend(browserWs, { t: "ready" });
    for (const b64 of state.audioBuffer) sendAudioFrame(sock, b64, sampleRate);
    state.audioBuffer.length = 0;
  });

  sock.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleSttMessage(browserWs, msg);
  });

  sock.on("error", (err) => {
    console.error(`[stt-relay] Sarvam error: ${err.message}`);
    safeSend(browserWs, { t: "error", message: `STT error: ${err.message}` });
  });

  sock.on("close", (code, reason) => {
    console.log(`[stt-relay] Sarvam closed code=${code} reason=${reason}`);
    if (state.sttSocket === sock) state.sttSocket = null;
  });

  return sock;
}

function closeSttSocket(state) {
  const sock = state.sttSocket;
  if (!sock) return;
  try {
    sock.terminate();
  } catch {
    /* ignore */
  }
  if (state.sttSocket === sock) state.sttSocket = null;
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[stt-relay] listening on ws://localhost:${PORT}`);

wss.on("connection", (browserWs) => {
  console.log("[stt-relay] browser connected");

  const state = {
    sttSocket: null,
    sampleRate: 16000,
    audioBuffer: [],
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
        closeSttSocket(state);
        state.audioBuffer.length = 0;
        state.sampleRate = msg.sampleRate || 16000;
        if (!msg.language) {
          safeSend(browserWs, { t: "error", message: "start requires language" });
          break;
        }
        state.sttSocket = openSttSocket(
          browserWs,
          state,
          msg.language,
          state.sampleRate
        );
        break;
      }

      case "audio": {
        if (!msg.b64) break;
        const sock = state.sttSocket;
        if (sock && sock.readyState === WebSocket.OPEN) {
          sendAudioFrame(sock, msg.b64, state.sampleRate);
        } else if (sock) {
          state.audioBuffer.push(msg.b64);
          if (state.audioBuffer.length > 200) state.audioBuffer.shift();
        } else {
          safeSend(browserWs, { t: "error", message: "Received audio before start" });
        }
        break;
      }

      case "flush": {
        const sock = state.sttSocket;
        if (sock && sock.readyState === WebSocket.OPEN) {
          try {
            sock.send(JSON.stringify({ type: "flush" }));
          } catch {
            /* ignore */
          }
        }
        break;
      }

      case "stop": {
        closeSttSocket(state);
        state.audioBuffer.length = 0;
        break;
      }

      default:
        safeSend(browserWs, { t: "error", message: `Unknown message type: ${msg.t}` });
    }
  });

  browserWs.on("close", () => {
    console.log("[stt-relay] browser disconnected");
    closeSttSocket(state);
  });
});
