/**
 * Railways from the map: at-grade mainlines (Dadar's suburban tracks),
 * elevated lines (Chennai's MRTS), tram lines set in the road (Kolkata), and
 * entrances where a metro runs underground (Chandni Chowk, Majestic, Park
 * Street, Kalupur).
 *
 * Trains run the longest lines back and forth. Every car samples the track
 * at its own distance, so a nine-car local bends round a curve instead of
 * sliding along it as one stiff block.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Landmark } from "../assets";
import { makeTramWithPantograph } from "../assets";
import type { MapData, MapRail, Pt } from "./mapData";
import type { CollisionWorld } from "./collide";
import { ribbon, Y } from "./roads";
import { Parts } from "./vc";
import { mulberry32 } from "../props";

/** Train and metro liveries, and the station sign for underground lines. */
type RailStyle = {
  /** Suburban/EMU livery: body, lower band, stripe. */
  emu: [number, number, number];
  metro?: { line: number; native: string; en: string; font: string };
};

const STYLE: Partial<Record<Landmark, RailStyle>> = {
  // Western Railway locals: cream with maroon and a purple stripe.
  mumbai: { emu: [0xefe6d2, 0x7a2a3a, 0x6a3fa0] },
  // MRTS: pale grey with a blue band.
  chennai: { emu: [0xe3e6ea, 0x2a5caa, 0xf2c230] },
  delhi: {
    emu: [0xc9ccd1, 0xf2c230, 0x3a3d42],
    metro: { line: 0xf2c230, native: "चाँदनी चौक", en: "CHANDNI CHOWK", font: "Noto Sans Devanagari" },
  },
  bengaluru: {
    emu: [0x6a2c91, 0xd9d6e8, 0x3a3d42],
    metro: { line: 0x6a2c91, native: "ಮೆಜೆಸ್ಟಿಕ್", en: "MAJESTIC", font: "Noto Sans Kannada" },
  },
  kolkata: {
    emu: [0xd9d6cf, 0x8a1c1c, 0x3a3d42],
    metro: { line: 0x2356a8, native: "পার্ক স্ট্রিট", en: "PARK STREET", font: "Noto Sans Bengali" },
  },
  ahmedabad: {
    emu: [0xf2f2f0, 0x2a5caa, 0xe86a2c],
    metro: { line: 0xe86a2c, native: "કાલુપુર", en: "KALUPUR", font: "Noto Sans Gujarati" },
  },
};

const DEFAULT_STYLE: RailStyle = { emu: [0xe3e6ea, 0x2a5caa, 0xf2c230] };
const DECK_Y = 9;

