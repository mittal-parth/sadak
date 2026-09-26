/**
 * Shared by the minimap, the full map and the HUD: the street map drawn from
 * OpenStreetMap data, and how each kind of task is coloured, iconed and named.
 */

import type { MapData } from "@/lib/game/world/mapData";
import type { TaskKind } from "@/lib/game/tasks";

export function kindColour(kind: TaskKind, done: boolean): string {
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
    case "counter":
      return "#9b59b6";
    case "barber":
      return "#33406b";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function kindIcon(kind: TaskKind): string {
  switch (kind) {
    case "auto":
      return "🛺";
    case "shop":
      return "🏪";
    case "temple":
      return "🛕";
    case "bus":
      return "🚌";
    case "counter":
      return "🎫";
    case "barber":
      return "💈";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function kindLabel(kind: TaskKind): string {
  switch (kind) {
    case "auto":
      return "Auto";
    case "shop":
      return "Shop";
    case "temple":
      return "Temple";
    case "bus":
      return "Bus";
    case "counter":
      return "Ticket";
    case "barber":
      return "Barber";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Pixels per metre in the pre-rendered street map. */
export const MAP_RES = 2;

/**
 * The district's streets, water and parks drawn once at MAP_RES; the minimap
 * then just rotates and crops this every frame.
 */
export function renderStreetMap(map: MapData): HTMLCanvasElement {
  const px = Math.ceil(map.half * 2 * MAP_RES);
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d")!;
  const X = (v: number) => (v + map.half) * MAP_RES;
  g.fillStyle = "#1d2229";
  g.fillRect(0, 0, px, px);
  const ring = (pts: [number, number][]) => {
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
    g.closePath();
  };
  for (const a of map.areas) {
    g.beginPath();
    ring(a.pts);
    a.holes?.forEach(ring);
    g.fillStyle = a.kind === "water" || a.kind === "sea" ? "#2d5f86" : a.kind === "park" || a.kind === "pitch" ? "#2e4f33" : "#2a2f36";
    g.fill("evenodd");
  }
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const r of map.roads) {
    g.beginPath();
    r.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
    const path = r.cls === "footway" || r.cls === "steps";
    g.strokeStyle = path ? "#3a414b" : r.w >= 10 ? "#6a7582" : "#4d5763";
    g.lineWidth = Math.max(1.5, r.w * MAP_RES);
    g.stroke();
  }
  for (const l of map.landmarks) {
    g.fillStyle = "#c9a23a";
    g.beginPath();
    g.arc(X(l.x), X(l.z), 5 * MAP_RES, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

