"use client";

import { useEffect, useRef, useState } from "react";
import type { District, Npc } from "@/lib/game/districts";
import { useVoice } from "@/lib/useVoice";

type Turn = { role: "user" | "assistant"; content: string };

export default function Dialogue({
  district,
  npc,
  clues,
  onClose,
  onComplete,
  onAnger,
}: {
  district: District;
  npc: Npc;
  clues: string[];
  onClose: () => void;
  onComplete: (npcId: string, reward: number, clue: string | null) => void;
  onAnger: (amount: number) => void;
}) {
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [angered, setAngered] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const voice = useVoice(district.language);

  useEffect(() => {
    inputRef.current?.focus();
    return () => audioRef.current?.pause();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    setInput("");
    setErr(null);
    setBusy(true);

    const next: Turn[] = [...history, { role: "user", content: clean }];
    setHistory(next);

    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          districtId: district.id,
          npcId: npc.id,
          playerText: clean,
          history,
          clues,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Something went wrong.");
        return;
      }

      setHistory([...next, { role: "assistant", content: json.reply }]);

      if (json.anger > 0) {
        onAnger(json.anger);
        setAngered(json.anger);
        setTimeout(() => setAngered(0), 2600);
      }

      if (json.missionComplete && !passed) {
        setPassed(true);
        onComplete(npc.id, json.reward, json.clue ?? null);
      }

      // The subtitle is already on screen; fetch and play the voice behind it.
      speak(json.reply);
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function speak(text: string) {
    setSpeaking(true);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ districtId: district.id, npcId: npc.id, text }),
      });
      const { audio } = await res.json();
      if (!audio) return;

      audioRef.current?.pause();
      const a = new Audio(audio);
      audioRef.current = a;
      // Autoplay can be refused before a user gesture, but subtitles still work.
      a.play().catch(() => {});
    } catch {
      // Voice is best-effort; the line is already readable.
    } finally {
      setSpeaking(false);
    }
  }

  // Hold SPACE to talk. The input is focused on open, so gating purely on focus
  // would mean Space never records; instead it records while the box is empty
  // (a leading space is meaningless) and types normally once there is text.
  const micRef = useRef({ busy, voice, send, input });
  micRef.current = { busy, voice, send, input };

  useEffect(() => {
    const canRecord = () => micRef.current.input.length === 0;

    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || !canRecord()) return;
      const { busy: b, voice: v } = micRef.current;
      if (b || v.recording || v.transcribing) return;
      e.preventDefault();
      v.start();
    };

    const up = async (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const { voice: v, send: s } = micRef.current;
      if (!v.recording) return;
      e.preventDefault();
      const transcript = await v.stop();
      if (transcript) s(transcript);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  async function onMicUp() {
    if (!voice.recording) return;
    const transcript = await voice.stop();
    if (transcript) send(transcript);
  }

  return (
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div className="dlg" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dlg-head">
          <div
            className="dlg-avatar"
            style={{ background: `#${npc.colour.toString(16).padStart(6, "0")}` }}
          />
          <div className="dlg-id">
            <h2>{npc.name}</h2>
            <p>
              {npc.role} · speaks <strong>{district.native}</strong>
            </p>
          </div>
          <button className="dlg-x" onClick={onClose} aria-label="Leave conversation">
            ✕
          </button>
        </header>

        <div className="dlg-objective">
          <span className="tag">OBJECTIVE</span>
          {npc.mission.brief}
        </div>

        {/* Tap a phrase to drop it in the box: learn the line by using it. */}
        <div className="dlg-phrases">
          {district.phrases.map((p) => (
            <button
              key={p.native}
              type="button"
              className="phrase-chip"
              title={`${p.roman} — ${p.en}`}
              onClick={() => {
                setInput((v) => (v ? `${v} ${p.native}` : p.native));
                inputRef.current?.focus();
              }}
            >
              <span lang={district.language.slice(0, 2)}>{p.native}</span>
              <em>{p.en}</em>
            </button>
          ))}
        </div>

        <div className="dlg-log" ref={scrollRef}>
          {history.length === 0 && (
            <p className="dlg-hint">
              Say something in {district.native}.
              <br />
              Hold <kbd>Space</kbd> to speak, or start typing.
            </p>
          )}

          {history.map((t, i) => (
            <div key={i} className={`bubble ${t.role}`}>
              {t.content}
            </div>
          ))}

          {busy && <div className="bubble assistant thinking">···</div>}
          {speaking && !busy && <p className="speaking">🔊 {npc.name} is speaking…</p>}
        </div>

        {angered > 0 && (
          <div className="dlg-anger">
            {angered > 1 ? "You crossed a line." : "That did not land well."} Wanted
            level +{angered}
          </div>
        )}

        {passed && (
          <div className="dlg-passed">
            <span>Mission passed</span>
            <span>+₹{npc.mission.reward}</span>
          </div>
        )}

        {(err || voice.error) && <div className="dlg-err">{err ?? voice.error}</div>}

        <form
          className="dlg-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <button
            type="button"
            className={`mic ${voice.recording ? "live" : ""}`}
            onMouseDown={voice.start}
            onMouseUp={onMicUp}
            onMouseLeave={onMicUp}
            disabled={busy || voice.transcribing}
            aria-label="Hold to speak"
          >
            {voice.transcribing ? "···" : voice.recording ? "◉" : "🎙"}
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voice.recording
                ? "Listening…"
                : voice.transcribing
                ? "Transcribing…"
                : `Reply in ${district.native}…`
            }
            disabled={busy}
          />

          <button type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
