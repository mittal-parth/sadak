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
/** Height from y0 at the local -z edge to y1 at +z (flat when equal), turned
 *  by `rot` within the monument's frame. */
export type LocalRect = { x: number; z: number; hw: number; hd: number; y0: number; y1: number; rot?: number };

export type Monument = {
  group: THREE.Group;
  colliders: LocalBox[];
  heights: LocalRect[];
  /** Where a priest, a flower seller or a sevadar stands inside: in the
   *  mandapa, the mosque courtyard, on the gurdwara's platform. Local frame;
   *  they face +z, toward whoever comes up the steps. */
  inner?: { x: number; z: number };
};

const MARBLE = 0xf1ece2;
const DARK = 0x2f2722;
const WATER = 0x3f7fc0;
const GOLD = 0xe0b23a;
const SAFFRON = 0xf08a24;

function material() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

export function finish(
  parts: Parts,
  colliders: LocalBox[],
  heights: LocalRect[],
  inner?: { x: number; z: number }
): Monument {
  const group = new THREE.Group();
  const m = parts.mesh(material());
  if (m) group.add(m);
  return { group, colliders, heights, inner };
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
export function chhatri(P: Parts, x: number, y: number, z: number, s: number, stone: number, domeCol: number) {
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
  /** Over the prayer hall: Delhi's three onions, Ahmedabad's field of small
   *  domes, or none (the Mecca Masjid's flat roof between its minarets). */
  domes?: "three" | "many" | "none";
  /** Black inlay striping the domes and the minarets' marble. */
  stripe?: number;
  /** Stairs and gates on the two sides as well as the front. */
  sideGates?: boolean;
};

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
  return finish(P, C, Hs, { x: 0, z: Math.min(pf.front - 1, hz + hallD / 2 + 2) });
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
  return finish(P, C, Hs, { x: 0, z: Math.min(pf.front - 1, pf.zc + s / 2 + 1.5) });
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
  // Corner pillars, and on a wide mandapa two more with a broad bay between
  // them: the way in is down the middle, wide enough to walk through.
  const pillarsX = mw >= 7 ? [-mw / 2 + 0.3, -mw / 4, mw / 4, mw / 2 - 0.3] : [-mw / 2 + 0.3, mw / 2 - 0.3];
  for (const px of pillarsX) {
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
  // Inside the mandapa, by the sanctum door.
  return finish(P, C, Hs, { x: 0, z: sz + s / 2 + 1.6 });
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
  const t = 0.5;
  const fz = nz + nd / 2;
  const bz = nz - nd / 2;
  const doorW = Math.max(2.4, nw * 0.26);
  const WOOD = 0x6b4a2e;

  // Walls: a nave you walk into, not a block. Side walls, the east end
  // behind the altar, and a west front with the door in it.
  for (const sx of [-1, 1]) {
    P.box(t, nh, nd, sx * (nw / 2 - t / 2), y + nh / 2, nz, st.wall);
    C.push({ x: sx * (nw / 2 - t / 2), z: nz, hw: t / 2, hd: nd / 2 });
    // Tall arched windows, coloured glass, inside and out.
    const n = Math.max(2, Math.floor(nd / 4.5));
    for (let k = 0; k < n; k++) {
      const z = bz + 3 + ((nd - 6) * (k + 0.5)) / n;
      for (const face of [1, -1]) {
        const x = sx * (nw / 2 - t / 2) + sx * face * (t / 2 + 0.03);
        P.box(0.05, nh * 0.42, 1.3, x, y + nh * 0.5, z, k % 2 ? 0x3b6fa8 : 0x9b3b5a);
        P.add(new THREE.CylinderGeometry(0.65, 0.65, 0.05, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(x, y + nh * 0.71, z), k % 2 ? 0x3b6fa8 : 0x9b3b5a);
      }
    }
  }
  P.box(nw, nh, t, 0, y + nh / 2, bz + t / 2, st.wall);
  C.push({ x: 0, z: bz + t / 2, hw: nw / 2, hd: t / 2 });
  const side = (nw - doorW) / 2;
  for (const sx of [-1, 1]) {
    P.box(side, nh, t, sx * (doorW / 2 + side / 2), y + nh / 2, fz - t / 2, st.wall);
    C.push({ x: sx * (doorW / 2 + side / 2), z: fz - t / 2, hw: side / 2, hd: t / 2 });
  }
  // Over the door, and the door leaves standing open.
  P.box(doorW, nh - 3.4, t, 0, y + 3.4 + (nh - 3.4) / 2, fz - t / 2, st.wall);
  for (const sx of [-1, 1]) P.box(0.08, 3.3, doorW / 2, sx * (doorW / 2 + 0.05), y + 1.65, fz + doorW / 4, WOOD);

  // Timber ceiling under a pitched roof.
  P.box(nw - 0.2, 0.2, nd - 0.2, 0, y + nh - 0.1, nz, 0x7a5a3a);
  for (let z = bz + 2; z < fz - 1; z += 3) P.box(nw - 0.3, 0.3, 0.25, 0, y + nh - 0.35, z, WOOD);
  for (const sgn of [-1, 1]) {
    const g = new THREE.BoxGeometry(nw * 0.58, 0.3, nd + 0.6);
    g.rotateZ(sgn * -0.55);
    g.translate(sgn * nw * 0.24, y + nh + nw * 0.14, nz);
    P.add(g, st.roof);
  }

  // Inside: altar on a step at the east end, a cross, candle stands; pews
  // either side of the aisle down the middle.
  const altarZ = bz + t + 2.2;
  P.box(nw - 1.2, 0.3, 3.4, 0, y + 0.15, altarZ, st.trim);
  Hs.push({ x: 0, z: altarZ, hw: (nw - 1.2) / 2, hd: 1.7, y0: y + 0.3, y1: y + 0.3 });
  P.box(2.6, 1.0, 1.0, 0, y + 0.8, bz + t + 1.3, 0xf4efe4);
  P.box(2.7, 0.08, 1.1, 0, y + 1.34, bz + t + 1.3, 0xd4a017);
  C.push({ x: 0, z: bz + t + 1.3, hw: 1.3, hd: 0.5 });
  P.box(0.18, 2.6, 0.12, 0, y + 3.2, bz + t + 0.2, 0xd4a017);
  P.box(1.4, 0.18, 0.12, 0, y + 3.9, bz + t + 0.2, 0xd4a017);
  for (const sx of [-1, 1]) {
    P.cyl(0.06, 0.1, 1.4, sx * 1.8, y + 1.0, bz + t + 1.3, 0xd4a017, 6);
    P.cyl(0.04, 0.04, 0.25, sx * 1.8, y + 1.82, bz + t + 1.3, 0xfff1c2, 6);
  }
  const aisle = Math.max(1.8, doorW * 0.8);
  const pewW = (nw - 2 * t - aisle) / 2 - 0.4;
  if (pewW > 0.8) {
    for (let z = altarZ + 3; z < fz - 3; z += 1.3) {
      for (const sx of [-1, 1]) {
        const x = sx * (aisle / 2 + pewW / 2);
        P.box(pewW, 0.45, 0.45, x, y + 0.45, z, WOOD);
        P.box(pewW, 0.5, 0.08, x, y + 0.85, z - 0.22, WOOD);
        C.push({ x, z, hw: pewW / 2, hd: 0.3 });
      }
    }
  }

  // Façade over the door: gable, rose window, pilasters, cross.
  P.box(nw + 0.4, 0.5, 0.6, 0, y + nh + 0.2, fz, st.trim);
  const tri = new THREE.Shape([new THREE.Vector2(-nw / 2, 0), new THREE.Vector2(nw / 2, 0), new THREE.Vector2(0, nw * 0.32)]);
  P.add(new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false }).translate(0, y + nh + 0.4, fz - 0.3), st.wall);
  P.add(new THREE.CylinderGeometry(nw * 0.1, nw * 0.1, 0.1, 14).rotateX(Math.PI / 2).translate(0, y + nh * 0.72, fz + 0.06), 0x3b4f7a);
  for (const px of [-nw / 2 + 0.3, -doorW / 2 - 0.4, doorW / 2 + 0.4, nw / 2 - 0.3]) P.box(0.5, nh, 0.3, px, y + nh / 2, fz + 0.1, st.trim);
  P.box(0.15, 1.4, 0.15, 0, y + nh + nw * 0.32 + 1.1, fz - 0.05, st.trim);
  P.box(0.8, 0.15, 0.15, 0, y + nh + nw * 0.32 + 1.4, fz - 0.05, st.trim);

  // Towers: a pair flanking the front, or one at the front corner (a
  // Kerala church's bell tower), never across the door.
  const tw = Math.max(3, nw * 0.26);
  const th = nh * 1.7;
  const towerAt: [number, number][] =
    st.towers === 2
      ? [[-(nw / 2 + tw / 2 - 0.4), fz - tw / 2], [nw / 2 + tw / 2 - 0.4, fz - tw / 2]]
      : st.towers === 1
        ? [[nw / 2 + tw / 2 - 0.4, fz - tw / 2]]
        : [];
  for (const [tx, tz] of towerAt) {
    P.box(tw, th, tw, tx, y + th / 2, tz, st.wall);
    for (let k = 1; k <= 3; k++) P.box(tw + 0.3, 0.3, tw + 0.3, tx, y + (th * k) / 4, tz, st.trim);
    P.box(tw * 0.35, tw * 0.6, 0.1, tx, y + th * 0.82, tz + tw / 2 + 0.05, DARK);
    P.cone(tw * 0.72, tw * 1.6, tx, y + th + tw * 0.8, tz, st.roof, 4);
    P.box(0.12, 1.1, 0.12, tx, y + th + tw * 1.6 + 0.5, tz, st.trim);
    P.box(0.6, 0.12, 0.12, tx, y + th + tw * 1.6 + 0.75, tz, st.trim);
    C.push({ x: tx, z: tz, hw: tw / 2, hd: tw / 2 });
  }
  // The priest stands before the altar step, facing the door.
  return finish(P, C, Hs, { x: 0, z: altarZ + 2.2 });
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
  return finish(P, C, Hs, { x: 0, z: sz + s / 2 + 1.8 });
}

