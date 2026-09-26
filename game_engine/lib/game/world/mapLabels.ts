/**
 * Names on the map, now that the streets are real: where to letter each
 * road and each place on the minimap and the full map, and which place and
 * street the player is standing in (for the location card that slides in
 * when that changes).
 */

import type { MapData, MapRoad, Pt } from "./mapData";

/** A road name lettered along its longest stretch, reading left to right. */
export type RoadLabel = { name: string; x: number; z: number; angle: number; rank: number };

/** A named place: a landmark, a park or market, a station. */
export type PlaceLabel = { name: string; x: number; z: number; kind: "landmark" | "area" | "station" };

/** Streets a name can be lettered on and a player can be "on". */
const named = (r: MapRoad) => !!r.name && r.cls !== "steps";

/** Bigger roads first: 3 trunk/primary, 2 secondary/tertiary, 1 the rest. */
function rankOf(r: MapRoad): number {
  if (r.cls === "trunk" || r.cls === "primary") return 3;
  if (r.cls === "secondary" || r.cls === "tertiary" || r.surface) return 2;
  return 1;
}

function length(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Point and heading halfway along a polyline. */
function middle(pts: Pt[]): { x: number; z: number; angle: number } {
  const half = length(pts) / 2;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (acc + seg >= half) {
      const t = seg ? (half - acc) / seg : 0;
      // Screen angle of the segment (x right, z down), kept upright.
      let angle = Math.atan2(bz - az, bx - ax);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle <= -Math.PI / 2) angle += Math.PI;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, angle };
    }
    acc += seg;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z, angle: 0 };
}

/**
 * One label per named road on its longest piece, and more along a long
 * road (one per ~220m of it), each on a different piece.
 */
export function roadLabels(map: MapData): RoadLabel[] {
  const byName = new Map<string, MapRoad[]>();
  for (const r of map.roads) {
    if (!named(r)) continue;
    byName.set(r.name!, [...(byName.get(r.name!) ?? []), r]);
  }
  const out: RoadLabel[] = [];
  for (const [name, pieces] of byName) {
    const sorted = [...pieces].sort((a, b) => length(b.pts) - length(a.pts));
    const total = pieces.reduce((n, r) => n + length(r.pts), 0);
    const want = Math.max(1, Math.min(4, Math.round(total / 220)));
    const placed: { x: number; z: number }[] = [];
    for (const r of sorted) {
      if (placed.length >= want) break;
      if (length(r.pts) < 18) continue;
      const m = middle(r.pts);
      // Spread along the road rather than bunched on neighbouring pieces.
      if (placed.some((p) => Math.hypot(p.x - m.x, p.z - m.z) < 120)) continue;
      placed.push(m);
      out.push({ name, ...m, rank: rankOf(r) });
    }
  }
  return out.sort((a, b) => b.rank - a.rank);
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0] / pts.length;
    z += p[1] / pts.length;
  }
  return [x, z];
}

/** Landmarks, named parks, markets, beaches and tanks, and stations. */
export function placeLabels(map: MapData): PlaceLabel[] {
  const out: PlaceLabel[] = [];
  const seen = new Set<string>();
  const add = (l: PlaceLabel) => {
    if (seen.has(l.name) || Math.abs(l.x) > map.half || Math.abs(l.z) > map.half) return;
    seen.add(l.name);
    out.push(l);
  };
  for (const l of map.landmarks) add({ name: l.name, x: l.x, z: l.z, kind: "landmark" });
  for (const a of map.areas) {
    if (!a.name || a.kind === "sea") continue;
    const [x, z] = centroid(a.pts);
    add({ name: a.name, x, z, kind: "area" });
  }
  for (const p of map.pois) if (p.kind === "station" && p.name) add({ name: p.name, x: p.x, z: p.z, kind: "station" });
  return out;
}

/* ------------------------------------------------------------------ *
 * Whereabouts
 * ------------------------------------------------------------------ */

export type Whereabouts = { place: string | null; road: string | null };

function inRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Answers "where am I" fast enough to ask a few times a second. */
export type Locator = { locate(x: number, z: number): Whereabouts };

const CELL = 24;

export function createLocator(map: MapData): Locator {
  // Named roads bucketed on a coarse grid by every cell along them (and the
  // cells either side, so a point near a cell edge still finds its road).
  const buckets = new Map<string, MapRoad[]>();
  for (const r of map.roads) {
    if (!named(r)) continue;
    const keys = new Set<string>();
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2)));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n;
        const z = az + ((bz - az) * k) / n;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) keys.add(`${Math.floor(x / CELL) + dx}:${Math.floor(z / CELL) + dz}`);
        }
      }
    }
    for (const k of keys) buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  const areas = map.areas.filter((a) => a.name && a.kind !== "sea" && a.kind !== "water");
  return {
    locate(x, z) {
      // On a street: the nearest named one whose carriageway or footpath
      // you are on, with a few metres' grace for the shopfronts.
      let road: string | null = null;
      let best = Infinity;
      for (const r of buckets.get(`${Math.floor(x / CELL)}:${Math.floor(z / CELL)}`) ?? []) {
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, az] = r.pts[i];
          const [bx, bz] = r.pts[i + 1];
          const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
          const d = Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) - (r.w / 2 + r.foot);
          if (d < 4 && d < best) {
            best = d;
            road = r.name!;
          }
        }
      }
      // At a place: inside (or on the doorstep of) a landmark, else in a
      // named park, market or beach.
      let place: string | null = null;
      for (const l of map.landmarks) {
        const c = Math.cos(l.rot);
        const s = Math.sin(l.rot);
        const u = (x - l.x) * c - (z - l.z) * s;
        const v = (x - l.x) * s + (z - l.z) * c;
        if (Math.abs(u) < l.w / 2 + 6 && Math.abs(v) < l.d / 2 + 6) {
          place = l.name;
          break;
        }
      }
      if (!place) {
        for (const a of areas) {
          if (inRing(x, z, a.pts) && !(a.holes ?? []).some((h) => inRing(x, z, h))) {
            place = a.name!;
            break;
          }
        }
      }
      return { place, road };
    },
  };
}
