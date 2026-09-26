/**
 * Compiles the cached OpenStreetMap extracts into playable district maps:
 * public/maps/<districtId>.json (see lib/game/world/mapData.ts).
 *
 *   npx tsx scripts/osm/fetch.ts        # once, needs network
 *   npx tsx scripts/osm/build.ts [id]   # offline, deterministic
 *
 * What it does:
 *   1. Projects everything to metres around the district centre and clips
 *      it to the map square.
 *   2. Builds the street graph (ways split at shared nodes).
 *   3. Pulls out water, parks, beach, plazas, rail and points of interest,
 *      and closes the sea polygon from the coastline where there is one.
 *   4. Swaps named landmark footprints for hero models (cities.ts rules).
 *   5. Picks the spawn and the four task spots on real streets and reserves
 *      clear ground round them.
 *   6. Rasterises everything onto a 1m occupancy grid and fills every street
 *      frontage with building plots in the city's grain, then back-fills the
 *      block interiors so the roofscape is continuous.
 *
 * Map data (c) OpenStreetMap contributors, ODbL 1.0.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OSM_CITIES, type OsmCity } from "./cities";
import { planRoute, reachShare } from "../../lib/game/world/route";
import { BARBER_PLOT } from "../../lib/game/barber";
import { modelExtent } from "../../lib/game/world/extent";
import { polylineLength } from "../../lib/game/world/roads";
import { keyhole, precinctGates } from "./precinct";
import { crossings } from "../../lib/game/world/precinct";
import type {
  Bridge,
  MapArea,
  MapBuilding,
  MapData,
  MapLandmark,
  FacadeBoard,
  MapNode,
  MapPoi,
  MapRail,
  MapRoad,
  Plot,
  PoiKind,
  Precinct,
  Pt,
  RailKind,
  RoadClass,
  Spot,
  TaskSpotKind,
} from "../../lib/game/world/mapData";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".cache");
const OUT = join(HERE, "../../public/maps");

/* ------------------------------------------------------------------ *
 * OSM shapes
 * ------------------------------------------------------------------ */

type LatLon = { lat: number; lon: number };
type Tags = Record<string, string>;
type OsmNode = { type: "node"; id: number; lat: number; lon: number; tags?: Tags };
type OsmWay = { type: "way"; id: number; nodes: number[]; geometry: LatLon[]; tags?: Tags };
type OsmRel = {
  type: "relation";
  id: number;
  tags?: Tags;
  members: { type: string; role: string; ref: number; geometry?: LatLon[] }[];
};
type OsmEl = OsmNode | OsmWay | OsmRel;

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const r1 = (v: number) => Math.round(v * 10) / 10;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polygonArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i];
    const [x2, z2] = p[(i + 1) % p.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function centroid(p: Pt[]): Pt {
  let x = 0;
  let z = 0;
  for (const q of p) {
    x += q[0];
    z += q[1];
  }
  return [x / p.length, z / p.length];
}

/** Sutherland-Hodgman against the square [-h, h]^2. */
function clipPolygon(poly: Pt[], h: number): Pt[] {
  let out = poly;
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= -h, (a, b) => lerpAt(a, b, 0, -h)],
    [(p) => p[0] <= h, (a, b) => lerpAt(a, b, 0, h)],
    [(p) => p[1] >= -h, (a, b) => lerpAt(a, b, 1, -h)],
    [(p) => p[1] <= h, (a, b) => lerpAt(a, b, 1, h)],
  ];
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i];
      const prev = src[(i + src.length - 1) % src.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(cut(prev, cur));
      }
    }
    if (!out.length) return out;
  }
  return out;
}

function lerpAt(a: Pt, b: Pt, axis: 0 | 1, v: number): Pt {
  const t = (v - a[axis]) / (b[axis] - a[axis]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Liang-Barsky: the part of segment a-b inside the square, or null. */
function clipSegment(a: Pt, b: Pt, h: number): [Pt, Pt] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const checks: [number, number][] = [
    [-dx, a[0] + h],
    [dx, h - a[0]],
    [-dz, a[1] + h],
    [dz, h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dz * t0],
    [a[0] + dx * t1, a[1] + dz * t1],
  ];
}

/** Clip a polyline to the square; may split it into several pieces. */
function clipPolyline(pts: Pt[], h: number): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], h);
    if (!seg) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      continue;
    }
    if (!cur.length) cur.push(seg[0]);
    else if (Math.hypot(cur[cur.length - 1][0] - seg[0][0], cur[cur.length - 1][1] - seg[0][1]) > 1e-6) {
      if (cur.length > 1) out.push(cur);
      cur = [seg[0]];
    }
    cur.push(seg[1]);
    const exited = Math.hypot(seg[1][0] - pts[i + 1][0], seg[1][1] - pts[i + 1][1]) > 1e-6;
    if (exited) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Minimum-area oriented rectangle of a point set (hull edges, brute force). */
function orientedBox(pts: Pt[]): { x: number; z: number; rot: number; w: number; d: number } {
  const hull = convexHull(pts);
  let best = { area: Infinity, x: 0, z: 0, rot: 0, w: 0, d: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * c + p[1] * s;
      const v = -p[0] * s + p[1] * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      // Local x runs along the edge (u), local z along v.
      best = {
        area,
        x: cu * c - cv * s,
        z: cu * s + cv * c,
        // Yaw whose local +x is (c, s) in (x, z): rot = -ang.
        rot: -ang,
        w: maxU - minU,
        d: maxV - minV,
      };
    }
  }
  return { x: best.x, z: best.z, rot: best.rot, w: best.w, d: best.d };
}

function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Joins member ways end to end into closed rings. */
function assembleRings(parts: Pt[][]): Pt[][] {
  const rings: Pt[][] = [];
  const pool = parts.map((p) => [...p]);
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  while (pool.length) {
    let ring = pool.shift()!;
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        const end = ring[ring.length - 1];
        if (same(end, p[0])) ring = ring.concat(p.slice(1));
        else if (same(end, p[p.length - 1])) ring = ring.concat([...p].reverse().slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring.slice(0, -1));
  }
  return rings;
}

function nearestOnPolyline(pts: Pt[], p: Pt): { pt: Pt; dist: number; dir: Pt; along: number } {
  let best = { pt: pts[0], dist: Infinity, dir: [1, 0] as Pt, along: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1e-9;
    const L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
    const q: Pt = [a[0] + dx * t, a[1] + dz * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.dist) best = { pt: q, dist: d, dir: [dx / L, dz / L], along: acc + L * t };
    acc += L;
  }
  return best;
}

/** Turn an oriented box by quarter turns so its local +z (the entrance)
 *  points closest to a compass bearing, swapping width and depth as it goes. */
function facing<B extends { rot: number; w: number; d: number }>(box: B, bearing: number): B {
  // Bearing to a direction in this frame: north is -z, east is +x.
  const b = (bearing * Math.PI) / 180;
  const want: Pt = [Math.sin(b), -Math.cos(b)];
  let best = box;
  let score = -Infinity;
  for (let k = 0; k < 4; k++) {
    const rot = box.rot + (k * Math.PI) / 2;
    const s = Math.sin(rot) * want[0] + Math.cos(rot) * want[1];
    if (s > score) {
      score = s;
      best = { ...box, rot, w: k % 2 ? box.d : box.w, d: k % 2 ? box.w : box.d };
    }
  }
  return best;
}

/** Where a landmark's entrance is: `out` metres in front of its +z face. */
const frontOf = (l: MapLandmark, out: number): Pt => [
  l.x + Math.sin(l.rot) * (l.d / 2 + out),
  l.z + Math.cos(l.rot) * (l.d / 2 + out),
];

/** The point `s` metres along a polyline. */
function pointAlong(pts: Pt[], s: number): Pt {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= s) {
      const t = L ? (s - acc) / L : 0;
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    acc += L;
  }
  return pts[pts.length - 1];
}

/** Even-odd point in polygon. */
function pointInRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A board for the shop at `p` on its building's wall nearest the street:
 * the edge closest to the nearest road, the board centred on the shop's
 * spot along it, facing out. Null if the building has no wall long enough.
 */