/** An arched window: a dark opening with a round head, on a face at z. */
export function archWindow(P: Parts, x: number, y: number, z: number, w: number, h: number, col: number, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h - w / 2, 0.08).translate(0, (h - w / 2) / 2, 0);
  const head = new THREE.CylinderGeometry(w / 2, w / 2, 0.08, 10, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, h - w / 2, 0);
  for (const geo of [g, head]) P.add(geo.rotateY(rotY).translate(x, y, z), col);
}

/** Four faces of a square block `s` wide centred on (0, cz): calls `f` with
 *  each face's offset along it and the face's rotation. */
function eachFace(s: number, cz: number, f: (px: (u: number) => number, pz: (u: number) => number, rot: number) => void) {
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    // Face normal (sin rot, cos rot); along the face (cos rot, -sin rot).
    f((u) => u * c + (sn * s) / 2, (u) => cz - u * sn + (c * s) / 2, rot);
  }
}

/**
 * The Harmandir Sahib: a marble ground storey with a door on every side, a
 * gilded upper storey with arched windows and jharokhas, a parapet of
 * gilded kiosks, and the fluted gold dome on its lotus. It stands on a
 * marble platform in the sarovar; the causeway arrives at the front.
 */
export function harmandir(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const rise = 0.3;
  P.box(w, rise, d, 0, rise / 2, 0, MARBLE);
  P.box(w + 0.3, 0.12, d + 0.3, 0, 0.06, 0, 0xd8c3a0);
  Hs.push({ x: 0, z: 0, hw: w / 2, hd: d / 2, y0: rise, y1: rise });
  // A low marble railing round the back and sides; open at the front.
  const rail = (x: number, z: number, lw: number, ld: number) => {
    P.box(lw, 0.7, ld, x, rise + 0.35, z, MARBLE);
    P.box(lw + 0.1, 0.08, ld + 0.1, x, rise + 0.74, z, GOLD);
    C.push({ x, z, hw: lw / 2, hd: ld / 2 });
  };
  rail(0, -d / 2 + 0.15, w, 0.3);
  for (const sx of [-1, 1]) rail(sx * (w / 2 - 0.15), -0.5, 0.3, d - 1);
  const s = Math.min(w, d) * 0.74;
  const sz = -d * 0.08;
  const y = rise;
  // Ground storey: marble, inlaid panels, a door on each side.
  const g1 = 5;
  P.box(s, g1, s, 0, y + g1 / 2, sz, MARBLE);
  eachFace(s, sz, (px, pz, rot) => {
    for (const u of [-s * 0.33, s * 0.33]) P.box(s * 0.2, g1 * 0.62, 0.06, px(u) + Math.sin(rot) * 0.03, y + g1 * 0.46, pz(u) + Math.cos(rot) * 0.03, 0xe6dccb, rot);
    P.box(s * 0.26, 3.7, 0.1, px(0) + Math.sin(rot) * 0.03, y + 1.85, pz(0) + Math.cos(rot) * 0.03, GOLD, rot);
    archWindow(P, px(0) + Math.sin(rot) * 0.06, y, pz(0) + Math.cos(rot) * 0.06, s * 0.18, 3.3, DARK, rot);
  });
  P.box(s + 0.5, 0.35, s + 0.5, 0, y + g1 + 0.1, sz, GOLD);
  // Upper storey, gilded, with arched windows and a jharokha on each face.
  const g2 = 4.4;
  const s2 = s * 0.96;
  const y2 = y + g1 + 0.3;
  P.box(s2, g2, s2, 0, y2 + g2 / 2, sz, GOLD);
  eachFace(s2, sz, (px, pz, rot) => {
    const out = (u: number, o: number): [number, number] => [px(u) + Math.sin(rot) * o, pz(u) + Math.cos(rot) * o];
    for (const u of [-s2 * 0.34, s2 * 0.34]) {
      const [x, z] = out(u, 0.05);
      archWindow(P, x, y2 + 0.9, z, s2 * 0.12, 2.6, 0x6b4a1f, rot);
    }
    const [jx, jz] = out(0, 0.55);
    P.box(s2 * 0.3, 0.2, 1.1, jx, y2 + 0.6, jz, GOLD, rot);
    P.box(s2 * 0.26, 2.2, 0.9, jx, y2 + 1.8, jz, GOLD, rot);
    const [wx, wz] = out(0, 1.02);
    archWindow(P, wx, y2 + 0.9, wz, s2 * 0.16, 2.0, 0x6b4a1f, rot);
    P.box(s2 * 0.32, 0.18, 1.3, jx, y2 + 3.0, jz, GOLD, rot);
    P.dome(s2 * 0.1, jx, y2 + 3.1, jz, GOLD, 1.15);
  });
  // Parapet with little gilded kiosks along it and chhatris at the corners.
  const y3 = y2 + g2;
  P.box(s2 + 0.4, 0.25, s2 + 0.4, 0, y3, sz, 0xc9962c);
  eachFace(s2, sz, (px, pz, rot) => {
    P.box(s2, 0.8, 0.2, px(0), y3 + 0.5, pz(0), GOLD, rot);
    for (const u of [-s2 * 0.25, 0, s2 * 0.25]) chhatri(P, px(u) - Math.sin(rot) * 0.4, y3 + 0.1, pz(u) - Math.cos(rot) * 0.4, 0.32, GOLD, GOLD);
  });
  const k = s2 / 2 - 0.9;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) chhatri(P, a * k, y3 + 0.1, sz + b * k, 0.75, GOLD, GOLD);
  // The central pavilion, the lotus and the fluted dome.
  const s3 = s * 0.46;
  P.box(s3, 2.4, s3, 0, y3 + 1.2, sz, GOLD);
  eachFace(s3, sz, (px, pz, rot) => archWindow(P, px(0) + Math.sin(rot) * 0.05, y3 + 0.4, pz(0) + Math.cos(rot) * 0.05, s3 * 0.3, 1.8, 0x6b4a1f, rot));
  const y4 = y3 + 2.4;
  const r = s3 * 0.62;
  P.cyl(r * 0.92, r, 0.6, 0, y4 + 0.3, sz, GOLD, 16);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    P.add(new THREE.ConeGeometry(0.34, 0.9, 4).rotateX(Math.PI).translate(Math.sin(a) * r * 0.95, y4 + 0.9, sz + Math.cos(a) * r * 0.95), GOLD);
  }
  P.dome(r, 0, y4 + 0.6, sz, GOLD, 1.1);
  // Flutes down the dome.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    P.box(0.08, r * 0.9, 0.08, Math.sin(a) * r * 0.86, y4 + 0.6 + r * 0.45, sz + Math.cos(a) * r * 0.86, 0xc9962c, a);
  }
  const top = y4 + 0.6 + r * 1.5;
  P.cyl(0.08, 0.1, 1.4, 0, top + 0.7, sz, GOLD, 6);
  P.cone(0.5, 0.35, 0, top + 1.2, sz, GOLD, 10);
  P.cyl(0.05, 0.05, 0.8, 0, top + 1.8, sz, GOLD, 5);
  C.push({ x: 0, z: sz, hw: s / 2, hd: s / 2 });
  return finish(P, C, Hs, { x: 0, z: sz + s / 2 + 1.3 });
}

