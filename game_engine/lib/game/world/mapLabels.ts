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
export type PlaceLabel = { name: string; x: number; z: number; kind: "landmark" | "area" | "station" | "building" };

/** Named OSM buildings big enough to be somewhere (a langar hall, a market,
 *  a ferry station), not every named shop or clinic. */
const BIG_BUILDING = 600;

function polyArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a / 2);
}

const namedBuildings = (map: MapData) => map.buildings.filter((b) => b.name && !b.canopy && polyArea(b.pts) >= BIG_BUILDING);

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

/** A point inside a ring (and out of its holes), nearest its centroid: a
 *  ring round a tank (the parikrama) has its centroid in the water. */
function interiorPoint(ring: Pt[], holes: Pt[][]): Pt {
  const c = centroid(ring);
  const inside = (x: number, z: number) => inRing(x, z, ring) && !holes.some((h) => inRing(x, z, h));
  if (inside(c[0], c[1])) return c;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const step = Math.max(2, Math.min(maxX - minX, maxZ - minZ) / 40);
  let best: Pt = c;
  let bd = Infinity;
  for (let z = minZ + step / 2; z < maxZ; z += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const d = Math.hypot(x - c[0], z - c[1]);
      if (d < bd && inside(x, z)) {
        bd = d;
        best = [x, z];
      }
    }
  }
  return best;
}

/** Landmarks, named parks, markets, beaches and tanks, stations, and the
 *  big named buildings. */
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
    const [x, z] = interiorPoint(a.pts, a.holes ?? []);
    add({ name: a.name, x, z, kind: "area" });
  }
  for (const p of map.pois) if (p.kind === "station" && p.name) add({ name: p.name, x: p.x, z: p.z, kind: "station" });
  for (const b of namedBuildings(map)) {
    const [x, z] = centroid(b.pts);
    add({ name: b.name!, x, z, kind: "building" });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Whereabouts
 * ------------------------------------------------------------------ */

/** `near` when the place is only close by (you are not in it): the card
 *  may say it, but it has not been visited. */
export type Whereabouts = { place: string | null; road: string | null; near?: boolean };

function inRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, z) to a ring's nearest edge. */
function edgeDist(x: number, z: number, ring: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
  }
  return best;
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
  const buildings = namedBuildings(map);
  const tanks = map.areas.filter((a) => a.name && a.kind === "water");
  const stations = map.pois.filter((p) => p.kind === "station" && p.name);
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
      // At a place: inside (or on the doorstep of) a landmark (the smallest,
      // when one stands in another's grounds), else in a named park, market
      // or beach, else in a big named building.
      let place: string | null = null;
      let smallest = Infinity;
      for (const l of map.landmarks) {
        const c = Math.cos(l.rot);
        const s = Math.sin(l.rot);
        const u = (x - l.x) * c - (z - l.z) * s;
        const v = (x - l.x) * s + (z - l.z) * c;
        if (Math.abs(u) < l.w / 2 + 6 && Math.abs(v) < l.d / 2 + 6 && l.w * l.d < smallest) {
          smallest = l.w * l.d;
          place = l.name;
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
      if (!place) {
        // Inside one before beside one; the smaller when two overlap.
        let score = Infinity;
        for (const b of buildings) {
          const inside = inRing(x, z, b.pts);
          if (!inside && edgeDist(x, z, b.pts) >= 6) continue;
          const sc = (inside ? 0 : 1e9) + polyArea(b.pts);
          if (sc < score) {
            score = sc;
            place = b.name!;
          }
        }
      }
      if (!place) {
        for (const st of stations) {
          if (Math.hypot(x - st.x, z - st.z) < 20) {
            place = st.name!;
            break;
          }
        }
      }
      // On the bank of a named tank or lake (Bindu Sagar's ghats), even from
      // the street round it: as close to it as anyone gets.
      if (!place) {
        for (const a of tanks) {
          if (edgeDist(x, z, a.pts) < 15) {
            place = a.name!;
            break;
          }
        }
      }
      let near = false;
      // Nowhere named underfoot: say what is near (a lane off a named street,
      // the forecourt of a landmark), within a short walk.
      if (!place && !road) {
        let reach = 60;
        for (const l of map.landmarks) {
          const d = Math.hypot(x - l.x, z - l.z) - Math.max(l.w, l.d) / 2;
          if (d < reach) {
            reach = d;
            place = l.name;
            near = true;
          }
        }
        for (const b of buildings) {
          const d = edgeDist(x, z, b.pts);
          if (d < reach) {
            reach = d;
            place = b.name!;
            near = true;
          }
        }
      }
      if (!place && !road) {
        let reach = 60;
        for (const r of map.roads) {
          if (!named(r)) continue;
          for (let i = 0; i < r.pts.length - 1; i++) {
            const [ax, az] = r.pts[i];
            const [bx, bz] = r.pts[i + 1];
            const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
            const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
            const d = Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az));
            if (d < reach) {
              reach = d;
              road = r.name!;
            }
          }
        }
      }
      return near ? { place, road, near } : { place, road };
    },
  };
}
