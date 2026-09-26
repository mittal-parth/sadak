/**
 * Every building in the district, in two levels of detail.
 *
 * Far: each plot is a coloured block with a window-grid texture, a dark shop
 * band and a sign strip, and each real OSM footprint is extruded with its
 * holes. All of it is merged per 48m tile, so the whole district is a couple
 * of hundred cheap meshes.
 *
 * Near: tiles close to the player swap to fully detailed buildings (recessed
 * shops, windows, balconies, AC units, laundry, lettered signs; see
 * ../buildings.ts). Detail is generated a few milliseconds per frame, nearest
 * tile first, and a tile only swaps once all of its buildings are ready, so
 * the two versions never show at once. Tiles that fall far behind drop their
 * detail again.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Theme } from "../districts";
import { bakeBuilding, buildBuildingParts, GROUND_H, FLOOR_H } from "../buildings";
import type { SignAtlas } from "../signage";
import type { MapBuilding, MapData, Plot, Pt } from "./mapData";
import { Parts, paint } from "./vc";
import { flatPolygon } from "./areas";
import type { CollisionWorld } from "./collide";

const TILE = 48;
const NEAR = 105;
const FAR = NEAR + 45;
/** Detail generation budget per frame, milliseconds. */
const BUDGET_MS = 4;

const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

function trimFor(wall: number): number {
  const c = new THREE.Color(wall);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  if (_hsl.l > 0.78) {
    return c.setHSL(_hsl.h, Math.min(1, _hsl.s + 0.15), _hsl.l * 0.66, THREE.SRGBColorSpace).getHex();
  }
  return 0xf3ead6;
}

/* ------------------------------------------------------------------ *
 * Far geometry
 * ------------------------------------------------------------------ */

/** Texture cell = one 3.2m bay of one floor: wall with a window. The
 *  bottom-left corner is plain wall, for surfaces that want no windows. */
function windowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const px = 64;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  // Surround, then pane.
  ctx.fillStyle = "#e9e4d8";
  ctx.fillRect(18, 14, 28, 34);
  ctx.fillStyle = "#3d4a5c";
  ctx.fillRect(21, 17, 22, 28);
  ctx.fillStyle = "#56657a";
  ctx.fillRect(21, 17, 22, 8);
  // Sill shadow.
  ctx.fillStyle = "#c9c2b4";
  ctx.fillRect(16, 48, 32, 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** UV that samples plain wall (the texture's corner). */
const PLAIN: [number, number] = [0.03, 0.03];

type Buf = { pos: number[]; nor: number[]; uv: number[]; col: number[] };
const newBuf = (): Buf => ({ pos: [], nor: [], uv: [], col: [] });

/** One upright quad a-b from y0 to y1, facing (nx, nz). */
function wallQuad(
  b: Buf,
  ax: number, az: number, bx: number, bz: number,
  y0: number, y1: number,
  nx: number, nz: number,
  colour: number,
  windows: boolean,
  u0 = 0
) {
  _c.setHex(colour);
  const len = Math.hypot(bx - ax, bz - az);
  const ua = u0 / FLOOR_H;
  const ub = (u0 + len) / FLOOR_H;
  const va = (y0 - GROUND_H) / FLOOR_H;
  const vb = (y1 - GROUND_H) / FLOOR_H;
  const uv = windows
    ? [ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb]
    : [...PLAIN, ...PLAIN, ...PLAIN, ...PLAIN, ...PLAIN, ...PLAIN];
  const p = [ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az];
  b.pos.push(...p);
  b.uv.push(...uv);
  for (let i = 0; i < 6; i++) {
    b.nor.push(nx, 0, nz);
    b.col.push(_c.r, _c.g, _c.b);
  }
}

function roofQuad(b: Buf, corners: Pt[], y: number, colour: number) {
  _c.setHex(colour);
  const [p0, p1, p2, p3] = corners;
  // Front-left, front-right, back-right: counter-clockwise seen from above.
  for (const q of [p0, p1, p2, p0, p2, p3]) {
    b.pos.push(q[0], y, q[1]);
    b.nor.push(0, 1, 0);
    b.uv.push(...PLAIN);
    b.col.push(_c.r, _c.g, _c.b);
  }
}

/** A plot block: corners in world space, walls outward, lid on top. */
function prism(
  b: Buf,
  p: Plot,
  inset: number,
  y0: number,
  y1: number,
  colour: number,
  windows: boolean,
  roof: number | null,
  frontOffset = 0
) {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const hw = p.w / 2 - inset;
  const hd = p.d / 2 - inset;
  // Local (u, v) -> world with local +z = (sin, cos), local +x = (cos, -sin).
  const at = (u: number, v: number): Pt => [p.x + u * c + v * s, p.z - u * s + v * c];
  const corners: Pt[] = [at(-hw, hd + frontOffset), at(hw, hd + frontOffset), at(hw, -hd), at(-hw, -hd)];
  // Faces: front (+z), right (+x), back (-z), left (-x), counter-clockwise
  // seen from above so each edge's outward normal is to its right.
  const normals: Pt[] = [
    [s, c],
    [c, -s],
    [-s, -c],
    [-c, s],
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const bb = corners[(i + 1) % 4];
    wallQuad(b, a[0], a[1], bb[0], bb[1], y0, y1, normals[i][0], normals[i][1], colour, windows && (i === 0 || !p.front));
  }
  if (roof !== null) roofQuad(b, corners, y1, roof);
}

function farPlot(b: Buf, p: Plot, theme: Theme) {
  const wall = theme.buildings[p.seed % theme.buildings.length];
  const trim = trimFor(wall);
  const top = GROUND_H + p.floors * FLOOR_H;
  if (p.front) {
    // Shop band: dark openings, then a sign strip in the canopy colour.
    prism(b, p, 0.25, 0, 3.0, 0x3a312b, false, null, 0.1);
    const sign = theme.canopies[p.seed % theme.canopies.length];
    prism(b, p, 0.1, 3.0, 3.8, sign, false, null, 0.2);
    prism(b, p, 0, 3.8, top, wall, true, null);
  } else {
    prism(b, p, 0, 0, top, wall, true, null);
  }
  // Parapet in the trim colour, grey concrete roof.
  prism(b, p, -0.1, top, top + 0.9, trim, false, 0x9d998f);
  // Water tank on most roofs.
  if (p.seed % 3 !== 0) {
    const tank: Plot = { ...p, w: 1.3, d: 1.3, x: p.x + Math.cos(p.rot) * (p.w / 4), z: p.z - Math.sin(p.rot) * (p.w / 4) };
    prism(b, tank, 0, top + 0.9, top + 2.3, 0x26272b, false, 0x26272b);
  }
}

function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i];
    const [x2, z2] = p[(i + 1) % p.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/**
 * Extruded OSM footprint: walls round the outer ring and any courtyards.
 * A wall quad's front face is to the right of its edge, so the outer ring is
 * walked with negative signed area (right = outward in this +x east, +z
 * south frame) and courtyard rings the other way (right = into the court).
 */
function farOsm(b: Buf, bld: MapBuilding, colour: number, roof: THREE.BufferGeometry[]) {
  const rings: [Pt[], boolean][] = [[bld.pts, false], ...(bld.holes ?? []).map((h) => [h, true] as [Pt[], boolean])];
  for (const [ring, hole] of rings) {
    const area = signedArea(ring);
    const pts = (hole ? area > 0 : area < 0) ? ring : [...ring].reverse();
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.05) continue;
      const nx = -(c[1] - a[1]) / len;
      const nz = (c[0] - a[0]) / len;
      wallQuad(b, a[0], a[1], c[0], c[1], 0, bld.h, nx, nz, colour, true, u);
      u += len;
    }
  }
  const lid = flatPolygon(bld.pts, bld.holes ?? [], bld.h, 1);
  if (lid) roof.push(lid);
}

/**
 * A canopy: a 0.35m slab at the building's height, underside and edges
 * included, on posts every ~8m round the outer ring. Returns the posts.
 */