function length(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Ballast with sleepers and two rails, painted along the track. */
function trackTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const W = 64;
  const H = 32;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a8078";
  g.fillRect(0, 0, W, H);
  // Sleepers run across (v), repeat along (u).
  g.fillStyle = "#5e4a3a";
  for (let x = 4; x < W; x += 16) g.fillRect(x, 3, 7, H - 6);
  g.fillStyle = "#c8ccd1";
  g.fillRect(0, 9, W, 2);
  g.fillRect(0, H - 11, W, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** One EMU car, 20m, facing +z, vertex-coloured. */
function carGeometry(style: RailStyle, cab: boolean): THREE.BufferGeometry {
  const [body, band, stripe] = style.emu;
  const P = new Parts();
  const L = 19.5;
  const W = 3.1;
  P.box(W, 3.3, L, 0, 0.6 + 1.65, 0, body);
  P.box(W + 0.02, 0.9, L - 0.2, 0, 1.05, 0, band);
  P.box(W + 0.03, 0.18, L - 0.2, 0, 1.6, 0, stripe);
  P.box(W - 0.4, 0.25, L - 1, 0, 4.05, 0, 0xa9adb3);
  for (const sx of [-1, 1]) {
    P.box(0.04, 0.95, L - 2, sx * (W / 2 + 0.01), 2.55, 0, 0x26303c);
    // Doorways, open, the Mumbai way.
    for (const dz of [-6, 0, 6]) P.box(0.05, 2.3, 1.3, sx * (W / 2 + 0.02), 1.75, dz, 0x1c2128);
  }
  if (cab) {
    P.box(W - 0.4, 1.1, 0.05, 0, 2.7, L / 2 + 0.02, 0x26303c);
    for (const sx of [-0.9, 0.9]) P.box(0.3, 0.16, 0.06, sx, 1.3, L / 2 + 0.03, 0xfff3c8);
  }
  return P.geometry()!;
}

type Runner = {
  pts: Pt[];
  cum: number[];
  len: number;
  y: number;
  cars: THREE.Object3D[];
  carLen: number;
  /** Head position along the line and direction of travel. */
  s: number;
  dir: 1 | -1;
  speed: number;
  cruise: number;
  wait: number;
};

export type Rails = { group: THREE.Group; update(dt: number): void; dispose(): void };

export function buildRails(map: MapData, city: Landmark, collide: CollisionWorld): Rails {
  const group = new THREE.Group();
  group.name = "rails";
  const style = STYLE[city] ?? DEFAULT_STYLE;
  const rand = mulberry32(6060);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const owned: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [];

  const surface = map.rails.filter((r) => !r.underground);

  /* ---- track beds ---- */
  const tex = trackTexture();
  if (tex) textures.push(tex);
  const beds: THREE.BufferGeometry[] = [];
  const tramRails: THREE.BufferGeometry[] = [];
  const viaduct = new Parts();
  for (const r of surface) {
    if (r.kind === "tram") {
      // Rails set flush in the carriageway.
      for (const o of [-0.72, 0.72]) tramRails.push(ribbon(r.pts, o - 0.05, o + 0.05, Y.paint + 0.002));
      continue;
    }
    const y = r.elevated ? DECK_Y : 0.08;
    beds.push(ribbon(r.pts, -1.6, 1.6, y + 0.02, 3.2));
    if (r.elevated) {
      // Deck, parapets and piers.
      viaduct.add(ribbon(r.pts, -2.6, 2.6, y - 0.65), 0xb4afa5);
      for (const o of [-2.5, 2.5]) viaduct.add(ribbon(r.pts, o - 0.15, o + 0.15, y + 0.9), 0xcfcac0);
      const L = length(r.pts);
      for (let s = 10; s < L; s += 26) {
        const p = sampleAt(r.pts, s);
        viaduct.cyl(0.8, 0.9, y - 0.6, p.x, (y - 0.6) / 2, p.z, 0xcfcac0, 8);
        collide.box(p.x, p.z, 0.9, 0.9);
      }
    }
  }
  if (beds.length) {
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(beds)!, new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0x8a8078 }));
    beds.forEach((b) => b.dispose());
    m.receiveShadow = true;
    group.add(m);
  }
  if (tramRails.length) {
    const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(tramRails)!, new THREE.MeshLambertMaterial({ color: 0x9a9da3 }));
    tramRails.forEach((b) => b.dispose());
    group.add(m);
  }
  const vm = viaduct.mesh(mat);
  if (vm) group.add(vm);

  /* ---- trains ---- */

  const runners: Runner[] = [];
  const lines = surface.filter((r) => r.kind !== "tram" && length(r.pts) > 180).sort((a, b) => length(b.pts) - length(a.pts));
  const carGeo = carGeometry(style, false);
  const cabGeo = carGeometry(style, true);
  owned.push(carGeo, cabGeo);
  lines.slice(0, 3).forEach((r, i) => {
    const cars: THREE.Object3D[] = [];
    const n = r.elevated ? 3 : 9;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(k === 0 || k === n - 1 ? cabGeo : carGeo, mat);
      m.castShadow = true;
      group.add(m);
      cars.push(m);
    }
    runners.push(runner(r, cars, 20, r.elevated ? DECK_Y + 0.1 : 0.2, 13, i));
  });
  // Trams on the tram lines.
  surface
    .filter((r) => r.kind === "tram" && length(r.pts) > 60)
    .slice(0, 2)
    .forEach((r, i) => {
      const tram = makeTramWithPantograph(undefined, 31 + i);
      const box = new THREE.Box3().setFromObject(tram);
      const holder = new THREE.Group();
      holder.add(tram);
      tram.position.y = -box.min.y;
      group.add(holder);
      runners.push(runner(r, [holder], box.getSize(new THREE.Vector3()).z, Y.tarmac, 5, i));
    });

  /* ---- underground entrances ---- */

  if (style.metro && map.rails.some((r) => r.underground)) {
    const stations = map.pois.filter((p) => p.kind === "station" || p.kind === "subway_entrance");
    const spots = stations.length ? stations.slice(0, 3) : [];
    const sign = stationBoard(style.metro);
    if (sign) textures.push(sign);
    for (const s of spots) group.add(entrance(s.x, s.z, style.metro.line, sign, collide));
  }

  function runner(r: MapRail, cars: THREE.Object3D[], carLen: number, y: number, cruise: number, i: number): Runner {
    const cum = [0];
    for (let k = 1; k < r.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]));
    const len = cum[cum.length - 1];
    return { pts: r.pts, cum, len, y, cars, carLen, s: (len * (0.3 + i * 0.25)) % len, dir: i % 2 ? -1 : 1, speed: cruise, cruise, wait: 0 };
  }

  const place = (run: Runner) => {
    run.cars.forEach((car, k) => {
      // Car k trails the head by k car lengths, back along the track.
      const s = run.s - run.dir * (k * run.carLen + run.carLen / 2);
      const a = sampleCum(run, s - run.dir * 3);
      const b = sampleCum(run, s + run.dir * 3);
      car.position.set((a.x + b.x) / 2, run.y, (a.z + b.z) / 2);
      car.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      car.visible = s > -run.carLen && s < run.len + run.carLen;
    });
  };

  return {
    group,
    update(dt) {
      for (const run of runners) {
        if (run.wait > 0) {
          run.wait -= dt;
          continue;
        }
        const total = run.cars.length * run.carLen;
        // Run off the end, turn round and come back: the far end of the
        // line is outside the map, where the reversal cannot be seen.
        const ahead = run.dir === 1 ? run.len + total - run.s : run.s + total;
        const target = ahead < 60 ? run.cruise * 0.4 : run.cruise;
        run.speed += (target - run.speed) * (1 - Math.exp(-dt * 0.8));
        run.s += run.dir * run.speed * dt;
        if (run.dir === 1 ? run.s > run.len + total : run.s < -total) {
          run.dir = (-run.dir) as 1 | -1;
          run.s = run.dir === 1 ? -1 : run.len + 1;
          run.wait = 6 + rand() * 6;
        }
        place(run);
      }
    },
    dispose() {
      owned.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

function sampleAt(pts: Pt[], s: number): { x: number; z: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + L >= s) {
      const f = L ? (s - acc) / L : 0;
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f };
    }
    acc += L;
  }
  const last = pts[pts.length - 1];
  return { x: last[0], z: last[1] };
}

