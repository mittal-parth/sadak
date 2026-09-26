/**
 * Shared by the minimap, the full map and the HUD: the street map drawn from
 * OpenStreetMap data, and how each kind of task is coloured, iconed and named.
 */

import type { MapData, MapRoad, Pt } from "@/lib/game/world/mapData";
import type { TaskKind } from "@/lib/game/tasks";
import type { Landmark } from "@/lib/game/assets";
import { CITY_TRAFFIC } from "@/lib/game/transit";

/** A 0xRRGGBB colour as CSS. */
export const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

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

/** The icons in components/map/errandIcons.tsx. */
export type ErrandIconId =
  | "auto"
  | "taxi"
  | "shop"
  | "langar"
  | "temple"
  | "mosque"
  | "church"
  | "gurdwara"
  | "bus"
  | "ticket"
  | "train"
  | "ferry"
  | "barber"
  | "done";

export function kindIcon(kind: TaskKind): ErrandIconId {
  switch (kind) {
    case "auto":
    case "shop":
    case "temple":
    case "bus":
    case "barber":
      return kind;
    case "counter":
      return "ticket";
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

/* ------------------------------------------------------------------ *
 * The map's look, shared by the minimap and the full map
 * ------------------------------------------------------------------ */

export const MAP_STYLE = {
  outside: "#161a20",
  ground: "#20252c",
  plot: "#2d333c",
  building: "#363e49",
  buildingEdge: "#262c34",
  canopy: "rgba(205,210,216,0.18)",
  water: "#1e5a88",
  shore: "#4a92c6",
  park: "#2c5836",
  pitch: "#346a3d",
  beach: "#7f6c48",
  plaza: "#30363f",
  market: "#4a3e2d",
  rail: "#6b7480",
  casing: "#0f1216",
  landmark: "rgba(227,189,82,0.38)",
  landmarkEdge: "#f0cf6a",
} as const;

const AREA_FILL: Record<string, string> = {
  water: MAP_STYLE.water,
  sea: MAP_STYLE.water,
  park: MAP_STYLE.park,
  pitch: MAP_STYLE.pitch,
  beach: MAP_STYLE.beach,
  plaza: MAP_STYLE.plaza,
  market: MAP_STYLE.market,
};

/** Road fill by importance: gold main roads, pale secondaries, grey lanes,
 *  the sandstone of a paved pedestrian street. */
function roadFill(r: MapRoad): string {
  if (r.surface) return "#c4826a";
  switch (r.cls) {
    case "trunk":
    case "primary":
      return "#f0c75e";
    case "secondary":
    case "tertiary":
      return "#e3e8ee";
    case "pedestrian":
      return "#b9a58a";
    default:
      return "#a3adb8";
  }
}

const ROAD_ORDER = ["footway", "steps", "service", "living_street", "residential", "unclassified", "pedestrian", "tertiary", "secondary", "primary", "trunk"];

/**
 * Draws the district's base map (ground, parks and water with their shore,
 * the city blocks, the streets in their casings, the landmarks) with X and Z
 * turning metres into canvas pixels at `scale` pixels per metre.
 */
export function drawMapBase(
  g: CanvasRenderingContext2D,
  map: MapData,
  X: (x: number) => number,
  Z: (z: number) => number,
  scale: number
) {
  const path = (pts: Pt[], close: boolean) => {
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
    if (close) g.closePath();
  };
  g.fillStyle = MAP_STYLE.ground;
  g.fillRect(X(-map.half), Z(-map.half), map.half * 2 * scale, map.half * 2 * scale);

  const water = (k: string) => k === "water" || k === "sea";
  for (const a of map.areas) {
    g.beginPath();
    path(a.pts, true);
    a.holes?.forEach((h) => path(h, true));
    g.fillStyle = AREA_FILL[a.kind] ?? MAP_STYLE.plaza;
    g.fill("evenodd");
  }

  // The blocks: generated plots and the real footprints.
  g.fillStyle = MAP_STYLE.plot;
  for (const p of map.plots) {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    g.beginPath();
    for (const [u, v] of [[-p.w / 2, -p.d / 2], [p.w / 2, -p.d / 2], [p.w / 2, p.d / 2], [-p.w / 2, p.d / 2]]) {
      g.lineTo(X(p.x + u * c + v * s), Z(p.z - u * s + v * c));
    }
    g.closePath();
    g.fill();
  }
  g.lineWidth = 1;
  for (const b of map.buildings) {
    g.beginPath();
    path(b.pts, true);
    b.holes?.forEach((h) => path(h, true));
    g.fillStyle = b.canopy ? MAP_STYLE.canopy : MAP_STYLE.building;
    g.fill("evenodd");
    if (!b.canopy && scale > 1.5) {
      g.strokeStyle = MAP_STYLE.buildingEdge;
      g.stroke();
    }
  }

  // Shorelines over the blocks' edges.
  g.strokeStyle = MAP_STYLE.shore;
  g.lineWidth = Math.max(1, 0.8 * scale);
  for (const a of map.areas) {
    if (!water(a.kind) || a.kind === "sea") continue;
    g.beginPath();
    path(a.pts, true);
    a.holes?.forEach((h) => path(h, true));
    g.stroke();
  }

  // Railways: sleepers over a casing.
  for (const r of map.rails) {
    if (r.underground) continue;
    g.beginPath();
    path(r.pts, false);
    g.setLineDash([]);
    g.strokeStyle = MAP_STYLE.casing;
    g.lineWidth = Math.max(2, 3 * scale);
    g.stroke();
    g.setLineDash([Math.max(2, 3 * scale), Math.max(2, 3 * scale)]);
    g.strokeStyle = MAP_STYLE.rail;
    g.lineWidth = Math.max(1, 1.6 * scale);
    g.stroke();
  }
  g.setLineDash([]);

  // Streets, smallest first, each in a dark casing so they read over the
  // blocks; footpaths dashed and only once there is room for them.
  g.lineCap = "round";
  g.lineJoin = "round";
  const sorted = [...map.roads].sort((a, b) => ROAD_ORDER.indexOf(a.cls) - ROAD_ORDER.indexOf(b.cls));
  const width = (r: MapRoad) => Math.max(1.4, (r.w + r.foot * 2) * scale);
  const streets = sorted.filter((r) => r.cls !== "footway" && r.cls !== "steps");
  for (const r of streets) {
    g.beginPath();
    path(r.pts, false);
    g.strokeStyle = MAP_STYLE.casing;
    g.lineWidth = width(r) + Math.max(1.5, 1.2 * scale);
    g.stroke();
  }
  for (const r of streets) {
    g.beginPath();
    path(r.pts, false);
    g.strokeStyle = roadFill(r);
    g.lineWidth = width(r);
    g.stroke();
  }
  if (scale >= 1.2) {
    g.setLineDash([Math.max(2, 1.5 * scale), Math.max(2, 1.5 * scale)]);
    g.strokeStyle = "#7c8691";
    g.lineWidth = Math.max(1, 0.9 * scale);
    for (const r of sorted) {
      if (r.cls !== "footway" && r.cls !== "steps") continue;
      g.beginPath();
      path(r.pts, false);
      g.stroke();
    }
    g.setLineDash([]);
  }

  // Landmarks: their footprints in gold.
  for (const l of map.landmarks) {
    const c = Math.cos(l.rot);
    const s = Math.sin(l.rot);
    g.beginPath();
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.lineTo(X(l.x + (u * l.w * c) / 2 + (v * l.d * s) / 2), Z(l.z - (u * l.w * s) / 2 + (v * l.d * c) / 2));
    }
    g.closePath();
    g.fillStyle = MAP_STYLE.landmark;
    g.fill();
    g.strokeStyle = MAP_STYLE.landmarkEdge;
    g.lineWidth = Math.max(1, 0.5 * scale);
    g.stroke();
  }
}

/**
 * The district's base map drawn once at MAP_RES; the minimap then just
 * rotates and crops this every frame.
 */
export function renderStreetMap(map: MapData): HTMLCanvasElement {
  const px = Math.ceil(map.half * 2 * MAP_RES);
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const g = c.getContext("2d")!;
  const X = (v: number) => (v + map.half) * MAP_RES;
  drawMapBase(g, map, X, X, MAP_RES);
  return c;
}

/**
 * An errand's icon and label as the player should read them: the kind, told
 * by what the errand actually is. A taxi where the city hails taxis, the
 * place of worship the errand is at (a mosque, a church, a gurdwara) rather
 * than "temple" for all of them, the train or the ferry a ticket is for;
 * the langar is a meal, not a shop.
 */
export function taskLook(t: { kind: TaskKind; role: string; title: string }, city: Landmark): { icon: ErrandIconId; label: string } {
  const about = `${t.role} ${t.title}`;
  if (t.kind === "auto" && CITY_TRAFFIC[city].hire === "taxi") return { icon: "taxi", label: "Taxi" };
  if (t.kind === "temple") {
    if (/masjid|mosque/i.test(about)) return { icon: "mosque", label: "Mosque" };
    if (/church|candle|cathedral|basilica/i.test(about)) return { icon: "church", label: "Church" };
    if (city === "amritsar") return { icon: "gurdwara", label: "Gurdwara" };
  }
  if (t.kind === "shop" && /langar|sevadar/i.test(about)) return { icon: "langar", label: "Langar" };
  if (t.kind === "counter") {
    if (/ferry|boat/i.test(about)) return { icon: "ferry", label: "Ferry" };
    if (/train|metro|local/i.test(about)) return { icon: "train", label: /metro/i.test(about) ? "Metro" : "Train" };
  }
  return { icon: kindIcon(t.kind), label: kindLabel(t.kind) };
}
