/**
 * Walkable monuments, built to fit their real footprints.
 *
 * Each builder works in its own frame: footprint centred on the origin, `w`
 * across (x) and `d` deep (z), with the entrance on the +z side, which the
 * map compiler turns toward the street. A builder returns its geometry plus
 * the walls that block (colliders) and the surfaces that can be climbed
 * (heights), so a mosque's grand stair actually carries the player up onto
 * the plinth and into the courtyard, and a temple's steps lead up into the
 * mandapa.
 */

import * as THREE from "three";
import { Parts } from "./vc";

export type LocalBox = { x: number; z: number; hw: number; hd: number; rot?: number };
/** Height from y0 at the local -z edge to y1 at +z (flat when equal). */
export type LocalRect = { x: number; z: number; hw: number; hd: number; y0: number; y1: number };

export type Monument = {
  group: THREE.Group;
  colliders: LocalBox[];
  heights: LocalRect[];
};

const MARBLE = 0xf1ece2;
const DARK = 0x2f2722;
const WATER = 0x3f7fc0;
const GOLD = 0xe0b23a;
const SAFFRON = 0xf08a24;

function material() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

function finish(parts: Parts, colliders: LocalBox[], heights: LocalRect[], extra: THREE.Object3D[] = []): Monument {
  const group = new THREE.Group();
  const m = parts.mesh(material());
  if (m) group.add(m);
  extra.forEach((o) => group.add(o));
  return { group, colliders, heights };
}

/**
 * A raised platform with a flight of steps at the front, inside the
 * footprint. Returns the platform's depth span so builders can lay things
 * out on top. Edge walls stop the player walking off (or up) the sides.
 */
function platform(
  P: Parts,
  C: LocalBox[],
  Hs: LocalRect[],
  w: number,
  d: number,
  rise: number,
  stone: number,
  stairFrac = 0.35,
  edgeWalls = true
) {
  const stairW = Math.max(3, Math.min(w * stairFrac, 20));
  const n = Math.max(2, Math.round(rise / 0.17));
  const run = n * 0.32;
  const top = -d / 2;
  const front = d / 2 - run;
  const depth = front - top;
  const zc = (top + front) / 2;
  P.box(w, rise, depth, 0, rise / 2, zc, stone);
  P.steps(stairW, rise, 0, d / 2, stone);
  // Stair cheek walls.
  for (const s of [-1, 1]) P.box(0.6, rise + 0.3, run, s * (stairW / 2 + 0.3), (rise + 0.3) / 2, d / 2 - run / 2, stone);
  Hs.push({ x: 0, z: zc, hw: w / 2, hd: depth / 2, y0: rise, y1: rise });
  Hs.push({ x: 0, z: d / 2 - run / 2, hw: stairW / 2, hd: run / 2, y0: rise, y1: 0 });
  if (edgeWalls) {
    const t = 0.5;
    C.push({ x: 0, z: top + t / 2, hw: w / 2, hd: t / 2 });
    for (const s of [-1, 1]) C.push({ x: (s * (w - t)) / 2, z: zc, hw: t / 2, hd: depth / 2 });
    // Front edge either side of the stair.
    const side = (w - stairW) / 2 - 0.6;
    if (side > 0.2) for (const s of [-1, 1]) C.push({ x: s * (stairW / 2 + 0.6 + side / 2), z: front - t / 2, hw: side / 2, hd: t / 2 });
    for (const s of [-1, 1]) C.push({ x: s * (stairW / 2 + 0.3), z: d / 2 - run / 2, hw: 0.3, hd: run / 2 });
  }
  return { top, front, depth, zc, run, stairW };
}

/** Small open pavilion: four pillars and a dome. */
function chhatri(P: Parts, x: number, y: number, z: number, s: number, stone: number, domeCol: number) {
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.25 * s, 1.6 * s, 0.25 * s, x + a * 0.7 * s, y + 0.8 * s, z + b * 0.7 * s, stone);
  P.box(2 * s, 0.2 * s, 2 * s, x, y + 1.7 * s, z, stone);
  P.dome(0.9 * s, x, y + 1.8 * s, z, domeCol);
}

function minaret(P: Parts, C: LocalBox[], x: number, z: number, base: number, h: number, stone: number, band: number, domeCol: number) {
  const r = Math.max(0.8, h * 0.045);
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const y0 = base + (h * t) / tiers;
    const hh = h / tiers;
    const r0 = r * (1 - t * 0.14);
    P.cyl(r0 * 0.9, r0, hh, x, y0 + hh / 2, z, t % 2 ? band : stone, 12);
    // Balcony.
    P.cyl(r0 * 1.35, r0 * 1.35, 0.3, x, y0 + hh, z, stone, 12);
  }
  chhatri(P, x, base + h, z, r * 0.9, stone, domeCol);
  C.push({ x, z, hw: r, hd: r });
}

