/**
 * A Dravidian temple, the way Chennai's Parthasarathy Koil is laid out:
 * walls striped in red ochre and white, the tall gopuram over the east gate
 * (a passage you walk through, painted tiers above), an inner wall with a
 * smaller gopuram, the gilded flagstaff and the pillared hall before the
 * sanctum, the vimana over the sanctum, and shrines round the courts.
 */

import * as THREE from "three";
import { Parts } from "./vc";
import { archWindow, finish, type LocalBox, type LocalRect, type Monument } from "./monuments";

const WHITE = 0xf3eee2;
const OCHRE = 0xb8452f;
const STONE = 0xd9cdb4;
const DEEP = 0x3a2c26;
const GOLD = 0xe0b23a;
const TIERS = [0xd9683a, 0xe8b34a, 0x3d7a72, 0xc0392b, 0x6a8fc0, 0xe8d6a0];

/** A wall `len` long along x, striped red and white, coped. */
function stripedWall(P: Parts, C: LocalBox[], len: number, h: number, x: number, z: number, rot = 0) {
  const t = 1;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (u: number): [number, number] => [x + u * c, z - u * s];
  P.box(len, h, t, x, h / 2, z, WHITE, rot);
  const n = Math.max(2, Math.floor(len / 1.6));
  for (let k = 0; k < n; k += 2) {
    const u = -len / 2 + (k + 0.5) * (len / n);
    for (const f of [-1, 1]) {
      const [px, pz] = at(u);
      P.box(len / n, h - 0.6, 0.06, px + f * s * (t / 2 + 0.02), (h - 0.6) / 2 + 0.3, pz + f * c * (t / 2 + 0.02), OCHRE, rot);
    }
  }
  P.box(len + 0.2, 0.35, t + 0.3, x, h + 0.17, z, STONE, rot);
  C.push({ x, z, hw: len / 2, hd: t / 2, rot });
}

/**
 * A gopuram `bw` wide and `bd` deep over a gate: a stone base with the
 * passage through it, then `tiers` painted storeys stepping in, each with
 * niches, and the barrel-vaulted crown with its row of gilded kalashas.
 * Returns the colliders (the base's two halves).
 */
function gopuram(P: Parts, C: LocalBox[], bw: number, bd: number, tiers: number, x: number, z: number): number {
  const baseH = 7;
  const pw = Math.max(3.5, bw * 0.25);
  const side = (bw - pw) / 2;
  for (const s of [-1, 1]) {
    const px = x + s * (pw / 2 + side / 2);
    P.box(side, baseH, bd, px, baseH / 2, z, STONE);
    for (const f of [-1, 1]) {
      // Pilasters and niches on the granite base.
      for (const u of [-0.36, 0.36]) P.box(0.3, baseH - 1, 0.2, px + u * side, baseH / 2, z + f * (bd / 2 + 0.05), 0xc4b89c);
      archWindow(P, px, 1.8, z + f * (bd / 2 + 0.08), side * 0.3, 2.6, DEEP, f < 0 ? Math.PI : 0);
    }
    C.push({ x: px, z, hw: side / 2, hd: bd / 2 });
  }
  const passH = 5.5;
  P.box(pw, baseH - passH, bd, x, passH + (baseH - passH) / 2, z, STONE);
  // Tall doors standing open in the passage.
  for (const s of [-1, 1]) P.box(0.15, passH - 0.3, pw / 2 - 0.3, x + s * (pw / 2 - 0.1), (passH - 0.3) / 2, z - bd / 2 + pw / 4 + 0.3, 0x6b4a2e);
  let y = baseH;
  let w = bw;
  let d = bd;
  const th = 2.6;
  for (let i = 0; i < tiers; i++) {
    const col = TIERS[i % TIERS.length];
    P.box(w, th * 0.75, d, x, y + th * 0.375, z, col);
    P.box(w + 0.4, th * 0.25, d + 0.4, x, y + th * 0.875, z, WHITE);
    // Niches with figures across each face, and kudu arches on the corners.
    const n = Math.max(3, Math.floor(w / 2.2));
    for (let k = 0; k < n; k++) {
      const u = x - w / 2 + ((k + 0.5) * w) / n;
      for (const f of [-1, 1]) {
        archWindow(P, u, y + 0.25, z + f * (d / 2 + 0.05), Math.min(1.1, (w / n) * 0.6), th * 0.55, k % 2 ? DEEP : 0x9c3b2e, f < 0 ? Math.PI : 0);
      }
    }
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      P.box(0.8, th * 0.5, 0.8, x + (a * w) / 2, y + th * 0.95, z + (b * d) / 2, 0xe8b34a);
    }
    y += th;
    w *= 0.86;
    d *= 0.8;
  }
  // The crown: a barrel vault with horned ends, kalashas along its ridge.
  const cw = w * 1.02;
  const cr = Math.min(d * 0.6, 2.4);
  P.add(new THREE.CylinderGeometry(cr, cr, cw, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(x, y, z), TIERS[1]);
  for (const s of [-1, 1]) P.add(new THREE.ConeGeometry(0.6, 1.8, 6).rotateZ(s * 0.5).translate(x + s * (cw / 2 + 0.3), y + cr * 0.6, z), TIERS[3]);
  const k = Math.max(5, Math.round(cw / 2));
  for (let i = 0; i < k; i++) {
    const u = x - cw / 2 + ((i + 0.5) * cw) / k;
    P.cyl(0.18, 0.28, 0.5, u, y + cr + 0.25, z, GOLD, 8);
    P.add(new THREE.SphereGeometry(0.3, 8, 6).translate(u, y + cr + 0.7, z), GOLD);
    P.cone(0.12, 0.6, u, y + cr + 1.2, z, GOLD, 6);
  }
  return y + cr + 1.5;
}

