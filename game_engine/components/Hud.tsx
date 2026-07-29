"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { roadLines, WORLD_LIMIT, ROAD_W } from "@/lib/game/city";
import type { LiveState, TaskSnapshot, Telemetry } from "@/lib/game/engine";
import type { District } from "@/lib/game/districts";
import type { StreetTask, TaskKind } from "@/lib/game/tasks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen, Volume2, VolumeX } from "lucide-react";

const MAP_PX = 168;
const MAP_PX_MOBILE = 80;
const MAP_RANGE = 90;

function kindColour(kind: TaskKind, done: boolean): string {
  if (done) return "#3ddc84";
  switch (kind) {
    case "auto":
      return "#f5c518";
    case "shop":
      return "#e67e22";
    case "temple":
      return "#e74c3c";
    case "bus":
      return "#3498db";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function kindIcon(kind: TaskKind): string {
  switch (kind) {
    case "auto":
      return "🛺";
    case "shop":
      return "🏪";
    case "temple":
      return "🛕";
    case "bus":
      return "🚌";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Duolingo-style circular lesson progress ring. */
function ProgressRing({
  done,
  total,
  size = 36,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  if (total <= 0) return null;
  const pct = Math.min(done / total, 1);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        className="text-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#58cc02"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground font-heading text-[0.55rem]"
      >
        {done}/{total}
      </text>
    </svg>
  );
}

function kindLabel(kind: TaskKind): string {
  switch (kind) {
    case "auto":
      return "Auto";
    case "shop":
      return "Shop";
    case "temple":
      return "Temple";
    case "bus":
      return "Bus";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Draws from the engine's LiveState on its own rAF rather than from React
 * state, so the map stays smooth at 60fps while the HUD around it only
 * re-renders when something actually changes.
 *
 * Previously this ran a useEffect keyed on `tel`, which arrived every frame,
 * and reassigned canvas.width/height on each pass — reallocating the backing
 * store 60 times a second inside the game's own rAF callback. That was the
 * single largest source of frame-time jitter in the whole app.
 */
function Minimap({
  live,
  tasks,
  size,
}: {
  live: LiveState | null;
  tasks: TaskSnapshot[];
  size: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Read through a ref so the draw loop never needs to be torn down and
  // rebuilt when the (throttled) task list changes.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(devicePixelRatio, 2);
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const l = liveRef.current;
      if (!l) return;

      // Only touch width/height when they actually change; assigning them is
      // what reallocates (and clears) the backing store.
      const w = Math.round(size * dpr);
      if (canvas.width !== w || canvas.height !== w) {
        canvas.width = w;
        canvas.height = w;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const R = size / 2;
      const scale = R / MAP_RANGE;
      const ui = size / MAP_PX;

      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 2, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = "#1d2229";
      ctx.fillRect(0, 0, size, size);

      ctx.translate(R, R);
      ctx.rotate(l.heading + Math.PI);
      ctx.translate(-l.x * scale, -l.z * scale);

      ctx.strokeStyle = "#454f5a";
      ctx.lineWidth = ROAD_W * scale;
      const L = WORLD_LIMIT;
      for (const c of roadLines()) {
        ctx.beginPath();
        ctx.moveTo(c * scale, -L * scale);
        ctx.lineTo(c * scale, L * scale);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-L * scale, c * scale);
        ctx.lineTo(L * scale, c * scale);
        ctx.stroke();
      }

      for (const t of tasksRef.current) {
        const col = kindColour(t.kind, t.done);
        const dotR = 4.5 * ui;
        const sx = t.x * scale;
        const sy = t.z * scale;

        // Soft shadow under blip (GTA-style minimap parity).
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(sx + 1.2 * ui, sy + 1.2 * ui, dotR + 1.5 * ui, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = Math.max(1, 1.5 * ui);
        ctx.beginPath();
        ctx.arc(sx, sy, dotR + 0.5 * ui, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      ctx.fillStyle = "#5ab0ff";
      ctx.beginPath();
      ctx.moveTo(R, R - 7 * ui);
      ctx.lineTo(R - 5 * ui, R + 5 * ui);
      ctx.lineTo(R + 5 * ui, R + 5 * ui);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = Math.max(1, 2 * ui);
      ctx.beginPath();
      ctx.arc(R, R, R - 2, 0, Math.PI * 2);
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

function HudCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("pointer-events-auto gap-2 py-3 shadow-shadow", className)}>
      {children}
    </Card>
  );
}

function ErrandsList({
  tasks,
  completed,
  compact,
}: {
  tasks: StreetTask[];
  completed: Set<string>;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {tasks.map((t) => {
        const done = completed.has(t.id);
        return (
          <div key={t.id} className={cn("flex gap-2", done && "opacity-50 line-through")}>
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-xs",
                done ? "bg-chart-4/20" : "bg-main/10",
                compact && "size-5 text-[0.65rem]"
              )}
              style={{ borderColor: done ? undefined : kindColour(t.kind, false) }}
              aria-hidden
            >
              {kindIcon(t.kind)}
            </span>
            <div>
              <strong className={cn("block text-sm", compact && "text-xs")}>{t.title}</strong>
              <em
                className={cn(
                  "text-xs not-italic text-foreground/70",
                  compact && "text-[0.65rem]"
                )}
              >
                {kindLabel(t.kind)} · {t.name}
              </em>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ArtifactsList({ artifacts }: { artifacts: string[] }) {
  if (artifacts.length === 0) {
    return (
      <p className="text-xs italic text-foreground/70">
        Walk the map — autos, stalls, temples, buses.
      </p>
    );
  }
  return (
    <ol className="grid list-none gap-2">
      {artifacts.map((c, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span className="font-heading text-main">{i + 1}</span>
          {c}
        </li>
      ))}
    </ol>
  );
}

export default function Hud({
  district,
  tasks,
  tel,
  cash,
  xp,
  live,
  artifacts,
  completed,
  errandProgress,
  onOpen,
  phrasesOpen,
  onTogglePhrases,
  onMenu,
  onRecenter,
  mobilePlay,
  panelsOpen,
  onTogglePanels,
  audioOn,
  onToggleAudio,
}: {
  district: District;
  tasks: StreetTask[];
  tel: Telemetry | null;
  /** Engine-owned, mutated per frame. Only the minimap reads it. */
  live: LiveState | null;
  cash: number;
  xp: number;
  artifacts: string[];
  completed: Set<string>;
  errandProgress: { done: number; total: number };
  onOpen: () => void;
  phrasesOpen: boolean;
  onTogglePhrases: () => void;
  onMenu: () => void;
  onRecenter: () => void;
  mobilePlay: boolean;
  panelsOpen: boolean;
  onTogglePanels: () => void;
  audioOn: boolean;
  onToggleAudio: () => void;
}) {
  const nearbyTask = tel?.nearby ? tasks.find((t) => t.id === tel.nearby) : null;
  const mapSize = mobilePlay ? MAP_PX_MOBILE : MAP_PX;

  const statsRow = (
    <>
      <Badge className={cn("font-heading", mobilePlay ? "text-sm" : "text-base")}>
        ₹{cash.toLocaleString("en-IN")}
      </Badge>
      <Badge variant="neutral" className={mobilePlay ? "text-xs" : undefined}>
        {xp} XP
      </Badge>
      {errandProgress.total > 0 && (
        <div className="flex items-center gap-2">
          <ProgressRing done={errandProgress.done} total={errandProgress.total} />
          <span className="text-xs text-foreground/70">
            {errandProgress.done === errandProgress.total
              ? "District complete!"
              : `${errandProgress.total - errandProgress.done} left`}
          </span>
        </div>
      )}
    </>
  );


  return (
    <>
      {mobilePlay ? (
        <>
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              {statsRow}
              <Button
                variant="neutral"
                size="icon"
                className="size-8 shrink-0"
                sound="tap"
                onClick={onTogglePanels}
                aria-expanded={panelsOpen}
                aria-label={panelsOpen ? "Hide game panels" : "Show game panels"}
              >
                {panelsOpen ? (
                  <PanelLeftClose className="size-4" aria-hidden />
                ) : (
                  <PanelLeftOpen className="size-4" aria-hidden />
                )}
              </Button>
              <Button
                variant="neutral"
                size="icon"
                className="size-8 shrink-0"
                sound={audioOn ? "toggleOff" : "toggleOn"}
                onClick={onToggleAudio}
                aria-label={audioOn ? "Mute sound" : "Unmute sound"}
              >
                {audioOn ? (
                  <Volume2 className="size-4" aria-hidden />
                ) : (
                  <VolumeX className="size-4" aria-hidden />
                )}
              </Button>
            </div>
            {tel && (
              <HudCard className="pointer-events-auto p-1">
                <CardContent className="px-0 py-0">
                  <Minimap live={live} tasks={tel.tasks} size={mapSize} />
                </CardContent>
              </HudCard>
            )}
          </div>

          {panelsOpen && (
            <div className="pointer-events-auto absolute top-[7.5rem] left-3 z-20 flex max-h-[min(52vh,22rem)] w-[min(18rem,calc(100vw-5.5rem))] flex-col gap-2 overflow-y-auto">
              <HudCard className="py-2">
                <CardHeader className="px-3 pb-0">
                  <CardTitle className="text-[0.65rem] uppercase tracking-widest text-main">
                    {district.name} · {district.native}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 px-3 pt-2">
                  <Button variant="neutral" size="sm" className="h-8 text-xs" onClick={onTogglePhrases}>
                    Phrasebook
                  </Button>
                  <Button variant="neutral" size="sm" className="h-8 text-xs" onClick={onMenu}>
                    Menu
                  </Button>
                  <Button variant="neutral" size="sm" className="h-8 text-xs" onClick={onRecenter}>
                    Recentre
                  </Button>
                </CardContent>
              </HudCard>
              <HudCard className="py-2">
                <CardHeader className="px-3 pb-0">
                  <CardTitle className="text-[0.65rem] uppercase tracking-widest text-main">
                    Errands
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pt-0">
                  <ErrandsList tasks={tasks} completed={completed} compact />
                </CardContent>
              </HudCard>
              <HudCard className="py-2">
                <CardHeader className="px-3 pb-0">
                  <CardTitle className="text-[0.65rem] uppercase tracking-widest text-main">
                    Done · {artifacts.length}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pt-0">
                  <ArtifactsList artifacts={artifacts} />
                </CardContent>
              </HudCard>
            </div>
          )}

          {phrasesOpen && (
            <HudCard className="pointer-events-auto absolute top-20 right-3 z-30 w-72 max-w-[calc(100vw-1.5rem)] py-2">
              <CardHeader className="px-3 pb-0">
                <CardTitle className="text-xs uppercase tracking-widest">
                  Say it in {district.native}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[40vh] overflow-y-auto px-3 pt-2">
                <Accordion type="single" collapsible className="w-full">
                  {district.phrases.map((p) => (
                    <AccordionItem key={p.native} value={p.native}>
                      <AccordionTrigger className="py-2 text-sm">{p.native}</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-main">{p.roman}</p>
                        <p className="text-foreground/70">{p.en}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </HudCard>
          )}
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-x-6 top-4 flex items-start justify-between gap-4">
            <div className="flex flex-col items-start gap-2">
              {statsRow}
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
              <Badge variant="neutral" className="uppercase tracking-widest">
                {district.name} · <strong className="font-indic normal-case">{district.native}</strong>
              </Badge>
              <Button variant="neutral" size="sm" onClick={onTogglePhrases}>
                <kbd>P</kbd> Phrasebook
              </Button>
              <Button variant="neutral" size="sm" onClick={onMenu}>
                <kbd>Esc</kbd> Menu
              </Button>
              <Button variant="neutral" size="sm" onClick={onRecenter}>
                Recentre
              </Button>
              <Button
                variant="neutral"
                size="icon"
                sound={audioOn ? "toggleOff" : "toggleOn"}
                onClick={onToggleAudio}
                aria-label={audioOn ? "Mute sound" : "Unmute sound"}
              >
                {audioOn ? (
                  <Volume2 className="size-4" aria-hidden />
                ) : (
                  <VolumeX className="size-4" aria-hidden />
                )}
              </Button>
            </div>
          </div>

          {phrasesOpen && (
            <HudCard className="absolute top-20 right-6 z-10 w-80 max-w-[calc(100vw-3rem)]">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-sm uppercase tracking-widest">
                  Say it in {district.native}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pt-2">
                <Accordion type="single" collapsible className="w-full">
                  {district.phrases.map((p) => (
                    <AccordionItem key={p.native} value={p.native}>
                      <AccordionTrigger className="text-sm">{p.native}</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-main">{p.roman}</p>
                        <p className="text-foreground/70">{p.en}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <p className="mt-3 text-xs text-foreground/70">
                  Type or speak these. They work on anyone in this district.
                </p>
              </CardContent>
            </HudCard>
          )}

          <HudCard className="absolute top-32 left-6 w-60 max-w-[calc(100vw-3rem)] max-[620px]:hidden max-lg:top-20 max-lg:w-48 max-lg:text-xs">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-xs uppercase tracking-widest text-main">Errands</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pt-0">
              <ErrandsList tasks={tasks} completed={completed} />
            </CardContent>
          </HudCard>

          <HudCard className="absolute bottom-6 left-6 w-72 max-w-[calc(100vw-3rem)] max-lg:hidden">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-xs uppercase tracking-widest text-main">
                Done · {artifacts.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-0">
              <ArtifactsList artifacts={artifacts} />
            </CardContent>
          </HudCard>

          <div className="absolute right-6 bottom-6 max-lg:origin-bottom-right max-lg:scale-90">
            {tel && (
              <HudCard className="p-2">
                <CardContent className="px-2 py-0">
                  <Minimap live={live} tasks={tel.tasks} size={mapSize} />
                </CardContent>
              </HudCard>
            )}
          </div>
        </>
      )}

      {nearbyTask && (
        <Button
          className={cn(
            mobilePlay
              ? "pointer-events-auto absolute bottom-6 left-4 z-30 max-w-[min(14rem,calc(100vw-8rem))] text-sm"
              : "absolute bottom-20 left-1/2 -translate-x-1/2"
          )}
          size={mobilePlay ? "default" : "lg"}
          onClick={onOpen}
        >
          {!mobilePlay && <kbd>E</kbd>}
          {nearbyTask.interactLabel}
        </Button>
      )}
    </>
  );
}
