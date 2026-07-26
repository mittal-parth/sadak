"use client";

/**
 * useVoiceTurn — the browser half of the interruptible voice loop.
 *
 * Wires the WebSocket relay protocol (see roznamcha/CONTRACT.md) to the
 * framework-free audio plumbing in ./audio.ts. The one thing this file must
 * get exactly right is barge-in: when `speech_start` arrives while we're
 * speaking, audio playback is killed SYNCHRONOUSLY inside the socket's
 * onmessage handler, before any React state update. A re-render is too slow
 * for a 200ms budget, so the ordering below is deliberate — do not refactor
 * stopNow() to happen inside a useEffect keyed off state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMsg, LangCode, Moment, ServerMsg } from "../types";
import { createMicStream, createPlayer, MicError, type MicStreamHandle, type Player } from "./audio";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface UseVoiceTurnOptions {
  relayUrl: string;
  language: LangCode;
  speaker: string;
}

export interface UseVoiceTurnResult {
  status: VoiceStatus;
  transcript: string;
  partial: string;
  error: string | null;
  connect: () => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string, moment?: Moment) => void;
  cancelSpeech: () => void;
  lastBargeInMs: number | null;
}

const MAX_BACKOFF_MS = 8000;
const BASE_BACKOFF_MS = 500;

export function useVoiceTurn(opts: UseVoiceTurnOptions): UseVoiceTurnResult {
  const { relayUrl, language, speaker } = opts;

  const [status, setStatusState] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [error, setErrorState] = useState<string | null>(null);
  const [lastBargeInMs, setLastBargeInMs] = useState<number | null>(null);

  // Refs mirror the state that the WS onmessage handler needs to read
  // synchronously. React state is batched/async; these are not.
  const statusRef = useRef<VoiceStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<Player | null>(null);
  const micRef = useRef<MicStreamHandle | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const everConnectedRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setStatus = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const ensurePlayer = useCallback((): Player => {
    if (!playerRef.current) {
      playerRef.current = createPlayer({
        onDrain: () => {
          // All queued TTS audio finished naturally (not via barge-in).
          if (statusRef.current === "speaking") {
            setStatus("idle");
          }
        },
      });
    }
    return playerRef.current;
  }, [setStatus]);

  const send = useCallback((msg: ClientMsg) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const teardownMic = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const openSocket = useCallback(() => {
    clearReconnectTimer();
    intentionalCloseRef.current = false;
    setStatus("connecting");
    setErrorState(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(optsRef.current.relayUrl);
    } catch (err: any) {
      setStatus("error");
      setErrorState(`Could not open relay connection: ${err?.message ?? err}`);
      return;
    }
    socketRef.current = ws;

    ws.onopen = () => {
      everConnectedRef.current = true;
      reconnectAttemptRef.current = 0;
      // "ready" from the relay is what actually confirms the pipe is live;
      // until then we stay in "connecting" so callers don't race startListening.
    };

    // ---- THE HOT PATH. Read this before touching it. ----
    ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return; // malformed frame from relay; ignore rather than crash the loop
      }

      switch (msg.t) {
        case "ready": {
          if (statusRef.current === "connecting") setStatus("idle");
          break;
        }

        case "speech_start": {
          // Barge-in: this branch MUST stay synchronous and MUST run before
          // any setState. player.stopNow() is a plain function call that
          // issues AudioBufferSourceNode.stop(0) on every scheduled node —
          // no promises, no effects, no waiting on a re-render.
          const t0 = performance.now();
          const wasSpeaking = statusRef.current === "speaking";
          if (playerRef.current) {
            playerRef.current.stopNow();
          }
          if (wasSpeaking) {
            send({ t: "shutup" });
            const elapsed = performance.now() - t0;
            setLastBargeInMs(elapsed);
          }
          // Whether we were speaking, thinking, or already listening, the
          // worker is now talking — reflect that immediately.
          setStatus("listening");
          break;
        }

        case "speech_end": {
          // No transcript may ever arrive for this turn (short noise blip,
          // VAD false trigger). We simply move to "thinking"; if no "final"
          // shows up, callers can time out and re-prompt — that's above our
          // pay grade here.
          setStatus("thinking");
          setPartial("");
          break;
        }

        case "partial": {
          setPartial(msg.text);
          break;
        }

        case "final": {
          setPartial("");
          setTranscript(msg.text);
          setStatus("thinking");
          break;
        }

        case "tts_chunk": {
          const player = ensurePlayer();
          try {
            player.push({ b64: msg.b64, codec: msg.codec, sampleRate: msg.sampleRate });
          } catch (err: any) {
            setStatus("error");
            setErrorState(`Playback error: ${err?.message ?? err}`);
            break;
          }
          if (statusRef.current !== "speaking") setStatus("speaking");
          break;
        }

        case "tts_done": {
          // Don't force a status change here: audio already scheduled may
          // still be playing. The player's onDrain callback flips us back
          // to "idle" once every buffer has actually finished.
          if (playerRef.current && !playerRef.current.isActive() && statusRef.current === "speaking") {
            setStatus("idle");
          }
          break;
        }

        case "error": {
          setStatus("error");
          setErrorState(msg.message);
          break;
        }
      }
    };

    ws.onerror = () => {
      // Real diagnosis happens in onclose (readyState tells us if it ever opened).
    };

    ws.onclose = () => {
      teardownMic();
      if (socketRef.current !== ws) return; // stale handler from a superseded socket
      socketRef.current = null;

      if (intentionalCloseRef.current) {
        setStatus("idle");
        return;
      }

      setStatus("error");
      setErrorState(
        everConnectedRef.current
          ? "Lost connection to the voice relay. Reconnecting…"
          : "Could not reach the voice relay at " + optsRef.current.relayUrl + ". Retrying…"
      );

      const attempt = reconnectAttemptRef.current++;
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      reconnectTimerRef.current = setTimeout(() => {
        openSocket();
      }, delay);
    };
  }, [clearReconnectTimer, ensurePlayer, send, setStatus, teardownMic]);

  const connect = useCallback(() => {
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    reconnectAttemptRef.current = 0;
    openSocket();
  }, [openSocket]);

  const startListening = useCallback(async () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      connect();
    }

    try {
      const mic = await createMicStream((b64) => {
        send({ t: "audio", b64 });
      });
      micRef.current = mic;
    } catch (err) {
      const msg =
        err instanceof MicError
          ? err.message
          : `Unexpected microphone error: ${(err as any)?.message ?? err}`;
      setStatus("error");
      setErrorState(msg);
      return;
    }

    send({ t: "start", language: optsRef.current.language, sampleRate: 16000 });
    setStatus("listening");
  }, [connect, send, setStatus]);

  const stopListening = useCallback(() => {
    teardownMic();
    send({ t: "stop" });
    if (statusRef.current === "listening") setStatus("thinking");
  }, [send, setStatus, teardownMic]);

  const speak = useCallback(
    (text: string, moment?: Moment) => {
      ensurePlayer();
      const ok = send({
        t: "say",
        text,
        speaker: optsRef.current.speaker,
        language: optsRef.current.language,
        ...(moment ? { moment } : {}),
      });
      if (ok) setStatus("speaking");
    },
    [ensurePlayer, send, setStatus]
  );

  const cancelSpeech = useCallback(() => {
    const t0 = performance.now();
    const wasSpeaking = statusRef.current === "speaking";
    playerRef.current?.stopNow();
    if (wasSpeaking) {
      send({ t: "shutup" });
      setLastBargeInMs(performance.now() - t0);
    }
    setStatus("idle");
  }, [send, setStatus]);

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      intentionalCloseRef.current = true;
      teardownMic();
      playerRef.current?.dispose();
      playerRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    transcript,
    partial,
    error,
    connect,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    lastBargeInMs,
  };
}
