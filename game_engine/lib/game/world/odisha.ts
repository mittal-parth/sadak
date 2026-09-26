/**
 * Kalinga temples: the rekha deul, its tower curving in like a beehive, cut
 * into vertical ribs (pagas) and banded by ribbed amalakas at every storey,
 * crowned with the great amalaka and the kalasha; the pidha deul in front,
 * its roof a pyramid of stepped tiers under a bell. Lingaraj is a whole
 * walled compound of them: the Lion Gate, the bhogamandapa, natamandira,
 * jagamohana and deul in a row down the axis, and shrines crowded round.
 */

import * as THREE from "three";
import { Parts } from "./vc";
import { archWindow, finish, type LocalBox, type LocalRect, type Monument } from "./monuments";

const LATERITE = 0xa4583c;
const SANDSTONE = 0xb98a66;
const SHADOW = 0x7e5a44;
const DEEP = 0x3a2a22;
const GOLD = 0xe0b23a;
const WHITE = 0xf2ede2;

/** A ribbed disc: the amalaka that caps a Kalinga tower. */
function amalaka(P: Parts, r: number, h: number, x: number, y: number, z: number, stone: number) {
  const ribs = 24;
  for (let i = 0; i < ribs; i++) {
    const k = i % 2 ? 0.97 : 1;
    const g = new THREE.CylinderGeometry(r * k * 0.9, r * k * 0.9, h, 1, 1, false, (i / ribs) * Math.PI * 2, (Math.PI * 2) / ribs);
    P.add(g.translate(x, y + h / 2, z), stone);
  }
  // Rounded above and below, like a ribbed gourd.
  P.add(new THREE.SphereGeometry(r, 24, 6).scale(1, (h * 0.8) / r, 1).translate(x, y + h / 2, z), stone);
}

/**
 * A rekha deul's tower, `b` across at the base and `H` tall, standing on y:
 * stacked courses whose plan steps out in three ribs a face, the batter
 * steep below and curving in toward the neck, with a band of little
 * amalakas at each storey; then the neck, the great amalaka, the kalasha
 * and a flag.
 */
export function rekha(P: Parts, x: number, y: number, z: number, b: number, H: number, stone: number, band: number, flag = true) {
  const courses = 18;
  const ch = H / courses;
  for (let i = 0; i < courses; i++) {
    const t = (i + 0.5) / courses;
    // Straight for the lower part, curving in hard toward the top.
    const s = b * (1 - 0.18 * t - 0.42 * Math.pow(t, 3.2));
    const yy = y + i * ch;
    const col = i % 3 === 2 ? band : stone;
    // The core and the ribs: the central raha stands proudest.
    P.box(s * 0.62, ch * 0.96, s * 0.62, x, yy + ch / 2, z, col);
    P.box(s, ch * 0.96, s * 0.36, x, yy + ch / 2, z, col);
    P.box(s * 0.36, ch * 0.96, s, x, yy + ch / 2, z, col);
    P.box(s * 0.84, ch * 0.96, s * 0.84, x, yy + ch / 2, z, col);
    // Bhumi-amalakas at the corners every third course.
    if (i % 3 === 2) {
      for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        P.add(new THREE.CylinderGeometry(s * 0.1, s * 0.1, ch * 0.7, 10).translate(x + a * s * 0.42, yy + ch / 2, z + c * s * 0.42), band);
      }
    }
  }
  const top = y + H;
  const nb = b * 0.36;
  P.cyl(nb * 0.8, nb * 0.9, b * 0.06, x, top + b * 0.03, z, stone, 12);
  amalaka(P, b * 0.36, b * 0.12, x, top + b * 0.06, z, stone);
  P.cyl(b * 0.2, b * 0.26, b * 0.05, x, top + b * 0.18, z, stone, 12);
  P.add(new THREE.SphereGeometry(b * 0.13, 12, 8).scale(1, 0.9, 1).translate(x, top + b * 0.3, z), GOLD);
  P.cone(b * 0.05, b * 0.14, x, top + b * 0.45, z, GOLD, 8);
  if (flag) {
    P.cyl(0.08, 0.08, b * 0.5, x, top + b * 0.6, z, 0x6b4a2a, 5);
    P.box(0.06, b * 0.12, b * 0.22, x, top + b * 0.78, z + b * 0.11, 0xf08a24);
  }
}

