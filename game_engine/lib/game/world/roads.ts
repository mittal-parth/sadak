/**
 * Street surfaces from the real street network: carriageways, raised
 * footpaths with painted kerbs, junction caps, lane paint and zebra
 * crossings, and paved pedestrian streets. Everything is merged by material,
 * so the whole network is a handful of draw calls.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MaterialLibrary } from "../materials";
import type { Theme } from "../districts";
import { KERB_H, type MapData, type MapRoad, type Pt } from "./mapData";

/** Surface heights, stacked so coplanar layers never z-fight. */
export const Y = {
  ground: 0,
  area: 0.012,
  tarmac: 0.03,
  cap: 0.034,
  paving: 0.04,
  paint: 0.046,
  footway: 0.055,
} as const;

const DRIVABLE = new Set(["trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"]);
export const isDrivable = (r: MapRoad) => DRIVABLE.has(r.cls);
const PAVED = new Set(["pedestrian", "footway", "steps"]);

/* ------------------------------------------------------------------ *
 * Polyline helpers
 * ------------------------------------------------------------------ */

export function polylineLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Cut `from` metres off the start and `to` off the end. */
export function trimPolyline(pts: Pt[], from: number, to: number): Pt[] | null {
  const L = polylineLength(pts);
  if (from + to >= L - 0.5) return null;
  const out: Pt[] = [];
  const s0 = from;
  const s1 = L - to;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lerp = (s: number): Pt => {
      const t = seg ? (s - acc) / seg : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    if (acc + seg >= s0 && acc <= s1) {
      if (!out.length) out.push(lerp(Math.max(s0, acc)));
      if (acc + seg <= s1) out.push(b);
      else {
        out.push(lerp(s1));
        break;
      }
    }
    acc += seg;
  }
  return out.length >= 2 ? out : null;
}

/** Drops consecutive repeated vertices, which OSM rings sometimes carry and
 *  which have no direction to take a normal from. */
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3) out.push(p);
  }
  return out;
}

/** Left-hand normals with a clamped miter at each vertex. Expects no
 *  repeated vertices (see dedupe). */
function miterNormals(pts: Pt[]): Pt[] {
  const n: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const d1 = norm(b[0] - a[0], b[1] - a[1]) ?? norm(c[0] - b[0], c[1] - b[1]) ?? ([1, 0] as Pt);
    const d2 = norm(c[0] - b[0], c[1] - b[1]) ?? d1;
    // Left of travel in a +x east, +z south frame.
    const n1: Pt = [d1[1], -d1[0]];
    const n2: Pt = [d2[1], -d2[0]];
    const m = norm(n1[0] + n2[0], n1[1] + n2[1]) ?? n1;
    const k = 1 / Math.max(0.4, m[0] * n1[0] + m[1] * n1[1]);
    n.push([m[0] * k, m[1] * k]);
  }
  return n;
}

function norm(x: number, z: number): Pt | null {
  const L = Math.hypot(x, z);
  return L < 1e-6 ? null : [x / L, z / L];
}

/** The polyline shifted `o` metres to the left of travel, mitred. */
export function offsetPolyline(raw: Pt[], o: number): Pt[] {
  const pts = dedupe(raw);
  const n = miterNormals(pts);
  return pts.map((p, i) => [p[0] + n[i][0] * o, p[1] + n[i][1] * o] as Pt);
}

/**
 * A flat strip between signed offsets `o0` and `o1` from the centreline
 * (positive = left of travel) at height `y`. UV u runs along the strip in
 * metres / uScale, v across in metres / uScale.
 */