/**
 * The Akal Takht: five storeys over a raised platform, marble arcades below,
 * a gilded storey and a gold dome above, facing the Harmandir Sahib, with
 * the twin Nishan Sahibs (Miri and Piri) before it.
 */
export function akalTakht(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const rise = 1.2;
  const pf = platform(P, C, Hs, w, d, rise, MARBLE, 0.5);
  const bw = Math.min(w * 0.72, 30);
  const bd = Math.min(pf.depth * 0.55, 12);
  const bz = pf.top + 0.6 + bd / 2;
  const front = bz + bd / 2;
  let y = rise;
  const storeys: { h: number; col: number; win: number; arches: boolean }[] = [
    { h: 4.6, col: MARBLE, win: DARK, arches: true },
    { h: 4.0, col: MARBLE, win: 0x7d6e5c, arches: false },
    { h: 3.8, col: 0xf6eedc, win: 0x7d6e5c, arches: false },
    { h: 3.6, col: GOLD, win: 0x6b4a1f, arches: false },
  ];
  storeys.forEach((st, i) => {
    const sw = bw * (1 - i * 0.05);
    P.box(sw, st.h, bd, 0, y + st.h / 2, bz, st.col);
    const bays = st.arches ? 5 : 7;
    for (let b = 0; b < bays; b++) {
      const x = -sw / 2 + ((b + 0.5) * sw) / bays;
      const aw = st.arches ? (sw / bays) * 0.66 : (sw / bays) * 0.42;
      archWindow(P, x, y + (st.arches ? 0 : 0.6), front + 0.05, aw, st.h * (st.arches ? 0.82 : 0.6), st.win);
    }
    // A chhajja over each storey; a balcony along the second.
    P.box(sw + 0.6, 0.18, bd + 1.2, 0, y + st.h, bz + 0.3, i === 2 ? GOLD : MARBLE);
    if (i === 1) {
      P.box(sw * 0.9, 0.16, 1.2, 0, y + 0.25, front + 0.6, MARBLE);
      P.box(sw * 0.9, 0.8, 0.1, 0, y + 0.65, front + 1.15, GOLD);
    }
    y += st.h;
  });
  // The gilded pavilion on top and its domes.
  const pw = bw * 0.36;
  P.box(pw, 3, bd * 0.6, 0, y + 1.5, bz, GOLD);
  for (let b = 0; b < 3; b++) archWindow(P, -pw / 2 + ((b + 0.5) * pw) / 3, y + 0.4, bz + bd * 0.3 + 0.05, pw * 0.16, 2, 0x6b4a1f);
  const r = pw * 0.36;
  P.cyl(r * 0.9, r * 0.95, 0.8, 0, y + 3.4, bz, GOLD, 16);
  P.dome(r, 0, y + 3.8, bz, GOLD, 1.12);
  P.cyl(0.08, 0.08, 1.4, 0, y + 3.8 + r * 1.5 + 0.7, bz, GOLD, 6);
  for (const a of [-1, 1]) {
    const x = a * bw * 0.34;
    P.cyl(r * 0.5, r * 0.52, 0.5, x, y + 0.25, bz, GOLD, 12);
    P.dome(r * 0.5, x, y + 0.5, bz, GOLD, 1.12);
    chhatri(P, a * (bw * 0.46), y, bz + bd / 2 - 1, 0.7, GOLD, GOLD);
  }
  C.push({ x: 0, z: bz, hw: bw / 2, hd: bd / 2 });
  // Miri and Piri: the twin Nishan Sahibs, before the stair.
  for (const a of [-1, 1]) {
    const nx = a * Math.min(w / 2 - 2, bw * 0.3);
    const nz = pf.front - 2.5;
    P.box(1.6, 0.8, 1.6, nx, rise + 0.4, nz, MARBLE);
    P.cyl(0.2, 0.26, 22, nx, rise + 11.8, nz, SAFFRON, 8);
    P.box(0.05, 2.6, 4, nx, rise + 21, nz + 2, SAFFRON);
    P.cone(0.5, 1.2, nx, rise + 23.4, nz, GOLD, 6);
    C.push({ x: nx, z: nz, hw: 0.8, hd: 0.8 });
  }
  return finish(P, C, Hs, { x: 0, z: front + 2 });
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
/** Is a local rectangle (centre, half extents) free of other buildings? */
export type ClearTest = (u: number, v: number, hw: number, hd: number) => boolean;

export function busStation(
  w: number,
  d: number,
  livery: { body: number; stripe: number; upper: number },
  clear: ClearTest = () => true
): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const bays = Math.max(2, Math.floor(w / 14));
  const len = Math.min(d * 0.8, 40);
  // Rows of bays down the whole yard, a driving lane between rows.
  const rows = Math.max(1, Math.floor((d * 0.9) / (len + 12)));
  for (let row = 0; row < rows; row++) {
    const z0 = -((rows - 1) * (len + 12)) / 2 + row * (len + 12);
    for (let b = 0; b < bays; b++) {
      const x = -w / 2 + (w * (b + 0.5)) / bays;
      // The real platform blocks OSM maps inside the yard stay; bays go
      // round them.
      if (!clear(x, z0, 4.6, len / 2 + 1)) continue;
      // Platform, columns and canopy.
      P.box(3, 0.25, len, x, 0.125, z0, 0xcfc9bb);
      for (let k = 0; k <= 4; k++) {
        const z = z0 - len / 2 + (len * k) / 4;
        P.box(0.3, 5, 0.3, x, 2.5, z, 0x6d7076);
        C.push({ x, z, hw: 0.3, hd: 0.3 });
      }
      P.box(9, 0.3, len + 2, x, 5.2, z0, 0xe6e3dc);
      P.box(9.2, 0.5, 0.3, x, 5.2, z0 + len / 2 + 1, livery.body);
      // Benches down the platform.
      for (let k = 0; k < 3; k++) P.box(0.5, 0.45, 3, x, 0.47, z0 - len / 3 + (k * len) / 3, 0x5d6168);
      // Buses nosed in beside the platform, most bays taken.
      for (const side of [-1, 1]) {
        if ((b * 3 + row * 5 + side + 7) % 4 === 0) continue;
        const bx = x + side * 3.2;
        const bl = 11;
        const bz = z0 - len / 2 + bl / 2 + 1 + ((b * 7 + row * 3) % 5);
        parkedBus(P, bx, bz, bl, livery);
        C.push({ x: bx, z: bz, hw: 1.3, hd: bl / 2 });
      }
    }
  }
  return finish(P, C, []);
}

