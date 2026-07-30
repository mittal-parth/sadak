"use client";

import { useCallback, useRef, useState } from "react";
import { createMicStream, MicError, type MicStreamHandle } from "@/lib/audio/pcm-mic";
import type { LangCode } from "@/lib/sarvam";

const PARTIAL_MS = 900;
const FLUSH_WAIT_MS = 1500;
const RELAY_CONNECT_MS = 3000;
const SAMPLE_RATE = 16000;

type RelayServerMsg =
  | { t: "ready" }
  | { t: "partial"; text: string }
  | { t: "final"; text: string }
  | { t: "error"; message: string };

function relayUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_STT_RELAY_URL?.trim();
  return url || null;
}

function combineTranscript(committed: string, interim: string): string {
  return [committed, interim].filter(Boolean).join(" ").trim();
}

/**
 * Push-to-talk recording for language lessons.
 *
 * Prefers Sarvam streaming STT via the game-owned WebSocket relay
 * (`npm run stt-relay`). Falls back to REST `/api/stt` when the relay is
 * unset or unreachable (e.g. Vercel without a relay host).
 *
 * `partial` drives live transcript + word colours while the mic is open.
 * The authoritative grade still comes from `stop()`.
 */
export function useVoice(language: LangCode) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");

  // REST fallback
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const partialInFlightRef = useRef(false);
  const partialSeqRef = useRef(0);
  const partialAppliedSeqRef = useRef(0);
  const partialAbortRef = useRef<AbortController | null>(null);

  // Streaming path
  const modeRef = useRef<"stream" | "rest" | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<MicStreamHandle | null>(null);
  const committedRef = useRef("");
  const interimRef = useRef("");
  const awaitingFlushRef = useRef(false);
  const flushResolveRef = useRef<((text: string) => void) | null>(null);

  const updatePartialDisplay = useCallback(() => {
    setPartial(combineTranscript(committedRef.current, interimRef.current));
  }, []);

  const teardownStream = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ t: "stop" }));
      } catch {
        /* ignore */
      }
      ws.close();
    }
    committedRef.current = "";
    interimRef.current = "";
    awaitingFlushRef.current = false;
    flushResolveRef.current = null;
  }, []);

  const handleRelayMessage = useCallback(
    (msg: RelayServerMsg) => {
      switch (msg.t) {
        case "partial": {
          interimRef.current = msg.text.trim();
          updatePartialDisplay();
          break;
        }
        case "final": {
          const text = msg.text.trim();
          if (text) {
            committedRef.current = committedRef.current
              ? `${committedRef.current} ${text}`
              : text;
          }
          interimRef.current = "";
          updatePartialDisplay();
          if (awaitingFlushRef.current && flushResolveRef.current) {
            awaitingFlushRef.current = false;
            const resolve = flushResolveRef.current;
            flushResolveRef.current = null;
            resolve(combineTranscript(committedRef.current, ""));
          }
          break;
        }
        case "error": {
          if (modeRef.current === "stream" && !committedRef.current && !interimRef.current) {
            setError(msg.message);
          }
          if (awaitingFlushRef.current && flushResolveRef.current) {
            awaitingFlushRef.current = false;
            const resolve = flushResolveRef.current;
            flushResolveRef.current = null;
            resolve(combineTranscript(committedRef.current, interimRef.current));
          }
          break;
        }
        default:
          break;
      }
    },
    [updatePartialDisplay]
  );

  const connectRelay = useCallback(
    (): Promise<WebSocket | null> =>
      new Promise((resolve) => {
        const url = relayUrl();
        if (!url) {
          resolve(null);
          return;
        }

        let settled = false;
        const finish = (ws: WebSocket | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(ws);
        };

        let ws: WebSocket;
        try {
          ws = new WebSocket(url);
        } catch {
          finish(null);
          return;
        }

        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          finish(null);
        }, RELAY_CONNECT_MS);

        ws.onopen = () => {
          ws.send(JSON.stringify({ t: "start", language, sampleRate: SAMPLE_RATE }));
        };

        ws.onmessage = (ev) => {
          let msg: RelayServerMsg;
          try {
            msg = JSON.parse(ev.data as string);
          } catch {
            return;
          }

          if (msg.t === "ready") {
            ws.onmessage = (event) => {
              let inner: RelayServerMsg;
              try {
                inner = JSON.parse(event.data as string);
              } catch {
                return;
              }
              handleRelayMessage(inner);
            };
            finish(ws);
            return;
          }

          if (msg.t === "error") {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            finish(null);
          }
        };

        ws.onerror = () => finish(null);
        ws.onclose = () => {
          if (!settled) finish(null);
        };
      }),
    [language, handleRelayMessage]
  );

  const startRest = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    partialInFlightRef.current = false;
    partialSeqRef.current = 0;
    partialAppliedSeqRef.current = 0;
    partialAbortRef.current = new AbortController();

    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      chunksRef.current.push(e.data);
      if (partialInFlightRef.current) return;

      const abortController = partialAbortRef.current;
      if (!abortController) return;

      const seq = ++partialSeqRef.current;
      const cumulative = new Blob(chunksRef.current, { type: "audio/webm" });
      if (cumulative.size < 1200) return;

      partialInFlightRef.current = true;
      (async () => {
        try {
          const form = new FormData();
          form.append("audio", cumulative, "speech.webm");
          form.append("language", language);
          form.append("partial", "true");

          const res = await fetch("/api/stt", {
            method: "POST",
            body: form,
            signal: abortController.signal,
          });
          if (!res.ok) return;
          const json = await res.json();
          const text = (json.transcript ?? "").trim();
          if (seq <= partialAppliedSeqRef.current) return;
          partialAppliedSeqRef.current = seq;
          setPartial(text);
        } catch {
          /* partial drops are cosmetic */
        } finally {
          partialInFlightRef.current = false;
        }
      })();
    };
    rec.start(PARTIAL_MS);
    recorderRef.current = rec;
    modeRef.current = "rest";
    setRecording(true);
  }, [language]);

  const startStream = useCallback(async () => {
    const ws = await connectRelay();
    if (!ws) return false;

    wsRef.current = ws;
    committedRef.current = "";
    interimRef.current = "";

    const mic = await createMicStream((b64) => {
      const socket = wsRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: "audio", b64 }));
      }
    });
    micRef.current = mic;
    modeRef.current = "stream";
    setRecording(true);
    return true;
  }, [connectRelay]);

  const start = useCallback(async () => {
    setError(null);
    setPartial("");
    modeRef.current = null;

    try {
      if (relayUrl()) {
        const ok = await startStream();
        if (ok) return;
      }
      await startRest();
    } catch (err) {
      teardownStream();
      if (err instanceof MicError) {
        setError(
          err.reason === "denied"
            ? "Microphone access denied, type instead."
            : err.message
        );
      } else {
        setError("Microphone access denied, type instead.");
      }
    }
  }, [startStream, startRest, teardownStream]);

  const stopRest = useCallback(async (): Promise<string> => {
    const rec = recorderRef.current;
    if (!rec) return "";

    partialAbortRef.current?.abort();
    partialAbortRef.current = null;

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      rec.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    if (blob.size < 1200) {
      setPartial("");
      return "";
    }

    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "speech.webm");
      form.append("language", language);

      const res = await fetch("/api/stt", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setError(
          typeof json.error === "string" && json.error.trim()
            ? json.error
            : "Could not transcribe that - try again."
        );
        return "";
      }
      return (json.transcript ?? "").trim();
    } catch {
      setError("Transcription failed.");
      return "";
    } finally {
      setTranscribing(false);
      setPartial("");
    }
  }, [language]);

  const stopStream = useCallback(async (): Promise<string> => {
    setRecording(false);
    micRef.current?.stop();
    micRef.current = null;

    const ws = wsRef.current;
    const preview = combineTranscript(committedRef.current, interimRef.current);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      teardownStream();
      setPartial("");
      return preview;
    }

    setTranscribing(true);

    let transcript = preview;
    try {
      const flushPromise = new Promise<string>((resolve) => {
        flushResolveRef.current = resolve;
        awaitingFlushRef.current = true;
        setTimeout(() => {
          if (!awaitingFlushRef.current || !flushResolveRef.current) return;
          awaitingFlushRef.current = false;
          const resolveLate = flushResolveRef.current;
          flushResolveRef.current = null;
          resolveLate(combineTranscript(committedRef.current, interimRef.current));
        }, FLUSH_WAIT_MS);
      });

      ws.send(JSON.stringify({ t: "flush" }));
      transcript = (await flushPromise).trim() || preview;
    } catch {
      transcript = preview;
    } finally {
      teardownStream();
      setTranscribing(false);
      setPartial("");
    }

    return transcript;
  }, [teardownStream]);

  const stop = useCallback(async (): Promise<string> => {
    if (modeRef.current === "stream") {
      return stopStream();
    }

    setRecording(false);
    return stopRest();
  }, [stopStream, stopRest]);

  return { recording, transcribing, error, partial, start, stop, setError };
}