function streetWall(b: MapBuilding, p: { x: number; z: number; name?: string }, roads: MapRoad[]): FacadeBoard | null {
  let road: Pt | null = null;
  let rd = Infinity;
  for (const r of roads) {
    if (r.cls === "footway" || r.cls === "steps") continue;
    const n = nearestOnPolyline(r.pts, [p.x, p.z]);
    if (n.dist < rd) {
      rd = n.dist;
      road = n.pt;
    }
  }
  if (!road) return null;
  const ring = b.pts;
  let best: { board: FacadeBoard; d: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 3) continue;
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    // Outward normal: the side the road is on.
    let nx = uz;
    let nz = -ux;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if ((road[0] - mx) * nx + (road[1] - mz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    // Only walls that face out of the building toward the road.
    if (pointInRing(mx + nx * 0.5, mz + nz * 0.5, ring)) continue;
    const d = Math.hypot(road[0] - mx, road[1] - mz);
    const w = Math.min(6, L - 1);
    const t = Math.max(w / 2, Math.min(L - w / 2, (p.x - ax) * ux + (p.z - az) * uz));
    const board: FacadeBoard = {
      name: p.name!.trim(),
      x: r1(ax + ux * t + nx * 0.15),
      z: r1(az + uz * t + nz * 0.15),
      rot: +Math.atan2(nx, nz).toFixed(3),
      w: r1(w),
    };
    if (!best || d < best.d) best = { board, d };
  }
  return best?.board ?? null;
}

/** Real shop names per district: each is a cell in the sign atlas. */
const MAX_NAMED_SIGNS = 40;

/** Footprint landmarks whose front is on the street. */
const FACE_STREET = new Set([
  "cinema",
  "colonial",
  "church",
  "church_small",
  "basilica",
  "temple",
  "deul_small",
  "gurdwara_small",
  "mosque_small",
  "dargah",
  "tomb",
  "shrine",
]);

/** Where the great gates really are: India's congregational mosques pray
 *  west and open east; Lingaraj's Lion Gate faces east. (The Akal Takht
 *  faces the Harmandir Sahib: see the precinct.) */
const MODEL_FACES: Record<string, number> = { jama_masjid: 90, lingaraj: 90 };

/** Monuments with a stair or gate at local +z that you walk into. */
const HAS_DOOR = new Set([
  "jama_masjid",
  "mosque_small",
  "dargah",
  "temple",
  "deul_small",
  "lingaraj",
  "gurdwara_small",
  "akal_takht",
  "church",
  "church_small",
  "basilica",
  "tomb",
  "gopuram_temple",
  "shrine",
]);

/** Landmark models that stand in or over the carriageway: a fountain or a
 *  pigeon house on a traffic island, a gateway the street runs through. */
const IN_THE_ROAD = new Set(["fountain", "kabutar_khana", "kaman", "teen_darwaza", "promenade", "fishing_nets"]);

/* ------------------------------------------------------------------ *
 * Occupancy grid (1m cells)
 * ------------------------------------------------------------------ */

const FREE = 0;
const ROAD = 1;
const AREA = 2;
const BUILT = 3;
const RESERVED = 4;

class Grid {
  n: number;
  cells: Uint8Array;
  constructor(public half: number) {
    this.n = half * 2;
    this.cells = new Uint8Array(this.n * this.n);
  }
  idx(x: number, z: number): number {
    const i = Math.floor(x + this.half);
    const j = Math.floor(z + this.half);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }
  get(x: number, z: number): number {
    const i = this.idx(x, z);
    return i < 0 ? ROAD : this.cells[i];
  }
  set(x: number, z: number, v: number) {
    const i = this.idx(x, z);
    if (i >= 0 && this.cells[i] < v) this.cells[i] = v;
  }
  /** Marks every cell within `r` of the polyline. */
  stroke(pts: Pt[], r: number, v: number) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[k + 1];
      const minX = Math.floor(Math.min(ax, bx) - r);
      const maxX = Math.ceil(Math.max(ax, bx) + r);
      const minZ = Math.floor(Math.min(az, bz) - r);
      const maxZ = Math.ceil(Math.max(az, bz) + r);
      const dx = bx - ax;
      const dz = bz - az;
      const L2 = dx * dx + dz * dz || 1e-9;
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5;
          const cz = z + 0.5;
          const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / L2));
          const qx = ax + dx * t;
          const qz = az + dz * t;
          if ((cx - qx) ** 2 + (cz - qz) ** 2 <= r * r) this.set(cx, cz, v);
        }
      }
    }
  }
  /** Even-odd scanline fill of a polygon and its holes. */
  fill(poly: Pt[], v: number, holes: Pt[][] = []) {
    if (poly.length < 3) return;
    const rings = [poly, ...holes];
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of poly) {
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
    for (let z = Math.floor(minZ); z <= Math.ceil(maxZ); z++) {
      const cz = z + 0.5;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          if ((a[1] <= cz && b[1] > cz) || (b[1] <= cz && a[1] > cz)) {
            xs.push(a[0] + ((cz - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.floor(xs[i]); x <= Math.ceil(xs[i + 1]); x++) {
          if (x + 0.5 >= xs[i] && x + 0.5 <= xs[i + 1]) this.set(x + 0.5, cz, v);
        }
      }
    }
  }
  /** True when any cell within `r` holds `v`. */
  near(x: number, z: number, r: number, v: number): boolean {
    for (let dz = -r; dz <= r; dz += 0.5) {
      for (let dx = -r; dx <= r; dx += 0.5) {
        if (dx * dx + dz * dz <= r * r && this.get(x + dx, z + dz) === v) return true;
      }
    }
    return false;
  }
  disc(x: number, z: number, r: number, v: number) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz <= r * r) this.set(x + dx, z + dz, v);
      }
    }
  }
  /** True when every cell under the oriented box is free. */
  boxFree(x: number, z: number, rot: number, w: number, d: number): boolean {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let v = -d / 2 + 0.5; v < d / 2; v += 0.9) {
      for (let u = -w / 2 + 0.4; u < w / 2; u += 0.9) {
        // Local (u, v) -> world, with local +z at (sin rot, cos rot).
        const wx = x + u * c + v * s;
        const wz = z - u * s + v * c;
        if (this.get(wx, wz) !== FREE) return false;
      }
    }
    return true;
  }
  markBox(x: number, z: number, rot: number, w: number, d: number, v: number) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let vv = -d / 2; vv <= d / 2; vv += 0.5) {
      for (let u = -w / 2; u <= w / 2; u += 0.5) {
        this.set(x + u * c + vv * s, z - u * s + vv * c, v);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Roads
 * ------------------------------------------------------------------ */

const CLASS_OF: Record<string, RoadClass> = {
  motorway: "trunk",
  trunk: "trunk",
  trunk_link: "primary",
  primary: "primary",
  primary_link: "secondary",
  secondary: "secondary",
  secondary_link: "tertiary",
  tertiary: "tertiary",
  tertiary_link: "tertiary",
  unclassified: "unclassified",
  residential: "residential",
  living_street: "living_street",
  service: "service",
  pedestrian: "pedestrian",
  footway: "footway",
  path: "footway",
  steps: "steps",
};

function roadSize(cls: RoadClass, city: OsmCity): { w: number; foot: number } {
  switch (cls) {
    case "trunk": return { w: 15, foot: 3 };
    case "primary": return { w: 12, foot: 3 };
    case "secondary": return { w: 10, foot: 2.6 };
    case "tertiary": return { w: 8.5, foot: 2.2 };
    case "unclassified": return { w: 7, foot: 1.6 };
    case "residential": return { w: city.fill.laneWidth, foot: 0 };
    case "living_street": return { w: Math.min(city.fill.laneWidth, 5), foot: 0 };
    case "service": return { w: 4.5, foot: 0 };
    case "pedestrian": return { w: 6, foot: 0 };
    case "footway":
    case "steps": return { w: 2.4, foot: 0 };
  }
}

/** Floors added on top of the city's lane range, by street importance. */
const FLOOR_BONUS: Partial<Record<RoadClass, number>> = {
  trunk: 2,
  primary: 2,
  secondary: 1,
  tertiary: 1,
  pedestrian: 0,
};

/* ------------------------------------------------------------------ *
 * Compile one city
 * ------------------------------------------------------------------ */

function compile(city: OsmCity): MapData {
  const raw = JSON.parse(readFileSync(join(CACHE, `${city.id}.json`), "utf8")) as { elements: OsmEl[] };
  const els = raw.elements;
  const H = city.half;
  const mLat = 111320;
  const mLon = 111320 * Math.cos((city.lat * Math.PI) / 180);
  const P = (g: LatLon): Pt => [(g.lon - city.lon) * mLon, -(g.lat - city.lat) * mLat];
  const nameOf = (t?: Tags) => t?.["name:en"] || t?.name;

  const grid = new Grid(H);

  /* ---- road graph ---- */

  const hwWays = els.filter(
    (e): e is OsmWay =>
      e.type === "way" &&
      !!e.tags?.highway &&
      !!CLASS_OF[e.tags.highway] &&
      e.tags.area !== "yes" &&
      e.tags.tunnel !== "yes" &&
      e.tags.tunnel !== "building_passage" &&
      // Metro passages and their steps run below the street.
      !(Number(e.tags.layer) < 0) &&
      !!e.geometry
  );
  const use = new Map<number, number>();
  for (const w of hwWays) for (const id of w.nodes) use.set(id, (use.get(id) ?? 0) + 1);

  const nodes = new Map<string, MapNode>();
  let nextId = 1;
  const nodeAt = (p: Pt): number => {
    const key = `${Math.round(p[0] * 2)}:${Math.round(p[1] * 2)}`;
    let n = nodes.get(key);
    if (!n) {
      n = { id: nextId++, x: r1(p[0]), z: r1(p[1]) };
      nodes.set(key, n);
    }
    return n.id;
  };

  const roads: MapRoad[] = [];
  // Ramps and bridges carry traffic but nobody builds a shop on a flyover.
  const noFrontage = new Set<MapRoad>();
  for (const w of hwWays) {
    const rule = city.streets?.find((r) => r.match.test(nameOf(w.tags) ?? ""));
    const cls = rule?.as ?? CLASS_OF[w.tags!.highway];
    const size = roadSize(cls, city);
    if (rule?.w) size.w = rule.w;
    const oneway = w.tags!.oneway === "yes" || w.tags!.junction === "roundabout";
    const bridge = w.tags!.bridge === "yes" && Number(w.tags!.layer ?? 1) > 0;
    // Flyovers are left out: without modelled ramps nothing could get onto
    // them, and the street they cross is what the player walks.
    if (bridge && (cls === "trunk" || cls === "primary")) continue;
    // Split at shared nodes.
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      const shared = (use.get(w.nodes[i]) ?? 0) > 1;
      if (!shared && i !== w.nodes.length - 1) continue;
      const pts = w.geometry.slice(start, i + 1).map(P);
      start = i;
      for (const piece of clipPolyline(pts, H)) {
        const len = piece.reduce((acc, p, k) => (k ? acc + Math.hypot(p[0] - piece[k - 1][0], p[1] - piece[k - 1][1]) : 0), 0);
        if (len < 1) continue;
        const road: MapRoad = {
          cls,
          w: size.w,
          foot: size.foot,
          oneway,
          a: nodeAt(piece[0]),
          b: nodeAt(piece[piece.length - 1]),
          pts: piece.map(([x, z]) => [r1(x), r1(z)] as Pt),
          name: nameOf(w.tags),
          ...(rule?.surface ? { surface: rule.surface } : {}),
        };
        roads.push(road);
        if (w.tags!.highway.endsWith("_link") || bridge) noFrontage.add(road);
      }
    }
  }
  for (const r of roads) grid.stroke(r.pts, r.w / 2 + r.foot + 0.4, ROAD);

  /* ---- areas ---- */

  const areas: MapArea[] = [];
  /** Outer rings with their holes: a gurdwara complex is a ring of
   *  buildings round a courtyard, a tank has an island in it. */
  const ringsOf = (e: OsmEl): { outer: Pt[]; holes: Pt[][] }[] => {
    if (e.type === "way") return e.geometry?.length ? [{ outer: e.geometry.map(P), holes: [] }] : [];
    if (e.type === "relation") {
      const role = (r: string) =>
        assembleRings(e.members.filter((m) => m.role === r && m.geometry).map((m) => m.geometry!.map(P)));
      const outers = role("outer").map((outer) => ({ outer, holes: [] as Pt[][] }));
      for (const inner of role("inner")) {
        const home = outers.find((o) => pointInPolygon(inner[0], o.outer));
        if (home) home.holes.push(inner);
      }
      return outers;
    }
    return [];
  };
  const clipRings = (r: { outer: Pt[]; holes: Pt[][] }) => ({
    outer: clipPolygon(r.outer, H),
    holes: r.holes.map((h) => clipPolygon(h, H)).filter((h) => h.length >= 3),
  });
  const round = (ring: Pt[]) => ring.map(([x, z]) => [r1(x), r1(z)] as Pt);
  const areaKind = (t: Tags): MapArea["kind"] | null => {
    if (t.natural === "water" || t.waterway === "riverbank" || t.water) return "water";
    if (t.natural === "beach" || t.natural === "sand") return "beach";
    if (t.leisure === "pitch") return "pitch";
    if (
      t.leisure === "park" ||
      t.leisure === "garden" ||
      t.landuse === "grass" ||
      t.landuse === "recreation_ground" ||
      t.natural === "wood" ||
      t.natural === "scrub"
    )
      return "park";
    if (t.amenity === "marketplace") return "market";
    if (t.place === "square" || (t.highway === "pedestrian" && t.area === "yes")) return "plaza";
    return null;
  };
  for (const e of els) {
    if (e.type === "node" || !e.tags) continue;
    if (e.tags.building) continue;
    const kind = areaKind(e.tags);
    if (!kind) continue;
    for (const rings of ringsOf(e)) {
      const { outer, holes } = clipRings(rings);
      if (outer.length < 3 || Math.abs(polygonArea(outer)) < 12) continue;
      areas.push({
        kind,
        pts: round(outer),
        ...(holes.length ? { holes: holes.map(round) } : {}),
        name: nameOf(e.tags),
      });
    }
  }

  // Canals mapped only as a centreline get a channel of their own.
  for (const e of els) {
    if (e.type !== "way" || !e.geometry || !e.tags) continue;
    if (e.tags.waterway !== "canal" && e.tags.waterway !== "river") continue;
    const width = e.tags.waterway === "river" ? 30 : 14;
    for (const piece of clipPolyline(e.geometry.map(P), H)) {
      areas.push({ kind: "water", pts: ribbon(piece, width).map(([x, z]) => [r1(x), r1(z)] as Pt) });
    }
  }

  // The sea: from the coastline where the extract has one (land on the left,
  // per OSM convention), otherwise past the configured edge.
  const coast = els.filter((e): e is OsmWay => e.type === "way" && e.tags?.natural === "coastline" && !!e.geometry);
  const seaPoly = coast.length ? seaFromCoast(assembleLines(coast.map((w) => w.geometry.map(P))), H) : null;
  if (seaPoly) areas.push({ kind: "sea", pts: seaPoly.map(([x, z]) => [r1(x), r1(z)] as Pt) });
  else if (city.sea) {
    const s = city.sea === "east" ? 1 : -1;
    // A strip the width of a beach past the edge; the renderer carries the
    // sea on out to the horizon.
    areas.push({ kind: "sea", pts: [[s * H, -H], [s * (H + 400), -H], [s * (H + 400), H], [s * H, H]] });
  }

  // Bridges: wherever a road crosses water, its corridor over the water
  // stays walkable (the Buckingham Canal's crossings on the way to the
  // Marina). The road itself is drawn over the water.
  for (const a of areas) {
    if (a.kind !== "water") continue;
    const inWater = (x: number, z: number) => pointInRing(x, z, a.pts) && !(a.holes ?? []).some((h) => pointInRing(x, z, h));
    const bridges: Bridge[] = [];
    for (const r of roads) {
      if (r.cls === "steps") continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [p, q] = [r.pts[i], r.pts[i + 1]];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (L < 0.1) continue;
        const cuts = [0, ...[a.pts, ...(a.holes ?? [])].flatMap((ring) => crossings(ring, p, q).map((h) => h.s)), 1].sort((x, y) => x - y);
        for (let k = 0; k < cuts.length - 1; k++) {
          const [s0, s1] = [cuts[k], cuts[k + 1]];
          const sm = (s0 + s1) / 2;
          if (s1 - s0 < 1e-6 || !inWater(p[0] + (q[0] - p[0]) * sm, p[1] + (q[1] - p[1]) * sm)) continue;
          // Over the water, and a metre and a half onto each bank.
          const half = ((s1 - s0) * L) / 2 + 1.5;
          bridges.push({
            x: r1(p[0] + (q[0] - p[0]) * sm),
            z: r1(p[1] + (q[1] - p[1]) * sm),
            hw: r1(Math.max(1.5, r.w / 2 + r.foot)),
            hd: r1(half),
            rot: +Math.atan2(q[0] - p[0], q[1] - p[1]).toFixed(3),
          });
        }
      }
    }
    if (bridges.length) a.bridges = bridges;
  }

  for (const a of areas) {
    if (a.kind === "sea") continue;
    grid.fill(a.pts, AREA, a.holes);
  }
  if (seaPoly) grid.fill(seaPoly, AREA);

  /* ---- rail ---- */

  const rails: MapRail[] = [];
  for (const e of els) {
    if (e.type !== "way" || !e.geometry || !e.tags?.railway) continue;
    const k = e.tags.railway as RailKind;
    if (!["rail", "subway", "light_rail", "tram", "monorail"].includes(k)) continue;
    const underground = e.tags.tunnel === "yes" || Number(e.tags.layer ?? 0) < 0;
    const elevated = e.tags.bridge === "yes" || e.tags.bridge === "viaduct" || Number(e.tags.layer ?? 0) > 0;
    for (const piece of clipPolyline(e.geometry.map(P), H)) {
      rails.push({ kind: k, elevated, underground, pts: piece.map(([x, z]) => [r1(x), r1(z)] as Pt) });
      // Ground-level mainline claims a corridor; trams run in the road.
      if (k === "rail" && !underground && !elevated) grid.stroke(piece, 4.2, AREA);
    }
  }
  // Platforms.
  for (const e of els) {
    if (e.type !== "way" || !e.geometry || e.tags?.railway !== "platform") continue;
    for (const piece of clipPolyline(e.geometry.map(P), H)) grid.stroke(piece, 3, AREA);
  }

  /* ---- points of interest ---- */

  const pois: MapPoi[] = [];
  const poiKind = (t: Tags): PoiKind | null => {
    if (t.highway === "bus_stop" || t.public_transport === "platform") return "bus_stop";
    if (t.amenity === "place_of_worship") return "worship";
    if (t.amenity === "taxi") return "taxi";
    if (t.amenity === "marketplace") return "market";
    if (t.railway === "station" || t.railway === "halt") return "station";
    if (t.railway === "subway_entrance") return "subway_entrance";
    if (t.amenity === "fuel") return "fuel";
    if (t.amenity === "restaurant" || t.amenity === "cafe" || t.amenity === "fast_food") return "food";
    if (t.shop) return "shop";
    return null;
  };
  for (const e of els) {
    if (e.type !== "node" || !e.tags) continue;
    const kind = poiKind(e.tags);
    if (!kind) continue;
    const [x, z] = P(e);
    if (Math.abs(x) > H || Math.abs(z) > H) continue;
    pois.push({ kind, x: r1(x), z: r1(z), name: nameOf(e.tags), religion: e.tags.religion });
  }

  /* ---- landmarks and OSM buildings ---- */

  const landmarks: MapLandmark[] = [];
  const buildings: MapBuilding[] = [];
  const claimed = new Set<string>();
  const ruleFor = (name: string | undefined) => (name ? city.landmarks.find((r) => r.match.test(name)) : undefined);

  // Largest footprint first, so a relation's outline wins over its parts.
  const footprints = els
    .filter((e) => e.type !== "node" && e.tags && (e.tags.building || ruleFor(nameOf(e.tags))))
    .flatMap((e) => ringsOf(e).map((rings) => ({ e, ...clipRings(rings) })))
    .filter((f) => f.outer.length >= 3)
    .sort((a, b) => Math.abs(polygonArea(b.outer)) - Math.abs(polygonArea(a.outer)));

  /** Turn a civic front (cinema marquee, church door) to its nearest street. */
  const towardStreet = <B extends { x: number; z: number; rot: number; w: number; d: number }>(box: B): B => {
    let best: ReturnType<typeof nearestOnPolyline> | null = null;
    for (const r of roads) {
      if (r.cls === "footway" || r.cls === "steps") continue;
      const n = nearestOnPolyline(r.pts, [box.x, box.z]);
      if (!best || n.dist < best.dist) best = n;
    }
    if (!best) return box;
    const bearing = (Math.atan2(best.pt[0] - box.x, -(best.pt[1] - box.z)) * 180) / Math.PI;
    return facing(box, bearing);
  };

  for (const { e, outer: ring, holes } of footprints) {
    const name = nameOf(e.tags);
    const rule = ruleFor(name);
    // A landmark the map edge has cut to a sliver is just a building here.
    const cutByEdge = ring.some(([x, z]) => Math.abs(x) >= H - 0.5 || Math.abs(z) >= H - 0.5);
    const sliver = cutByEdge && Math.min(orientedBox(ring).w, orientedBox(ring).d) < 6;
    if (rule && name && !sliver && !claimed.has(`${rule.model}:${name.toLowerCase()}`)) {
      claimed.add(`${rule.model}:${name.toLowerCase()}`);
      const faces = rule.faces ?? MODEL_FACES[rule.model];
      const box =
        faces !== undefined
          ? facing(orientedBox(ring), faces)
          : FACE_STREET.has(rule.model)
            ? towardStreet(orientedBox(ring))
            : orientedBox(ring);
      landmarks.push({ model: rule.model, name, x: r1(box.x), z: r1(box.z), rot: +box.rot.toFixed(3), w: r1(box.w), d: r1(box.d) });
      grid.markBox(box.x, box.z, box.rot, box.w + 2, box.d + 2, BUILT);
      continue;
    }
    if (!e.tags?.building) continue;
    const area = Math.abs(polygonArea(ring)) - holes.reduce((a, h) => a + Math.abs(polygonArea(h)), 0);
    if (area < 15) continue;
    const levels = Number(e.tags["building:levels"]);
    const canopy = e.tags.building === "roof";
    const h = canopy
      ? 5
      : Number.isFinite(levels) && levels > 0
        ? levels * 3.2 + 1
        : Math.min(18, 5 + Math.sqrt(area) * 0.35);
    buildings.push({
      pts: round(ring),
      ...(holes.length ? { holes: holes.map(round) } : {}),
      h: r1(h),
      name,
      ...(canopy ? { canopy: true as const } : {}),
    });
    grid.fill(ring, BUILT, holes);
  }

  // Landmarks mapped only as points. The node is wherever the mapper
  // clicked, often mid-block: a shrine or a small temple is brought up to
  // its street, front on the kerb. Islands and gateways stay put, in or over
  // the road where they really are.
  for (const e of els) {
    if (e.type !== "node") continue;
    const name = nameOf(e.tags);
    const rule = ruleFor(name);
    if (!rule || !name || claimed.has(`${rule.model}:${name.toLowerCase()}`)) continue;
    let [x, z] = P(e);
    if (Math.abs(x) > H - 5 || Math.abs(z) > H - 5) continue;
    // Placed and fenced at the size its model really is.
    const [w, d] = modelExtent(rule.model, ...(rule.size ?? [10, 10]));
    // The same place again as a point, beside its own footprint.
    if (landmarks.some((l) => l.model === rule.model && Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d) / 2 + 15)) continue;
    claimed.add(`${rule.model}:${name.toLowerCase()}`);
    let rot = 0;
    let street: { r: MapRoad; n: ReturnType<typeof nearestOnPolyline> } | null = null;
    for (const r of roads) {
      if (r.cls === "footway" || r.cls === "steps") continue;
      const n = nearestOnPolyline(r.pts, [x, z]);
      if (!street || n.dist < street.n.dist) street = { r, n };
    }
    if (street) {
      const { r, n } = street;
      if (!IN_THE_ROAD.has(rule.model) && n.dist < 40) {
        const back = r.w / 2 + r.foot + d / 2 + 0.6;
        const ux = (x - n.pt[0]) / (n.dist || 1);
        const uz = (z - n.pt[1]) / (n.dist || 1);
        x = n.pt[0] + ux * back;
        z = n.pt[1] + uz * back;
      }
      rot = Math.atan2(n.pt[0] - x, n.pt[1] - z);
    }
    landmarks.push({ model: rule.model, name, x: r1(x), z: r1(z), rot: +rot.toFixed(3), w, d });
    grid.markBox(x, z, rot, w + 2, d + 2, BUILT);
  }

  // Set pieces OSM doesn't map, beside their street (the stretch nearest
  // the named landmark, else the longest), long side along it.
  for (const piece of city.setPieces ?? []) {
    const anchor = piece.near ? landmarks.find((l) => piece.near!.test(l.name)) : undefined;
    if (piece.near && !anchor) throw new Error(`${city.id}: set piece landmark ${piece.near} not in the extract`);
    const candidates = roads.filter((r) => r.cls !== "footway" && r.cls !== "steps" && piece.on.test(r.name ?? ""));
    const street = anchor
      ? candidates.sort((a, b) => nearestOnPolyline(a.pts, [anchor.x, anchor.z]).dist - nearestOnPolyline(b.pts, [anchor.x, anchor.z]).dist)[0]
      : candidates.sort((a, b) => polylineLength(b.pts) - polylineLength(a.pts))[0];
    if (!street) throw new Error(`${city.id}: set piece street ${piece.on} not in the extract`);
    const [w, d] = piece.size;
    const L = polylineLength(street.pts);
    // Near the landmark's end, clear of the junction.
    const along = anchor ? Math.min(L / 2, Math.max(12, nearestOnPolyline(street.pts, [anchor.x, anchor.z]).along)) : L / 2;
    const n = nearestOnPolyline(street.pts, pointAlong(street.pts, along));
    const off = street.w / 2 + street.foot + w / 2 + 0.4;
    const x = n.pt[0] - n.dir[1] * off;
    const z = n.pt[1] + n.dir[0] * off;
    const rot = Math.atan2(n.dir[0], n.dir[1]);
    landmarks.push({ model: piece.model, name: piece.name, x: r1(x), z: r1(z), rot: +rot.toFixed(3), w, d });
    grid.markBox(x, z, rot, w + 2, d + 2, BUILT);
  }

  // A pavilion on a tank's island.
  if (city.islandPavilion) {
    const ip = city.islandPavilion;
    const tank = areas.find((a) => a.kind === "water" && ip.water.test(a.name ?? ""));
    const island = tank?.holes?.[0];
    if (!tank || !island) throw new Error(`${city.id}: no island in ${ip.water}`);
    const box = orientedBox(island);
    // The island is the pavilion's alone.
    grid.fill(island, RESERVED);
    landmarks.push({ model: "jalamandira", name: ip.name, x: r1(box.x), z: r1(box.z), rot: +box.rot.toFixed(3), w: r1(box.w), d: r1(box.d) });
  }

  // A model smaller than its footprint that would stand in water (Gurdwara
  // Santokhsar's footprint is its whole compound, sarovar and all) moves to
  // the dry ground nearest the middle, and its footprint shrinks to the model.
  {
    const water = areas.filter((a) => a.kind === "water" || a.kind === "sea");
    for (const l of landmarks) {
      const [mw, md] = modelExtent(l.model, l.w, l.d);
      if (mw >= l.w && md >= l.d) continue;
      const c = Math.cos(l.rot);
      const sn = Math.sin(l.rot);
      const world = (u: number, v: number): Pt => [l.x + u * c + v * sn, l.z - u * sn + v * c];
      // (A tank within the model's own footprint is its hauz, and goes.)
      const own = (a: MapArea) =>
        a.pts.every(([x, z]) => Math.abs((x - l.x) * c - (z - l.z) * sn) < mw / 2 && Math.abs((x - l.x) * sn + (z - l.z) * c) < md / 2);
      const wet = (x: number, z: number) =>
        water.some((a) => !own(a) && pointInRing(x, z, a.pts) && !(a.holes ?? []).some((h) => pointInRing(x, z, h)));
      const dry = (u0: number, v0: number) => {
        for (let u = -mw / 2 - 2; u <= mw / 2 + 2; u += 2) for (let v = -md / 2 - 2; v <= md / 2 + 2; v += 2) if (wet(...world(u0 + u, v0 + v))) return false;
        return true;
      };
      if (dry(0, 0)) continue;
      let best: [number, number] | null = null;
      for (let u = -(l.w - mw) / 2; u <= (l.w - mw) / 2; u += 2) {
        for (let v = -(l.d - md) / 2; v <= (l.d - md) / 2; v += 2) {
          if ((!best || Math.hypot(u, v) < Math.hypot(...best)) && dry(u, v)) best = [u, v];
        }
      }
      if (!best) throw new Error(`${city.id}: ${l.name} has no dry ground in its footprint`);
      const [x, z] = world(...best);
      Object.assign(l, { x: r1(x), z: r1(z), w: mw, d: md });
    }
  }

  // The models replace the OSM buildings under them (a mosque's own gates
  // and prayer hall, mapped as buildings, would otherwise wall off its
  // courtyard); the rest of a big compound keeps its real buildings.
  // (A bus stand, a memorial garden or a promenade is open ground hosting
  // real buildings: its platform roofs and pavilions stay.)
  const HOSTS_BUILDINGS = new Set(["bus_station", "memorial_garden", "promenade", "fishing_nets"]);
  const underModel = (x: number, z: number) =>
    landmarks.some((l) => {
      if (HOSTS_BUILDINGS.has(l.model)) return false;
      const [mw, md] = modelExtent(l.model, l.w, l.d);
      const c = Math.cos(l.rot);
      const s = Math.sin(l.rot);
      const u = (x - l.x) * c - (z - l.z) * s;
      const v = (x - l.x) * s + (z - l.z) * c;
      return Math.abs(u) < mw / 2 + 1 && Math.abs(v) < md / 2 + 1;
    });
  for (let i = buildings.length - 1; i >= 0; i--) {
    const [cx, cz] = centroid(buildings[i].pts);
    if (underModel(cx, cz)) buildings.splice(i, 1);
  }
  // Likewise a mosque's hauz: the model has its own ablution tank.
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i];
    if (a.kind === "water" && a.pts.every(([x, z]) => underModel(x, z))) areas.splice(i, 1);
  }

  // A temple in a tank inside a ring of buildings (the Golden Temple): the
  // ring becomes an arcade with gates, and a causeway is cut through the
  // water to the island, so the parikrama opens on the city and the sanctum
  // on the parikrama.
  let precinct: Precinct | undefined;
  if (city.pool) {
    const pool = city.pool;
    const water = areas.find((a) => a.kind === "water" && pool.water.test(a.name ?? ""));
    if (!water) throw new Error(`${city.id}: pool ${pool.water} not in the extract`);
    const sanctum = landmarks.find((l) => pool.sanctum.test(l.name));
    if (!sanctum) throw new Error(`${city.id}: sanctum ${pool.sanctum} not in the extract`);
    const island = (water.holes ?? []).find((h) => pointInRing(sanctum.x, sanctum.z, h));
    if (!island) throw new Error(`${city.id}: ${sanctum.name} is not on an island in ${water.name}`);
    const nearRing = (p: Pt, ring: Pt[]) =>
      ring.some((q, i) => nearestOnPolyline([q, ring[(i + 1) % ring.length]], p).dist < 2);
    const onIsland = (p: Pt) => pointInRing(p[0], p[1], island) || nearRing(p, island);
    // The causeway: the path from dry land out onto the island.
    let way: { a: Pt; b: Pt } | undefined;
    for (const r of roads) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        for (const [a, b] of [[r.pts[i], r.pts[i + 1]], [r.pts[i + 1], r.pts[i]]] as const) {
          if (pointInRing(a[0], a[1], water.pts) || !onIsland(b)) continue;
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (!way || L < Math.hypot(way.b[0] - way.a[0], way.b[1] - way.a[1])) way = { a, b };
        }
      }
    }
    if (!way) throw new Error(`${city.id}: no path runs out to ${sanctum.name}`);
    const { a, b } = way;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // On past the island's edge, so the cut is clean.
    const into: Pt = [b[0] + ((b[0] - a[0]) / L) * 4, b[1] + ((b[1] - a[1]) / L) * 4];
    const CAUSEWAY_W = 6;
    const shore = water.pts;
    water.pts = round(keyhole(water.pts, island, a, into, CAUSEWAY_W));
    const rest = (water.holes ?? []).filter((h) => h !== island);
    if (rest.length) water.holes = rest;
    else delete water.holes;
    // The sanctum's doors on the causeway; the throne across it faces it.
    const turn = (l: MapLandmark, rot: number) => {
      const box = facing(l, 180 - (rot * 180) / Math.PI);
      Object.assign(l, { rot: +rot.toFixed(3), w: box.w, d: box.d });
    };
    turn(sanctum, Math.atan2(a[0] - sanctum.x, a[1] - sanctum.z));
    for (const l of landmarks) if (l.model === "akal_takht") turn(l, Math.atan2(sanctum.x - l.x, sanctum.z - l.z));
    // The ring of buildings round the tank.
    const ringAt = buildings.findIndex((bd) => (bd.holes ?? []).some((h) => pointInRing(sanctum.x, sanctum.z, h)));
    if (ringAt < 0) throw new Error(`${city.id}: no ring of buildings round ${water.name}`);
    const [ring] = buildings.splice(ringAt, 1);
    const inner = ring.holes!.find((h) => pointInRing(sanctum.x, sanctum.z, h))!;
    precinct = {
      outer: ring.pts,
      inner,
      gates: precinctGates(inner, roads.map((r) => r.pts), { a, b }),
      causeway: { a: [r1(a[0]), r1(a[1])], b: [r1(into[0]), r1(into[1])], w: CAUSEWAY_W },
    };
    // Marble underfoot, round the tank and under the arcade (the water is
    // drawn over it), and nothing else built or planted on it.
    areas.push({ kind: "plaza", pts: ring.pts, holes: [shore], name: "Parikrama" });
    grid.fill(ring.pts, RESERVED);
    // The parikrama is open marble: the blocks mapped on it (shrines under
    // trees, in truth) would stand as flats.
    for (let i = buildings.length - 1; i >= 0; i--) {
      const [cx, cz] = centroid(buildings[i].pts);
      if (pointInRing(cx, cz, inner)) buildings.splice(i, 1);
    }
  }

  // Every monument you walk into gets its door, and a clear way from the
  // door to the nearest street, so no plot is built across it.
  for (const l of landmarks) {
    if (!HAS_DOOR.has(l.model)) continue;
    // At the model's own front, which may stand in from the footprint's.
    const [, md] = modelExtent(l.model, l.w, l.d);
    const door = frontOf({ ...l, d: md }, 1.5);
    l.door = [r1(door[0]), r1(door[1])];
    let best: ReturnType<typeof nearestOnPolyline> | null = null;
    for (const r of roads) {
      if (r.cls === "steps") continue;
      const n = nearestOnPolyline(r.pts, door);
      if (!best || n.dist < best.dist) best = n;
    }
    if (best && best.dist < 80) grid.stroke([door, best.pt], 2.5, RESERVED);
  }

  /* ---- spawn and task spots ---- */

  const walkable = (r: MapRoad) => r.cls !== "footway" && r.cls !== "steps";
  const landmarkNamed = (re: RegExp) => landmarks.find((l) => re.test(l.name));

  /** A standing spot at the kerb of the nearest street to `p`, facing `p`. */
  /** No building between (x, z) and `p`, up to `reach` short of `p`. */
  const inSight = (x: number, z: number, p: Pt, reach: number) => {
    const L = Math.hypot(p[0] - x, p[1] - z);
    for (let t = 1; t < L - reach; t += 0.5) {
      if (grid.get(x + ((p[0] - x) * t) / L, z + ((p[1] - z) * t) / L) === BUILT) return false;
    }
    return true;
  };

  const kerbSpot = (
    p: Pt,
    filter: (r: MapRoad) => boolean,
    minDist = 0,
    avoid: Spot[] = [],
    clearance = 0,
    opts: { avoidR?: number; sight?: number; sightTo?: Pt } = {}
  ): Spot => {
    const spot = kerbSpotOrNull(p, filter, minDist, avoid, clearance, opts);
    if (!spot) throw new Error(`${city.id}: no street near (${p[0]}, ${p[1]})`);
    return spot;
  };

  function kerbSpotOrNull(
    p: Pt,
    filter: (r: MapRoad) => boolean,
    minDist: number,
    avoid: Spot[],
    clearance: number,
    opts: { avoidR?: number; sight?: number; sightTo?: Pt }
  ): Spot | null {
    let best: { spot: Spot; d: number } | null = null;
    for (const r of roads) {
      if (!filter(r)) continue;
      const n = nearestOnPolyline(r.pts, p);
      // Step out of the carriageway onto the footpath or lane edge, on the
      // side facing the target.
      const nx = -n.dir[1];
      const nz = n.dir[0];
      const side = (p[0] - n.pt[0]) * nx + (p[1] - n.pt[1]) * nz >= 0 ? 1 : -1;
      const off = r.foot > 0 ? r.w / 2 + r.foot / 2 : Math.max(0, r.w / 2 - 1.2);
      const x = n.pt[0] + nx * side * off;
      const z = n.pt[1] + nz * side * off;
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < minDist) continue;
      // Well inside the map: a set piece on the edge has nowhere to come from.
      if (Math.abs(x) > H - 25 || Math.abs(z) > H - 25) continue;
      // Never inside a building: some service roads run straight through
      // real footprints (Majestic's bus stand). With `clearance`, not against
      // one either.
      if (grid.near(x, z, clearance, BUILT)) continue;
      // Keep clear of spots already taken, so two set pieces never share a kerb.
      if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < (opts.avoidR ?? 12))) continue;
      if (opts.sight !== undefined && !inSight(x, z, opts.sightTo ?? p, opts.sight)) continue;
      if (!best || d < best.d) best = { spot: { x: r1(x), z: r1(z), yaw: +Math.atan2(p[0] - x, p[1] - z).toFixed(3) }, d };
    }
    return best?.spot ?? null;
  }

  const spawnMark = landmarkNamed(city.spawnNear);
  if (!spawnMark) throw new Error(`${city.id}: spawn landmark ${city.spawnNear} not in the extract`);
  // Task spots are laid out round the spawn landmark; the spawn itself is
  // placed last, on a kerb of its own facing the landmark.
  const spawn: Spot = { x: spawnMark.x, z: spawnMark.z, yaw: 0 };

  // Temple: at the landmark's street entrance, or a new wayside shrine.
  let templeSpot: Spot;
  if (city.temple) {
    const t = landmarkNamed(city.temple);
    if (!t) throw new Error(`${city.id}: temple ${city.temple} not in the extract`);
    // Any path will do: the way into a temple compound is often a footway
    // (the Golden Temple's parikrama), not a street.
    // With a known entrance, at the kerb in front of it.
    const templeRule = city.landmarks.find((r) => r.match.test(t.name));
    // A sanctum in a tank: on the causeway, before its door.
    const onCauseway = (): Spot => {
      const [x, z] = frontOf(t, 2);
      return { x: r1(x), z: r1(z), yaw: +(t.rot + Math.PI).toFixed(3) };
    };
    templeSpot = precinct
      ? onCauseway()
      : templeRule?.faces === undefined
        ? kerbSpot([t.x, t.z], () => true, Math.min(t.w, t.d) / 2)
        : kerbSpot(frontOf(t, 4), () => true, 0);
  } else {
    const road = roads.filter((r) => city.shrineOn!.test(r.name ?? ""));
    if (!road.length) throw new Error(`${city.id}: shrine road ${city.shrineOn} not in the extract`);
    const onRoad = kerbSpot([spawn.x + 40, spawn.z + 40], (r) => road.includes(r));
    // The shrine stands just behind the stall, off the footpath.
    const [shw, shd] = modelExtent("shrine", 5, 5);
    const sx = onRoad.x + Math.sin(onRoad.yaw) * (shd / 2 + 2);
    const sz = onRoad.z + Math.cos(onRoad.yaw) * (shd / 2 + 2);
    const shrine: MapLandmark = { model: "shrine", name: "Wayside mandir", x: r1(sx), z: r1(sz), rot: +(onRoad.yaw + Math.PI).toFixed(3), w: shw, d: shd };
    const door = frontOf(shrine, 1.5);
    shrine.door = [r1(door[0]), r1(door[1])];
    landmarks.push(shrine);
    grid.markBox(sx, sz, onRoad.yaw, shw + 2, shd + 2, BUILT);
    templeSpot = onRoad;
  }

  // The city's own errands: at the named place, on the nearest path to it.
  const errandSpots: Record<string, Spot> = {};
  for (const e of city.errands ?? []) {
    // A monument you walk into: at its door.
    const monument = landmarks.find((l) => e.at.test(l.name) && l.door);
    const named =
      pois.find((p) => p.name && e.at.test(p.name)) ??
      landmarks.find((l) => e.at.test(l.name)) ??
      areas.find((a) => a.name && e.at.test(a.name));
    let target: Pt | null = null;
    if (monument) {
      target = monument.door!;
    } else if (named && "pts" in named) {
      // An area (a beach, a market): stand at its edge nearest the spawn.
      target = named.pts.reduce((best, p) =>
        Math.hypot(p[0] - spawn.x, p[1] - spawn.z) < Math.hypot(best[0] - spawn.x, best[1] - spawn.z) ? p : best
      );
    } else if (named) {
      target = [named.x, named.z];
    } else {
      const road = roads.find((r) => r.name && e.at.test(r.name));
      if (road) target = road.pts[Math.floor(road.pts.length / 2)];
    }
    if (!target) {
      // Anything else OSM has a name for: a station stop, a ticket hall.
      for (const el of els) {
        if (!el.tags || !e.at.test(nameOf(el.tags) ?? "")) continue;
        const pts = el.type === "node" ? [P(el)] : el.type === "way" && el.geometry ? el.geometry.map(P) : [];
        if (!pts.length) continue;
        const c = centroid(pts);
        if (Math.abs(c[0]) < H - 20 && Math.abs(c[1]) < H - 20) {
          target = c;
          break;
        }
      }
    }
    if (!target) throw new Error(`${city.id}: errand ${e.id} place ${e.at} not in the extract`);
    // The place is often a building of its own (the Golden Temple's langar
    // hall) and the nearest path hugs its wall: keep the host, and a ticket
    // booth backed onto the place, off the wall.
    errandSpots[e.id] = kerbSpot(target, (r) => !e.street || (r.cls !== "footway" && r.cls !== "steps"), 0, [templeSpot, ...Object.values(errandSpots)], 2.5);
  }


  const shopRoads = roads.filter((r) => city.shopStreet.test(r.name ?? ""));
  if (!shopRoads.length) throw new Error(`${city.id}: shop street ${city.shopStreet} not in the extract`);
  // Errands spread over the district, not bunched at the spawn: each staple
  // goes to the candidate farthest from everything placed so far (up to a
  // couple of hundred metres; beyond that, nearer the spawn is better), well
  // in from the map's edge.
  const SPREAD = 200;
  const placed: Pt[] = [[spawn.x, spawn.z], [templeSpot.x, templeSpot.z], ...Object.values(errandSpots).map((e): Pt => [e.x, e.z])];
  const spread = (p: Pt) =>
    Math.min(SPREAD, ...placed.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))) - 0.15 * Math.hypot(p[0] - spawn.x, p[1] - spawn.z);
  const wellIn = (p: Pt) => Math.abs(p[0]) < H - 60 && Math.abs(p[1]) < H - 60;
  const alongRoads = (rs: MapRoad[], step: number): Pt[] =>
    rs.flatMap((r) => {
      const L = polylineLength(r.pts);
      return Array.from({ length: Math.max(1, Math.floor(L / step)) }, (_, k) => pointAlong(r.pts, (k + 0.5) * (L / Math.max(1, Math.floor(L / step)))));
    }).filter(wellIn);
  const farthest = (pts: Pt[]): Pt | null => (pts.length ? pts.reduce((a, b) => (spread(b) > spread(a) ? b : a)) : null);
  const allErrands = () => [templeSpot, ...Object.values(errandSpots)];

  const shopAt = farthest(alongRoads(shopRoads, 10));
  if (!shopAt) throw new Error(`${city.id}: shop street ${city.shopStreet} runs only along the map's edge`);
  const shopSpot = kerbSpot(shopAt, (r) => shopRoads.includes(r), 0, allErrands());
  placed.push([shopSpot.x, shopSpot.z]);

  const major = (r: MapRoad) => ["trunk", "primary", "secondary", "tertiary", "unclassified"].includes(r.cls);
  /** Streets a vehicle can wait on: not a footpath or a pedestrian street. */
  const drivable = (r: MapRoad) => walkable(r) && r.cls !== "pedestrian";
  /** A kerb on a main road if there is one within reach, else the nearest
   *  lane: buses and autos wait where the traffic is, but not 400m away. */
  const roadside = (p: Pt, minDist: number, avoid: Spot[]) => {
    const onMajor = roads.some(major) ? kerbSpot(p, major, minDist, avoid) : null;
    if (onMajor && Math.hypot(onMajor.x - p[0], onMajor.z - p[1]) < 60) return onMajor;
    return kerbSpot(p, drivable, minDist, avoid);
  };
  const taken = [...allErrands(), shopSpot];
  /** A stop on a street a bus can use, if one is within reach. */
  const busStop = (p: Pt, minDist: number) => {
    const wide = (r: MapRoad) => r.w >= 7.5 && r.cls !== "pedestrian" && r.cls !== "footway" && r.cls !== "steps";
    if (roads.some(wide)) {
      const s = kerbSpot(p, wide, minDist, taken);
      if (Math.hypot(s.x - p[0], s.z - p[1]) < 60) return s;
    }
    return roadside(p, minDist, taken);
  };
  // The bus pulls in on the left and has to drive on from there: a stop on
  // a one-way stretch that runs off the map (Delhi's, north of Chandni
  // Chowk) would be a ride to nowhere.
  const routeMap = { nodes: [...nodes.values()], roads } as unknown as MapData;
  const busLeaves = (st: Spot) => {
    let q: { dir: Pt; pt: Pt; dist: number } | null = null;
    for (const r of roads) {
      if (!drivable(r)) continue;
      const n = nearestOnPolyline(r.pts, [st.x, st.z]);
      if (!q || n.dist < q.dist) q = n;
    }
    if (!q) return false;
    // Keep left: the kerb is on the left of travel, left = (dz, -dx).
    const left = (st.x - q.pt[0]) * q.dir[1] - (st.z - q.pt[1]) * q.dir[0];
    const sgn = left >= 0 ? 1 : -1;
    const tx = st.x + q.dir[0] * sgn * 250;
    const tz = st.z + q.dir[1] * sgn * 250;
    const leaves = [7.5, 6, 5].some((w) => {
      const path = planRoute(routeMap, st.x, st.z, tx, tz, w, 2);
      return !!path && polylineLength(path) >= 150;
    });
    // And one can get there: as rides.ts brings it in, from a junction a
    // couple of blocks back, ending at the stop.
    const arrives = [...nodes.values()]
      .map((n) => ({ n, d: Math.hypot(n.x - st.x, n.z - st.z) }))
      .filter((q) => q.d > 90 && q.d < 170)
      .some(({ n }) =>
        [7.5, 6, 5].some((w) => {
          const path = planRoute(routeMap, n.x, n.z, st.x, st.z, w, 2);
          if (!path) return false;
          const [ex, ez] = path[path.length - 1];
          return Math.hypot(ex - st.x, ez - st.z) <= 15 && polylineLength(path) <= 300;
        })
      );
    return leaves && arrives;
  };
  // At the city's bus stand when it has one (Kempegowda); else the real
  // stops, the most out-of-the-way first, then kerbs on the main roads.
  const stand = city.busNear ? landmarks.find((l) => city.busNear!.test(l.name)) : undefined;
  if (city.busNear && !stand) throw new Error(`${city.id}: bus stand ${city.busNear} not in the extract`);
  const byspread = (pts: Pt[]) => pts.filter(wellIn).sort((a, b) => spread(b) - spread(a));
  const busCandidates = [
    ...(stand ? [() => busStop(frontOf(stand, 6), 0)] : []),
    ...byspread(pois.filter((p) => p.kind === "bus_stop").map((p): Pt => [p.x, p.z])).map((p) => () => busStop(p, 0)),
    ...byspread(alongRoads(roads.filter(major), 25)).slice(0, 12).map((p) => () => busStop(p, 0)),
    () => busStop([spawn.x - 60, spawn.z + 30], 50),
    () => busStop([spawn.x + 60, spawn.z - 30], 50),
  ];
  let busSpot: Spot | null = null;
  for (const make of busCandidates) {
    const st = make();
    if (reachShare(routeMap, st.x, st.z, 4.2) >= 0.5 && busLeaves(st)) {
      busSpot = st;
      break;
    }
  }
  if (!busSpot) throw new Error(`${city.id}: no bus stop a bus can drive on from`);
  // The auto stand, likewise, has to be somewhere an auto can drive off
  // from to most of the district.
  placed.push([busSpot.x, busSpot.z]);
  const taxiPoi = farthest(pois.filter((p) => p.kind === "taxi").map((p): Pt => [p.x, p.z]).filter(wellIn));
  const autoAt: Pt =
    taxiPoi && spread(taxiPoi) > 80
      ? taxiPoi
      : farthest(alongRoads(roads.filter((r) => drivable(r) && r.w >= 4.2), 15)) ?? [spawn.x + 45, spawn.z - 20];
  const byDistance = roads
    .filter((r) => drivable(r) && r.w >= 4.2)
    .map((r) => ({ r, d: nearestOnPolyline(r.pts, autoAt).dist }))
    .sort((a, b) => a.d - b.d);
  // And rides from it drop you within a short walk of every other errand.
  const dropsNearAll = (st: Spot) =>
    [...taken, busSpot!].every((t) => {
      const path = planRoute(routeMap, st.x, st.z, t.x, t.z, 4.2, 1.6, { closest: true });
      if (!path || path.length < 2) return false;
      const [ex, ez] = path[path.length - 1];
      return Math.hypot(ex - t.x, ez - t.z) < 150;
    });
  let autoSpot: Spot | null = null;
  // Main roads within reach first (autos wait where the traffic is), then
  // any street, nearest first.
  for (const pass of [(r: MapRoad) => major(r), () => true]) {
    for (const { r, d } of byDistance) {
      if (autoSpot || d > 150 || !pass(r)) continue;
      const st = kerbSpotOrNull(autoAt, (x) => x === r, 0, [...taken, busSpot], 0, {});
      if (st && reachShare(routeMap, st.x, st.z, 4.2) >= 0.5 && dropsNearAll(st)) autoSpot = st;
    }
  }
  if (!autoSpot) throw new Error(`${city.id}: no auto stand an auto can drive off from`);

  const spots: Record<TaskSpotKind, Spot> = { auto: autoSpot, bus: busSpot, temple: templeSpot, shop: shopSpot };
  // Stand where the landmark is in full view: across the street from its
  // front if nothing is in the way, else the nearest kerb round it.
  function spawnSpot(): Spot {
    const at: Pt = [spawnMark!.x, spawnMark!.z];
    const minDist = Math.max(spawnMark!.w, spawnMark!.d) / 2 + 8;
    const reach = Math.hypot(spawnMark!.w, spawnMark!.d) / 2 + 1.5;
    // Facing its entrance when the rule says where that is.
    const rule = city.landmarks.find((r) => r.match.test(spawnMark!.name));
    if (rule?.faces !== undefined) {
      const front = kerbSpotOrNull(frontOf(spawnMark!, 14), () => true, 0, [...Object.values(spots), ...Object.values(errandSpots)], 0, {
        avoidR: 8,
        sight: reach,
        sightTo: at,
      });
      if (front) return { ...front, yaw: +Math.atan2(at[0] - front.x, at[1] - front.z).toFixed(3) };
    }
    const inView = kerbSpotOrNull(at, () => true, minDist, [...Object.values(spots), ...Object.values(errandSpots)], 0, { avoidR: 8, sight: reach });
    if (inView) return inView;
    console.log(`${city.id}: no kerb with ${spawnMark!.name} in view; spawning at the nearest kerb`);
    return kerbSpot(at, () => true, minDist, [...Object.values(spots), ...Object.values(errandSpots)]);
  }
  Object.assign(
    spawn,
    // Footways count: the approach to a temple complex is often all paths.
    spawnSpot()
  );
  for (const s of [spawn, ...Object.values(spots), ...Object.values(errandSpots)]) grid.disc(s.x, s.z, 5, RESERVED);

  // The barber's lock-up: a gap in a street frontage near the spawn (the
  // bazaar street first), clear of the task spots, facing the street.
  const setPiecesClear = [spawn, ...Object.values(spots), ...Object.values(errandSpots)];
  const barber = frontageGap(BARBER_PLOT.hw * 2, BARBER_PLOT.hd * 2, setPiecesClear);
  if (!barber) throw new Error(`${city.id}: no frontage gap for the barber near the spawn`);
  grid.markBox(barber.x, barber.z, barber.yaw, BARBER_PLOT.hw * 2 + 0.6, BARBER_PLOT.hd * 2 + 0.6, BUILT);

  // The tricolour: the nearest park or plaza to the spawn, else open ground.
  const flag = flagSpot([...setPiecesClear, barber]);
  grid.disc(flag.x, flag.z, 2.5, RESERVED);

  /* ---- frontage fill ---- */

  /** A slot `w` wide and `d` deep against a street, front on the footpath,
   *  nearest the spawn: the bazaar street if it has room within 150m, else
   *  any street. Null if nothing fits. */
  function frontageGap(w: number, d: number, clearOf: Spot[]): Spot | null {
    const passes = [(r: MapRoad) => city.shopStreet.test(r.name ?? ""), () => true];
    for (const pass of passes) {
      let best: { spot: Spot; dist: number } | null = null;
      for (const r of roads) {
        if (r.cls === "footway" || r.cls === "steps" || r.cls === "pedestrian" || !pass(r)) continue;
        const L = polylineLength(r.pts);
        for (let s = 4; s < L - 4; s += 3) {
          const n = nearestOnPolyline(r.pts, pointAlong(r.pts, s));
          for (const side of [1, -1]) {
            const nx = -n.dir[1] * side;
            const nz = n.dir[0] * side;
            const back = r.w / 2 + r.foot + d / 2 + 0.6;
            const x = n.pt[0] + nx * back;
            const z = n.pt[1] + nz * back;
            const dist = Math.hypot(x - spawn.x, z - spawn.z);
            if (dist > 150 || (best && dist >= best.dist)) continue;
            if (Math.abs(x) > H - 30 || Math.abs(z) > H - 30) continue;
            if (clearOf.some((c) => Math.hypot(c.x - x, c.z - z) < 14)) continue;
            const yaw = Math.atan2(-nx, -nz);
            if (!grid.boxFree(x, z, yaw, w + 0.6, d + 0.6)) continue;
            best = { spot: { x: r1(x), z: r1(z), yaw: +yaw.toFixed(3) }, dist };
          }
        }
      }
      if (best) return best.spot;
    }
    return null;
  }

  /** The flagpole's spot: the middle of the nearest park or plaza (within
   *  120m) that has open ground there, else open ground near the spawn. */
  function flagSpot(clearOf: Spot[]): Spot {
    const open = (x: number, z: number) => {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const v = grid.get(x + dx, z + dz);
          if (v !== FREE && v !== AREA) return false;
        }
      }
      const wet = areas.some((a) => (a.kind === "water" || a.kind === "sea") && pointInRing(x, z, a.pts));
      // Not in a temple precinct's forecourts either.
      if (precinct && precinct.outer.some((q, i) => nearestOnPolyline([q, precinct!.outer[(i + 1) % precinct!.outer.length]], [x, z]).dist < 40)) return false;
      return !wet && Math.abs(x) < H - 20 && Math.abs(z) < H - 20 && !clearOf.some((c) => Math.hypot(c.x - x, c.z - z) < 6);
    };
    const greens = areas
      .filter((a) => a.kind === "park" || a.kind === "plaza")
      .map((a) => ({ a, c: centroid(a.pts) }))
      .filter(({ a, c }) => pointInRing(c[0], c[1], a.pts) && open(c[0], c[1]))
      .map(({ c }) => ({ c, d: Math.hypot(c[0] - spawn.x, c[1] - spawn.z) }))
      .filter(({ d }) => d < 120)
      .sort((p, q) => p.d - q.d);
    if (greens.length) return { x: r1(greens[0].c[0]), z: r1(greens[0].c[1]), yaw: 0 };
    for (let r = 10; r < 240; r += 2) {
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const x = spawn.x + Math.cos(a) * r;
        const z = spawn.z + Math.sin(a) * r;
        if (open(x, z)) return { x: r1(x), z: r1(z), yaw: 0 };
      }
    }
    throw new Error(`${city.id}: no open ground for the flag near the spawn`);
  }

  const rand = mulberry32(hashString(city.id));
  const plots: Plot[] = [];
  const fillable = (r: MapRoad) => r.cls !== "footway" && r.cls !== "steps" && !noFrontage.has(r);
  const range = ([a, b]: [number, number]) => a + rand() * (b - a);

  const waresOn = (r: MapRoad) => city.streets?.find((rule) => rule.wares && rule.match.test(r.name ?? ""))?.wares;
  for (const r of roads) {
    if (!fillable(r)) continue;
    const wares = waresOn(r);
    const front = r.w / 2 + r.foot + 0.45;
    for (const side of [1, -1]) {
      // Walk the polyline, dropping plots edge to edge along the frontage.
      let carry = rand() * 2;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const a = r.pts[k];
        const b = r.pts[k + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1) continue;
        const ux = (b[0] - a[0]) / L;
        const uz = (b[1] - a[1]) / L;
        const nx = -uz * side;
        const nz = ux * side;
        let t = carry;
        while (t < L - 2) {
          const w = Math.min(range(city.fill.width), L - t);
          if (w < 3) break;
          const cx = a[0] + ux * (t + w / 2);
          const cz = a[1] + uz * (t + w / 2);
          // Local +z faces the street: the inward normal points away from it.
          const rot = Math.atan2(-nx, -nz);
          let placed = false;
          for (const scale of [1, 0.75, 0.55]) {
            const d = Math.max(5, range(city.fill.depth) * scale);
            const px = cx + nx * (front + d / 2);
            const pz = cz + nz * (front + d / 2);
            if (!grid.boxFree(px, pz, rot, w - 0.2, d)) continue;
            const floors = Math.max(
              1,
              Math.round(range(city.fill.floors)) + (FLOOR_BONUS[r.cls] ?? 0) - (rand() < 0.2 ? 1 : 0)
            );
            plots.push({
              x: r1(px),
              z: r1(pz),
              rot: +rot.toFixed(3),
              w: r1(w - 0.15),
              d: r1(d),
              floors,
              front: rand() < city.fill.shop || !!wares,
              seed: Math.floor(rand() * 1e6),
              ...(wares ? { wares } : {}),
            });
            grid.markBox(px, pz, rot, w, d, BUILT);
            placed = true;
            break;
          }
          t += placed ? w : 1.5;
        }
        carry = Math.max(0, t - L);
      }
    }
  }

  // Back-fill block interiors: a continuous roofscape with courtyards and
  // light wells, no frontage detail. Several tries per cell at shrinking
  // sizes, so the gaps close up the way a real old city's do.
  const step = 7;
  for (let z = -H + step; z < H - step; z += step) {
    for (let x = -H + step; x < H - step; x += step) {
      if (rand() < city.fill.courtyards) continue;
      let px = 0, pz = 0, w = 0, d = 0, rot = 0, ok = false;
      for (const size of [9, 7, 5.5]) {
        w = size + rand() * 2;
        d = size + rand() * 2;
        px = x + (rand() - 0.5) * 3;
        pz = z + (rand() - 0.5) * 3;
        // Align with the nearest frontage plot so the roofs read as one grain.
        rot = nearestPlotRot(plots, px, pz);
        if (grid.boxFree(px, pz, rot, w, d)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      plots.push({
        x: r1(px),
        z: r1(pz),
        rot: +rot.toFixed(3),
        w: r1(w),
        d: r1(d),
        floors: Math.max(1, Math.round(range(city.fill.floors)) - 1),
        front: false,
        seed: Math.floor(rand() * 1e6),
      });
      grid.markBox(px, pz, rot, w, d, BUILT);
    }
  }

  // Real names over real shops: a named restaurant or shop inside a real
  // building gets a board on that building's street wall; otherwise it takes
  // the nearest street-front shop plot within reach.
  const named = pois
    .filter(
      (p) =>
        (p.kind === "food" || p.kind === "shop") &&
        p.name &&
        /\p{L}/u.test(p.name) &&
        p.name.length <= 28 &&
        !/entry|entrance|ticket|window|toilet|atm\b/i.test(p.name)
    )
    // The city errand's own place first (Mocambo), then out from the spawn.
    .map((p) => ({
      p,
      key: ((city.errands ?? []).some((e) => e.at.test(p.name!)) ? 0 : 1e6) + Math.hypot(p.x - spawn.x, p.z - spawn.z),
    }))
    .sort((a, b) => a.key - b.key)
    .map(({ p }) => p);
  const signed = new Set<Plot>();
  const boards: FacadeBoard[] = [];
  for (const p of named) {
    if (signed.size + boards.length >= MAX_NAMED_SIGNS) break;
    const home = buildings.find((b) => !b.canopy && pointInRing(p.x, p.z, b.pts));
    if (home) {
      const board = streetWall(home, p, roads);
      if (board && !boards.some((o) => Math.hypot(o.x - board.x, o.z - board.z) < board.w)) boards.push(board);
      continue;
    }
    let best: { plot: Plot; d: number } | null = null;
    for (const plot of plots) {
      if (!plot.front || signed.has(plot)) continue;
      const d = Math.hypot(plot.x - p.x, plot.z - p.z);
      if (d < 15 && (!best || d < best.d)) best = { plot, d };
    }
    if (!best) continue;
    best.plot.sign = p.name!.trim();
    signed.add(best.plot);
  }

  return {
    id: city.id,
    half: H,
    attribution: "Map data © OpenStreetMap contributors, ODbL 1.0",
    nodes: [...nodes.values()],
    roads,
    plots,
    buildings,
    landmarks,
    areas,
    rails,
    pois,
    spawn,
    spots,
    errandSpots,
    boards,
    barber,
    flag,
    ...(precinct ? { precinct } : {}),
  };
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function nearestPlotRot(plots: Plot[], x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (const p of plots) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = p.rot;
    }
  }
  return best;
}