/** A parked bus, nose to local +z: livery bands, a window strip, windscreen,
 *  destination board, wheels. */
export function parkedBus(P: Parts, x: number, z: number, len: number, livery: { body: number; stripe: number; upper: number }) {
  P.box(2.5, 1.05, len, x, 0.95, z, livery.body);
  P.box(2.52, 0.22, len, x, 1.55, z, livery.stripe);
  P.box(2.5, 1.35, len, x, 2.35, z, livery.upper);
  P.box(2.54, 0.8, len - 1.6, x, 2.3, z - 0.3, 0x26303c);
  P.box(2.2, 1.0, 0.06, x, 2.25, z + len / 2 + 0.01, 0x2e3a48);
  P.box(1.8, 0.28, 0.08, x, 2.88, z + len / 2 + 0.02, 0xffb000);
  P.box(2.4, 0.15, len - 0.4, x, 3.1, z, 0xe8e6e0);
  for (const wz of [z + len / 2 - 2, z - len / 2 + 2.4]) {
    for (const sx of [-1.28, 1.28]) {
      P.add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2).translate(x + sx, 0.5, wz), 0x1f1f22);
    }
  }
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

/** A statue on a stepped plinth, facing +z: a draped standing figure, one
 *  arm raised (Kannagi holds up her anklet). The Marina's row of statues. */