/* ------------------------------------------------------------------ *
 * Mosque family
 * ------------------------------------------------------------------ */

export type MosqueStyle = {
  stone: number;
  /** Bands, arch frames and minaret stripes. */
  accent: number;
  dome: number;
  plinth: number;
};

/** Congregational mosque: plinth, stair, cloister, courtyard, prayer hall. */
export function mosque(w: number, d: number, st: MosqueStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const pf = platform(P, C, Hs, w, d, st.plinth, st.stone, 0.3, false);
  const y = st.plinth;

  // Cloister: arcaded walls on three sides and the front, with a tall gate
  // over the stair head.
  const wallH = 5;
  const t = 1.4;
  const gateW = pf.stairW + 2;
  const side = (w - gateW) / 2;
  const walls: [number, number, number, number][] = [
    [0, pf.top + t / 2, w, t],
    [-(w - t) / 2, pf.zc, t, pf.depth],
    [(w - t) / 2, pf.zc, t, pf.depth],
    [-(gateW / 2 + side / 2), pf.front - t / 2, side, t],
    [gateW / 2 + side / 2, pf.front - t / 2, side, t],
  ];
  for (const [x, z, ww, dd] of walls) {
    P.box(ww, wallH, dd, x, y + wallH / 2, z, st.stone);
    P.box(ww + 0.2, 0.4, dd + 0.2, x, y + wallH + 0.2, z, st.accent);
    C.push({ x, z, hw: ww / 2, hd: dd / 2 });
  }
  // Arch recesses along the inner face of the front walls.
  for (const s of [-1, 1]) {
    for (let k = 0; k < Math.floor(side / 4); k++) {
      const x = s * (gateW / 2 + 2 + k * 4);
      P.box(2.4, 3.2, 0.1, x, y + 1.8, pf.front - t - 0.05, DARK);
    }
  }
  // Gate: tall portal with an arched opening and chhatris.
  const gateH = 11;
  for (const s of [-1, 1]) P.box(2, gateH, 3, s * (gateW / 2 + 1), y + gateH / 2, pf.front - 1.5, st.stone);
  P.box(gateW + 4, 3, 3, 0, y + gateH - 1.5, pf.front - 1.5, st.stone);
  P.box(gateW + 4.4, 0.5, 3.4, 0, y + gateH + 0.25, pf.front - 1.5, st.accent);
  for (const s of [-1, 1]) chhatri(P, s * (gateW / 2 + 1), y + gateH + 0.5, pf.front - 1.5, 1.1, st.stone, st.dome);
  for (const s of [-1, 1]) C.push({ x: s * (gateW / 2 + 1), z: pf.front - 1.5, hw: 1, hd: 1.5 });

  // Prayer hall across the back.
  const hallW = w * 0.8;
  const hallD = Math.min(pf.depth * 0.28, 22);
  const hallH = 10;
  const hz = pf.top + t + hallD / 2;
  P.box(hallW, hallH, hallD, 0, y + hallH / 2, hz, st.stone);
  P.box(hallW + 0.4, 0.6, hallD + 0.4, 0, y + hallH + 0.3, hz, st.accent);
  C.push({ x: 0, z: hz, hw: hallW / 2, hd: hallD / 2 });
  // Façade: arched bays and a tall central iwan.
  const bays = 9;
  for (let k = 0; k < bays; k++) {
    if (k === (bays - 1) / 2) continue;
    const x = -hallW / 2 + (hallW * (k + 0.5)) / bays;
    P.box((hallW / bays) * 0.62, 4.2, 0.1, x, y + 2.6, hz + hallD / 2 + 0.05, DARK);
    P.box((hallW / bays) * 0.8, 0.3, 0.2, x, y + 4.9, hz + hallD / 2 + 0.1, st.accent);
  }
  const iwanW = Math.min(9, hallW * 0.18);
  P.box(iwanW + 2, hallH + 4, 2, 0, y + (hallH + 4) / 2, hz + hallD / 2 + 0.9, st.stone);
  P.box(iwanW, hallH - 1, 0.12, 0, y + (hallH - 1) / 2, hz + hallD / 2 + 1.95, DARK);
  P.box(iwanW + 2.4, 0.5, 2.3, 0, y + hallH + 4.2, hz + hallD / 2 + 0.9, st.accent);
  // Domes on drums: big centre, two flanking.
  const r = Math.min(hallW * 0.11, hallD * 0.42);
  for (const [x, s] of [[0, 1], [-hallW * 0.3, 0.72], [hallW * 0.3, 0.72]] as const) {
    P.cyl(r * s * 0.95, r * s * 0.95, 2, x, y + hallH + 1, hz, st.stone, 14);
    P.dome(r * s, x, y + hallH + 2, hz, st.dome, 1.18);
    P.cyl(0.08, 0.08, 1.6, x, y + hallH + 2 + r * s * 1.5 + 0.8, hz, GOLD, 5);
  }
  // Minarets at the hall's front corners.
  const mh = Math.min(40, Math.max(14, w * 0.3));
  for (const s of [-1, 1]) minaret(P, C, s * (hallW / 2 + 1.6), hz + hallD / 2 + 1.6, y, mh, st.stone, st.accent, st.dome);

  // Ablution tank in the courtyard.
  const cz = (hz + hallD / 2 + pf.front - t) / 2;
  const tr = Math.min(6, w * 0.08);
  P.box(tr * 2 + 1, 0.5, tr * 2 + 1, 0, y + 0.25, cz, st.accent);
  P.box(tr * 2, 0.52, tr * 2, 0, y + 0.27, cz, WATER);
  C.push({ x: 0, z: cz, hw: tr + 0.5, hd: tr + 0.5 });

  return finish(P, C, Hs);
}