/** A vimana over a sanctum `b` square: stepped storeys of little shrines,
 *  a domed crown (the sikhara) and its kalasha. */
function vimana(P: Parts, C: LocalBox[], b: number, x: number, z: number, storeys = 3) {
  const wallH = b * 0.5;
  P.box(b, wallH, b, x, wallH / 2, z, WHITE);
  for (const [dx, dz, rot] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]] as const) {
    archWindow(P, x + dx * (b / 2 + 0.05), 0.4, z + dz * (b / 2 + 0.05), b * 0.18, wallH * 0.6, DEEP, rot);
  }
  let y = wallH;
  let s = b;
  for (let i = 0; i < storeys; i++) {
    P.box(s + 0.3, 0.3, s + 0.3, x, y + 0.15, z, STONE);
    const h = b * 0.18;
    P.box(s * 0.84, h, s * 0.84, x, y + 0.3 + h / 2, z, i % 2 ? 0xe8b34a : WHITE);
    // A ring of little shrines (kutas) at the corners.
    for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      P.box(s * 0.16, h * 0.6, s * 0.16, x + a * s * 0.42, y + 0.3 + h + h * 0.3, z + c * s * 0.42, TIERS[i % TIERS.length]);
      P.dome(s * 0.07, x + a * s * 0.42, y + 0.3 + h * 1.6, z + c * s * 0.42, GOLD, 1);
    }
    y += 0.3 + h;
    s *= 0.72;
  }
  P.cyl(s * 0.45, s * 0.5, b * 0.1, x, y + b * 0.05, z, WHITE, 8);
  P.dome(s * 0.55, x, y + b * 0.1, z, GOLD, 1);
  P.cone(s * 0.12, s * 0.5, x, y + b * 0.1 + s * 0.7 + s * 0.25, z, GOLD, 8);
  C.push({ x, z, hw: b / 2, hd: b / 2 });
}

/** A pillared hall `w` × `d` on a plinth you step up onto: open sides, a
 *  flat roof with a painted parapet. The pillars stand in the way. */
function mandapa(P: Parts, C: LocalBox[], Hs: LocalRect[], w: number, d: number, x: number, z: number) {
  const ph = 0.7;
  const h = 4.5;
  P.box(w, ph, d, x, ph / 2, z, STONE);
  Hs.push({ x, z, hw: w / 2, hd: d / 2, y0: ph, y1: ph });
  P.steps(Math.min(4, w * 0.4), ph, x, z + d / 2 + 1.2, STONE);
  Hs.push({ x, z: z + d / 2 + 0.6, hw: Math.min(4, w * 0.4) / 2, hd: 0.6, y0: ph, y1: 0 });
  const nx = Math.max(2, Math.round(w / 3.2));
  const nz = Math.max(2, Math.round(d / 3.2));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const px = x - w / 2 + 0.5 + (i * (w - 1)) / nx;
      const pz = z - d / 2 + 0.5 + (j * (d - 1)) / nz;
      // Only the outer rows and every other inner one: the hall stays open.
      if (i > 0 && i < nx && j > 0 && j < nz && (i + j) % 2) continue;
      P.box(0.55, h, 0.55, px, ph + h / 2, pz, STONE);
      P.box(0.9, 0.35, 0.9, px, ph + h - 0.15, pz, 0xc4b89c);
      C.push({ x: px, z: pz, hw: 0.3, hd: 0.3 });
    }
  }
  P.box(w + 0.6, 0.5, d + 0.6, x, ph + h + 0.25, z, STONE);
  const n = Math.max(3, Math.floor(w / 1.6));
  for (let k = 0; k < n; k++) {
    for (const f of [-1, 1]) {
      P.box(0.6, 0.8, 0.4, x - w / 2 + ((k + 0.5) * w) / n, ph + h + 0.9, z + f * (d / 2), TIERS[k % TIERS.length]);
    }
  }
}

