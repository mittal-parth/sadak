"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game, type LiveState, type Telemetry } from "@/lib/game/engine";
import type { District } from "@/lib/game/districts";
import {
  errandIndexForTask,
  findTaskById,
  resolveTaskLesson,
  taskAsLessonTarget,
  totalTaskRewardForTasks,
  type DistrictTaskPack,
  type StreetTask,
} from "@/lib/game/tasks";
import type { ComfortLevel } from "@/lib/game/levels";
import type { BaseLangCode } from "@/lib/i18n/base-lang";
import { readStoredBaseLang } from "@/lib/i18n/base-lang";
import type { DistrictProgress } from "@/lib/game/progress";
import { errandLevelNumber, lessonTierFor } from "@/lib/game/levels";
import { useGameAudio } from "@/lib/audio/useGameAudio";
import { playSfx } from "@/lib/audio/sfx";
import Title from "./Title";
import EnterLoading from "./EnterLoading";
import Hud from "./Hud";
import Dialogue from "./Dialogue";
import VirtualJoystick from "./VirtualJoystick";
import LandscapeGate from "./LandscapeGate";
import SignOutButton from "@/components/auth/SignOutButton";
import { useMobilePlay } from "@/lib/useMobilePlay";
import posthog from "posthog-js";
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
import { prefetchTtsUrls, revokeTtsPrefetchMap, type TtsPrefetchMap } from "@/lib/tts/prefetch-client";

/** Minimum time the enter screen stays up, so its controls are readable even
 *  when the district and progress fetches come back instantly. */
