/**
 * Sarvam streaming STT proxy for browser WebSocket sessions.
 * Used by /api/stt/ws (Vercel Functions WebSocket upgrade).
 */

import WebSocket from "ws";

const SARVAM_HOST = "api.sarvam.ai";

export type SttClientMsg =
  | { t: "start"; language: string; sampleRate?: number }
  | { t: "audio"; b64: string }
  | { t: "flush" }
  | { t: "stop" };

export type SttServerMsg =
  | { t: "ready" }
  | { t: "partial"; text: string }
  | { t: "final"; text: string }
  | { t: "error"; message: string };

export interface SttSessionState {
  sttSocket: WebSocket | null;
  sampleRate: number;
  audioBuffer: string[];
}

export function createSttSessionState(): SttSessionState {
  return { sttSocket: null, sampleRate: 16000, audioBuffer: [] };
}

function sendAudioFrame(sock: WebSocket, b64: string, sampleRate: number) {
  if (sock.readyState !== WebSocket.OPEN) return;
  sock.send(
    JSON.stringify({
      audio: {
        data: b64,
        sample_rate: String(sampleRate),
        encoding: "audio/wav",
      },
    })
  );
}

function forwardSarvamMessage(send: (msg: SttServerMsg) => void, raw: unknown) {
  const msg = raw as {
    type?: string;
    data?: { transcript?: string; is_final?: boolean; message?: string };
    transcript?: string;
    is_final?: boolean;
    error?: string;
  };
  const type = msg.type;
  const data = msg.data ?? msg;

  const transcript = data?.transcript ?? msg.transcript;
  if (typeof transcript === "string") {
    const isPartial =
      data?.is_final === false || msg.is_final === false || type === "partial";
    send({ t: isPartial ? "partial" : "final", text: transcript });
    return;
  }

  if (type === "error" || msg.error) {
    const errMsg =
      (data && "message" in data ? data.message : undefined) ??
      msg.error ??
      "STT error";
    send({ t: "error", message: String(errMsg) });
  }
}

function closeSttSocket(state: SttSessionState) {
  const sock = state.sttSocket;
  if (!sock) return;
  try {
    sock.terminate();
  } catch {
    /* ignore */
  }
  if (state.sttSocket === sock) state.sttSocket = null;
}

function openSttSocket(
  send: (msg: SttServerMsg) => void,
  state: SttSessionState,
  apiKey: string,
  language: string,
  sampleRate: number
) {
  const qs = new URLSearchParams({
    "language-code": language,
    model: "saaras:v3",
    mode: "transcribe",
    sample_rate: String(sampleRate),
    vad_signals: "true",
    high_vad_sensitivity: "true",
    flush_signal: "true",
    input_audio_codec: "pcm_s16le",
  });
  const url = `wss://${SARVAM_HOST}/speech-to-text/ws?${qs.toString()}`;

  const sock = new WebSocket(url, {
    headers: { "Api-Subscription-Key": apiKey },
  });

  sock.on("open", () => {
    send({ t: "ready" });
    for (const b64 of state.audioBuffer) sendAudioFrame(sock, b64, sampleRate);
    state.audioBuffer.length = 0;
  });

  sock.on("message", (raw) => {
    try {
      forwardSarvamMessage(send, JSON.parse(raw.toString()));
    } catch {
      /* ignore malformed Sarvam frames */
    }
  });

  sock.on("error", (err) => {
    send({ t: "error", message: `STT error: ${err.message}` });
  });

  sock.on("close", () => {
    if (state.sttSocket === sock) state.sttSocket = null;
  });

  return sock;
}

export function teardownSttSession(state: SttSessionState) {
  closeSttSocket(state);
  state.audioBuffer.length = 0;
}

export function handleSttClientMessage(
  raw: string,
  send: (msg: SttServerMsg) => void,
  state: SttSessionState,
  apiKey: string
) {
  let msg: SttClientMsg;
  try {
    msg = JSON.parse(raw);
  } catch {
    send({ t: "error", message: "Invalid JSON from client" });
    return;
  }

  switch (msg.t) {
    case "start": {
      closeSttSocket(state);
      state.audioBuffer.length = 0;
      state.sampleRate = msg.sampleRate || 16000;
      if (!msg.language) {
        send({ t: "error", message: "start requires language" });
        break;
      }
      state.sttSocket = openSttSocket(
        send,
        state,
        apiKey,
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
        send({ t: "error", message: "Received audio before start" });
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
      send({ t: "error", message: `Unknown message type: ${(msg as { t: string }).t}` });
  }
}
