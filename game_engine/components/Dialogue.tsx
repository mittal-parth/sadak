"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { District } from "@/lib/game/districts";
import type { NpcTurn } from "@/lib/game/npc-memory";
import type { LessonTarget } from "@/lib/game/tasks";
import { useVoice } from "@/lib/useVoice";
import { scoreAttempt, type WordVerdict } from "@/lib/game/speech-score";
import { playSfx } from "@/lib/audio/sfx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonTierLabel } from "@/lib/game/levels";
import { cn } from "@/lib/utils";

type Phase = "recall" | "npc" | "player" | "result" | "finished";

export default function Dialogue({
  district,
  target,
  priorMemory,
  onMemoryUpdate,
  onClose,
  onComplete,
  onPoints,
}: {
  district: District;
  target: LessonTarget;
  priorMemory: NpcTurn[];
  onMemoryUpdate: (turns: NpcTurn[]) => void;
  onClose: () => void;
  onComplete: (id: string, reward: number) => void;
  onPoints: (points: number) => void;
}) {
  const steps = target.lesson;
  const hasPrior = priorMemory.length > 0;

  const [stepIndex, setStepIndex] = useState(0);
  const [recallDone, setRecallDone] = useState(!hasPrior);
  const [recallLine, setRecallLine] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(hasPrior ? "recall" : "npc");
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
  const sessionTurnsRef = useRef<NpcTurn[]>([]);
  const onMemoryUpdateRef = useRef(onMemoryUpdate);
  onMemoryUpdateRef.current = onMemoryUpdate;

  const step = steps[stepIndex];

  // Live word colouring + accuracy while the mic is still open, reusing the
  // exact same scorer the committed grade uses so the meter never disagrees
  // with the "+N pts" that lands a moment later. Only drives the preview
  // layer — `attempt` (set in onMicUp) remains the sole source of the score.
  const live = useMemo(
    () =>
      step?.prompt && !attempt && voice.partial
        ? scoreAttempt(step.prompt.native, voice.partial)
        : null,
    [step, attempt, voice.partial]
  );

  const pushTurn = useCallback((turn: NpcTurn) => {
    const text = turn.content.trim();
    if (!text) return;
    sessionTurnsRef.current = [...sessionTurnsRef.current, { ...turn, content: text }];
  }, []);

  const playNpcLine = useCallback(
    async (text: string, after: "player" | "lesson") => {
      setNpcSpeaking(true);
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ districtId: district.id, npcId: target.id, text }),
        });
        const { audio } = await res.json();
        const finish = () => {
          setNpcSpeaking(false);
          if (after === "player") setPhase("player");
          else setRecallDone(true);
        };
        if (!audio) {
          finish();
          return;
        }
        audioRef.current?.pause();
        const a = new Audio(audio);
        audioRef.current = a;
        a.onended = finish;
        a.onerror = finish;
        await a.play().catch(finish);
      } catch {
        setNpcSpeaking(false);
        if (after === "player") setPhase("player");
        else setRecallDone(true);
      }
    },
    [district.id, target.id]
  );

  useEffect(() => {
    if (!hasPrior) return;
    let cancelled = false;

    (async () => {
      setPhase("recall");
      try {
        const res = await fetch("/api/recall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            districtId: district.id,
            taskId: target.id,
            memory: priorMemory,
          }),
        });
        const json = (await res.json()) as { reply?: string };
        if (cancelled) return;
        if (res.ok && json.reply?.trim()) {
          const line = json.reply.trim();
          setRecallLine(line);
          pushTurn({ role: "assistant", content: line });
          await playNpcLine(line, "lesson");
          if (!cancelled) setPhase("npc");
          return;
        }
      } catch {
        /* fall through to normal lesson */
      }
      if (!cancelled) setRecallDone(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recallDone || !step) return;
    setPhase("npc");
    setAttempt(null);
    setHeardNothing(false);
    pushTurn({ role: "assistant", content: step.npc.native });
    playNpcLine(step.npc.native, "player");
    return () => {
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, recallDone]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      const turns = sessionTurnsRef.current;
      if (turns.length) onMemoryUpdateRef.current(turns);
    };
  }, []);

  const advance = useCallback(() => {
    if (stepIndex + 1 >= steps.length) {
      setPhase("finished");
      if (!finishedRef.current) {
        finishedRef.current = true;
        playSfx("success");
        onComplete(target.id, target.reward);
      }
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, onComplete, target]);

  async function onMicUp() {
    if (!voice.recording) return;
    playSfx("tap");
    const transcript = await voice.stop();

    if (!transcript) {
      setHeardNothing(true);
      playSfx("error");
      return;
    }

    pushTurn({ role: "user", content: transcript });
    const scored = scoreAttempt(step.prompt.native, transcript);
    setAttempt({ transcript, verdicts: scored.verdicts, points: scored.points });
    setTotalPoints((p) => p + scored.points);
    setGradedCount((c) => c + 1);
    onPoints(scored.points);
    setPhase("result");
    // Three-band feedback so the player hears how they did, not just sees it.
    if (scored.points >= 72) playSfx("success");
    else if (scored.points >= 40) playSfx("partial");
    else playSfx("error");
  }

  const promptWords = step?.prompt?.roman.split(/\s+/) ?? [];
  const verdictColor: Record<WordVerdict, string> = {
    green: "word-green",
    yellow: "word-yellow",
    red: "word-red",
  };
  // Same green/yellow/red bands scoreAttempt uses per-word, applied to the
  // overall live accuracy so the meter's colour matches the words it sums up.
  const liveAccuracyVerdict = (accuracy: number): WordVerdict =>
    accuracy >= 0.72 ? "green" : accuracy >= 0.4 ? "yellow" : "red";

  const stepsGraded = steps.filter((s) => s.prompt).length;
  const avgAccuracy = gradedCount ? Math.round(totalPoints / gradedCount) : 0;

  const npcNative =
    phase === "recall" && recallLine ? recallLine : step?.npc.native ?? "";
  const npcRoman = phase === "recall" ? null : step?.npc.roman;
  const npcEn = phase === "recall" ? null : step?.npc.en;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed top-auto bottom-6 max-h-[min(85vh,42rem)] translate-y-0 gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b-2 border-border px-4 py-3 text-left">
          <div
            className="size-9 shrink-0 rounded-base border-2 border-border"
            style={{ background: `#${target.colour.toString(16).padStart(6, "0")}` }}
          />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">{target.name}</DialogTitle>
            <DialogDescription>
              {target.role} · learning{" "}
              <strong className="font-indic text-foreground">{district.native}</strong>
            </DialogDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {target.errandLevel != null && target.lessonTier != null && (
              <Badge variant="neutral" className="text-[0.625rem] uppercase tracking-wide">
                Level {target.errandLevel}/4 · {lessonTierLabel(target.lessonTier)}
              </Badge>
            )}
            <Badge variant="neutral">
              {Math.min(stepIndex + 1, steps.length)} / {steps.length}
            </Badge>
          </div>
        </DialogHeader>

        <Alert className="rounded-none border-x-0 border-t-0 shadow-none">
          <AlertTitle className="text-xs uppercase tracking-widest">Objective</AlertTitle>
          <AlertDescription>{target.brief}</AlertDescription>
        </Alert>

        {phase !== "finished" && step && (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Card className="gap-2 py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-[0.625rem] uppercase tracking-widest text-foreground/70">
                  {target.name}
                  {phase === "recall" && (
                    <span className="ml-2 normal-case tracking-normal text-main">· remembers you</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-4">
                <p className="font-indic text-lg leading-snug" lang={district.language.slice(0, 2)}>
                  {npcNative}
                </p>
                {npcRoman && (
                  <p className="text-sm italic text-foreground/80">{npcRoman}</p>
                )}
                {npcEn && <p className="text-xs text-foreground/70">{npcEn}</p>}
                {npcSpeaking && (
                  <span className="text-xs text-main animate-pulse">🔊 speaking…</span>
                )}
              </CardContent>
            </Card>

            <Card className="gap-2 py-4 text-right sm:text-right">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-[0.625rem] uppercase tracking-widest text-foreground/70">
                  You
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 px-4 max-sm:text-left">
                {phase === "recall" ? (
                  <p className="text-base italic text-foreground/80">…</p>
                ) : step.prompt ? (
                  <>
                    <p className="flex flex-wrap justify-end gap-1.5 text-lg max-sm:justify-start">
                      {promptWords.map((w, i) => {
                        // Committed verdict wins once the mic is released; until
                        // then the live partial paints the same words as the
                        // player speaks them.
                        const verdict = attempt?.verdicts[i] ?? live?.verdicts[i];
                        return (
                          <span
                            key={i}
                            className={verdict ? verdictColor[verdict] : "text-foreground/80"}
                          >
                            {w}
                          </span>
                        );
                      })}
                    </p>
                    <p className="text-xs text-foreground/70">{step.prompt.en}</p>
                  </>
                ) : (
                  <p className="text-base italic text-foreground/80">…</p>
                )}
                {attempt && (
                  <p className="text-xs italic text-foreground/70">
                    You said: “{attempt.transcript}”
                  </p>
                )}
                {heardNothing && (
                  <p className="text-xs text-chart-2">Didn&apos;t catch that — try again.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {phase === "result" && attempt && step.prompt && (
          <div className="flex items-center justify-between gap-3 border-t-2 border-border px-4 py-3">
            <div>
              <p className="text-[0.625rem] uppercase tracking-widest text-foreground/70">
                This line
              </p>
              <strong className="text-xl text-main">+{attempt.points} pts</strong>
            </div>
            <Button type="button" onClick={advance}>
              Continue →
            </Button>
          </div>
        )}

        {phase === "finished" && (
          <div className="flex flex-col items-center gap-2 border-t-2 border-border px-4 py-6 text-center">
            <Badge className="size-10 justify-center text-lg">✓</Badge>
            <h3 className="text-xl font-heading">Errand complete</h3>
            <p className="text-sm text-foreground/80">
              {gradedCount}/{stepsGraded} lines scored · average accuracy{" "}
              <strong>{avgAccuracy}%</strong>
            </p>
            <p className="font-base text-chart-4">
              +₹{target.reward} · {target.completionNote}
            </p>
            <Button type="button" className="mt-2 w-full max-w-xs" onClick={onClose}>
              Done
            </Button>
          </div>
        )}

        {phase === "player" && (
          <div className="flex flex-col items-center gap-2 border-t-2 border-border px-4 py-4">
            <Button
              type="button"
              size="icon"
              className={cn(
                "size-16 text-2xl touch-none select-none",
                voice.recording && "bg-chart-2 hover:bg-chart-2",
              )}
              onMouseDown={() => {
                playSfx("tap");
                voice.start();
              }}
              onMouseUp={onMicUp}
              onMouseLeave={onMicUp}
              onTouchStart={(e) => {
                e.preventDefault();
                playSfx("tap");
                voice.start();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                void onMicUp();
              }}
              disabled={voice.transcribing}
              aria-label="Hold to speak"
            >
              {voice.transcribing ? "···" : voice.recording ? "◉" : "🎙"}
            </Button>
            {voice.recording && live && (
              <p className="text-xs">
                <span className={verdictColor[liveAccuracyVerdict(live.accuracy)]}>
                  {live.points}%
                </span>
                <span className="text-foreground/70">
                  {" "}
                  · {live.verdicts.filter((v) => v === "green").length}/{live.verdicts.length} words
                </span>
              </p>
            )}
            <p className="text-xs text-foreground/70">
              {voice.transcribing ? (
                "Transcribing…"
              ) : voice.recording ? (
                voice.partial ? (
                  <span className="italic">
                    {voice.partial}
                    <span className="animate-pulse">▍</span>
                  </span>
                ) : (
                  "Listening…"
                )
              ) : (
                "Hold to speak the line above"
              )}
            </p>
          </div>
        )}

        {voice.error && (
          <Alert variant="destructive" className="rounded-none border-x-0 border-b-0">
            <AlertDescription>{voice.error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
