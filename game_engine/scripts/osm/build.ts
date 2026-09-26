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
import type {
  MapArea,
  MapBuilding,
  MapData,
  MapLandmark,
  MapNode,
  MapPoi,
  MapRail,
  MapRoad,
  Plot,
  PoiKind,
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
  for (const w of hwWays) {
    const cls = CLASS_OF[w.tags!.highway];
    const size = roadSize(cls, city);
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
        roads.push({
          cls,
          w: size.w,
          foot: size.foot,
          oneway,
          a: nodeAt(piece[0]),
          b: nodeAt(piece[piece.length - 1]),
          pts: piece.map(([x, z]) => [r1(x), r1(z)] as Pt),
          name: nameOf(w.tags),
        });
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
    if (t.place === "square" || (t.highway === "pedestrian" && t.area === "yes") || t.amenity === "marketplace")
      return "plaza";
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

  for (const { e, outer: ring, holes } of footprints) {
    const name = nameOf(e.tags);
    const rule = ruleFor(name);
    if (rule && name && !claimed.has(`${rule.model}:${name}`)) {
      claimed.add(`${rule.model}:${name}`);
      const box = orientedBox(ring);
      landmarks.push({ model: rule.model, name, x: r1(box.x), z: r1(box.z), rot: +box.rot.toFixed(3), w: r1(box.w), d: r1(box.d) });
      grid.markBox(box.x, box.z, box.rot, box.w + 2, box.d + 2, BUILT);
      continue;
    }
    if (!e.tags?.building) continue;
    const area = Math.abs(polygonArea(ring)) - holes.reduce((a, h) => a + Math.abs(polygonArea(h)), 0);
    if (area < 15) continue;
    const levels = Number(e.tags["building:levels"]);
    const h = Number.isFinite(levels) && levels > 0 ? levels * 3.2 + 1 : Math.min(18, 5 + Math.sqrt(area) * 0.35);
    buildings.push({ pts: round(ring), ...(holes.length ? { holes: holes.map(round) } : {}), h: r1(h), name });
    grid.fill(ring, BUILT, holes);
  }

  // Landmarks mapped only as points.
  for (const e of els) {
    if (e.type !== "node") continue;
    const name = nameOf(e.tags);
    const rule = ruleFor(name);
    if (!rule || !name || claimed.has(`${rule.model}:${name}`)) continue;
    const [x, z] = P(e);
    if (Math.abs(x) > H - 5 || Math.abs(z) > H - 5) continue;
    claimed.add(`${rule.model}:${name}`);
    const [w, d] = rule.size ?? [10, 10];
    // Face the nearest street.
    const near = nearestRoad(roads, [x, z], ["footway", "steps"]);
    const rot = near ? Math.atan2(near.pt[0] - x, near.pt[1] - z) : 0;
    landmarks.push({ model: rule.model, name, x: r1(x), z: r1(z), rot: +rot.toFixed(3), w, d });
    grid.markBox(x, z, rot, w + 2, d + 2, BUILT);
  }

  /* ---- spawn and task spots ---- */

  const walkable = (r: MapRoad) => r.cls !== "footway" && r.cls !== "steps";
  const landmarkNamed = (re: RegExp) => landmarks.find((l) => re.test(l.name));

  /** A standing spot at the kerb of the nearest street to `p`, facing `p`. */
  const kerbSpot = (p: Pt, filter: (r: MapRoad) => boolean, minDist = 0, avoid: Spot[] = []): Spot => {
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
      // real footprints (Majestic's bus stand).
      if (grid.get(x, z) === BUILT) continue;
      // Keep clear of spots already taken, so two set pieces never share a kerb.
      if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 12)) continue;
      if (!best || d < best.d) best = { spot: { x: r1(x), z: r1(z), yaw: +Math.atan2(p[0] - x, p[1] - z).toFixed(3) }, d };
    }
    if (!best) throw new Error(`${city.id}: no street near (${p[0]}, ${p[1]})`);
    return best.spot;
  };

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
    templeSpot = kerbSpot([t.x, t.z], () => true, Math.min(t.w, t.d) / 2);
  } else {
    const road = roads.filter((r) => city.shrineOn!.test(r.name ?? ""));
    if (!road.length) throw new Error(`${city.id}: shrine road ${city.shrineOn} not in the extract`);
    const onRoad = kerbSpot([spawn.x + 40, spawn.z + 40], (r) => road.includes(r));
    // The shrine stands just behind the stall, off the footpath.
    const sx = onRoad.x + Math.sin(onRoad.yaw) * 5;
    const sz = onRoad.z + Math.cos(onRoad.yaw) * 5;
    landmarks.push({ model: "shrine", name: "Wayside mandir", x: r1(sx), z: r1(sz), rot: +(onRoad.yaw + Math.PI).toFixed(3), w: 5, d: 5 });
    grid.markBox(sx, sz, onRoad.yaw, 7, 7, BUILT);
    templeSpot = onRoad;
  }

  const shopRoads = roads.filter((r) => city.shopStreet.test(r.name ?? ""));
  if (!shopRoads.length) throw new Error(`${city.id}: shop street ${city.shopStreet} not in the extract`);
  const shopSpot = kerbSpot([spawn.x, spawn.z], (r) => shopRoads.includes(r), 25, [templeSpot]);

  const near = (kind: PoiKind, max: number) =>
    pois
      .filter((p) => p.kind === kind)
      .map((p) => ({ p, d: Math.hypot(p.x - spawn.x, p.z - spawn.z) }))
      .filter((q) => q.d < max && q.d > 20)
      .sort((a, b) => a.d - b.d)[0]?.p;

  const major = (r: MapRoad) => ["trunk", "primary", "secondary", "tertiary", "unclassified"].includes(r.cls);
  /** A kerb on a main road if there is one within reach, else the nearest
   *  lane: buses and autos wait where the traffic is, but not 400m away. */
  const roadside = (p: Pt, minDist: number, avoid: Spot[]) => {
    const onMajor = roads.some(major) ? kerbSpot(p, major, minDist, avoid) : null;
    if (onMajor && Math.hypot(onMajor.x - spawn.x, onMajor.z - spawn.z) < 150) return onMajor;
    return kerbSpot(p, walkable, minDist, avoid);
  };
  const busPoi = near("bus_stop", 260);
  const taken = [templeSpot, shopSpot];
  /** A stop on a street a bus can use, if one is within reach. */
  const busStop = (p: Pt, minDist: number) => {
    const wide = (r: MapRoad) => r.w >= 7.5 && r.cls !== "pedestrian" && r.cls !== "footway" && r.cls !== "steps";
    if (roads.some(wide)) {
      const s = kerbSpot(p, wide, minDist, taken);
      if (Math.hypot(s.x - spawn.x, s.z - spawn.z) < 180) return s;
    }
    return roadside(p, minDist, taken);
  };
  const busSpot = busPoi ? busStop([busPoi.x, busPoi.z], 0) : busStop([spawn.x - 60, spawn.z + 30], 50);
  const taxiPoi = near("taxi", 220);
  const autoSpot = taxiPoi
    ? kerbSpot([taxiPoi.x, taxiPoi.z], walkable, 0, [...taken, busSpot])
    : roadside([spawn.x + 45, spawn.z - 20], 30, [...taken, busSpot]);

  const spots: Record<TaskSpotKind, Spot> = { auto: autoSpot, bus: busSpot, temple: templeSpot, shop: shopSpot };
  Object.assign(
    spawn,
    // Footways count: the approach to a temple complex is often all paths.
    kerbSpot([spawnMark.x, spawnMark.z], () => true, Math.max(spawnMark.w, spawnMark.d) / 2 + 8, Object.values(spots))
  );
  for (const s of [spawn, ...Object.values(spots)]) grid.disc(s.x, s.z, 5, RESERVED);

  /* ---- frontage fill ---- */

  const rand = mulberry32(hashString(city.id));
  const plots: Plot[] = [];
  const fillable = (r: MapRoad) => r.cls !== "footway" && r.cls !== "steps";
  const range = ([a, b]: [number, number]) => a + rand() * (b - a);

  for (const r of roads) {
    if (!fillable(r)) continue;
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
              front: rand() < city.fill.shop,
              seed: Math.floor(rand() * 1e6),
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

function nearestRoad(roads: MapRoad[], p: Pt, exclude: RoadClass[]) {
  let best: ReturnType<typeof nearestOnPolyline> | null = null;
  for (const r of roads) {
    if (exclude.includes(r.cls)) continue;
    const n = nearestOnPolyline(r.pts, p);
    if (!best || n.dist < best.dist) best = n;
  }
  return best;
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
