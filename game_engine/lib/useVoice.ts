"use client";

import { useCallback, useRef, useState } from "react";
import type { LangCode } from "@/lib/sarvam";

/**
 * Push-to-talk recording, transcribed by Sarvam Saaras.
 * Kept deliberately simple: record on hold, transcribe on release.
 */
export function useVoice(language: LangCode) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();

      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access denied, type instead.");
    }
  }, []);

  /** Stops recording and resolves with the transcript ("" if nothing usable). */
  const stop = useCallback(async (): Promise<string> => {
    const rec = recorderRef.current;
    if (!rec) return "";

    setRecording(false);

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      rec.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    // Anything this short is a mis-click, not speech.
    if (blob.size < 1200) return "";

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
    }
  }, [language]);

  return { recording, transcribing, error, start, stop, setError };
}
