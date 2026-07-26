"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { roadLines, WORLD_LIMIT, ROAD_W } from "@/lib/game/city";
import type { Telemetry } from "@/lib/game/engine";
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

const MAP_PX = 168;
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

function Minimap({ tel }: { tel: Telemetry }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = MAP_PX * dpr;
    canvas.height = MAP_PX * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAP_PX, MAP_PX);

    const R = MAP_PX / 2;
    const scale = R / MAP_RANGE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#1d2229";
    ctx.fillRect(0, 0, MAP_PX, MAP_PX);

    ctx.translate(R, R);
    ctx.rotate(tel.heading);
    ctx.translate(-tel.playerX * scale, -tel.playerZ * scale);

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

    for (const t of tel.tasks) {
      ctx.fillStyle = kindColour(t.kind, t.done);
      ctx.beginPath();
      ctx.arc(t.x * scale, t.z * scale, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.fillStyle = "#5ab0ff";
    ctx.beginPath();
    ctx.moveTo(R, R - 7);
    ctx.lineTo(R - 5, R + 5);
    ctx.lineTo(R + 5, R + 5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [tel]);

  return <canvas ref={ref} style={{ width: MAP_PX, height: MAP_PX }} />;
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

export default function Hud({
  district,
  tasks,
  tel,
  cash,
  xp,
  artifacts,
  completed,
  heat,
  onOpen,
  phrasesOpen,
  onTogglePhrases,
  onMenu,
}: {
  district: District;
  tasks: StreetTask[];
  tel: Telemetry | null;
  cash: number;
  xp: number;
  artifacts: string[];
  completed: Set<string>;
  heat: number;
  onOpen: () => void;
  phrasesOpen: boolean;
  onTogglePhrases: () => void;
  onMenu: () => void;
}) {
  const nearbyTask = tel?.nearby ? tasks.find((t) => t.id === tel.nearby) : null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-6 top-4 flex items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-2">
          <Badge className="text-base font-heading">₹{cash.toLocaleString("en-IN")}</Badge>
          <Badge variant="neutral">{xp} XP</Badge>
          {heat > 0 && (
            <HudCard className="flex-row px-3 py-2">
              <CardContent className="flex gap-0.5 px-0 py-0" aria-label={`Wanted level ${heat} of 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={cn("text-base leading-none", i < heat ? "text-main" : "text-foreground/30")}
                  >
                    ★
                  </span>
                ))}
              </CardContent>
            </HudCard>
          )}
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
          {tasks.map((t) => {
            const done = completed.has(t.id);
            return (
              <div
                key={t.id}
                className={cn("flex gap-2", done && "opacity-50 line-through")}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full border border-border",
                    done ? "bg-chart-4" : "bg-main",
                  )}
                />
                <div>
                  <strong className="block text-sm">{t.title}</strong>
                  <em className="text-xs not-italic text-foreground/70">
                    {kindLabel(t.kind)} · {t.name}
                  </em>
                </div>
              </div>
            );
          })}
        </CardContent>
      </HudCard>

      <HudCard className="absolute bottom-6 left-6 w-72 max-w-[calc(100vw-3rem)] max-lg:hidden">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-xs uppercase tracking-widest text-main">
            Done · {artifacts.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-0">
          {artifacts.length === 0 ? (
            <p className="text-xs italic text-foreground/70">
              Walk the map — autos, stalls, temples, buses.
            </p>
          ) : (
            <ol className="grid list-none gap-2">
              {artifacts.map((c, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="font-heading text-main">{i + 1}</span>
                  {c}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </HudCard>

      <div className="absolute right-6 bottom-6 max-lg:origin-bottom-right max-lg:scale-90">
        {tel && (
          <HudCard className="p-2">
            <CardContent className="px-2 py-0">
              <Minimap tel={tel} />
            </CardContent>
          </HudCard>
        )}
      </div>

      {nearbyTask && (
        <Button
          className="absolute bottom-20 left-1/2 -translate-x-1/2"
          size="lg"
          onClick={onOpen}
        >
          <kbd>E</kbd>
          {nearbyTask.interactLabel}
        </Button>
      )}
    </>
  );
}