export function statue(w: number, d: number, figure = 0x3d3530, plinth = 0xe8e0d0): Monument {
  const P = new Parts();
  const s = Math.max(2.4, Math.min(w, d));
  P.box(s, 0.5, s, 0, 0.25, 0, plinth);
  P.box(s * 0.72, 0.5, s * 0.72, 0, 0.75, 0, plinth);
  P.box(s * 0.5, 2.2, s * 0.5, 0, 2.1, 0, plinth);
  P.box(s * 0.56, 0.15, s * 0.56, 0, 3.27, 0, 0xcfc6b4);
  // Figure: robe, torso, head, one arm down and one raised.
  const y = 3.35;
  P.cyl(0.42, 0.62, 2.1, 0, y + 1.05, 0, figure, 10);
  P.cyl(0.34, 0.4, 0.9, 0, y + 2.5, 0, figure, 10);
  P.add(new THREE.SphereGeometry(0.26, 10, 8).translate(0, y + 3.2, 0), figure);
  P.box(0.16, 1.1, 0.16, -0.48, y + 2.2, 0, figure);
  P.add(new THREE.BoxGeometry(0.16, 1.2, 0.16).rotateZ(-0.5).translate(0.62, y + 3.2, 0), figure);
  P.add(new THREE.TorusGeometry(0.14, 0.035, 6, 12).translate(0.92, y + 3.8, 0), 0xc9a44a);
  return finish(P, [{ x: 0, z: 0, hw: s / 2, hd: s / 2 }], []);
}