/** A closed ribbon polygon of `width` along a polyline. */
function ribbon(pts: Pt[], width: number): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L;
    const nz = (b[0] - a[0]) / L;
    left.push([pts[i][0] + nx * width / 2, pts[i][1] + nz * width / 2]);
    right.push([pts[i][0] - nx * width / 2, pts[i][1] - nz * width / 2]);
  }
  return left.concat(right.reverse());
}

/** Joins open coastline ways end to end. */
function assembleLines(lines: Pt[][]): Pt[][] {
  const pool = lines.map((l) => [...l]);
  const out: Pt[][] = [];
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  while (pool.length) {
    let line = pool.shift()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (same(line[line.length - 1], p[0])) line = line.concat(p.slice(1));
        else if (same(p[p.length - 1], line[0])) line = p.concat(line.slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Sea polygon from a coastline crossing the square. OSM coastlines keep land
 * on the left, so the sea lies to the right of travel. In our frame (+x east,
 * +z south) "right of travel" is the counter-clockwise side, so after the
 * coastline we walk the square's boundary anticlockwise (as seen on the map)
 * from where it leaves back to where it came in.
 */
function seaFromCoast(lines: Pt[][], H: number): Pt[] | null {
  const pieces = lines.flatMap((l) => clipPolyline(l, H)).sort((a, b) => b.length - a.length);
  const coast = pieces[0];
  if (!coast || coast.length < 2) return null;
  const perim = (p: Pt): number => {
    // Parameter along the boundary going N edge west->east, E edge north->south,
    // S edge east->west, W edge south->north: clockwise on the map.
    const [x, z] = p;
    const e = 1e-3;
    if (Math.abs(z + H) < e) return x + H;
    if (Math.abs(x - H) < e) return 2 * H + (z + H);
    if (Math.abs(z - H) < e) return 4 * H + (H - x);
    return 6 * H + (H - z);
  };
  const corners: [number, Pt][] = [
    [2 * H, [H, -H]],
    [4 * H, [H, H]],
    [6 * H, [-H, H]],
    [8 * H, [-H, -H]],
  ];
  const start = coast[0];
  const end = coast[coast.length - 1];
  const tEnd = perim(end);
  const tStart = perim(start);
  // Map clockwise equals screen clockwise with z pointing down. Sea on the
  // right of travel means continuing clockwise from the exit.
  const poly: Pt[] = [...coast];
  let t = tEnd;
  const target = tStart > tEnd ? tStart : tStart + 8 * H;
  const walk = corners
    .flatMap(([c, p]) => [[c, p], [c + 8 * H, p]] as [number, Pt][])
    .filter(([c]) => c > t && c < target)
    .sort((a, b) => a[0] - b[0]);
  for (const [, p] of walk) poly.push(p);
  t = target;
  return poly;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  const cities = only ? OSM_CITIES.filter((c) => c.id === only) : OSM_CITIES;
  if (only && !cities.length) throw new Error(`unknown district ${only}`);
  for (const city of cities) {
    const map = compile(city);
    const json = JSON.stringify(map);
    writeFileSync(join(OUT, `${city.id}.json`), json);
    const count = (k: string) => map.pois.filter((p) => p.kind === k).length;
    console.log(
      `${city.id}: ${map.roads.length} roads, ${map.plots.length} plots (${map.plots.filter((p) => p.front).length} shops), ` +
        `${map.buildings.length} osm buildings, ${map.landmarks.length} landmarks [${map.landmarks.map((l) => l.model).join(", ")}], ` +
        `${map.areas.length} areas, ${map.rails.length} rails, bus stops ${count("bus_stop")}, ${Math.round(json.length / 1024)} KB`
    );
  }
}

main();