/** Neighbourhood masjid or dargah: low plinth, hall, one dome, two minarets. */
export function smallMosque(w: number, d: number, st: MosqueStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const pf = platform(P, C, Hs, w, d, Math.min(st.plinth, 0.9), st.stone, 0.4);
  const y = Math.min(st.plinth, 0.9);
  const hallW = w * 0.78;
  const hallD = pf.depth * 0.62;
  const hz = pf.top + hallD / 2 + 0.6;
  const hallH = Math.min(7, 3 + w * 0.25);
  P.box(hallW, hallH, hallD, 0, y + hallH / 2, hz, st.stone);
  P.box(hallW + 0.3, 0.4, hallD + 0.3, 0, y + hallH + 0.2, hz, st.accent);
  for (let k = 0; k < 3; k++) {
    P.box(hallW * 0.18, hallH * 0.6, 0.1, -hallW / 3 + (k * hallW) / 3, y + hallH * 0.32, hz + hallD / 2 + 0.05, DARK);
  }
  C.push({ x: 0, z: hz, hw: hallW / 2, hd: hallD / 2 });
  const r = Math.min(hallW, hallD) * 0.3;
  P.cyl(r * 0.95, r * 0.95, 1, 0, y + hallH + 0.5, hz, st.stone, 12);
  P.dome(r, 0, y + hallH + 1, hz, st.dome, 1.2);
  const mh = hallH * 2.1;
  for (const s of [-1, 1]) minaret(P, C, s * (hallW / 2 + 0.4), hz + hallD / 2, y, mh, st.stone, st.accent, st.dome);
  return finish(P, C, Hs);
}

/** Tomb: a domed chamber with corner chhatris on a stepped plinth. */
export function tomb(w: number, d: number, st: MosqueStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const pf = platform(P, C, Hs, w, d, Math.max(1, st.plinth * 0.6), st.stone, 0.3);
  const y = Math.max(1, st.plinth * 0.6);
  const s = Math.min(w, pf.depth) * 0.62;
  const h = s * 0.7;
  P.box(s, h, s, 0, y + h / 2, pf.zc, st.stone);
  for (const f of [1, -1]) {
    P.box(s * 0.4, h * 0.75, 0.1, 0, y + h * 0.38, pf.zc + f * (s / 2 + 0.05), DARK);
    P.box(0.1, h * 0.75, s * 0.4, f * (s / 2 + 0.05), y + h * 0.38, pf.zc, DARK);
  }
  P.box(s + 0.4, 0.5, s + 0.4, 0, y + h + 0.25, pf.zc, st.accent);
  P.cyl(s * 0.32, s * 0.32, 1.5, 0, y + h + 1.2, pf.zc, st.stone, 14);
  P.dome(s * 0.34, 0, y + h + 1.9, pf.zc, st.dome, 1.15);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) chhatri(P, a * s * 0.38, y + h + 0.5, pf.zc + b * s * 0.38, s * 0.07, st.stone, st.dome);
  C.push({ x: 0, z: pf.zc, hw: s / 2, hd: s / 2 });
  return finish(P, C, Hs);
}

/* ------------------------------------------------------------------ *
 * Temples
 * ------------------------------------------------------------------ */

export type TempleStyle = {
  stone: number;
  accent: number;
  plinth: number;
  /** "nagara": North Indian curvilinear shikhara. "kalinga": Odisha rekha
   *  deul with a stepped jagamohana. */
  kind: "nagara" | "kalinga";
  /** Tower height relative to the footprint. */
  tower: number;
  /** Walled compound with a gateway (Lingaraj). */
  compound?: boolean;
};