export function ribbon(raw: Pt[], o0: number, o1: number, y: number, uScale = 1): THREE.BufferGeometry {
  const pts = dedupe(raw);
  const n = miterNormals(pts);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    for (const o of [o0, o1]) {
      pos.push(pts[i][0] + n[i][0] * o, y, pts[i][1] + n[i][1] * o);
      uv.push(s / uScale, o / uScale);
    }
    if (i) {
      const b = (i - 1) * 2;
      // Winding so the face points up (+y) whichever side o1 is on.
      if (o1 > o0) idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      else idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A vertical strip along the polyline at offset `o`, facing the left of
 *  travel (+normal) when `facing` is 1 and the right when it is -1. */
function wall(raw: Pt[], o: number, y0: number, y1: number, facing: 1 | -1, uScale = 1): THREE.BufferGeometry {
  const pts = dedupe(raw);
  const n = miterNormals(pts);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const x = pts[i][0] + n[i][0] * o;
    const z = pts[i][1] + n[i][1] * o;
    pos.push(x, y0, z, x, y1, z);
    uv.push(s / uScale, 0, s / uScale, 1);
    if (i) {
      const b = (i - 1) * 2;
      if (facing === 1) idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      else idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function disc(x: number, z: number, r: number, y: number, segs = 18): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function quad(w: number, d: number, x: number, z: number, y: number, rot: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.rotateY(rot);
  g.translate(x, y, z);
  return g;
}

/* ------------------------------------------------------------------ *
 * Paving texture
 * ------------------------------------------------------------------ */

function pavingTexture(base: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const px = 128;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(base);
  ctx.fillStyle = `#${c.getHexString()}`;
  ctx.fillRect(0, 0, px, px);
  ctx.strokeStyle = `#${c.clone().multiplyScalar(0.8).getHexString()}`;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, px, px);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export type RoadMeshes = { group: THREE.Group; textures: THREE.Texture[] };

/** Which roads meet at each node, and how far a road's footpath and paint
 *  must stop short of that node to clear the crossing road. */
function junctionTrims(map: MapData) {
  const atNode = new Map<number, MapRoad[]>();
  for (const r of map.roads) {
    for (const id of [r.a, r.b]) {
      if (!atNode.has(id)) atNode.set(id, []);
      atNode.get(id)!.push(r);
    }
  }
  const trimAt = (r: MapRoad, node: number) => {
    let t = 0;
    for (const o of atNode.get(node) ?? []) {
      if (o === r || o.cls === "footway" || o.cls === "steps") continue;
      t = Math.max(t, o.w / 2 + o.foot + 0.4);
    }
    return t;
  };
  return { atNode, trimAt };
}

export type FootpathStrip = { pts: Pt[]; o0: number; o1: number };

/**
 * The raised footpaths, as strips between two offsets along a trimmed
 * centreline. The renderer draws these and the height field raises them, so
 * the kerb you see is the kerb you step up.
 */
export function footpathStrips(map: MapData): FootpathStrip[] {
  const { trimAt } = junctionTrims(map);
  const out: FootpathStrip[] = [];
  for (const r of map.roads) {
    if (r.foot <= 0 || PAVED.has(r.cls)) continue;
    const pts = trimPolyline(r.pts, trimAt(r, r.a), trimAt(r, r.b));
    if (!pts) continue;
    for (const side of [1, -1]) out.push({ pts, o0: (side * r.w) / 2, o1: side * (r.w / 2 + r.foot) });
  }
  return out;
}

export function buildRoads(map: MapData, theme: Theme, mats?: MaterialLibrary): RoadMeshes {
  const group = new THREE.Group();
  group.name = "roads";
  const textures: THREE.Texture[] = [];
  const { atNode, trimAt } = junctionTrims(map);

  const tarmac: THREE.BufferGeometry[] = [];
  const paving: THREE.BufferGeometry[] = [];
  const footTop: THREE.BufferGeometry[] = [];
  const kerb: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [];
  const yellow: THREE.BufferGeometry[] = [];

  for (const r of map.roads) {
    if (PAVED.has(r.cls)) {
      paving.push(ribbon(r.pts, -r.w / 2, r.w / 2, r.cls === "pedestrian" ? Y.paving : Y.footway, 2.6));
      continue;
    }
    tarmac.push(ribbon(r.pts, -r.w / 2, r.w / 2, Y.tarmac, 4));


    // Lane paint on the big roads: a dashed centre line and edge lines,
    // stopping short of the junctions.
    if (r.w >= 10) {
      const run = trimPolyline(r.pts, trimAt(r, r.a) + 2, trimAt(r, r.b) + 2);
      if (run) {
        const L = polylineLength(run);
        for (let s = 0; s < L - 3; s += 7) {
          const piece = trimPolyline(run, s, Math.max(0, L - s - 3));
          if (piece) (r.cls === "trunk" || r.cls === "primary" ? yellow : white).push(ribbon(piece, -0.1, 0.1, Y.paint));
        }
        for (const side of [1, -1]) {
          white.push(ribbon(run, side * (r.w / 2 - 0.6), side * (r.w / 2 - 0.45), Y.paint));
        }
      }
    }
  }

  for (const f of footpathStrips(map)) {
    const side = f.o0 > 0 || f.o1 > 0 ? 1 : -1;
    footTop.push(ribbon(f.pts, f.o0, f.o1, KERB_H, 2.6));
    // Kerb face toward the road, painted; plain face on the back.
    kerb.push(wall(f.pts, f.o0, Y.tarmac, KERB_H, side === 1 ? -1 : 1, 1.2));
    footTop.push(wall(f.pts, f.o1, 0, KERB_H, side === 1 ? 1 : -1, 2.6));
  }

  // Junction caps fill the gaps where ribbons meet at an angle, and zebra
  // crossings go across each major approach.
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  for (const [id, list] of atNode) {
    const roads = list.filter(isDrivable);
    if (roads.length < 2) continue;
    const n = nodeById.get(id)!;
    const rMax = Math.max(...roads.map((r) => r.w / 2));
    tarmac.push(disc(n.x, n.z, rMax + 0.3, Y.cap));
    if (roads.length >= 3) {
      for (const r of roads) {
        if (r.w < 8.5) continue;
        // Direction from the node into this road.
        const pts = r.a === id ? r.pts : [...r.pts].reverse();
        const d = norm(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
        if (!d) continue;
        const at = rMax + 2.2;
        const cx = n.x + d[0] * at;
        const cz = n.z + d[1] * at;
        const rot = Math.atan2(d[0], d[1]);
        for (let k = -3; k <= 3; k++) {
          const across = k * 0.9 * (r.w / 8);
          white.push(quad(0.45, 3, cx + d[1] * across, cz - d[0] * across, Y.paint, rot));
        }
      }
    }
  }

  const merged = (list: THREE.BufferGeometry[]) => {
    const g = BufferGeometryUtils.mergeGeometries(list, false)!;
    list.forEach((p) => p.dispose());
    return g;
  };
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, castShadow = false) => {
    if (!list.length) return;
    const m = new THREE.Mesh(merged(list), mat);
    m.receiveShadow = true;
    m.castShadow = castShadow;
    group.add(m);
  };

  add(tarmac, mats ? mats.tint("asphalt", theme.tarmac, 1) : new THREE.MeshLambertMaterial({ color: theme.tarmac }));

  const paveTex = pavingTexture(theme.plaza);
  if (paveTex) textures.push(paveTex);
  add(paving, new THREE.MeshLambertMaterial({ color: paveTex ? 0xffffff : theme.plaza, map: paveTex }));

  const footTex = pavingTexture(theme.pavement);
  if (footTex) textures.push(footTex);
  add(footTop, new THREE.MeshLambertMaterial({ color: footTex ? 0xffffff : theme.pavement, map: footTex }));
  add(kerb, mats ? mats.tint("kerb_stone", 0xe8e4dc, 1) : new THREE.MeshLambertMaterial({ color: 0xcfc9bb }));
  add(white, new THREE.MeshLambertMaterial({ color: 0xe8e4d6 }));
  add(yellow, new THREE.MeshLambertMaterial({ color: theme.lane }));

  return { group, textures };
}
