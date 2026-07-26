"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { District, Npc } from "@/lib/game/districts";
import { useVoice } from "@/lib/useVoice";
import { scoreAttempt, type WordVerdict } from "@/lib/game/speech-score";

/**
 * The language lesson: no chat box. The NPC speaks a scripted line (native
 * script, read aloud by TTS), the player is shown the phrase they should say
 * back — romanised, since the script on screen is always Latin — and after
 * they speak it, each word of that prompt is painted green / yellow / red
 * against what Sarvam actually heard.
 *
 * Steps run easiest-first per NPC (lib/game/districts.ts), and an occasional
 * step has no prompt at all: an interruption the player just has to roll
 * with, same as a real conversation going sideways.
 */
export default function Dialogue({
  district,
  npc,
  onClose,
  onComplete,
  onPoints,
}: {
  district: District;
  npc: Npc;
  clues: string[];
  onClose: () => void;
  onComplete: (npcId: string, reward: number, clue: string | null) => void;
  onAnger: (amount: number) => void;
  onPoints: (points: number) => void;
}) {
  const steps = npc.lesson;

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<"npc" | "player" | "result" | "finished">("npc");
  const [attempt, setAttempt] = useState<{
    transcript: string;
    verdicts: WordVerdict[];
    points: number;
  } | null>(null);
  const [heardNothing, setHeardNothing] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [gradedCount, setGradedCount] = useState(0);
  const [npcSpeaking, setNpcSpeaking] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voice = useVoice(district.language);
  const finishedRef = useRef(false);

  const step = steps[stepIndex];

  const playNpcLine = useCallback(
    async (text: string) => {
      setNpcSpeaking(true);
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ districtId: district.id, npcId: npc.id, text }),
        });
        const { audio } = await res.json();
        if (!audio) {
          setNpcSpeaking(false);
          setPhase("player");
          return;
        }
        audioRef.current?.pause();
        const a = new Audio(audio);
        audioRef.current = a;
        a.onended = () => {
          setNpcSpeaking(false);
          setPhase("player");
        };
        a.onerror = () => {
          setNpcSpeaking(false);
          setPhase("player");
        };
        await a.play().catch(() => {
          setNpcSpeaking(false);
          setPhase("player");
        });
      } catch {
        setNpcSpeaking(false);
        setPhase("player");
      }
    },
    [district.id, npc.id]
  );

  // Speak each NPC line as its step comes up.
  useEffect(() => {
    if (!step) return;
    setPhase("npc");
    setAttempt(null);
    setHeardNothing(false);
    playNpcLine(step.npc.native);
    return () => {
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const advance = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      setPhase("finished");
      if (!finishedRef.current) {
        finishedRef.current = true;
        onComplete(npc.id, npc.mission.reward, npc.clue);
      }
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, onComplete, npc]);

  async function onMicUp() {
    if (!voice.recording) return;
    const transcript = await voice.stop();

    if (!step.prompt) {
      // Interruption: whatever they said, the scene just carries on.
      setAttempt(transcript ? { transcript, verdicts: [], points: 0 } : null);
      setPhase("result");
      setTimeout(advance, transcript ? 1400 : 700);
      return;
    }

    if (!transcript) {
      setHeardNothing(true);
      return;
    }

    const scored = scoreAttempt(step.prompt.native, transcript);
    setAttempt({ transcript, verdicts: scored.verdicts, points: scored.points });
    setTotalPoints((p) => p + scored.points);
    setGradedCount((c) => c + 1);
    onPoints(scored.points);
    setPhase("result");
  }

  const promptWords = step?.prompt?.roman.split(/\s+/) ?? [];
  const verdictColor: Record<WordVerdict, string> = {
    green: "word-green",
    yellow: "word-yellow",
    red: "word-red",
  };

  const stepsGraded = steps.filter((s) => s.prompt).length;
  const avgAccuracy = gradedCount ? Math.round(totalPoints / gradedCount) : 0;

  return (
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div className="dlg lesson" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dlg-head">
          <div
            className="dlg-avatar"
            style={{ background: `#${npc.colour.toString(16).padStart(6, "0")}` }}
          />
          <div className="dlg-id">
            <h2>{npc.name}</h2>
            <p>
              {npc.role} · learning <strong>{district.native}</strong>
            </p>
          </div>
          <span className="lesson-step">
            {Math.min(stepIndex + 1, steps.length)} / {steps.length}
          </span>
          <button className="dlg-x" onClick={onClose} aria-label="Leave conversation">
            ✕
          </button>
        </header>

        <div className="dlg-objective">
          <span className="tag">OBJECTIVE</span>
          {npc.mission.brief}
        </div>

        {phase !== "finished" && (
          <div className="captions">
            <div className="caption caption-npc">
              <span className="caption-who">{npc.name}</span>
              <p className="caption-native" lang={district.language.slice(0, 2)}>
                {step.npc.native}
              </p>
              <p className="caption-roman">{step.npc.roman}</p>
              <p className="caption-en">{step.npc.en}</p>
              {npcSpeaking && <span className="caption-live">🔊 speaking…</span>}
            </div>

            <div className="caption caption-player">
              <span className="caption-who">You</span>
              {step.prompt ? (
                <>
                  <p className="caption-prompt">
                    {promptWords.map((w, i) => (
                      <span
                        key={i}
                        className={
                          attempt?.verdicts[i] ? `pw ${verdictColor[attempt.verdicts[i]]}` : "pw"
                        }
                      >
                        {w}
                      </span>
                    ))}
                  </p>
                  <p className="caption-en">{step.prompt.en}</p>
                </>
              ) : (
                <p className="caption-prompt caption-free">Say anything back…</p>
              )}
              {attempt && <p className="caption-heard">You said: “{attempt.transcript}”</p>}
              {heardNothing && <p className="caption-heard warn">Didn't catch that — try again.</p>}
            </div>
          </div>
        )}

        {phase === "result" && attempt && step.prompt && (
          <div className="lesson-result">
            <strong>+{attempt.points} pts</strong>
            <button className="menu-primary" onClick={advance}>
              Continue
            </button>
          </div>
        )}

        {phase === "finished" && (
          <div className="lesson-finished">
            <h3>Lesson complete</h3>
            <p>
              {gradedCount}/{stepsGraded} lines scored · average accuracy{" "}
              <strong>{avgAccuracy}%</strong>
            </p>
            <p className="lesson-reward">+₹{npc.mission.reward} · clue unlocked</p>
            <button className="menu-primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {phase === "player" && (
          <div className="lesson-mic">
            <button
              type="button"
              className={`mic big ${voice.recording ? "live" : ""}`}
              onMouseDown={voice.start}
              onMouseUp={onMicUp}
              onMouseLeave={onMicUp}
              disabled={voice.transcribing}
              aria-label="Hold to speak"
            >
              {voice.transcribing ? "···" : voice.recording ? "◉" : "🎙"}
            </button>
            <p className="lesson-mic-hint">
              {voice.transcribing
                ? "Transcribing…"
                : voice.recording
                ? "Listening…"
                : "Hold to speak the line above"}
            </p>
          </div>
        )}

        {voice.error && <div className="dlg-err">{voice.error}</div>}
      </div>
    </div>
  );
}