/** Curvilinear tower: banded courses that swell and draw in to an amalaka. */
function shikhara(P: Parts, x: number, y: number, z: number, base: number, h: number, st: TempleStyle) {
  const courses = st.kind === "kalinga" ? 12 : 9;
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    // Parabolic batter: steep at the base, rounding in at the top.
    const s = base * (1 - Math.pow(t, 1.8) * 0.62);
    const ch = h / courses;
    P.box(s, ch * 0.92, s, x, y + ch * (i + 0.5), z, i % 2 ? st.accent : st.stone);
    // Vertical ribs on each face.
    for (const f of [-1, 1]) {
      P.box(s * 0.22, ch, 0.12, x, y + ch * (i + 0.5), z + f * (s / 2 + 0.05), st.stone);
      P.box(0.12, ch, s * 0.22, x + f * (s / 2 + 0.05), y + ch * (i + 0.5), z, st.stone);
    }
  }
  const top = y + h;
  const cap = base * 0.42;
  P.cyl(cap * 0.55, cap * 0.55, cap * 0.25, x, top + cap * 0.12, z, st.stone, 16);
  P.add(new THREE.SphereGeometry(cap * 0.3, 10, 6).scale(1, 0.5, 1).translate(x, top + cap * 0.35, z), st.accent);
  P.cone(cap * 0.12, cap * 0.5, x, top + cap * 0.65, z, GOLD);
  // Flag on a staff.
  P.cyl(0.05, 0.05, cap * 1.6, x, top + cap * 1.2, z, 0x5b3a22, 4);
  P.box(0.05, cap * 0.35, cap * 0.7, x, top + cap * 1.8, z + cap * 0.35, SAFFRON);
}

/** A temple: steps up to a pillared mandapa, the sanctum and its tower
 *  behind. The mandapa is open, so the player can walk in to the door. */
export function temple(w: number, d: number, st: TempleStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  let W = w;
  let D = d;
  if (st.compound) {
    // Compound wall with a gateway; the temple stands inside it.
    const t = 1.2;
    const wh = 4;
    const gate = Math.min(8, w * 0.18);
    const segs: [number, number, number, number][] = [
      [0, -d / 2 + t / 2, w, t],
      [-(w - t) / 2, 0, t, d],
      [(w - t) / 2, 0, t, d],
      [-(w / 2 + gate / 2) / 2, d / 2 - t / 2, w / 2 - gate / 2, t],
      [(w / 2 + gate / 2) / 2, d / 2 - t / 2, w / 2 - gate / 2, t],
    ];
    for (const [x, z, ww, dd] of segs) {
      P.box(ww, wh, dd, x, wh / 2, z, st.stone);
      C.push({ x, z, hw: ww / 2, hd: dd / 2 });
    }
    // Gate towers.
    for (const s of [-1, 1]) P.box(2, wh + 2.5, 2, s * (gate / 2 + 1), (wh + 2.5) / 2, d / 2 - t / 2, st.accent);
    W = w * 0.55;
    D = d * 0.62;
  }
  const rise = st.plinth;
  const pf = platform(P, C, Hs, W, D, rise, st.stone, 0.4);
  const y = rise;

  // Sanctum at the back, tower on it.
  const s = Math.min(W * 0.55, pf.depth * 0.5);
  const sz = pf.top + s / 2 + 0.4;
  const sh = s * 0.55;
  P.box(s, sh, s, 0, y + sh / 2, sz, st.stone);
  P.box(s * 0.28, sh * 0.62, 0.1, 0, y + sh * 0.31, sz + s / 2 + 0.05, DARK);
  C.push({ x: 0, z: sz, hw: s / 2, hd: s / 2 });
  shikhara(P, 0, y + sh, sz, s, Math.max(4, s * st.tower), st);

  // Mandapa in front: pillars under a stepped pyramidal roof.
  const mw = W * 0.8;
  const md = Math.max(3, pf.front - (sz + s / 2) - 0.6);
  const mz = sz + s / 2 + md / 2;
  const ph = Math.min(4, 2.6 + W * 0.05);
  for (const px of [-mw / 2 + 0.3, -mw / 6, mw / 6, mw / 2 - 0.3]) {
    for (const pz of [mz - md / 2 + 0.3, mz + md / 2 - 0.3]) {
      P.box(0.35, ph, 0.35, px, y + ph / 2, pz, st.accent);
      C.push({ x: px, z: pz, hw: 0.25, hd: 0.25 });
    }
  }
  P.box(mw + 0.8, 0.4, md + 0.8, 0, y + ph + 0.2, mz, st.stone);
  const tiers = st.kind === "kalinga" ? 5 : 3;
  for (let i = 0; i < tiers; i++) {
    const f = 1 - (i + 1) / (tiers + 1);
    P.box((mw + 0.8) * f, 0.55, (md + 0.8) * f, 0, y + ph + 0.6 + i * 0.6, mz, i % 2 ? st.accent : st.stone);
  }
  // Bell at the door.
  P.cyl(0.02, 0.02, 0.6, 0, y + ph - 0.3, sz + s / 2 + 0.8, 0x3a3a3a, 4);
  P.cone(0.18, 0.3, 0, y + ph - 0.7, sz + s / 2 + 0.8, GOLD, 8);
  return finish(P, C, Hs);
}

