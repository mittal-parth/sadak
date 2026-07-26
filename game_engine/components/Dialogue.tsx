"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { District, Npc } from "@/lib/game/districts";
import { useVoice } from "@/lib/useVoice";
import { useLiveVoice, type LiveTurn } from "@/lib/useLiveVoice";

type Turn = LiveTurn;

/**
 * Two ways to have the same conversation:
 *
 *  - LIVE (default). The player is in a LiveKit room with the NPC worker
 *    (agent.py): the mic stays open, the NPC hears them and answers over the
 *    wire, and lines arrive here as subtitles.
 *  - PUSH-TO-TALK (fallback). No LiveKit config, or no worker running: hold
 *    Space, the clip goes to /api/stt, the reply to /api/talk, the voice to
 *    /api/speak. Slower and turn-based, but it needs nothing but a Sarvam key.
 *
 * Falling back mid-conversation keeps whatever has been said so far, so the
 * scene carries on instead of restarting.
 */
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
  const [restHistory, setRestHistory] = useState<Turn[]>([]);
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

  // Grading is one path for both modes: the live agent scores the conversation
  // and pushes a verdict, /api/talk returns one inline.
  const passedRef = useRef(false);
  const award = useCallback(
    (grade: { missionComplete: boolean; anger: number }) => {
      if (grade.anger > 0) {
        onAnger(grade.anger);
        setAngered(grade.anger);
        setTimeout(() => setAngered(0), 2600);
      }
      if (grade.missionComplete && !passedRef.current) {
        passedRef.current = true;
        setPassed(true);
        onComplete(npc.id, npc.mission.reward, npc.clue);
      }
    },
    [npc, onAnger, onComplete]
  );

  const live = useLiveVoice({
    districtId: district.id,
    npcId: npc.id,
    clues,
    onGrade: award,
  });

  const liveMode = live.status !== "unavailable";
  const history = liveMode ? live.history : restHistory;

  // Dropping to push-to-talk should not lose the conversation: /api/talk takes
  // the same history shape the agent has been narrating.
  const handedOver = useRef(false);
  useEffect(() => {
    if (liveMode || handedOver.current) return;
    handedOver.current = true;
    if (live.history.length) setRestHistory(live.history);
  }, [liveMode, live.history]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => audioRef.current?.pause();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy, live.partial]);

  /** The push-to-talk path: one round trip per turn. */
  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    setInput("");
    setErr(null);
    setBusy(true);

    const next: Turn[] = [...restHistory, { role: "user", content: clean }];
    setRestHistory(next);

    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          districtId: district.id,
          npcId: npc.id,
          playerText: clean,
          history: restHistory,
          clues,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Something went wrong.");
        return;
      }

      setRestHistory([...next, { role: "assistant", content: json.reply }]);
      award({ missionComplete: json.missionComplete === true, anger: json.anger ?? 0 });

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

  function submit(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (liveMode) {
      if (live.sendText(clean)) setInput("");
      return;
    }
    send(clean);
  }

  // Hold SPACE to talk, on the push-to-talk path only: in live mode the mic is
  // already open and Space is just a space. The input is focused on open, so
  // gating purely on focus would mean Space never records; instead it records
  // while the box is empty and types normally once there is text.
  const micRef = useRef({ busy, voice, send, input, liveMode });
  micRef.current = { busy, voice, send, input, liveMode };

  useEffect(() => {
    const canRecord = () =>
      !micRef.current.liveMode && micRef.current.input.length === 0;

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

  const connecting = live.status === "connecting";
  const thinking = liveMode ? live.npcState === "thinking" : busy;
  const talking = liveMode ? live.npcState === "speaking" : speaking && !busy;
  const problem = err ?? live.error ?? voice.error;

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
          <span className={`dlg-link ${liveMode ? (connecting ? "wait" : "on") : "off"}`}>
            {connecting ? "connecting" : liveMode ? "live" : "push to talk"}
          </span>
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
              {connecting ? (
                <>Opening the line to {npc.name}…</>
              ) : liveMode ? (
                <>
                  The mic is <strong>open</strong>. Just talk, or type instead.
                </>
              ) : (
                <>
                  Hold <kbd>Space</kbd> to speak, or start typing.
                </>
              )}
            </p>
          )}

          {history.map((t, i) => (
            <div key={i} className={`bubble ${t.role}`}>
              {t.content}
            </div>
          ))}

          {/* What the NPC is hearing right now, before the turn is committed. */}
          {liveMode && live.partial && !thinking && (
            <div className="bubble user partial">{live.partial}</div>
          )}

          {thinking && <div className="bubble assistant thinking">···</div>}
          {talking && <p className="speaking">🔊 {npc.name} is speaking…</p>}
          {liveMode && !thinking && !talking && live.npcState === "listening" && (
            <p className="speaking">🎙 {npc.name} is listening…</p>
          )}
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

        {problem && <div className="dlg-err">{problem}</div>}

        <form
          className="dlg-input"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          {liveMode ? (
            <button
              type="button"
              className={`mic ${live.muted || live.micDenied ? "" : "live"}`}
              onClick={live.toggleMute}
              disabled={live.micDenied || connecting}
              aria-label={live.muted ? "Unmute the microphone" : "Mute the microphone"}
              title={live.muted ? "Mic muted" : "Mic open"}
            >
              {live.micDenied ? "🚫" : live.muted ? "🔇" : "🎙"}
            </button>
          ) : (
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
          )}

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              connecting
                ? "Connecting…"
                : voice.recording
                ? "Listening…"
                : voice.transcribing
                ? "Transcribing…"
                : `Reply in ${district.native}…`
            }
            disabled={!liveMode && busy}
          />

          <button type="submit" disabled={connecting || (!liveMode && busy) || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
