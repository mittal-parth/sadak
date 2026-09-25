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

const PARK = 0x7fb069;
const PITCH = 0x6aa85c;
const SAND = 0xead9a8;

export function buildAreas(map: MapData, theme: Theme): AreaMeshes {
  const group = new THREE.Group();
  group.name = "areas";
  const H = map.half;
  const textures: THREE.Texture[] = [];

  // Base ground, wide enough to run under the skyline and out to the haze.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2 + 900, H * 2 + 900).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: theme.ground })
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
    const kind = a.kind === "park" ? "park" : a.kind === "pitch" ? "pitch" : a.kind === "beach" ? "beach" : "plaza";
    push(kind, flatPolygon(a.pts, holes, Y.area, kind === "plaza" ? 2.6 : 1));
  }

  // The sea beyond the map edge on each side its polygon touches, out to
  // the horizon.
  const seaEdges: AreaMeshes["seaEdges"] = [];
  const sea = map.areas.filter((a) => a.kind === "sea");
  const inSea = (x: number, z: number) => sea.some((a) => pointInRing(x, z, a.pts));
  const far = 900;
  const edges: [AreaMeshes["seaEdges"][number], number, number, Pt[]][] = [
    ["north", 0, -H + 1, [[-H - far, -H - far], [H + far, -H - far], [H + far, -H], [-H - far, -H]]],
    ["south", 0, H - 1, [[-H - far, H], [H + far, H], [H + far, H + far], [-H - far, H + far]]],
    ["east", H - 1, 0, [[H, -H - far], [H + far, -H - far], [H + far, H + far], [H, H + far]]],
    ["west", -H + 1, 0, [[-H - far, -H - far], [-H, -H - far], [-H, H + far], [-H - far, H + far]]],
  ];
  for (const [name, x, z, quad] of edges) {
    // Sample a few points along the edge; the sea has to own most of it.
    const along = [-0.6, -0.3, 0, 0.3, 0.6].map((f) => (name === "north" || name === "south" ? inSea(f * H, z) : inSea(x, f * H)));
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

  add("park", new THREE.MeshLambertMaterial({ color: PARK }));
  add("pitch", new THREE.MeshLambertMaterial({ color: PITCH }));
  add("beach", new THREE.MeshLambertMaterial({ color: SAND }));
  add("plaza", new THREE.MeshLambertMaterial({ color: theme.plaza }));
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