/* ------------------------------------------------------------------ *
 * Churches
 * ------------------------------------------------------------------ */

export type ChurchStyle = { wall: number; trim: number; roof: number; towers: 0 | 1 | 2 };

export function church(w: number, d: number, st: ChurchStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const pf = platform(P, C, Hs, w, d, 0.6, st.trim, 0.3);
  const y = 0.6;
  const nw = Math.min(w * 0.62, 18);
  const nd = pf.depth * 0.82;
  const nz = pf.top + nd / 2 + 0.3;
  const nh = Math.min(12, 5 + nw * 0.4);
  P.box(nw, nh, nd, 0, y + nh / 2, nz, st.wall);
  // Gable roof as two sloped slabs.
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(nw * 0.58, 0.3, nd + 0.6);
    g.rotateZ(s * -0.55);
    g.translate(s * nw * 0.24, y + nh + nw * 0.14, nz);
    P.add(g, st.roof);
  }
  C.push({ x: 0, z: nz, hw: nw / 2, hd: nd / 2 });
  // Façade: gable front, door, rose window, pilasters.
  const fz = nz + nd / 2;
  P.box(nw + 0.4, 0.5, 0.6, 0, y + nh + 0.2, fz, st.trim);
  const tri = new THREE.Shape([new THREE.Vector2(-nw / 2, 0), new THREE.Vector2(nw / 2, 0), new THREE.Vector2(0, nw * 0.32)]);
  P.add(new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false }).translate(0, y + nh + 0.4, fz - 0.3), st.wall);
  P.box(nw * 0.2, nh * 0.45, 0.1, 0, y + nh * 0.225, fz + 0.05, DARK);
  P.add(new THREE.CylinderGeometry(nw * 0.1, nw * 0.1, 0.1, 14).rotateX(Math.PI / 2).translate(0, y + nh * 0.68, fz + 0.06), 0x3b4f7a);
  for (const px of [-nw / 2 + 0.3, -nw / 6, nw / 6, nw / 2 - 0.3]) P.box(0.5, nh, 0.3, px, y + nh / 2, fz + 0.1, st.trim);
  // Cross on the gable.
  P.box(0.15, 1.4, 0.15, 0, y + nh + nw * 0.32 + 1.1, fz - 0.05, st.trim);
  P.box(0.8, 0.15, 0.15, 0, y + nh + nw * 0.32 + 1.4, fz - 0.05, st.trim);

  // Towers.
  const tw = Math.max(3, nw * 0.26);
  const th = nh * 1.7;
  const towerAt = st.towers === 2 ? [-(nw / 2 + tw / 2 - 0.4), nw / 2 + tw / 2 - 0.4] : st.towers === 1 ? [0] : [];
  for (const tx of towerAt) {
    const tz = st.towers === 1 ? fz + tw / 2 : fz - tw / 2;
    P.box(tw, th, tw, tx, y + th / 2, tz, st.wall);
    for (let k = 1; k <= 3; k++) P.box(tw + 0.3, 0.3, tw + 0.3, tx, y + (th * k) / 4, tz, st.trim);
    P.box(tw * 0.35, tw * 0.6, 0.1, tx, y + th * 0.82, tz + tw / 2 + 0.05, DARK);
    P.cone(tw * 0.72, tw * 1.6, tx, y + th + tw * 0.8, tz, st.roof, 4);
    P.box(0.12, 1.1, 0.12, tx, y + th + tw * 1.6 + 0.5, tz, st.trim);
    P.box(0.6, 0.12, 0.12, tx, y + th + tw * 1.6 + 0.75, tz, st.trim);
    C.push({ x: tx, z: tz, hw: tw / 2, hd: tw / 2 });
  }
  return finish(P, C, Hs);
}

/* ------------------------------------------------------------------ *
 * Gurdwaras
 * ------------------------------------------------------------------ */

export type GurdwaraStyle = { storeys: number; gold: boolean; nishan: boolean };

/** White (or gilded) storeys with arched windows, a ribbed dome and corner
 *  kiosks; the Nishan Sahib flag outside. */
