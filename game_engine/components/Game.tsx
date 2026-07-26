"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game, type Telemetry } from "@/lib/game/engine";
import type { District } from "@/lib/game/districts";
import {
  errandIndexForTask,
  resolveTaskLesson,
  taskAsLessonTarget,
  taskById,
  taskFinaleForDistrict,
  tasksForDistrict,
  totalTaskReward,
  type StreetTask,
} from "@/lib/game/tasks";
import type { ComfortLevel } from "@/lib/game/levels";
import { errandLevelNumber, lessonTierFor } from "@/lib/game/levels";
import Title from "./Title";
import Hud from "./Hud";
import Dialogue from "./Dialogue";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  memoryKey,
  mergeTurns,
  type NpcMemoryMap,
  type NpcTurn,
} from "@/lib/game/npc-memory";

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [district, setDistrict] = useState<District | null>(null);
  const [comfort, setComfort] = useState<ComfortLevel>("medium");
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [talking, setTalking] = useState<StreetTask | null>(null);
  const [cash, setCash] = useState(0);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [heat, setHeat] = useState(0);
  const [busted, setBusted] = useState(false);
  const [card, setCard] = useState<StreetTask | null>(null);
  const [npcMemory, setNpcMemory] = useState<NpcMemoryMap>({});

  const tasks = useMemo(
    () => (district ? tasksForDistrict(district.id) : []),
    [district]
  );

  const talkingTarget = useMemo(() => {
    if (!talking) return null;
    const index = errandIndexForTask(talking.id, talking.districtId);
    const tier = lessonTierFor(comfort, index);
    const lesson = resolveTaskLesson(talking, comfort);
    return taskAsLessonTarget(talking, lesson, {
      errandLevel: errandLevelNumber(index),
      lessonTier: tier,
    });
  }, [talking, comfort]);

  const nearbyRef = useRef<string | null>(null);
  const talkingRef = useRef<StreetTask | null>(null);
  const menuRef = useRef(false);
  const metRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    talkingRef.current = talking;
    menuRef.current = menuOpen;

    const g = gameRef.current;
    if (!g) return;
    const frozen = talking !== null || menuOpen || busted || card !== null;
    g.paused = frozen;
    if (frozen) g.releasePointer();
  }, [talking, menuOpen, busted, card]);

  useEffect(() => {
    if (heat <= 0 || busted) return;
    const t = setTimeout(() => setHeat((h) => Math.max(0, h - 1)), 40000);
    return () => clearTimeout(t);
  }, [heat, busted]);

  useEffect(() => {
    if (heat < 5 || busted) return;
    setBusted(true);
    setTalking(null);
    setCash((c) => Math.max(0, Math.round(c * 0.5)));
  }, [heat, busted]);

  useEffect(() => {
    if (!district || !canvasRef.current) return;

    const game = new Game(canvasRef.current, district, (t) => {
      nearbyRef.current = t.nearby;
      setTel(t);
    });
    gameRef.current = game;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__game = game;
    }
    game.start();

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [district]);

  const openTalk = useCallback(() => {
    if (!district || talkingRef.current) return;
    const task = taskById(nearbyRef.current ?? "");
    if (!task || task.districtId !== district.id) return;

    if (!metRef.current.has(task.id)) {
      metRef.current.add(task.id);
      setCard(task);
      setTimeout(() => {
        setCard(null);
        setTalking(task);
      }, 2200);
      return;
    }
    setTalking(task);
  }, [district]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (talkingRef.current) setTalking(null);
        else setMenuOpen((m) => !m);
        return;
      }
      if (talkingRef.current || menuRef.current) return;

      if (e.code === "KeyE") {
        e.preventDefault();
        openTalk();
      }
      if (e.code === "KeyP") setPhrasesOpen((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTalk]);

  const onPoints = useCallback((points: number) => {
    setXp((x) => x + points);
  }, []);

  const mergeNpcMemory = useCallback(
    (taskId: string, turns: NpcTurn[]) => {
      if (!district || !turns.length) return;
      const key = memoryKey(district.id, taskId);
      setNpcMemory((prev) => ({
        ...prev,
        [key]: mergeTurns(prev[key] ?? [], turns),
      }));
    },
    [district]
  );

  const onComplete = useCallback(
    (taskId: string, reward: number) => {
      const task = taskById(taskId);
      if (!task) return;

      setCompleted((prev) => {
        if (prev.has(taskId)) return prev;
        return new Set(prev).add(taskId);
      });
      setCash((c) => c + reward);
      setArtifacts((prev) =>
        prev.includes(task.completionNote) ? prev : [...prev, task.completionNote]
      );
      gameRef.current?.markDone(taskId);

      setToast(`Done: ${task.title}`);
      setTimeout(() => setToast(null), 4000);
      setTalking(null);
    },
    []
  );

  const leaveDistrict = useCallback(() => {
    setDistrict(null);
    setTel(null);
    setTalking(null);
    setCash(0);
    setXp(0);
    setCompleted(new Set());
    setArtifacts([]);
    setToast(null);
    setMenuOpen(false);
    setPhrasesOpen(false);
    setHeat(0);
    setBusted(false);
    setCard(null);
    metRef.current = new Set();
    setNpcMemory({});
    setComfort("medium");
  }, []);

  const release = useCallback(() => {
    setBusted(false);
    setHeat(0);
  }, []);

  if (!district) {
    return (
      <Title
        onEnter={(d, c) => {
          setDistrict(d);
          setComfort(c);
        }}
      />
    );
  }

  const allDone = tasks.length > 0 && completed.size === tasks.length;
  const finale = taskFinaleForDistrict(district.id);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <canvas ref={canvasRef} className="scene" />

      <Hud
        district={district}
        tasks={tasks}
        tel={tel}
        cash={cash}
        xp={xp}
        artifacts={artifacts}
        completed={completed}
        heat={heat}
        errandProgress={{ done: completed.size, total: tasks.length }}
        onOpen={openTalk}
        phrasesOpen={phrasesOpen}
        onTogglePhrases={() => setPhrasesOpen((p) => !p)}
        onMenu={() => setMenuOpen(true)}
      />

      {toast && (
        <Alert className="pointer-events-none absolute top-[20%] left-1/2 z-50 w-max max-w-[min(90vw,32rem)] -translate-x-1/2">
          <AlertTitle>{toast}</AlertTitle>
        </Alert>
      )}

      {card && (
        <Card className="absolute bottom-[22%] left-1/2 z-40 w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2 gap-2 border-l-4 border-l-main py-5">
          <CardHeader className="px-6 pb-0">
            <p className="text-xs font-base uppercase tracking-widest text-main">
              {card.kind.toUpperCase()} · {card.role}
            </p>
            <CardTitle className="text-2xl">{card.title}</CardTitle>
          </CardHeader>
          <CardContent className="px-6 text-sm leading-relaxed text-foreground/80">
            {card.brief}
          </CardContent>
        </Card>
      )}

      <Dialog open={busted} onOpenChange={(open) => !open && release()}>
        <DialogContent className="text-center sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-4xl tracking-wide">BUSTED</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              Havaldar Singh had heard enough. A night in the chowk lockup, and half of what you
              were carrying is gone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center sm:justify-center">
            <Button onClick={release}>Back to the street</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="text-center sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Paused</DialogTitle>
            <DialogDescription>
              {district.name}, {district.city}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => setMenuOpen(false)}>
              Resume
            </Button>
            <Button variant="neutral" className="w-full" onClick={leaveDistrict}>
              Leave for another district
            </Button>
            <p className="text-xs text-foreground/70">Progress in this district is not saved.</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {allDone && finale && (
        <Dialog open onOpenChange={(open) => !open && leaveDistrict()}>
          <DialogContent className="text-center sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-3xl leading-tight">{finale.title}</DialogTitle>
              <DialogDescription className="text-base leading-relaxed">
                {finale.text}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-foreground/80">
              ₹{totalTaskReward(district.id).toLocaleString("en-IN")} earned in {district.name}
            </p>
            <DialogFooter className="justify-center sm:justify-center">
              <Button variant="neutral" onClick={leaveDistrict}>
                Choose another district
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {talking && talkingTarget && (
        <Dialogue
          key={talking.id}
          district={district}
          target={talkingTarget}
          priorMemory={npcMemory[memoryKey(district.id, talking.id)] ?? []}
          onMemoryUpdate={(turns) => mergeNpcMemory(talking.id, turns)}
          onClose={() => setTalking(null)}
          onComplete={onComplete}
          onPoints={onPoints}
        />
      )}
    </div>
  );
}