/** A pidha deul (jagamohana): walls `wh` high, then a stepped pyramid roof
 *  in two groups of tiers under the bell and amalaka. */
function pidha(P: Parts, x: number, y: number, z: number, b: number, wh: number, stone: number, band: number) {
  P.box(b, wh, b, x, y + wh / 2, z, stone);
  P.box(b + 0.4, 0.4, b + 0.4, x, y + wh, z, band);
  let yy = y + wh + 0.2;
  let s = b * 1.02;
  for (const tiers of [5, 4]) {
    for (let i = 0; i < tiers; i++) {
      P.box(s, b * 0.05, s, x, yy + b * 0.025, z, band);
      P.box(s * 0.94, b * 0.03, s * 0.94, x, yy + b * 0.065, z, stone);
      yy += b * 0.08;
      s -= b * 0.07;
    }
    // A recess between the groups.
    P.box(s * 0.85, b * 0.08, s * 0.85, x, yy + b * 0.04, z, SHADOW);
    yy += b * 0.08;
    s -= b * 0.04;
  }
  // The bell (ghanta), the amalaka, the kalasha.
  P.add(new THREE.SphereGeometry(s * 0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(x, yy, z), stone);
  amalaka(P, s * 0.32, s * 0.12, x, yy + s * 0.34, z, stone);
  P.add(new THREE.SphereGeometry(s * 0.12, 10, 6).translate(x, yy + s * 0.58, z), GOLD);
  // Doors on every face, framed.
  for (const [dx, dz, rot] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]] as const) {
    archWindow(P, x + dx * (b / 2 + 0.05), y, z + dz * (b / 2 + 0.05), b * 0.18, wh * 0.72, DEEP, rot);
  }
}

/** A seated lion (simha) facing +z on a plinth at (x, z): haunches, a
 *  chest with its front legs straight, a maned head, a curled tail. */
function simha(P: Parts, x: number, z: number) {
  const st = 0xb07a55;
  const dark = SHADOW;
  P.box(1.5, 0.35, 2.1, x, 0.18, z, SANDSTONE);
  P.box(1.3, 0.55, 1.9, x, 0.62, z, dark);
  P.box(1.5, 0.15, 2.1, x, 0.97, z, SANDSTONE);
  const y = 1.05;
  // Haunches and body, sloping up to the chest.
  P.add(new THREE.SphereGeometry(0.5, 12, 8).scale(1.05, 0.8, 1.1).translate(x, y + 0.4, z - 0.35), st);
  P.add(new THREE.CylinderGeometry(0.42, 0.5, 1.0, 12).rotateX(-0.5).translate(x, y + 0.75, z + 0.05), st);
  // Front legs, straight, paws forward.
  for (const sx of [-1, 1]) {
    P.cyl(0.13, 0.15, 0.9, x + sx * 0.24, y + 0.45, z + 0.45, st, 8);
    P.box(0.26, 0.12, 0.34, x + sx * 0.24, y + 0.06, z + 0.55, st);
    // Hind paws either side of the haunch.
    P.box(0.22, 0.12, 0.4, x + sx * 0.42, y + 0.06, z - 0.3, st);
  }
  // The mane: a ruff of lobes round the head.
  const hy = y + 1.45;
  const hz = z + 0.42;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    P.add(new THREE.SphereGeometry(0.17, 8, 6).translate(x + Math.cos(a) * 0.34, hy + Math.sin(a) * 0.34, hz - 0.08), dark);
  }
  // Face: brow, muzzle, open jaw.
  P.add(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.95, 0.9).translate(x, hy, hz), st);
  P.box(0.3, 0.2, 0.28, x, hy - 0.08, hz + 0.26, st);
  P.box(0.26, 0.07, 0.2, x, hy - 0.22, hz + 0.26, dark);
  for (const sx of [-1, 1]) {
    P.add(new THREE.SphereGeometry(0.05, 6, 4).translate(x + sx * 0.12, hy + 0.08, hz + 0.25), DEEP);
    P.add(new THREE.ConeGeometry(0.07, 0.14, 5).translate(x + sx * 0.2, hy + 0.32, hz - 0.02), st);
  }
  // The tail curling up the back.
  P.add(new THREE.TorusGeometry(0.28, 0.05, 6, 10, Math.PI * 1.3).rotateY(Math.PI / 2).translate(x, y + 0.55, z - 0.8), st);
}