export function gurdwara(w: number, d: number, st: GurdwaraStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const pf = platform(P, C, Hs, w, d, 0.8, MARBLE, 0.45);
  const y = 0.8;
  const s = Math.min(w * 0.72, pf.depth * 0.72);
  const sz = pf.zc - 0.5;
  const fh = 4.2;
  for (let k = 0; k < st.storeys; k++) {
    const shrink = 1 - k * 0.08;
    const col = st.gold && k > 0 ? GOLD : MARBLE;
    P.box(s * shrink, fh, s * shrink, 0, y + fh * (k + 0.5), sz, col);
    P.box(s * shrink + 0.4, 0.3, s * shrink + 0.4, 0, y + fh * (k + 1), sz, st.gold ? GOLD : 0xe8c85a);
    for (const f of [-1, 1]) {
      for (let a = -1; a <= 1; a++) {
        P.box(s * 0.12, fh * 0.55, 0.1, (a * s * shrink) / 3.4, y + fh * (k + 0.45), sz + f * ((s * shrink) / 2 + 0.05), DARK);
        P.box(0.1, fh * 0.55, s * 0.12, f * ((s * shrink) / 2 + 0.05), y + fh * (k + 0.45), sz + (a * s * shrink) / 3.4, DARK);
      }
    }
  }
  const top = y + fh * st.storeys;
  const r = s * 0.28;
  P.cyl(r * 0.9, r * 0.95, 1.2, 0, top + 0.6, sz, st.gold ? GOLD : MARBLE, 16);
  P.dome(r, 0, top + 1.2, sz, GOLD, 1.12);
  P.cyl(0.1, 0.1, r * 0.9, 0, top + 1.2 + r * 1.5 + r * 0.45, sz, GOLD, 6);
  const k = s * 0.38;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) chhatri(P, a * k, top, sz + b * k, s * 0.055, st.gold ? GOLD : MARBLE, GOLD);
  C.push({ x: 0, z: sz, hw: s / 2, hd: s / 2 });
  if (st.nishan) {
    const nx = w / 2 - 1.5;
    const nz = pf.front - 2;
    P.cyl(0.12, 0.16, 16, nx, y + 8, nz, 0xd9d4c7, 6);
    P.box(0.05, 2, 3, nx, y + 14.6, nz + 1.5, SAFFRON);
    P.cone(0.35, 0.8, nx, y + 16.4, nz, GOLD, 6);
    C.push({ x: nx, z: nz, hw: 0.3, hd: 0.3 });
  }
  return finish(P, C, Hs);
}

/* ------------------------------------------------------------------ *
 * Gates, fountains and other civic pieces
 * ------------------------------------------------------------------ */

/**
 * A gateway of `arches` openings spanning `w` across x (the road runs
 * along z through it). Only the piers collide.
 */
export function gateway(w: number, d: number, arches: number, stone: number, accent: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const pier = Math.max(1.6, w * 0.08);
  const open = (w - pier * (arches + 1)) / arches;
  const h = Math.max(9, open * 1.6);
  const depth = Math.max(3, d);
  for (let i = 0; i <= arches; i++) {
    const x = -w / 2 + pier / 2 + i * (pier + open);
    P.box(pier, h, depth, x, h / 2, 0, stone);
    P.box(pier + 0.3, 0.4, depth + 0.3, x, h * 0.55, 0, accent);
    C.push({ x, z: 0, hw: pier / 2, hd: depth / 2 });
    if (i < arches) {
      // Pointed arch head: two sloped slabs meeting over the opening.
      const cx = x + pier / 2 + open / 2;
      for (const s of [-1, 1]) {
        const g = new THREE.BoxGeometry(open * 0.62, 0.9, depth);
        g.rotateZ(s * -0.6);
        g.translate(cx + s * open * 0.22, h * 0.62, 0);
        P.add(g, stone);
      }
    }
  }
  P.box(w, h * 0.3, depth, 0, h * 0.85, 0, stone);
  P.box(w + 0.6, 0.6, depth + 0.6, 0, h + 0.3, 0, accent);
  for (let i = 0; i <= arches; i++) {
    const x = -w / 2 + pier / 2 + i * (pier + open);
    P.cone(0.5, 1.4, x, h + 1.3, 0, stone, 8);
  }
  return finish(P, C, []);
}

/** Gulzar Houz: an octagonal basin with a tiered fountain, in a roundabout. */
export function fountain(w: number, d: number, stone: number): Monument {
  const P = new Parts();
  const r = Math.min(w, d) * 0.45;
  P.cyl(r, r, 0.7, 0, 0.35, 0, stone, 8);
  P.cyl(r - 0.4, r - 0.4, 0.72, 0, 0.36, 0, WATER, 8);
  for (let k = 0; k < 3; k++) P.cyl(r * (0.3 - k * 0.08), r * (0.34 - k * 0.08), 0.5, 0, 0.9 + k * 0.9, 0, stone, 8);
  P.cone(0.3, 1.2, 0, 3.6, 0, 0xcfe8f2, 6);
  return finish(P, [{ x: 0, z: 0, hw: r * 0.9, hd: r * 0.9 }], []);
}