const ENTER_DWELL_MS = 2600;

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [district, setDistrict] = useState<District | null>(null);
  const [tasks, setTasks] = useState<StreetTask[]>([]);
  const [taskFinale, setTaskFinale] = useState<DistrictTaskPack["finale"] | null>(null);
  const [entering, setEntering] = useState(false);
  const [enteringCity, setEnteringCity] = useState<string | undefined>();
  // Survives `district` going back to null so Title (which fully remounts
  // on every return trip) can default the picker to what was last played
  // instead of always resetting to DISTRICTS[0].
  const [lastDistrictId, setLastDistrictId] = useState<string | undefined>();
  const [comfort, setComfort] = useState<ComfortLevel>("medium");
  const [baseLang, setBaseLang] = useState<BaseLangCode>("en-IN");
  const [tel, setTel] = useState<Telemetry | null>(null);
  // The engine's per-frame state object. Held in React state only so a render
  // happens once when the engine is created; the object itself is mutated in
  // place by the engine and read by the minimap's own rAF, never diffed.
  const [live, setLive] = useState<LiveState | null>(null);
  const [talking, setTalking] = useState<StreetTask | null>(null);
  const [cash, setCash] = useState(0);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [card, setCard] = useState<StreetTask | null>(null);
  const [npcMemory, setNpcMemory] = useState<NpcMemoryMap>({});
  const [hudPanelsOpen, setHudPanelsOpen] = useState(false);
  const ttsPrefetchRef = useRef<TtsPrefetchMap>(new Map());
  const { mobilePlay, portrait } = useMobilePlay();
  const audio = useGameAudio(district?.id);

  const tasksMemo = tasks;

  const talkingTarget = useMemo(() => {
    if (!talking) return null;
    const index = errandIndexForTask(talking.id, tasksMemo);
    const tier = lessonTierFor(comfort, index);
    const lesson = resolveTaskLesson(talking, comfort, tasksMemo);
    return taskAsLessonTarget(talking, lesson, {
      errandLevel: errandLevelNumber(index),
      lessonTier: tier,
    });
  }, [talking, comfort, tasksMemo]);

  const nearbyRef = useRef<string | null>(null);
  const talkingRef = useRef<StreetTask | null>(null);
  const menuRef = useRef(false);
  const metRef = useRef<Set<string>>(new Set());
  const progressRef = useRef({
    districtId: "",
    comfort: "medium" as ComfortLevel,
    cash: 0,
    xp: 0,
    completedTaskIds: [] as string[],
  });

  useEffect(() => {
    progressRef.current = {
      districtId: district?.id ?? "",
      comfort,
      cash,
      xp,
      completedTaskIds: [...completed],
    };
  }, [district?.id, comfort, cash, xp, completed]);

  const persistProgress = useCallback(async (snapshot: DistrictProgress) => {
    try {
      const res = await fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) {
        throw new Error("save failed");
      }
    } catch {
      setToast("Could not save progress");
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  useEffect(() => {
    setBaseLang(readStoredBaseLang());
  }, []);

  const enterDistrict = useCallback(
    async (
      districtId: string,
      pickedComfort: ComfortLevel,
      cityLabel: string | undefined,
      pickedBaseLang: BaseLangCode,
    ) => {
      setEntering(true);
      setEnteringCity(cityLabel);
      const startedAt = Date.now();
      try {
        const [districtRes, progressRes] = await Promise.all([
          fetch(`/api/districts/${encodeURIComponent(districtId)}`),
          fetch(`/api/progress?districtId=${encodeURIComponent(districtId)}`),
        ]);
        if (!districtRes.ok) {
          throw new Error("Could not load district.");
        }
        if (!progressRes.ok) {
          throw new Error("Could not load progress.");
        }
        const districtPayload = (await districtRes.json()) as {
          district: District;
          taskPack: DistrictTaskPack;
          tasks: StreetTask[];
        };
        const progressPayload = (await progressRes.json()) as {
          progress: DistrictProgress;
        };
        const saved = progressPayload.progress;

        // Hold the loading screen open long enough to read the controls on it.
        // Committing the state below is what tears it down, so the wait goes
        // here rather than around `setEntering`.
        const elapsed = Date.now() - startedAt;
        if (elapsed < ENTER_DWELL_MS) {
          await new Promise((r) => setTimeout(r, ENTER_DWELL_MS - elapsed));
        }

        setDistrict(districtPayload.district);
        setTasks(districtPayload.tasks);
        setTaskFinale(districtPayload.taskPack.finale);
        setLastDistrictId(districtId);
        setComfort(pickedComfort);
        setBaseLang(pickedBaseLang);
        setCash(saved.cash);
        setXp(saved.xp);
        setCompleted(new Set(saved.completedTaskIds));
        setArtifacts([]);
        setNpcMemory({});
        metRef.current = new Set();
        posthog.capture("district_entered", {
          district_id: districtPayload.district.id,
          district_name: districtPayload.district.name,
          language: districtPayload.district.language,
          comfort_level: pickedComfort,
          base_language: pickedBaseLang,
          task_count: districtPayload.tasks.length,
          prior_cash: saved.cash,
          prior_xp: saved.xp,
          prior_completed_count: saved.completedTaskIds.length,
        });
      } catch {
        setToast("Could not enter district");
        setTimeout(() => setToast(null), 4000);
      } finally {
        setEntering(false);
        setEnteringCity(undefined);
      }
    },
    [],
  );

  useEffect(() => {
    if (!district?.id || tasks.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/speak/prefetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ districtId: district.id, comfort }),
        });
        if (!res.ok || cancelled) return;
        const { items } = (await res.json()) as {
          items: Array<{ key: string; url: string }>;
        };
        const map = await prefetchTtsUrls(items);
        if (cancelled) {
          revokeTtsPrefetchMap(map);
          return;
        }
        revokeTtsPrefetchMap(ttsPrefetchRef.current);
        ttsPrefetchRef.current = map;
      } catch {
        /* live /api/speak fallback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [district?.id, district?.language, tasks, comfort]);

  useEffect(() => {
    return () => {
      revokeTtsPrefetchMap(ttsPrefetchRef.current);
    };
  }, []);

  useEffect(() => {
    talkingRef.current = talking;
    menuRef.current = menuOpen;

    const g = gameRef.current;
    if (!g) return;
    const frozen =
      talking !== null || menuOpen || card !== null || (mobilePlay && portrait);
    g.paused = frozen;
    if (frozen) g.releasePointer();
  }, [talking, menuOpen, card, mobilePlay, portrait]);

  // Music sits under the dialogue's TTS and the held mic, and stays down
  // for the pause menu and the portrait rotate-gate, so it never fights the
  // one voice the player actually needs to hear.
  //
  // Depend on `audio.duck` (stable via useCallback), not the `audio` object
  // itself: `useGameAudio` returns a fresh object every render, and telemetry
  // re-renders this component every frame, so depending on the whole object
  // would re-run this effect (and restart the duck gain ramp) 60x/sec.
  const duck = audio.duck;
  useEffect(() => {
    duck(talking !== null || menuOpen || (mobilePlay && portrait));
  }, [duck, talking, menuOpen, mobilePlay, portrait]);

  useEffect(() => {
    if (!district || !canvasRef.current) return;

    const game = new Game(canvasRef.current, district, tasks, (t) => {
      nearbyRef.current = t.nearby;
      setTel(t);
    });
    gameRef.current = game;
    setLive(game.live);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__game = game;
    }
    game.start();

    return () => {
      game.dispose();
      gameRef.current = null;
      setLive(null);
    };
  }, [district, tasks]);

  const openTalk = useCallback(() => {
    if (!district || talkingRef.current) return;
    const task = findTaskById(tasks, nearbyRef.current ?? "");
    if (!task || task.districtId !== district.id) return;

    posthog.capture("errand_started", {
      task_id: task.id,
      task_title: task.title,
      task_kind: task.kind,
      district_id: district.id,
      district_name: district.name,
      language: district.language,
      is_first_meeting: !metRef.current.has(task.id),
    });

    if (!metRef.current.has(task.id)) {
      metRef.current.add(task.id);
      setCard(task);
      playSfx("open");
      setTimeout(() => {
        setCard(null);
        setTalking(task);
      }, 2200);
      return;
    }
    setTalking(task);
  }, [district, tasks]);

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
      if (!district) return;
      const task = findTaskById(tasks, taskId);
      if (!task) return;

      if (completed.has(taskId)) return;

      const nextCompleted = new Set(completed);
      nextCompleted.add(taskId);
      const nextCash = cash + reward;

      setCompleted(nextCompleted);
      setCash(nextCash);
      setArtifacts((prev) =>
        prev.includes(task.completionNote) ? prev : [...prev, task.completionNote]
      );
      gameRef.current?.markDone(taskId);
      playSfx("cash");
      posthog.capture("errand_completed", {
        task_id: task.id,
        task_title: task.title,
        task_kind: task.kind,
        district_id: district.id,
        district_name: district.name,
        language: district.language,
        reward,
        total_cash: nextCash,
        errands_completed_in_district: nextCompleted.size,
      });

      void persistProgress({
        districtId: district.id,
        comfort,
        cash: nextCash,
        xp: progressRef.current.xp,
        completedTaskIds: [...nextCompleted],
      });

      setToast(`Done: ${task.title}`);
      setTimeout(() => setToast(null), 4000);
      setTalking(null);
    },
    [district, tasks, completed, cash, comfort, persistProgress]
  );

  const leaveDistrict = useCallback(() => {
    const snap = progressRef.current;
    if (snap.districtId) {
      void persistProgress(snap);
      posthog.capture("district_left", {
        district_id: snap.districtId,
        comfort_level: snap.comfort,
        cash_earned: snap.cash,
        xp_earned: snap.xp,
        tasks_completed: snap.completedTaskIds.length,
      });
    }
    setDistrict(null);
    setTasks([]);
    setTaskFinale(null);
    setTel(null);
    setTalking(null);
    setCash(0);
    setXp(0);
    setCompleted(new Set());
    setArtifacts([]);
    setToast(null);
    setMenuOpen(false);
    setPhrasesOpen(false);
    setCard(null);
    metRef.current = new Set();
    setNpcMemory({});
  }, [persistProgress]);

  const onJoystickMove = useCallback((fwd: number, strafe: number) => {
    gameRef.current?.setVirtualMove(fwd, strafe);
  }, []);

  const gameplayFrozen =
    talking !== null || menuOpen || card !== null || (mobilePlay && portrait);

  if (!district) {
    return (
      <>
        <Title defaultDistrictId={lastDistrictId} onEnter={enterDistrict} />
        {entering && <EnterLoading city={enteringCity} />}
      </>
    );
  }

  const allDone = tasks.length > 0 && completed.size === tasks.length;
  const finale = taskFinale;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <canvas ref={canvasRef} className="scene" />

      <Hud
        district={district}
        baseLang={baseLang}
        tasks={tasks}
        tel={tel}
        live={live}
        cash={cash}
        xp={xp}
        artifacts={artifacts}
        completed={completed}
        errandProgress={{ done: completed.size, total: tasks.length }}
        onOpen={openTalk}
        phrasesOpen={phrasesOpen}
        onTogglePhrases={() => setPhrasesOpen((p) => !p)}
        onMenu={() => setMenuOpen(true)}
        mobilePlay={mobilePlay}
        panelsOpen={hudPanelsOpen}
        onTogglePanels={() => setHudPanelsOpen((o) => !o)}
        audioOn={audio.sfxOn || audio.musicOn}
        onToggleAudio={audio.toggleAll}
      />

      {mobilePlay && !portrait && (
        <VirtualJoystick
          className="absolute right-4 bottom-10 z-30"
          onMove={onJoystickMove}
          disabled={gameplayFrozen}
        />
      )}

      {mobilePlay && portrait && <LandscapeGate />}

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
            <div className="flex w-full gap-2">
              <Button
                variant="neutral"
                className="w-full"
                sound={audio.sfxOn ? "toggleOff" : "toggleOn"}
                onClick={audio.toggleSfx}
              >
                Sound effects: {audio.sfxOn ? "On" : "Off"}
              </Button>
              <Button
                variant="neutral"
                className="w-full"
                sound={audio.musicOn ? "toggleOff" : "toggleOn"}
                onClick={audio.toggleMusic}
              >
                Music: {audio.musicOn ? "On" : "Off"}
              </Button>
            </div>
            <Button variant="neutral" className="w-full" onClick={leaveDistrict}>
              Leave for another district
            </Button>
            <SignOutButton fullWidth />
            <p className="text-xs text-foreground/70">
              Cash, XP, and completed errands save when you finish a task or leave.
            </p>
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
              ₹{totalTaskRewardForTasks(tasks).toLocaleString("en-IN")} earned in {district.name}
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
          baseLang={baseLang}
          target={talkingTarget}
          priorMemory={npcMemory[memoryKey(district.id, talking.id)] ?? []}
          onMemoryUpdate={(turns) => mergeNpcMemory(talking.id, turns)}
          onClose={() => setTalking(null)}
          onComplete={onComplete}
          onPoints={onPoints}
          ttsPrefetchRef={ttsPrefetchRef}
        />
      )}
    </div>
  );
}
