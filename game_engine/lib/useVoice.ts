"use client";

import { useCallback, useRef, useState } from "react";
import type { LangCode } from "@/lib/sarvam";

// How often MediaRecorder hands us a slice while recording. Small enough that
// the player sees words land within about a second of speaking, large enough
// that we aren't hammering /api/stt (and Sarvam's bill) every frame.
const PARTIAL_MS = 900;

/**
 * Push-to-talk recording, transcribed by Sarvam Saaras.
 *
 * Recording still starts on hold and the authoritative transcript still comes
 * from a single POST on release — that scoring path is unchanged. What's new
 * is a *live* transcript: MediaRecorder is started with a timeslice, and on
 * every slice we cumulatively re-transcribe everything captured so far
 * (`chunks[0]` carries the WebM header, so `Blob(chunks[0..n])` is always a
 * decodable file on its own) against the same /api/stt route. That result is
 * exposed as `partial` purely for display — it is never scored.
 */
export function useVoice(language: LangCode) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Guards for the partial stream only — none of this touches the final send.
  const partialInFlightRef = useRef(false);
  const partialSeqRef = useRef(0);
  const partialAppliedSeqRef = useRef(0);
  const partialAbortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setPartial("");
    try {
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

        // Natural backpressure: if the previous partial hasn't come back yet,
        // skip this slice rather than queue it. A slow network shouldn't stack
        // up requests that just get superseded seconds later anyway.
        if (partialInFlightRef.current) return;

        const abortController = partialAbortRef.current;
        if (!abortController) return;

        const seq = ++partialSeqRef.current;
        const cumulative = new Blob(chunksRef.current, { type: "audio/webm" });

        // Mirror the mis-click guard on the final send — a single ~900ms slice
        // of silence isn't worth a round trip.
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

            // Drop a response that arrived out of order — an older slice's
            // reply landing after a newer one would otherwise rewind the text
            // the player is watching.
            if (seq <= partialAppliedSeqRef.current) return;
            partialAppliedSeqRef.current = seq;
            setPartial(text);
          } catch {
            // Silent by design: a dropped partial is purely cosmetic, and
            // surfacing it would flash an error for something the player
            // never notices (the next slice fixes it 900ms later). Only the
            // final transcription may call setError.
          } finally {
            partialInFlightRef.current = false;
          }
        })();
      };
      rec.start(PARTIAL_MS);

      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access denied, type instead.");
    }
  }, [language]);

  /** Stops recording and resolves with the transcript ("" if nothing usable). */
  const stop = useCallback(async (): Promise<string> => {
    const rec = recorderRef.current;
    if (!rec) return "";

    setRecording(false);

    // Cancel any in-flight partial first — one landing after the final send
    // resolves below could otherwise overwrite `partial` with stale text right
    // as the committed `attempt` takes over from it.
    partialAbortRef.current?.abort();
    partialAbortRef.current = null;

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      rec.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    // Anything this short is a mis-click, not speech.
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
        setError(json.error ?? "Could not transcribe that.");
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

  return { recording, transcribing, error, partial, start, stop, setError };
}