/** Kabutar Khana: a railed platform round a pillar and a caged cupola, where
 *  the city feeds its pigeons. */
export function kabutarKhana(w: number, d: number): Monument {
  const P = new Parts();
  const r = Math.min(w, d) * 0.45;
  P.cyl(r, r, 0.5, 0, 0.25, 0, 0xd8cfbf, 12);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    P.box(0.08, 0.9, 0.08, Math.cos(a) * r, 0.95, Math.sin(a) * r, 0x2e5a3a);
  }
  P.add(new THREE.TorusGeometry(r, 0.05, 4, 24).rotateX(Math.PI / 2).translate(0, 1.4, 0), 0x2e5a3a);
  P.cyl(0.45, 0.55, 7, 0, 3.5, 0, 0xe7e1d4, 10);
  P.cyl(1.6, 1.6, 0.2, 0, 7, 0, 0x2e5a3a, 12);
  P.dome(1.5, 0, 7.1, 0, 0x2e5a3a, 1.0);
  // Pigeons on the platform and grain.
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 40; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = 1 + rnd() * (r - 1.4);
    P.add(new THREE.IcosahedronGeometry(0.13, 0).scale(1, 0.8, 1.4).rotateY(rnd() * 6).translate(Math.cos(a) * rr, 0.62, Math.sin(a) * rr), rnd() < 0.2 ? 0xf2f2f2 : 0x7c7f8a);
  }
  return finish(P, [{ x: 0, z: 0, hw: r * 0.95, hd: r * 0.95 }], []);
}

/** Colonial block: stuccoed floors with a pillared portico and pediment,
 *  green louvred shutters. Park Street, Fort Kochi. */
export function colonialBlock(w: number, d: number, floors: number, wall: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const fh = 4;
  const h = floors * fh;
  const bw = w * 0.92;
  const bd = d * 0.8;
  const bz = -d / 2 + bd / 2;
  P.box(bw, h, bd, 0, h / 2, bz, wall);
  C.push({ x: 0, z: bz, hw: bw / 2, hd: bd / 2 });
  for (let f = 0; f < floors; f++) {
    P.box(bw + 0.3, 0.3, bd + 0.3, 0, fh * (f + 1), bz, 0xf4efe4);
    const n = Math.max(3, Math.floor(bw / 3));
    for (let k = 0; k < n; k++) {
      const x = -bw / 2 + (bw * (k + 0.5)) / n;
      P.box(1.1, 2.2, 0.1, x, fh * f + 2, bz + bd / 2 + 0.05, 0x2f5e3f);
      P.box(1.4, 0.2, 0.25, x, fh * f + 3.25, bz + bd / 2 + 0.1, 0xf4efe4);
    }
  }
  P.box(bw + 0.6, 0.8, bd + 0.6, 0, h + 0.4, bz, 0xf4efe4);
  // Portico.
  const pw = Math.min(bw * 0.5, 14);
  const pz = bz + bd / 2 + 1.6;
  for (let k = 0; k < 6; k++) {
    const x = -pw / 2 + (pw * k) / 5;
    P.cyl(0.3, 0.35, fh * 2, x, fh, pz + 1.1, 0xf4efe4, 10);
    C.push({ x, z: pz + 1.1, hw: 0.35, hd: 0.35 });
  }
  P.box(pw + 1, 0.8, 3.4, 0, fh * 2 + 0.4, pz, 0xf4efe4);
  const tri = new THREE.Shape([new THREE.Vector2(-pw / 2 - 0.5, 0), new THREE.Vector2(pw / 2 + 0.5, 0), new THREE.Vector2(0, 2.4)]);
  P.add(new THREE.ExtrudeGeometry(tri, { depth: 0.6, bevelEnabled: false }).translate(0, fh * 2 + 0.8, pz + 1.1), 0xf4efe4);
  return finish(P, C, []);
}

