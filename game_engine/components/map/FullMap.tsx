"use client";

/**
 * The full district map (M, or a tap on the minimap): north up, drawn as
 * vectors from the OpenStreetMap data so it stays sharp at any zoom, with
 * every building, the real street and place names, the errands, the barber
 * and you. Drag to pan, scroll or pinch to zoom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, Minus, Plus, X } from "lucide-react";
import type { LiveState, TaskSnapshot } from "@/lib/game/engine";
import type { District } from "@/lib/game/districts";
import type { MapData } from "@/lib/game/world/mapData";
import { placeLabels, roadLabels } from "@/lib/game/world/mapLabels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { drawMapBase, kindColour, kindIcon, kindLabel, MAP_STYLE } from "./mapKit";

/** Pixels per metre, limits. */
const MAX_SCALE = 9;

type View = { cx: number; cz: number; scale: number };


export function FullMap({
  map,
  live,
  tasks,
  barber,
  district,
  titles,
  found,
  onClose,
}: {
  /** Places found so far; the rest are marked but not named. */
  found: ReadonlySet<string> | null;
  map: MapData;
  /** Errand titles by task id, for the card over a hovered marker. */
  titles: Record<string, string>;
  live: LiveState | null;
  tasks: TaskSnapshot[];
  barber?: { x: number; z: number };
  district: District;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const roads = useMemo(() => roadLabels(map), [map]);
  const places = useMemo(() => placeLabels(map), [map]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Opens centred on the player, about 300m across.
  const [view, setView] = useState<View | null>(null);
  const [hover, setHover] = useState<TaskSnapshot | null>(null);
  // The whole district across the map's longer side: the view never shows
  // the district as a square floating in an empty rectangle.
  const fit = useCallback((w: number, h: number): View => ({ cx: 0, cz: 0, scale: Math.max(w, h) / (map.half * 2) }), [map]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const clamp = useCallback(
    (v: View): View => {
      const min = fit(size.w, size.h).scale;
      const scale = Math.min(MAX_SCALE, Math.max(min, v.scale));
      // Keep the district's edge at or beyond the view's edge.
      const h = map.half;
      const mx = Math.max(0, h - size.w / 2 / scale);
      const mz = Math.max(0, h - size.h / 2 / scale);
      return { scale, cx: Math.max(-mx, Math.min(mx, v.cx)), cz: Math.max(-mz, Math.min(mz, v.cz)) };
    },
    [fit, size, map]
  );

  useEffect(() => {
    if (view || !size.w) return;
    setView(clamp({ cx: live?.x ?? 0, cz: live?.z ?? 0, scale: Math.min(size.w, size.h) / 300 }));
  }, [size, view, live, clamp]);

  /* ---- drawing ---- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !view || !size.w) return;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cz, scale } = view;
    const X = (x: number) => size.w / 2 + (x - cx) * scale;
    const Z = (z: number) => size.h / 2 + (z - cz) * scale;

    ctx.fillStyle = MAP_STYLE.outside;
    ctx.fillRect(0, 0, size.w, size.h);
    drawMapBase(ctx, map, X, Z, scale);
    // A soft vignette, so the edges of the view settle back.
    const vg = ctx.createRadialGradient(size.w / 2, size.h / 2, Math.min(size.w, size.h) * 0.45, size.w / 2, size.h / 2, Math.hypot(size.w, size.h) / 2);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, size.w, size.h);

    // Street names along their streets; the smaller streets as you zoom in.
    // Markers are drawn last but claim their space first, so no name ever
    // sits under one.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const minRank = scale > 2.2 ? 1 : scale > 1.1 ? 2 : 3;
    const taken: { x: number; y: number; w: number; h: number }[] = [
      ...tasks.map((t) => ({ x: X(t.x), y: Z(t.z), w: 28, h: 28 })),
      ...(barber ? [{ x: X(barber.x), y: Z(barber.z), w: 28, h: 28 }] : []),
      ...(live ? [{ x: X(live.x), y: Z(live.z), w: 30, h: 30 }] : []),
    ];
    const free = (x: number, y: number, w: number, h: number) =>
      !taken.some((t) => Math.abs(t.x - x) < (t.w + w) / 2 && Math.abs(t.y - y) < (t.h + h) / 2);
    for (const lb of roads) {
      if (lb.rank < minRank) continue;
      const px = X(lb.x);
      const py = Z(lb.z);
      if (px < -50 || py < -50 || px > size.w + 50 || py > size.h + 50) continue;
      const fs = lb.rank === 3 ? 13 : lb.rank === 2 ? 12 : 11;
      ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
      const w = ctx.measureText(lb.name).width;
      // An axis-aligned box round the turned text, for spacing.
      const bw = Math.abs(Math.cos(lb.angle)) * w + Math.abs(Math.sin(lb.angle)) * fs;
      const bh = Math.abs(Math.sin(lb.angle)) * w + Math.abs(Math.cos(lb.angle)) * fs;
      if (!free(px, py, bw, bh)) continue;
      taken.push({ x: px, y: py, w: bw, h: bh });
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(lb.angle);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(12,14,18,0.9)";
      ctx.strokeText(lb.name, 0, 0);
      ctx.fillStyle = "#dfe5ec";
      ctx.fillText(lb.name, 0, 0);
      ctx.restore();
    }

    // Places, in a warmer, larger face than the streets. One not yet found
    // is a question mark where it is, unnamed: something to go and see.
    for (const p of places) {
      const px = X(p.x);
      const py = Z(p.z);
      if (px < -80 || py < -30 || px > size.w + 80 || py > size.h + 30) continue;
      if (found && !found.has(p.name)) {
        if (!free(px, py, 18, 18)) continue;
        taken.push({ x: px, y: py, w: 18, h: 18 });
        ctx.fillStyle = "rgba(12,14,18,0.75)";
        ctx.beginPath();
        ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(243,210,122,0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillStyle = "#f3d27a";
        ctx.fillText("?", px, py + 1);
        continue;
      }
      const fs = p.kind === "landmark" ? 15 : 13;
      ctx.font = `${fs}px ui-serif, Georgia, serif`;
      const w = ctx.measureText(p.name).width;
      const y = py - (p.kind === "landmark" ? 14 : 0);
      if (!free(px, y, w, fs + 2)) continue;
      taken.push({ x: px, y, w, h: fs + 2 });
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(12,14,18,0.9)";
      ctx.strokeText(p.name, px, y);
      ctx.fillStyle = p.kind === "landmark" ? "#f3d27a" : p.kind === "station" ? "#9fd3ff" : "#cfe8c4";
      ctx.fillText(p.name, px, y);
    }

    // Errands and the barber, with their icons.
    const blip = (x: number, z: number, colour: string, icon: string, ring: boolean, dim = false) => {
      const px = X(x);
      const py = Z(z);
      ctx.globalAlpha = dim ? 0.5 : 1;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ring ? "#ffffff" : "rgba(255,255,255,0.55)";
      ctx.lineWidth = ring ? 2.5 : 1.5;
      ctx.stroke();
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(icon, px, py + 1);
      ctx.globalAlpha = 1;
    };
    for (const t of tasks) blip(t.x, t.z, t.colour, t.done ? "✓" : kindIcon(t.kind), hover?.id === t.id, t.done);
    if (barber) blip(barber.x, barber.z, kindColour("barber", false), kindIcon("barber"), false);

    // You: an arrow the way you face.
    if (live) {
      const px = X(live.x);
      const py = Z(live.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.cos(live.heading), Math.sin(live.heading)) + Math.PI / 2);
      ctx.fillStyle = "rgba(90,176,255,0.22)";
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5ab0ff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(-8, 9);
      ctx.lineTo(0, 5);
      ctx.lineTo(8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [view, size, map, roads, places, tasks, barber, live, hover, found]);

  /* ---- panning and zooming ---- */

  const drag = useRef<{ id: number; x: number; y: number }[]>([]);
  const pinch = useRef<number | null>(null);

  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      setView((v) => {
        if (!v) return v;
        // Keep the point under the cursor where it is.
        const wx = v.cx + (sx - size.w / 2) / v.scale;
        const wz = v.cz + (sy - size.h / 2) / v.scale;
        const next = clamp({ ...v, scale: v.scale * factor });
        return clamp({ scale: next.scale, cx: wx - (sx - size.w / 2) / next.scale, cz: wz - (sy - size.h / 2) / next.scale });
      });
    },
    [clamp, size]
  );

  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
    if (drag.current.length === 2) {
      const [a, b] = drag.current;
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = drag.current.find((d) => d.id === e.pointerId);
    const r = canvasRef.current!.getBoundingClientRect();
    if (!p) {
      // Hover: which errand is under the pointer.
      if (!view) return;
      const wx = view.cx + (e.clientX - r.left - size.w / 2) / view.scale;
      const wz = view.cz + (e.clientY - r.top - size.h / 2) / view.scale;
      const hit = tasks.find((t) => Math.hypot(t.x - wx, t.z - wz) * view.scale < 14) ?? null;
      if (hit?.id !== hover?.id) setHover(hit);
      return;
    }
    if (drag.current.length === 2 && pinch.current) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = drag.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(d / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current = d;
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    setView((v) => (v ? clamp({ ...v, cx: v.cx - dx / v.scale, cz: v.cz - dy / v.scale }) : v));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = drag.current.filter((d) => d.id !== e.pointerId);
    if (drag.current.length < 2) pinch.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#15191f] text-white" role="dialog" aria-label="Map">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="font-heading text-xl leading-tight">{district.name}</div>
          <div className="text-sm text-white/60">
            {district.city} · {district.native}
            {found && ` · ${[...found].filter((n) => places.some((p) => p.name === n)).length} of ${places.length} places found`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="neutral" size="icon" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)}>
            <Minus className="size-4" aria-hidden />
          </Button>
          <Button variant="neutral" size="icon" aria-label="Zoom in" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)}>
            <Plus className="size-4" aria-hidden />
          </Button>
          <Button
            variant="neutral"
            size="icon"
            aria-label="Centre on me"
            disabled={!live}
            onClick={() => live && setView((v) => (v ? clamp({ ...v, cx: live.x, cz: live.z }) : v))}
          >
            <Crosshair className="size-4" aria-hidden />
          </Button>
          <Button variant="neutral" size="icon" aria-label="Whole district" onClick={() => setView(clamp(fit(size.w, size.h)))}>
            <Maximize2 className="size-4" aria-hidden />
          </Button>
          <Button variant="neutral" onClick={onClose} aria-label="Close map">
            <X className="size-4" aria-hidden />
            <kbd className="hidden sm:inline">M</kbd>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
      <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            const r = canvasRef.current!.getBoundingClientRect();
            zoomAt(1.8, e.clientX - r.left, e.clientY - r.top);
          }}
        />
        {hover && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-black/75 px-3 py-2 text-sm">
            {kindIcon(hover.kind)} {titles[hover.id] ?? kindLabel(hover.kind)}
            {hover.done ? " · done" : ""}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-md bg-black/60 px-3 py-2 text-xs lg:hidden">
          {tasks.map((t) => (
            <span key={t.id} className={cn("flex items-center gap-2", t.done && "opacity-50 line-through")}>
              <span className="inline-block size-3 rounded-full" style={{ background: t.colour }} />
              {kindIcon(t.kind)} {titles[t.id] ?? kindLabel(t.kind)}
            </span>
          ))}
          {barber && (
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-full" style={{ background: kindColour("barber", false) }} />
              {kindIcon("barber")} {kindLabel("barber")}
            </span>
          )}
          <span className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full bg-[#5ab0ff]" /> You
          </span>
        </div>
        {/* ODbL requires the attribution wherever the map data is shown. */}
        <span className="pointer-events-none absolute right-3 bottom-2 text-[10px] text-white/60">
          © OpenStreetMap contributors
        </span>
      </div>
      {/* On a wide screen the key sits beside the map, so the map itself is
          nearer square and the district fills it. */}
      <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-white/10 px-5 py-4 text-sm lg:flex">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-widest text-white/60">Errands</h3>
          {tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn("flex items-center gap-2 text-left hover:text-white", t.done ? "text-white/40 line-through" : "text-white/85")}
              onClick={() => setView((v) => (v ? clamp({ ...v, cx: t.x, cz: t.z, scale: Math.max(v.scale, 2.5) }) : v))}
            >
              <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: t.colour }} />
              <span className="shrink-0">{kindIcon(t.kind)}</span>
              <span className="min-w-0 truncate">{titles[t.id] ?? kindLabel(t.kind)}</span>
            </button>
          ))}
          {barber && (
            <span className="flex items-center gap-2 text-white/85">
              <span className="inline-block size-3 rounded-full" style={{ background: kindColour("barber", false) }} />
              {kindIcon("barber")} {kindLabel("barber")}
            </span>
          )}
          <span className="flex items-center gap-2 text-white/85">
            <span className="inline-block size-3 rounded-full bg-[#5ab0ff]" /> You
          </span>
        </section>
        {found && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs uppercase tracking-widest text-white/60">
              Places · {places.filter((p) => found.has(p.name)).length} of {places.length}
            </h3>
            {places.map((p) =>
              found.has(p.name) ? (
                <span key={p.name} className="truncate text-white/85">
                  {p.name}
                </span>
              ) : null
            )}
            {places.some((p) => !found.has(p.name)) && (
              <span className="text-white/50">? marks the ones still to find</span>
            )}
          </section>
        )}
        <section className="flex flex-col gap-1.5 text-white/70">
          <h3 className="text-xs uppercase tracking-widest text-white/60">Controls</h3>
          <span>Drag to move, scroll to zoom</span>
          <span>Click an errand to go to it</span>
          <span>
            <kbd>M</kbd> or <kbd>Esc</kbd> to close
          </span>
        </section>
      </aside>
      </div>
    </div>
  );
}