/** The whole temple in its footprint, entrance (the gopuram) on +z. */
export function dravidianTemple(w: number, d: number): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const W = Math.min(w, 64);
  const D = Math.min(d, 150);
  const wallH = 5.5;
  // The main gopuram over the east gate, in the outer wall.
  const gw = Math.min(W * 0.42, 22);
  const gd = 10;
  const front = D / 2 - gd / 2;
  gopuram(P, C, gw, gd, 6, 0, front);
  const side = (W - gw) / 2;
  for (const s of [-1, 1]) stripedWall(P, C, side, wallH, s * (gw / 2 + side / 2), D / 2 - 0.5);
  for (const s of [-1, 1]) stripedWall(P, C, D, wallH, s * (W / 2 - 0.5), 0, Math.PI / 2);
  stripedWall(P, C, W, wallH, 0, -D / 2 + 0.5);

  // The outer court: a sixteen-pillar mandapa by the gate, a shrine each side.
  const outer = D * 0.3;
  const innerZ = D / 2 - outer;
  mandapa(P, C, Hs, Math.min(W * 0.3, 12), 9, -W * 0.25, D / 2 - gd - 8);
  vimana(P, C, 5, W * 0.3, D / 2 - gd - 9, 2);

  // The inner wall and its gopuram.
  const iw = W - 10;
  const igw = Math.min(iw * 0.34, 14);
  gopuram(P, C, igw, 7, 3, 0, innerZ);
  const iside = (iw - igw) / 2;
  for (const s of [-1, 1]) stripedWall(P, C, iside, wallH, s * (igw / 2 + iside / 2), innerZ);
  const innerD = innerZ - (-D / 2 + 6);
  for (const s of [-1, 1]) stripedWall(P, C, innerD, wallH, s * (iw / 2), innerZ - innerD / 2, Math.PI / 2);
  stripedWall(P, C, iw, wallH, 0, -D / 2 + 6);

  // Before the sanctum: the flagstaff on its pedestal, the bali-pitha.
  const dz = innerZ - 10;
  P.box(2.2, 1.2, 2.2, 0, 0.6, dz, STONE);
  for (let k = 0; k < 10; k++) P.cyl(0.32, 0.36, 1.3, 0, 1.2 + k * 1.3 + 0.65, dz, k % 2 ? GOLD : 0xc9962c, 8);
  P.box(1.6, 0.25, 0.3, 0, 14.4, dz, GOLD);
  for (const s of [-1, 1]) P.box(0.2, 0.9, 0.2, s * 0.7, 14.9, dz, GOLD);
  C.push({ x: 0, z: dz, hw: 1.1, hd: 1.1 });
  P.cyl(0.9, 1.1, 1, 0, 0.5, dz - 3.5, STONE, 10);
  P.dome(0.8, 0, 1, dz - 3.5, STONE, 1);
  C.push({ x: 0, z: dz - 3.5, hw: 1, hd: 1 });

  // The great pillared hall, then the sanctum under its vimana.
  const hallD = Math.min(18, innerD * 0.3);
  const hallZ = dz - 7 - hallD / 2;
  mandapa(P, C, Hs, Math.min(iw * 0.55, 20), hallD, 0, hallZ);
  const vb = Math.min(iw * 0.35, 13);
  const vz = hallZ - hallD / 2 - vb / 2 - 1;
  vimana(P, C, vb, 0, vz, 3);
  // Shrines to the other deities round the inner court.
  for (const s of [-1, 1]) {
    vimana(P, C, 5.5, s * (iw / 2 - 6), vz, 2);
    vimana(P, C, 4.5, s * (iw / 2 - 5.5), hallZ + 2, 1);
  }
  // Lamps along the way in.
  for (const s of [-1, 1]) {
    for (let z = innerZ + 4; z < front - gd / 2 - 2; z += 7) {
      P.cyl(0.14, 0.2, 2.2, s * 3, 1.1, z, 0xb08a58, 8);
      P.cyl(0.4, 0.2, 0.25, s * 3, 2.3, z, 0xb08a58, 8);
      C.push({ x: s * 3, z, hw: 0.25, hd: 0.25 });
    }
  }
  // The priest stands at the hall's steps.
  return finish(P, C, Hs, { x: 0, z: hallZ + hallD / 2 + 2.6 });
}