function canopy(bld: MapBuilding, out: THREE.BufferGeometry[]): Pt[] {
  const top = bld.h;
  const slab = 0.35;
  const P = new Parts();
  const lid = flatPolygon(bld.pts, bld.holes ?? [], top, 1);
  if (lid) out.push(paint(lid.toNonIndexed(), 0xe6e3dc));
  const under = flatPolygon(bld.pts, bld.holes ?? [], top - slab, 1);
  if (under) {
    // Face down: flip the winding and the normals.
    const g = under.toNonIndexed();
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i += 3) {
      for (const k of [0, 1, 2]) {
        const a = pos.getComponent(i + 1, k);
        pos.setComponent(i + 1, k, pos.getComponent(i + 2, k));
        pos.setComponent(i + 2, k, a);
      }
    }
    g.computeVertexNormals();
    out.push(paint(g, 0xb8b4aa));
  }
  // Fascia round the edge, and the posts.
  const posts: Pt[] = [];
  const ring = bld.pts;
  let carry = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) continue;
    const rot = Math.atan2(bx - ax, bz - az);
    P.box(0.12, slab, L, (ax + bx) / 2, top - slab / 2, (az + bz) / 2, 0xd35400, rot);
    // Posts a little in from the edge.
    const nx = (bz - az) / L;
    const nz = -(bx - ax) / L;
    for (let s = 8 - carry; s < L; s += 8) {
      const x = ax + ((bx - ax) * s) / L - nx * 0.6 * Math.sign(signedArea(ring));
      const z = az + ((bz - az) * s) / L - nz * 0.6 * Math.sign(signedArea(ring));
      P.box(0.25, top - slab, 0.25, x, (top - slab) / 2, z, 0x6d7076);
      posts.push([x, z]);
    }
    carry = (carry + L) % 8;
  }
  const g = P.geometry();
  if (g) out.push(g);
  return posts;
}

function bufGeometry(b: Buf): THREE.BufferGeometry | null {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
  return g;
}

/* ------------------------------------------------------------------ *
 * Streaming
 * ------------------------------------------------------------------ */

type Tile = {
  cx: number;
  cz: number;
  far: THREE.Mesh | null;
  /** Street-facing plots that get full detail when near. */
  plots: Plot[];
  state: "far" | "building" | "near";
  next: number;
  baked: ReturnType<typeof bakeBuilding>[];
  near: THREE.Group | null;
};

export type BuildingLayer = {
  group: THREE.Group;
  /** Stream detail around `focus`. Call once a frame. */
  update(focus: THREE.Vector3): void;
  /** Build detail around `focus` synchronously, for the first frame. */
  prime(focus: THREE.Vector3): void;
  dispose(): void;
};

export type BuildingKit = {
  glass: THREE.Material;
  signs: THREE.Material | null;
  atlas: SignAtlas | null;
  toon: (m: THREE.Material) => THREE.Material;
};

