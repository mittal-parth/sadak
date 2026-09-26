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
import type { MapData, Pt } from "@/lib/game/world/mapData";
import { placeLabels, roadLabels } from "@/lib/game/world/mapLabels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { kindColour, kindIcon, kindLabel } from "./mapKit";

/** Pixels per metre, limits. */
const MAX_SCALE = 9;

type View = { cx: number; cz: number; scale: number };

const AREA_FILL: Record<string, string> = {
  water: "#2d5f86",
  sea: "#2d5f86",
  park: "#2e4f33",
  pitch: "#355c3a",
  beach: "#7d6c47",
  plaza: "#2c3138",
  market: "#3a3328",
};

export function FullMap({
  map,
  live,
  tasks,
  barber,
  district,
  titles,
  onClose,
}: {
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
  const fit = useCallback((w: number, h: number): View => ({ cx: 0, cz: 0, scale: Math.min(w, h) / (map.half * 2 * 1.04) }), [map]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (view || !size.w) return;
    setView({ cx: live?.x ?? 0, cz: live?.z ?? 0, scale: Math.min(size.w, size.h) / 300 });
  }, [size, view, live]);

  const clamp = useCallback(
    (v: View): View => {
      const min = fit(size.w, size.h).scale * 0.9;
      const scale = Math.min(MAX_SCALE, Math.max(min, v.scale));
      const h = map.half;
      return { scale, cx: Math.max(-h, Math.min(h, v.cx)), cz: Math.max(-h, Math.min(h, v.cz)) };
    },
    [fit, size, map]
  );

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
    const path = (pts: Pt[], close: boolean) => {
      pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      if (close) ctx.closePath();
    };

    ctx.fillStyle = "#15191f";
    ctx.fillRect(0, 0, size.w, size.h);
    // The district's own square.
    ctx.fillStyle = "#1d2229";
    ctx.fillRect(X(-map.half), Z(-map.half), map.half * 2 * scale, map.half * 2 * scale);

    for (const a of map.areas) {
      ctx.beginPath();
      path(a.pts, true);
      a.holes?.forEach((h) => path(h, true));
      ctx.fillStyle = AREA_FILL[a.kind] ?? "#2a2f36";
      ctx.fill("evenodd");
    }

    // Railways: a dashed line down the middle of the track bed.
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#5b6470";
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    for (const r of map.rails) {
      if (r.underground) continue;
      ctx.beginPath();
      path(r.pts, false);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const order = ["footway", "steps", "service", "living_street", "residential", "unclassified", "pedestrian", "tertiary", "secondary", "primary", "trunk"];
    const sorted = [...map.roads].sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
    for (const r of sorted) {
      const footpath = r.cls === "footway" || r.cls === "steps";
      if (footpath && scale < 1.2) continue;
      ctx.beginPath();
      path(r.pts, false);
      ctx.strokeStyle = footpath ? "#39414b" : r.surface ? "#b0735e" : r.w >= 10 ? "#8a95a3" : r.w >= 7 ? "#6f7a88" : "#555f6b";
      ctx.lineWidth = Math.max(footpath ? 0.8 : 1.4, (r.w + r.foot * 2) * scale * (footpath ? 0.6 : 1));
      ctx.stroke();
    }

    // Buildings, once there is room to see them.
    if (scale > 0.9) {
      ctx.fillStyle = "#3b424c";
      for (const p of map.plots) {
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        const hw = p.w / 2;
        const hd = p.d / 2;
        ctx.beginPath();
        for (const [u, v] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
          const x = p.x + u * c + v * s;
          const z = p.z - u * s + v * c;
          ctx.lineTo(X(x), Z(z));
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const b of map.buildings) {
      ctx.beginPath();
      path(b.pts, true);
      b.holes?.forEach((h) => path(h, true));
      ctx.fillStyle = b.canopy ? "rgba(200,205,212,0.25)" : "#454d58";
      ctx.fill("evenodd");
    }
    for (const l of map.landmarks) {
      const c = Math.cos(l.rot);
      const s = Math.sin(l.rot);
      ctx.beginPath();
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = l.x + (u * l.w * c) / 2 + (v * l.d * s) / 2;
        const z = l.z - (u * l.w * s) / 2 + (v * l.d * c) / 2;
        ctx.lineTo(X(x), Z(z));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(201,162,58,0.55)";
      ctx.fill();
      ctx.strokeStyle = "#e3bd52";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

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

    // Places, in a warmer, larger face than the streets.
    for (const p of places) {
      const px = X(p.x);
      const py = Z(p.z);
      if (px < -80 || py < -30 || px > size.w + 80 || py > size.h + 30) continue;
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
  }, [view, size, map, roads, places, tasks, barber, live, hover]);

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
          <Button variant="neutral" size="icon" aria-label="Whole district" onClick={() => setView(fit(size.w, size.h))}>
            <Maximize2 className="size-4" aria-hidden />
          </Button>
          <Button variant="neutral" onClick={onClose} aria-label="Close map">
            <X className="size-4" aria-hidden />
            <kbd className="hidden sm:inline">M</kbd>
          </Button>
        </div>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
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
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-md bg-black/60 px-3 py-2 text-xs">
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
    </div>
  );
}