/**
 * The Lingaraj compound, `w` × `d`, entrance (the Lion Gate) on +z. Its
 * laterite wall, the axis of four halls rising to the great deul, and the
 * shrines round it.
 */
export function lingaraj(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const W = Math.min(w, 150);
  const D = Math.min(d, 170);
  const t = 1.6;
  const wh = 6.5;
  const gate = 8;
  // The compound wall, with the Lion Gate in the front.
  const wall = (x: number, z: number, lw: number, ld: number) => {
    P.box(lw, wh, ld, x, wh / 2, z, LATERITE);
    P.box(lw + 0.3, 0.5, ld + 0.3, x, wh + 0.25, z, SANDSTONE);
    C.push({ x, z, hw: lw / 2, hd: ld / 2 });
  };
  wall(0, -D / 2 + t / 2, W, t);
  for (const s of [-1, 1]) wall(s * (W / 2 - t / 2), 0, t, D);
  const side = (W - gate) / 2 - 3;
  for (const s of [-1, 1]) wall(s * (gate / 2 + 3 + side / 2), D / 2 - t / 2, side, t);
  // The Lion Gate: a pidha-roofed gatehouse, two lions before it.
  for (const s of [-1, 1]) {
    P.box(3, 9, 6, s * (gate / 2 + 1.5), 4.5, D / 2 - 2, SANDSTONE);
    C.push({ x: s * (gate / 2 + 1.5), z: D / 2 - 2, hw: 1.5, hd: 3 });
    // The seated simha that gives the gate its name, on a moulded plinth.
    simha(P, s * (gate / 2 + 1.5), D / 2 + 2);
    C.push({ x: s * (gate / 2 + 1.5), z: D / 2 + 2, hw: 0.8, hd: 1.1 });
  }
  P.box(gate + 6, 3, 6, 0, 10.5, D / 2 - 2, SANDSTONE);
  pidha(P, 0, 12, D / 2 - 2, 7, 0.1, SANDSTONE, SHADOW);

  // Down the axis from the gate: bhogamandapa, natamandira, jagamohana, deul.
  const b = Math.min(W * 0.14, 20);
  const H = Math.min(b * 2.6, 48);
  const zDeul = -D / 2 + D * 0.3;
  const zJag = zDeul + b * 1.02;
  const zNat = zJag + b * 0.95;
  const zBhog = zNat + b * 0.85;
  const plinth = 1.2;
  // One long plinth under the four, with steps up at the front.
  const p0 = zDeul - b / 2 - 1.5;
  const p1 = zBhog + b * 0.4 + 1.5;
  P.box(b * 1.3, plinth, p1 - p0, 0, plinth / 2, (p0 + p1) / 2, SANDSTONE);
  Hs.push({ x: 0, z: (p0 + p1) / 2, hw: (b * 1.3) / 2, hd: (p1 - p0) / 2, y0: plinth, y1: plinth });
  P.steps(b * 0.6, plinth, 0, p1 + 2.4, SANDSTONE);
  Hs.push({ x: 0, z: p1 + 1.2, hw: b * 0.3, hd: 1.2, y0: plinth, y1: 0 });

  rekha(P, 0, plinth, zDeul, b, H, SANDSTONE, SHADOW);
  C.push({ x: 0, z: zDeul, hw: b / 2, hd: b / 2 });
  pidha(P, 0, plinth, zJag, b * 0.9, b * 0.5, SANDSTONE, SHADOW);
  C.push({ x: 0, z: zJag, hw: b * 0.45, hd: b * 0.45 });
  pidha(P, 0, plinth, zNat, b * 0.75, b * 0.36, SANDSTONE, SHADOW);
  C.push({ x: 0, z: zNat, hw: b * 0.375, hd: b * 0.375 });
  pidha(P, 0, plinth, zBhog, b * 0.6, b * 0.3, SANDSTONE, SHADOW);
  C.push({ x: 0, z: zBhog, hw: b * 0.3, hd: b * 0.3 });

  // Shrines crowded round the great temple: small rekha deuls on plinths.
  const spots: [number, number, number][] = [];
  const rand = (() => {
    let s = 91;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (let k = 0; k < 60 && spots.length < 22; k++) {
    const x = (rand() - 0.5) * (W - 14);
    const z = -D / 2 + 8 + rand() * (D - 22);
    const s = 3 + rand() * 4;
    // Off the axis and its path, clear of each other.
    if (Math.abs(x) < b * 0.9 + s) continue;
    if (spots.some(([ox, oz, os]) => Math.hypot(ox - x, oz - z) < (os + s) * 0.9 + 2)) continue;
    spots.push([x, z, s]);
  }
  for (const [x, z, s] of spots) {
    P.box(s * 1.2, 0.6, s * 1.2, x, 0.3, z, SANDSTONE);
    rekha(P, x, 0.6, z, s, s * 2.7, SANDSTONE, SHADOW, false);
    archWindow(P, x, 0.6, z + s / 2 + 0.05, s * 0.28, s * 0.55, DEEP);
    C.push({ x, z, hw: (s * 1.2) / 2, hd: (s * 1.2) / 2 });
  }
  // Whitewashed lamp pillar before the bhogamandapa.
  const lx = b * 0.55;
  P.cyl(0.35, 0.45, 6, lx, 3, p1 + 6, WHITE, 8);
  P.cyl(0.9, 0.9, 0.3, lx, 6.1, p1 + 6, WHITE, 8);
  C.push({ x: lx, z: p1 + 6, hw: 0.5, hd: 0.5 });
  // The priest waits before the bhogamandapa's door.
  return finish(P, C, Hs, { x: 0, z: zBhog + b * 0.3 + 1.6 });
}

/** A small Kalinga temple: a rekha deul with its pidha porch in front, on a
 *  plinth with steps (Mukteswar, Vaital and their neighbours). */
export function deul(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const b = Math.min(w * 0.7, d * 0.45);
  const plinth = 0.8;
  P.box(w, plinth, d, 0, plinth / 2, 0, SANDSTONE);
  Hs.push({ x: 0, z: 0, hw: w / 2, hd: d / 2, y0: plinth, y1: plinth });
  const zD = -d / 2 + b / 2 + 0.4;
  const zJ = zD + b * 0.95;
  rekha(P, 0, plinth, zD, b, b * 2.2, SANDSTONE, SHADOW);
  pidha(P, 0, plinth, zJ, b * 0.8, b * 0.45, SANDSTONE, SHADOW);
  C.push({ x: 0, z: zD, hw: b / 2, hd: b / 2 });
  C.push({ x: 0, z: zJ, hw: b * 0.4, hd: b * 0.4 });
  P.steps(Math.min(3, w * 0.4), plinth, 0, d / 2 + 1.3, SANDSTONE);
  Hs.push({ x: 0, z: d / 2 + 0.65, hw: Math.min(3, w * 0.4) / 2, hd: 0.65, y0: plinth, y1: 0 });
  return finish(P, C, Hs, { x: 0, z: Math.min(d / 2 - 0.8, zJ + b * 0.4 + 1.2) });
}

/** The Jalamandira on Bindu Sagar's island: an open pillared pavilion under
 *  a pidha roof, where the deity is rowed out for the Chandan Yatra. */
export function jalamandira(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const s = Math.min(w, d, 16) * 0.7;
  P.box(s + 3, 1, s + 3, 0, 0.5, 0, SANDSTONE);
  P.box(s + 3.4, 0.25, s + 3.4, 0, 1.05, 0, SHADOW);
  const ph = s * 0.45;
  for (const a of [-1, -1 / 3, 1 / 3, 1]) {
    for (const b of [-1, 1]) {
      for (const [x, z] of [[a * (s / 2), b * (s / 2)], [b * (s / 2), a * (s / 2)]]) {
        P.box(0.6, ph, 0.6, x, 1 + ph / 2, z, SANDSTONE);
        C.push({ x, z, hw: 0.3, hd: 0.3 });
      }
    }
  }
  pidha(P, 0, 1 + ph, 0, s + 0.6, 0.01, SANDSTONE, SHADOW);
  return finish(P, C, [{ x: 0, z: 0, hw: (s + 3) / 2, hd: (s + 3) / 2, y0: 1, y1: 1 }]);
}