function sampleCum(run: { pts: Pt[]; cum: number[]; len: number }, s: number) {
  // Past either end, extrapolate along the end segment so cars can run off
  // the map smoothly.
  const pts = run.pts;
  const c = run.cum;
  if (s <= 0 || s >= run.len) {
    const [a, b] = s <= 0 ? [pts[0], pts[1]] : [pts[pts.length - 2], pts[pts.length - 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const base = s <= 0 ? a : b;
    const t = s <= 0 ? s : s - run.len;
    return { x: base[0] + ((b[0] - a[0]) / L) * t, z: base[1] + ((b[1] - a[1]) / L) * t };
  }
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const f = (s - c[i - 1]) / (c[i] - c[i - 1] || 1);
  return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f };
}

function stationBoard(m: NonNullable<RailStyle["metro"]>): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  const paintBoard = () => {
    g.fillStyle = "#1c2230";
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = `#${new THREE.Color(m.line).getHexString()}`;
    g.beginPath();
    g.arc(60, 64, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 50px "${m.font}", system-ui, sans-serif`;
    g.fillText("M", 60, 67);
    g.textAlign = "left";
    g.font = `600 40px "${m.font}", system-ui, sans-serif`;
    g.fillText(m.native, 118, 48);
    g.font = `600 26px "${m.font}", system-ui, sans-serif`;
    g.fillText(m.en, 120, 96);
  };
  paintBoard();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  document.fonts
    ?.load(`600 40px "${m.font}"`, m.native)
    .then(() => {
      paintBoard();
      t.needsUpdate = true;
    })
    .catch((err: unknown) => console.warn(`[rails] "${m.font}" failed to load for the station sign`, err));
  return t;
}

/** A metro entrance kiosk: glazed canopy over stairs going down, and the
 *  station sign on a post. */
function entrance(x: number, z: number, line: number, sign: THREE.Texture | null, collide: CollisionWorld): THREE.Group {
  const g = new THREE.Group();
  const P = new Parts();
  P.box(3.2, 0.3, 6, 0, 3.1, 0, line);
  for (const sx of [-1.5, 1.5]) for (const sz of [-2.8, 2.8]) P.box(0.12, 3, 0.12, sx, 1.5, sz, 0x6d7076);
  for (const sx of [-1.55, 1.55]) P.box(0.05, 1.1, 5.6, sx, 0.7, 0, 0xcfe0ea);
  P.box(2.8, 0.05, 5.2, 0, 0.03, 0, 0x1c2128);
  P.box(0.1, 3.4, 0.1, 2.2, 1.7, 3.2, 0x6d7076);
  const m = P.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  if (m) g.add(m);
  if (sign) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshLambertMaterial({ map: sign }));
    b.position.set(2.2, 3.5, 3.2);
    g.add(b);
    const back = b.clone();
    back.rotation.y = Math.PI;
    g.add(back);
  }
  g.position.set(x, 0, z);
  for (const sx of [-1.55, 1.55]) collide.box(x + sx, z, 0.1, 2.8);
  collide.box(x, z - 2.8, 1.6, 0.1);
  return g;
}

