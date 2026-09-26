/**
 * Ground surfaces: the base ground under the whole district, and the OSM
 * areas laid over it: parks and pitches, beach, plazas, temple tanks and the
 * sea. Water is a scrolling stylised ripple texture; tanks get a stepped
 * stone rim so they read as ghats rather than puddles. Where the coast runs
 * off the edge of the map the sea carries on to the horizon.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Theme } from "../districts";
import type { MapArea, MapData, Pt } from "./mapData";
import { ribbon, Y } from "./roads";

export type AreaMeshes = {
  group: THREE.Group;
  /** Edges of the map the sea runs past, so the skyline leaves them open. */
  seaEdges: ("north" | "south" | "east" | "west")[];
  update(t: number): void;
  dispose(): void;
};

function signedArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i];
    const [x2, z2] = p[(i + 1) % p.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function pointInRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Triangulated flat polygon (with holes) at height y, UVs in metres/scale. */
export function flatPolygon(outer: Pt[], holes: Pt[][], y: number, uvScale = 1): THREE.BufferGeometry | null {
  const v2 = (r: Pt[]) => r.map(([x, z]) => new THREE.Vector2(x, z));
  let contour = v2(outer);
  if (THREE.ShapeUtils.isClockWise(contour)) contour = contour.reverse();
  const hs = holes.map((h) => {
    const r = v2(h);
    return THREE.ShapeUtils.isClockWise(r) ? r : r.reverse();
  });
  const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
  if (!tris.length) return null;
  const all = contour.concat(...hs);
  const pos: number[] = [];
  const uv: number[] = [];
  for (const p of all) {
    pos.push(p.x, y, p.y);
    uv.push(p.x / uvScale, p.y / uvScale);
  }
  const idx: number[] = [];
  // Wind each triangle so it faces up.
  for (const [a, b, c] of tris) {
    const ax = all[a].x, az = all[a].y;
    const cross = (all[b].x - ax) * (all[c].y - az) - (all[b].y - az) * (all[c].x - ax);
    if (cross < 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function rippleTexture(deep: number, light: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${new THREE.Color(deep).getHexString()}`;
  ctx.fillRect(0, 0, px, px);
  // Short horizontal glints in a light tint: the painted-water shorthand.
  ctx.strokeStyle = `#${new THREE.Color(light).getHexString()}`;
  ctx.lineCap = "round";
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * px;
    const y = rnd() * px;
    const w = 10 + rnd() * 30;
    ctx.lineWidth = 2 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    // Wrap so the tile repeats seamlessly.
    ctx.beginPath();
    ctx.moveTo(x - px, y);
    ctx.lineTo(x + w - px, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A tiling surface texture in the given base colour, painted the way the cel
 * look wants it: soft mottling, a few specks, and for paving, stones laid in
 * a running bond with their joints. Seamless, so it repeats without seams.
 */
function surfaceTexture(kind: "ground" | "paving" | "grass" | "sand", base: number, seed: number): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  const c = new THREE.Color(base);
  const tint = (k: number) => `#${c.clone().offsetHSL(0, 0, k).getHexString()}`;
  ctx.fillStyle = tint(0);
  ctx.fillRect(0, 0, px, px);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Draw a shape at (x, y) and its wrapped copies, so the tile is seamless.
  const wrap = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const dx of [0, -px, px]) for (const dy of [0, -px, px]) {
      if (x + dx + r < 0 || x + dx - r > px || y + dy + r < 0 || y + dy - r > px) continue;
      draw(x + dx, y + dy);
    }
  };
  const blob = (x: number, y: number, r: number, style: string) =>
    wrap(x, y, r, (bx, by) => {
      ctx.fillStyle = style;
      ctx.beginPath();
      ctx.ellipse(bx, by, r, r * (0.55 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });

  if (kind === "paving") {
    // Stones in a running bond, each a touch lighter or darker, over the
    // darker line of their joints.
    ctx.fillStyle = tint(-0.1);
    ctx.fillRect(0, 0, px, px);
    const rows = 6;
    const h = px / rows;
    for (let r = 0; r < rows; r++) {
      const w = h * 1.6;
      const off = (r % 2) * (w / 2);
      for (let x = -w; x < px + w; x += w) {
        ctx.fillStyle = tint((rnd() - 0.5) * 0.08);
        ctx.fillRect(x + off + 1.5, r * h + 1.5, w - 3, h - 3);
      }
    }
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 18; i++) blob(rnd() * px, rnd() * px, 6 + rnd() * 14, tint(-0.05));
    ctx.globalAlpha = 1;
  } else {
    // Soft mottling in broad, faint patches.
    const spread = kind === "grass" ? 0.07 : 0.05;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) blob(rnd() * px, rnd() * px, 16 + rnd() * 34, tint((rnd() - 0.5) * spread * 2));
    ctx.globalAlpha = 1;
    // Specks: grit on the ground, tufts in the grass, grains in the sand.
    const n = kind === "grass" ? 160 : kind === "sand" ? 220 : 180;
    for (let i = 0; i < n; i++) {
      const x = rnd() * px;
      const y = rnd() * px;
      if (kind === "grass") {
        ctx.strokeStyle = tint(rnd() < 0.5 ? -0.08 : 0.06);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = tint(rnd() < 0.6 ? -0.07 : 0.06);
        ctx.fillRect(x, y, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
      }
    }
    if (kind === "sand") {
      // Wind ripples.
      ctx.strokeStyle = tint(-0.04);
      ctx.lineWidth = 1.5;
      for (let y = 8; y < px; y += 18) {
        ctx.beginPath();
        for (let x = 0; x <= px; x += 8) ctx.lineTo(x, y + Math.sin((x / px) * Math.PI * 4 + y) * 3);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PARK = 0x7fb069;
const PITCH = 0x6aa85c;
const SAND = 0xead9a8;

export function buildAreas(map: MapData, theme: Theme): AreaMeshes {
  const group = new THREE.Group();
  group.name = "areas";
  const H = map.half;
  const textures: THREE.Texture[] = [];

  // Base ground, wide enough to run under the skyline and out to the haze.
  const G = H * 2 + 900;
  const dirt = surfaceTexture("ground", theme.ground, 11);
  if (dirt) {
    dirt.repeat.set(G / 22, G / 22);
    textures.push(dirt);
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(G, G).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: dirt ? 0xffffff : theme.ground, map: dirt })
  );
  ground.receiveShadow = true;
  group.add(ground);

  const byKind = new Map<string, THREE.BufferGeometry[]>();
  const push = (k: string, g: THREE.BufferGeometry | null) => {
    if (!g) return;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(g);
  };

  const water = (a: MapArea) => a.kind === "water" || a.kind === "sea";
  for (const a of map.areas) {
    const holes = a.holes ?? [];
    if (water(a)) {
      push("water", flatPolygon(a.pts, holes, Y.area + 0.01, 1));
      // Tanks (not the sea, not rivers mapped as wide channels) get a stepped
      // stone rim: an outer coping and a lower step just inside it.
      if (a.kind === "water" && a.pts.length > 3) {
        // Orient the ring so its left-hand normal points out of the water
        // (positive signed area in this +x east, +z south frame).
        const ccw = signedArea(a.pts) > 0;
        const pts = ccw ? a.pts : [...a.pts].reverse();
        const ring: Pt[] = [...pts, pts[0]];
        push("rim", ribbon(ring, -0.2, 1.8, 0.28));
        push("step", ribbon(ring, -1.4, -0.2, 0.12));
      }
      continue;
    }
    // The Golden Temple's parikrama is white marble, not the city's paving.
    const kind =
      a.kind === "park" ? "park" : a.kind === "pitch" ? "pitch" : a.kind === "beach" ? "beach" : a.name === "Parikrama" ? "marble" : "plaza";
    push(kind, flatPolygon(a.pts, holes, Y.area, kind === "plaza" || kind === "marble" ? 2.6 : 1));
  }

  // The sea beyond the map edge on each side its polygon touches, out to
  // the horizon.
  const seaEdges: AreaMeshes["seaEdges"] = [];
  const sea = map.areas.filter((a) => a.kind === "sea");
  const inSea = (x: number, z: number) => sea.some((a) => pointInRing(x, z, a.pts));
  const far = 900;
  // Each edge with its outward normal.
  const edges: [AreaMeshes["seaEdges"][number], number, number, Pt[]][] = [
    ["north", 0, -1, [[-H - far, -H - far], [H + far, -H - far], [H + far, -H], [-H - far, -H]]],
    ["south", 0, 1, [[-H - far, H], [H + far, H], [H + far, H + far], [-H - far, H + far]]],
    ["east", 1, 0, [[H, -H - far], [H + far, -H - far], [H + far, H + far], [H, H + far]]],
    ["west", -1, 0, [[-H - far, -H - far], [-H, -H - far], [-H, H + far], [-H - far, H + far]]],
  ];
  for (const [name, nx, nz, quad] of edges) {
    // Sample a few points along the edge, a metre either side of it (the
    // sea may start inside the map, or right at its edge past a beach that
    // runs to the boundary); the sea has to own most of it.
    const along = [-0.6, -0.3, 0, 0.3, 0.6].map((f) =>
      [H - 1, H + 1].some((r) => (nx ? inSea(nx * r, f * H) : inSea(f * H, nz * r)))
    );
    if (along.filter(Boolean).length >= 3) {
      seaEdges.push(name);
      push("water", flatPolygon(quad, [], Y.area + 0.01, 1));
    }
  }

  const merged = (k: string) => {
    const list = byKind.get(k);
    if (!list?.length) return null;
    const g = BufferGeometryUtils.mergeGeometries(list, false)!;
    list.forEach((p) => p.dispose());
    return g;
  };
  const add = (k: string, mat: THREE.Material) => {
    const g = merged(k);
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  };

  // Surfaces with their textures (world UVs: a metre per unit, a plaza's
  // per 2.6m), each repeating every few metres.
  const surface = (kind: "paving" | "grass" | "sand", colour: number, seed: number, every: number) => {
    const t = surfaceTexture(kind, colour, seed);
    if (!t) return new THREE.MeshLambertMaterial({ color: colour });
    t.repeat.set(1 / every, 1 / every);
    textures.push(t);
    return new THREE.MeshLambertMaterial({ color: 0xffffff, map: t });
  };
  add("park", surface("grass", PARK, 5, 14));
  add("pitch", surface("grass", PITCH, 6, 14));
  add("beach", surface("sand", SAND, 7, 16));
  add("plaza", surface("paving", theme.plaza, 8, 3));
  add("marble", surface("paving", 0xefebe3, 9, 2));
  add("rim", new THREE.MeshLambertMaterial({ color: 0xefe9dc }));
  add("step", new THREE.MeshLambertMaterial({ color: 0xcdc6b6 }));

  // Water: deep and light tints of the district's sky, so a tank reflects
  // the day it sits in.
  const skyMid = new THREE.Color(theme.sky[1]);
  const deep = skyMid.clone().lerp(new THREE.Color(0x1f5f8b), 0.55).getHex();
  const light = skyMid.clone().lerp(new THREE.Color(0xffffff), 0.55).getHex();
  const ripple = rippleTexture(deep, light);
  if (ripple) {
    ripple.repeat.set(1 / 18, 1 / 18);
    textures.push(ripple);
  }
  add("water", new THREE.MeshLambertMaterial({ color: ripple ? 0xffffff : deep, map: ripple, emissive: deep, emissiveIntensity: 0.15 }));

  return {
    group,
    seaEdges,
    update(t) {
      if (ripple) {
        ripple.offset.x = t * 0.004;
        ripple.offset.y = Math.sin(t * 0.3) * 0.01;
      }
    },
    dispose() {
      textures.forEach((x) => x.dispose());
    },
  };
}