/** Jallianwala Bagh: walled garden, the flame memorial and the martyrs' well. */
export function memorialGarden(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const t = 1;
  const wh = 3.2;
  const gate = 3;
  const segs: [number, number, number, number][] = [
    [0, -d / 2 + t / 2, w, t],
    [-(w - t) / 2, 0, t, d],
    [(w - t) / 2, 0, t, d],
    [-(w / 2 + gate / 2) / 2, d / 2 - t / 2, w / 2 - gate / 2, t],
    [(w / 2 + gate / 2) / 2, d / 2 - t / 2, w / 2 - gate / 2, t],
  ];
  for (const [x, z, ww, dd] of segs) {
    P.box(ww, wh, dd, x, wh / 2, z, 0xa4553b);
    C.push({ x, z, hw: ww / 2, hd: dd / 2 });
  }
  // Paths and lawns.
  P.box(w - 2, 0.05, d - 2, 0, 0.03, 0, 0x7fb069);
  P.box(3, 0.08, d - 2, 0, 0.05, 0, 0xd9c9a8);
  P.box(w - 2, 0.08, 3, 0, 0.05, 0, 0xd9c9a8);
  // Flame of Liberty: a tapering red sandstone pylon.
  const fz = -d * 0.15;
  P.box(9, 1, 9, 0, 0.5, fz, 0xc9a882);
  for (let k = 0; k < 6; k++) {
    const s = 3.2 - k * 0.42;
    P.box(s, 2.6, s, 0, 1 + 1.3 + k * 2.6, fz, k % 2 ? 0xa4553b : 0xb5623f);
  }
  P.cone(0.9, 2.4, 0, 1 + 6 * 2.6 + 1.2, fz, 0xd9412b, 6);
  C.push({ x: 0, z: fz, hw: 4.5, hd: 4.5 });
  // Martyrs' well.
  const wx = w * 0.28;
  P.cyl(2.4, 2.4, 1.1, wx, 0.55, 0, 0xd9d4c7, 12);
  P.cyl(1.8, 1.8, 1.12, wx, 0.56, 0, 0x1f2a33, 12);
  C.push({ x: wx, z: 0, hw: 2.4, hd: 2.4 });
  return finish(P, C, []);
}

/** A bus terminus: raised bays under long canopies, buses nosed in. */
export function busStation(w: number, d: number, livery: { body: number; stripe: number; upper: number }): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const bays = Math.max(2, Math.floor(w / 14));
  const len = Math.min(d * 0.8, 40);
  for (let b = 0; b < bays; b++) {
    const x = -w / 2 + (w * (b + 0.5)) / bays;
    // Platform, columns and canopy.
    P.box(3, 0.25, len, x, 0.125, 0, 0xcfc9bb);
    for (let k = 0; k <= 4; k++) {
      const z = -len / 2 + (len * k) / 4;
      P.box(0.3, 5, 0.3, x, 2.5, z, 0x6d7076);
      C.push({ x, z, hw: 0.3, hd: 0.3 });
    }
    P.box(9, 0.3, len + 2, x, 5.2, 0, 0xe6e3dc);
    P.box(9.2, 0.5, 0.3, x, 5.2, len / 2 + 1, livery.body);
    // A bus in the bay beside the platform.
    for (const side of [-1, 1]) {
      if ((b + side) % 3 === 0) continue;
      const bx = x + side * 3.2;
      const bl = 11;
      const bz = -len / 2 + bl / 2 + 1 + ((b * 7) % 5);
      P.box(2.5, 1.05, bl, bx, 0.95, bz, livery.body);
      P.box(2.52, 0.22, bl, bx, 1.55, bz, livery.stripe);
      P.box(2.5, 1.35, bl, bx, 2.35, bz, livery.upper);
      P.box(2.54, 0.85, bl - 1.4, bx, 2.3, bz, 0x26303c);
      P.box(2.4, 0.15, bl - 0.4, bx, 3.1, bz, 0xe8e6e0);
      C.push({ x: bx, z: bz, hw: 1.3, hd: bl / 2 });
    }
  }
  return finish(P, C, []);
}

/** A seafront promenade: sea wall, benches and lamps along the long side. */
export function promenade(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const wallZ = -d / 2 + 0.4;
  P.box(w, 0.9, 0.5, 0, 0.45, wallZ, 0xd8cfbd);
  C.push({ x: 0, z: wallZ, hw: w / 2, hd: 0.3 });
  const n = Math.max(2, Math.floor(w / 8));
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + (w * (k + 0.5)) / n;
    // Bench facing the water.
    P.box(1.8, 0.1, 0.5, x, 0.45, wallZ + 1.2, 0x8a5a2b);
    P.box(1.8, 0.45, 0.08, x, 0.7, wallZ + 1.45, 0x8a5a2b);
    for (const s of [-0.8, 0.8]) P.box(0.08, 0.45, 0.45, x + s, 0.22, wallZ + 1.2, 0x3a3d42);
    C.push({ x, z: wallZ + 1.2, hw: 0.9, hd: 0.3 });
    if (k % 2 === 0) {
      P.cyl(0.07, 0.09, 4.2, x + 3, 2.1, wallZ + 0.9, 0x2e5a3a, 6);
      P.add(new THREE.SphereGeometry(0.28, 8, 6).translate(x + 3, 4.4, wallZ + 0.9), 0xfff3c8);
      C.push({ x: x + 3, z: wallZ + 0.9, hw: 0.15, hd: 0.15 });
    }
  }
  return finish(P, C, []);
}