export function buildBuildings(
  map: MapData,
  theme: Theme,
  kit: BuildingKit,
  collide: CollisionWorld
): BuildingLayer {
  const group = new THREE.Group();
  group.name = "buildings";
  const tex = windowTexture();
  const farMat = kit.toon(new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }));
  const bodyMat = kit.toon(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const roofMat = kit.toon(new THREE.MeshLambertMaterial({ color: 0x9d998f }));

  const tiles = new Map<string, Tile>();
  const tileOf = (x: number, z: number): Tile => {
    const i = Math.floor(x / TILE);
    const j = Math.floor(z / TILE);
    const key = `${i}:${j}`;
    let t = tiles.get(key);
    if (!t) {
      t = { cx: (i + 0.5) * TILE, cz: (j + 0.5) * TILE, far: null, plots: [], state: "far", next: 0, baked: [], near: null };
      tiles.set(key, t);
    }
    return t;
  };

  // Far geometry per tile, plus colliders for everything.
  const farBufs = new Map<Tile, Buf>();
  for (const p of map.plots) {
    const t = tileOf(p.x, p.z);
    if (!farBufs.has(t)) farBufs.set(t, newBuf());
    farPlot(farBufs.get(t)!, p, theme);
    if (p.front) t.plots.push(p);
    collide.box(p.x, p.z, p.w / 2, p.d / 2, p.rot);
  }
  for (const [t, b] of farBufs) {
    const g = bufGeometry(b);
    if (!g) continue;
    const m = new THREE.Mesh(g, farMat);
    m.castShadow = true;
    m.receiveShadow = true;
    t.far = m;
    group.add(m);
  }

  // Real footprints: always the extruded version (they have no plot to
  // detail), merged into one mesh per tile.
  const osmBufs = new Map<Tile, Buf>();
  const roofs: THREE.BufferGeometry[] = [];
  const canopies: THREE.BufferGeometry[] = [];
  map.buildings.forEach((bld, i) => {
    if (bld.canopy) {
      // A roof slab on posts round its edge; only the posts block.
      for (const [x, z] of canopy(bld, canopies)) collide.box(x, z, 0.2, 0.2);
      return;
    }
    const [cx, cz] = bld.pts[0];
    const t = tileOf(cx, cz);
    if (!osmBufs.has(t)) osmBufs.set(t, newBuf());
    farOsm(osmBufs.get(t)!, bld, theme.buildings[i % theme.buildings.length], roofs);
    collide.add({ kind: "poly", outer: bld.pts, holes: bld.holes ?? [] });
  });
  if (canopies.length) {
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(canopies, false)!, kit.toon(new THREE.MeshLambertMaterial({ vertexColors: true })));
    canopies.forEach((g) => g.dispose());
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  for (const b of osmBufs.values()) {
    const g = bufGeometry(b);
    if (!g) continue;
    const m = new THREE.Mesh(g, farMat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  if (roofs.length) {
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(roofs, false)!, roofMat);
    roofs.forEach((g) => g.dispose());
    m.receiveShadow = true;
    group.add(m);
  }

  /* ---- detail ---- */

  const style = theme.archStyle;
  function bakePlot(p: Plot) {
    const named = p.sign ? kit.atlas?.named(p.sign) : null;
    if (p.sign && kit.atlas && !named) throw new Error(`sign atlas is missing "${p.sign}"`);
    const parts = buildBuildingParts(p.w, p.d, p.floors, p.seed, {
      style,
      signs: kit.atlas ?? undefined,
      frontOnly: true,
      named: named ?? undefined,
    });
    const wall = theme.buildings[p.seed % theme.buildings.length];
    const baked = bakeBuilding(parts, {
      wall,
      trim: trimFor(wall),
      metal: 0x8f979c,
      sign: theme.canopies[p.seed % theme.canopies.length],
    });
    const m = new THREE.Matrix4().makeRotationY(p.rot).setPosition(p.x, 0, p.z);
    baked.body.applyMatrix4(m);
    if (baked.glass.attributes.position) baked.glass.applyMatrix4(m);
    if (baked.signs.attributes.position) baked.signs.applyMatrix4(m);
    return baked;
  }

  function finish(t: Tile) {
    const merge = (list: THREE.BufferGeometry[]) => {
      const withPos = list.filter((g) => g.attributes.position);
      if (!withPos.length) return null;
      const g = BufferGeometryUtils.mergeGeometries(withPos, false)!;
      list.forEach((x) => x.dispose());
      return g;
    };
    const near = new THREE.Group();
    const body = merge(t.baked.map((b) => b.body));
    if (body) {
      const m = new THREE.Mesh(body, bodyMat);
      m.castShadow = true;
      m.receiveShadow = true;
      near.add(m);
    }
    const glass = merge(t.baked.map((b) => b.glass));
    if (glass) near.add(new THREE.Mesh(glass, kit.glass));
    const signs = merge(t.baked.map((b) => b.signs));
    if (signs && kit.signs) near.add(new THREE.Mesh(signs, kit.signs));
    t.baked = [];
    t.near = near;
    t.state = "near";
    group.add(near);
    if (t.far) t.far.visible = false;
  }

  function drop(t: Tile) {
    if (t.near) {
      group.remove(t.near);
      t.near.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      t.near = null;
    }
    t.baked.forEach((b) => [b.body, b.glass, b.signs].forEach((g) => g.dispose()));
    t.baked = [];
    t.next = 0;
    t.state = "far";
    if (t.far) t.far.visible = true;
  }

  const list = [...tiles.values()].filter((t) => t.plots.length);
  function step(focus: THREE.Vector3, budget: number) {
    const start = performance.now();
    const dist = (t: Tile) => Math.hypot(t.cx - focus.x, t.cz - focus.z);
    for (const t of list) {
      if (t.state !== "far" && dist(t) > FAR) drop(t);
    }
    const wanted = list
      .filter((t) => t.state !== "near" && dist(t) < NEAR)
      .sort((a, b) => dist(a) - dist(b));
    for (const t of wanted) {
      t.state = "building";
      while (t.next < t.plots.length) {
        if (performance.now() - start > budget) return;
        t.baked.push(bakePlot(t.plots[t.next++]));
      }
      finish(t);
    }
  }

  return {
    group,
    update(focus) {
      step(focus, BUDGET_MS);
    },
    prime(focus) {
      step(focus, Infinity);
    },
    dispose() {
      for (const t of tiles.values()) drop(t);
      tex?.dispose();
    },
  };
}