/**
 * A temple car (ther) parked in its street between festivals: four solid
 * wooden wheels, a carved wooden base in tiers, and above it the frame
 * wrapped in bands of red, white and yellow cloth, a gilt kalasam on top.
 * Long axis along local z.
 */
export function templeCar(w: number, d: number): Monument {
  const P = new Parts();
  const bw = Math.min(w, 6);
  const bd = Math.min(d, 7);
  const WOOD = 0x6b4a2e;
  const DARK_WOOD = 0x4a321f;
  // Wheels, outside the base.
  for (const x of [-bw / 2 - 0.2, bw / 2 + 0.2]) {
    for (const z of [-bd / 2 + 1.2, bd / 2 - 1.2]) {
      P.add(new THREE.CylinderGeometry(1.2, 1.2, 0.45, 14).rotateZ(Math.PI / 2).translate(x, 1.2, z), DARK_WOOD);
      P.add(new THREE.CylinderGeometry(0.3, 0.3, 0.55, 8).rotateZ(Math.PI / 2).translate(x, 1.2, z), 0x8f8f8f);
    }
  }
  // Carved base in tiers, each a little smaller.
  let y = 0.5;
  for (let k = 0; k < 4; k++) {
    const f = 1 - k * 0.08;
    const h = k === 0 ? 1.4 : 0.8;
    P.box(bw * f, h, bd * f, 0, y + h / 2, 0, k % 2 ? WOOD : DARK_WOOD);
    P.box(bw * f + 0.12, 0.12, bd * f + 0.12, 0, y + h, 0, 0xb08a58);
    y += h;
  }
  // Pillars round the deck where the deity rides.
  for (const x of [-bw * 0.32, bw * 0.32]) for (const z of [-bd * 0.32, bd * 0.32]) P.box(0.18, 2.2, 0.18, x, y + 1.1, z, WOOD);
  y += 2.2;
  // The cloth-wrapped tower, tapering, in bands.
  const bands = [0xc0392b, 0xf4efe4, 0xe6b422, 0xc0392b, 0xf4efe4, 0x2e8b57, 0xc0392b];
  let r = Math.min(bw, bd) * 0.46;
  for (const hex of bands) {
    P.cyl(r * 0.88, r, 0.75, 0, y + 0.375, 0, hex, 8);
    y += 0.75;
    r *= 0.86;
  }
  P.cone(r * 1.1, 1.2, 0, y + 0.6, 0, 0xc0392b, 8);
  P.cyl(0.14, 0.2, 0.7, 0, y + 1.45, 0, 0xd4a017, 8);
  // Tow ropes coiled at the front.
  P.add(new THREE.TorusGeometry(0.5, 0.1, 6, 14).rotateX(Math.PI / 2).translate(0, 0.12, bd / 2 + 0.9), 0xc8b08a);
  return finish(P, [{ x: 0, z: 0, hw: bw / 2 + 0.5, hd: bd / 2 + 0.2 }], []);
}
