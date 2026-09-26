/**
 * The Golden Temple's precinct: the ring of white two-storey buildings round
 * the parikrama, arcaded on the courtyard side with a jharokha over every
 * other bay, a bunga with a gilded dome at each corner, and a gatehouse
 * wherever a way comes in: the gilded Darshani Deori on the causeway's axis,
 * the clock tower over the north gate. Then the causeway itself, a marble
 * deck with a gilded lamp every few metres, out to the Harmandir Sahib.
 *
 * Everything is built along the courtyard's edge in the edge's own frame
 * (u along it, v out of the courtyard) and merged into one mesh.
 */

import * as THREE from "three";
import type { CollisionWorld } from "./collide";
import type { HeightField } from "./height";
import type { Precinct, Pt } from "./mapData";
import { Parts } from "./vc";

type Hit = { edge: number; t: number; s: number; pt: Pt };

/** Where segment a→b crosses the ring's edges (s along a→b, t along the
 *  edge), nearest `a` first. */
export function crossings(ring: Pt[], a: Pt, b: Pt): Hit[] {
  const out: Hit[] = [];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const ex = q[0] - p[0];
    const ez = q[1] - p[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den;
    const t = ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / den;
    if (s < 0 || s > 1 || t < 0 || t > 1) continue;
    out.push({ edge: i, t, s, pt: [a[0] + dx * s, a[1] + dz * s] });
  }
  return out.sort((x, y) => x.s - y.s);
}

export function inRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const MARBLE = 0xf4f0e8;
const INLAY = 0xe6dccb;
const SANDSTONE = 0xd8c3a0;
const SHADE = 0x9a8a76;
const DEEP = 0x3b312b;
const GOLD = 0xe2b33c;
const GOLD_DARK = 0xb8892a;

/** Storey height and the arcade's full height. */
const STOREY = 4.2;
const ARCADE_H = STOREY * 2;
/** The arcade's depth from the courtyard, at most. */
const DEPTH = 9;
/** Piers either side of a gate's opening. */
const PIER = 2;

/** A semicircular-arched opening `w` wide, springing at `spring`, cut
 *  through a slab `d` thick from y=0 to `top`: the slab above and beside the
 *  arch, as one extruded shape (local x across, z through). */
function archedSlab(w: number, spring: number, top: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, spring);
  s.absarc(0, spring, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, spring);
  s.lineTo(w / 2, top);
  s.lineTo(-w / 2, top);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -d / 2);
}

/** A small open kiosk with a dome, sitting on y. */
function kiosk(P: Parts, x: number, y: number, z: number, s: number, dome: number) {
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.18 * s, 1.3 * s, 0.18 * s, x + a * 0.55 * s, y + 0.65 * s, z + b * 0.55 * s, MARBLE);
  P.box(1.5 * s, 0.16 * s, 1.5 * s, x, y + 1.36 * s, z, MARBLE);
  P.dome(0.62 * s, x, y + 1.44 * s, z, dome, 1.18);
  P.cyl(0.04 * s, 0.04 * s, 0.6 * s, x, y + 2.6 * s, z, GOLD, 5);
}

/**
 * One stretch of arcade, `len` along x, `d` deep from the courtyard face at
 * z=0 out to z=d. Arches on the courtyard side, a chhajja between storeys,
 * a jharokha over every other bay, windows on the street side, a gilded
 * band and a parapet of little domes on top.
 */
function arcade(len: number, d: number): THREE.BufferGeometry | null {
  const P = new Parts();
  P.box(len, ARCADE_H, d, 0, ARCADE_H / 2, d / 2, MARBLE);
  P.box(len + 0.05, 0.45, d + 0.2, 0, 0.22, d / 2, SANDSTONE);
  // Chhajja between the storeys, and the gilded band under the parapet.
  P.box(len, 0.14, 0.8, 0, STOREY + 0.1, -0.35, MARBLE);
  P.box(len, 0.2, d + 0.12, 0, ARCADE_H - 0.1, d / 2, GOLD);
  P.box(len, 0.7, 0.22, 0, ARCADE_H + 0.35, 0.05, MARBLE);
  P.box(len, 0.7, 0.22, 0, ARCADE_H + 0.35, d - 0.05, MARBLE);
  const bays = Math.max(1, Math.floor(len / 3.3));
  const bay = len / bays;
  for (let k = 0; k < bays; k++) {
    const cx = -len / 2 + (k + 0.5) * bay;
    const aw = Math.min(2.2, bay - 0.9);
    if (aw > 0.8) {
      // The arch: a deep opening with a round head, framed in inlay.
      P.box(aw + 0.3, 3.3, 0.06, cx, 0.45 + 1.65, -0.03, INLAY);
      P.box(aw, 2.3, 0.08, cx, 0.45 + 1.15, -0.05, DEEP);
      P.add(new THREE.CylinderGeometry(aw / 2, aw / 2, 0.08, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(cx, 0.45 + 2.3, -0.05), DEEP);
      // Upstairs: a jharokha on alternate bays, a window between.
      if (k % 2 === 0) {
        P.box(aw * 0.8, 0.14, 0.7, cx, STOREY + 0.9, -0.35, MARBLE);
        P.box(aw * 0.62, 1.5, 0.05, cx, STOREY + 1.75, -0.66, SHADE);
        for (const s of [-1, 1]) P.box(0.12, 1.6, 0.12, cx + s * aw * 0.36, STOREY + 1.75, -0.64, MARBLE);
        P.box(aw * 0.86, 0.12, 0.78, cx, STOREY + 2.6, -0.36, MARBLE);
        P.dome(aw * 0.32, cx, STOREY + 2.66, -0.36, MARBLE, 1.1);
      } else {
        P.box(aw * 0.55, 1.4, 0.06, cx, STOREY + 1.8, -0.03, SHADE);
      }
      // Street side: two rows of plain windows.
      P.box(aw * 0.5, 1.3, 0.06, cx, 2.2, d + 0.03, SHADE);
      P.box(aw * 0.5, 1.3, 0.06, cx, STOREY + 1.8, d + 0.03, SHADE);
    }
    // Pillar pilasters between the arches.
    P.box(0.34, STOREY - 0.4, 0.14, cx - bay / 2, STOREY / 2 + 0.2, -0.07, INLAY);
  }
  // Little domes along the parapet.
  const domes = Math.max(1, Math.floor(len / 9));
  for (let k = 0; k < domes; k++) kiosk(P, -len / 2 + (k + 0.5) * (len / domes), ARCADE_H, 0.6, 0.55, MARBLE);
  return P.geometry();
}

/** A corner bunga: a square tower with a gilded dome. */
function bunga(s: number): THREE.BufferGeometry | null {
  const P = new Parts();
  const h = ARCADE_H + 3.2;
  P.box(s, h, s, 0, h / 2, 0, MARBLE);
  P.box(s + 0.1, 0.45, s + 0.1, 0, 0.22, 0, SANDSTONE);
  P.box(s + 0.5, 0.18, s + 0.5, 0, ARCADE_H - 0.1, 0, GOLD);
  P.box(s + 0.6, 0.16, s + 0.6, 0, h, 0, MARBLE);
  for (const f of [-1, 1]) {
    for (const [ax, az] of [[1, 0], [0, 1]] as const) {
      // A window on each face of the top storey.
      P.box(ax ? 0.06 : s * 0.3, 1.6, ax ? s * 0.3 : 0.06, ax * f * (s / 2 + 0.03), ARCADE_H + 1.4, az * f * (s / 2 + 0.03), SHADE);
    }
  }
  P.cyl(s * 0.3, s * 0.32, 0.8, 0, h + 0.5, 0, MARBLE, 14);
  P.dome(s * 0.3, 0, h + 0.9, 0, GOLD, 1.15);
  P.cyl(0.06, 0.06, 1.2, 0, h + 0.9 + s * 0.45 + 0.6, 0, GOLD, 5);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kiosk(P, (a * s) / 2.6, h, (b * s) / 2.6, 0.45, GOLD);
  return P.geometry();
}

/**
 * A gatehouse over an opening `w` wide in an arcade `d` deep: piers either
 * side, an arched passage, a storey over it. The main gate (the Darshani
 * Deori) rises higher and is gilded above; the clock gate carries a tower.
 */
function gatehouse(w: number, d: number, kind: "main" | "clock" | "plain"): THREE.BufferGeometry | null {
  const P = new Parts();
  const spring = 3.6;
  const H = kind === "main" ? ARCADE_H + 4.5 : ARCADE_H + 1.6;
  const upper = kind === "main" ? GOLD : MARBLE;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + PIER / 2);
    P.box(PIER, H, d, x, H / 2, d / 2, MARBLE);
    P.box(PIER + 0.1, 0.45, d + 0.2, x, 0.22, d / 2, SANDSTONE);
    // Engaged columns flanking the arch, both faces.
    for (const z of [-0.12, d + 0.12]) P.cyl(0.32, 0.36, spring + w / 2, s * (w / 2 + 0.35), (spring + w / 2) / 2, z, INLAY, 10);
  }
  // Over the passage: the arched slab, then the upper storey.
  const archTop = spring + w / 2 + 0.8;
  P.add(archedSlab(w, spring, archTop, d).translate(0, 0, d / 2), MARBLE);
  // The arch's gilded rim on both faces.
  for (const z of [-0.04, d + 0.04]) P.add(new THREE.TorusGeometry(w / 2, 0.14, 6, 18, Math.PI).translate(0, spring, z), GOLD);
  const upH = H - archTop;
  const span = w + PIER * 2;
  P.box(span, upH, d, 0, archTop + upH / 2, d / 2, upper);
  P.box(span + 0.2, 0.22, d + 0.3, 0, archTop, d / 2, kind === "main" ? MARBLE : GOLD);
  // Windows across the upper storey, both faces.
  const n = kind === "main" ? 5 : 3;
  for (let k = 0; k < n; k++) {
    const x = -span / 2 + ((k + 0.5) * span) / n;
    for (const z of [-0.04, d + 0.04]) {
      P.box(span / n - 0.9, upH * 0.5, 0.06, x, archTop + upH * 0.5, z, kind === "main" ? DEEP : SHADE);
      P.add(new THREE.CylinderGeometry((span / n - 0.9) / 2, (span / n - 0.9) / 2, 0.06, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(x, archTop + upH * 0.75, z), kind === "main" ? DEEP : SHADE);
    }
  }
  P.box(span + 0.5, 0.18, d + 0.5, 0, H, d / 2, kind === "main" ? GOLD_DARK : GOLD);
  if (kind === "main") {
    // Gilded domes: one over the passage, kiosks at the corners.
    P.cyl(w * 0.2, w * 0.22, 0.9, 0, H + 0.45, d / 2, GOLD, 14);
    P.dome(w * 0.2, 0, H + 0.9, d / 2, GOLD, 1.15);
    P.cyl(0.07, 0.07, 1.4, 0, H + 0.9 + w * 0.3 + 0.7, d / 2, GOLD, 5);
    for (const [a, b] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) kiosk(P, a * (span / 2 - 0.9), H, b ? d - 0.9 : 0.9, 0.7, GOLD);
    // The silver-and-gold doors, standing open against the piers.
    for (const s of [-1, 1]) P.box(0.12, spring + w * 0.35, w / 2 - 0.2, s * (w / 2 - 0.1), (spring + w * 0.35) / 2, w / 4 - 0.1, GOLD_DARK);
  } else if (kind === "clock") {
    // The clock tower over the north gate (Ghanta Ghar).
    const s = Math.min(span * 0.4, 4.2);
    const th = 9;
    P.box(s, th, s, 0, H + th / 2, d / 2, MARBLE);
    for (const z of [d / 2 - s / 2 - 0.04, d / 2 + s / 2 + 0.04]) {
      P.add(new THREE.CylinderGeometry(s * 0.34, s * 0.34, 0.08, 20).rotateX(Math.PI / 2).translate(0, H + th - 2, z), 0xfbf7ea);
      P.box(0.1, s * 0.26, 0.1, 0, H + th - 2 + s * 0.1, z + Math.sign(z - d / 2) * 0.06, DEEP);
      P.box(s * 0.2, 0.1, 0.1, s * 0.07, H + th - 2, z + Math.sign(z - d / 2) * 0.06, DEEP);
    }
    P.box(s + 0.5, 0.2, s + 0.5, 0, H + th, d / 2, GOLD);
    P.dome(s * 0.42, 0, H + th + 0.1, d / 2, GOLD, 1.15);
    P.cyl(0.06, 0.06, 1.2, 0, H + th + s * 0.64 + 0.6, d / 2, GOLD, 5);
    for (const a of [-1, 1]) kiosk(P, a * (span / 2 - 0.8), H, d / 2, 0.55, MARBLE);
  } else {
    for (const a of [-1, 1]) kiosk(P, a * (span / 2 - 0.8), H, d / 2, 0.6, GOLD);
  }
  return P.geometry();
}

/** The causeway's deck, balustrades and lamps, `len` along +z from z=0. */
function causeway(len: number, w: number, rail0: number, rail1: number): THREE.BufferGeometry | null {
  const P = new Parts();
  P.box(w, 0.22, len, 0, 0.11, len / 2, MARBLE);
  // A strip of inlay down the middle.
  P.box(w * 0.3, 0.02, len, 0, 0.23, len / 2, INLAY);
  const rl = rail1 - rail0;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.15);
    P.box(0.3, 0.75, rl, x, 0.22 + 0.375, rail0 + rl / 2, MARBLE);
    P.box(0.42, 0.1, rl, x, 1.02, rail0 + rl / 2, SANDSTONE);
    // Gilded lamps on the balustrade, every five metres.
    for (let z = rail0 + 1; z <= rail1 - 0.5; z += 5) {
      P.box(0.46, 0.3, 0.46, x, 1.2, z, MARBLE);
      P.cyl(0.07, 0.09, 1.9, x, 2.3, z, GOLD, 6);
      P.box(0.4, 0.5, 0.4, x, 3.45, z, GOLD);
      P.box(0.28, 0.34, 0.28, x, 3.45, z, 0xfff1c2);
      P.cone(0.3, 0.4, x, 3.9, z, GOLD, 4);
    }
  }
  return P.geometry();
}

export type BuiltPrecinct = { group: THREE.Group; dispose(): void };

/** Builds the precinct: registers its walls and the causeway deck. */
export function buildPrecinct(p: Precinct, half: number, collide: CollisionWorld, height: HeightField): BuiltPrecinct {
  const all = new Parts();
  const put = (geo: THREE.BufferGeometry | null, x: number, z: number, rot: number) => {
    if (!geo) return;
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z));
    all.list.push(geo);
  };
  const { inner, outer } = p;
  const n = inner.length;
  const onEdge = (q: Pt) => Math.abs(q[0]) >= half - 0.6 || Math.abs(q[1]) >= half - 0.6;
  // The north gate carries the clock tower (the Ghanta Ghar entrance).
  const sideGates = p.gates.filter((g) => !g.main);
  const clock = sideGates.length ? sideGates.reduce((a, b) => (b.z < a.z ? b : a)) : null;

  const edges = inner.map((q, i) => {
    const r = inner[(i + 1) % n];
    const len = Math.hypot(r[0] - q[0], r[1] - q[1]);
    const ux = (r[0] - q[0]) / (len || 1);
    const uz = (r[1] - q[1]) / (len || 1);
    // Out of the courtyard.
    let ox = uz;
    let oz = -ux;
    const mx = (q[0] + r[0]) / 2;
    const mz = (q[1] + r[1]) / 2;
    if (inRing(mx + ox * 0.5, mz + oz * 0.5, inner)) {
      ox = -ox;
      oz = -oz;
    }
    // As deep as the ring allows, at most DEPTH.
    const hit = crossings(outer, [mx, mz], [mx + ox * 60, mz + oz * 60])[0];
    const room = hit ? hit.s * 60 : DEPTH;
    const d = Math.max(4, Math.min(DEPTH, room - 0.5));
    return { q, r, len, ux, uz, ox, oz, d, skip: onEdge(q) && onEdge(r) };
  });

  for (const e of edges) {
    if (e.skip || e.len < 0.5) continue;
    // The rotation that takes local +x along the edge and +z out.
    const rot = Math.atan2(e.ox, e.oz);
    // Gates on this edge, as intervals along it.
    const cuts: [number, number][] = [];
    for (const g of p.gates) {
      const gu = (g.x - e.q[0]) * e.ux + (g.z - e.q[1]) * e.uz;
      const gv = (g.x - e.q[0]) * e.ox + (g.z - e.q[1]) * e.oz;
      if (Math.abs(gv) > 1.5 || gu < -g.w / 2 - PIER || gu > e.len + g.w / 2 + PIER) continue;
      cuts.push([gu - g.w / 2 - PIER, gu + g.w / 2 + PIER]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let from = 0;
    const pieces: [number, number][] = [];
    for (const [c0, c1] of cuts) {
      if (c0 > from) pieces.push([from, Math.min(c0, e.len)]);
      from = Math.max(from, c1);
    }
    if (from < e.len) pieces.push([from, e.len]);
    for (const [u0, u1] of pieces) {
      const len = u1 - u0;
      if (len < 0.4) continue;
      const um = (u0 + u1) / 2;
      const cx = e.q[0] + e.ux * um;
      const cz = e.q[1] + e.uz * um;
      put(arcade(len, e.d), cx, cz, rot);
      collide.box(cx + (e.ox * e.d) / 2, cz + (e.oz * e.d) / 2, len / 2, e.d / 2, rot);
    }
  }

  // Bungas at the corners, clear of the gates.
  for (let i = 0; i < n; i++) {
    const a = edges[(i - 1 + n) % n];
    const b = edges[i];
    const v = inner[i];
    if (a.skip || b.skip || onEdge(v)) continue;
    if (p.gates.some((g) => Math.hypot(g.x - v[0], g.z - v[1]) < g.w / 2 + PIER + 2)) continue;
    // A corner only where the ring turns.
    const turn = Math.abs(a.ux * b.uz - a.uz * b.ux);
    if (turn < 0.25 || a.len < 3 || b.len < 3) continue;
    const s = Math.min(a.d, b.d) + 1;
    let bx = a.ox + b.ox;
    let bz = a.oz + b.oz;
    const L = Math.hypot(bx, bz) || 1;
    bx /= L;
    bz /= L;
    const cx = v[0] + (bx * s) / 2;
    const cz = v[1] + (bz * s) / 2;
    const rot = Math.atan2(b.ox, b.oz);
    put(bunga(s), cx, cz, rot);
    collide.box(cx, cz, s / 2, s / 2, rot);
  }

  // Gatehouses: only the piers stand in the way.
  for (const g of p.gates) {
    const e = edges.reduce((best, x) => {
      const gv = Math.abs((g.x - x.q[0]) * x.ox + (g.z - x.q[1]) * x.oz);
      const gu = (g.x - x.q[0]) * x.ux + (g.z - x.q[1]) * x.uz;
      const score = gv + (gu < 0 ? -gu : gu > x.len ? gu - x.len : 0);
      return score < best.score ? { e: x, score } : best;
    }, { e: edges[0], score: Infinity }).e;
    const kind = g.main ? "main" : g === clock ? "clock" : "plain";
    const d = Math.max(e.d, g.main ? 7 : 5);
    const rot = Math.atan2(e.ox, e.oz);
    put(gatehouse(g.w, d, kind), g.x, g.z, rot);
    for (const s of [-1, 1]) {
      const off = s * (g.w / 2 + PIER / 2);
      collide.box(g.x + e.ux * off + (e.ox * d) / 2, g.z + e.uz * off + (e.oz * d) / 2, PIER / 2, d / 2, rot);
    }
  }

  // The causeway, from the parikrama out to the island.
  const { a, b, w } = p.causeway;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const crot = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const cux = Math.sin(crot);
  const cuz = Math.cos(crot);
  // The balustrade runs over the water, stopping short of both ends.
  const rail0 = 2;
  const rail1 = len - 5;
  put(causeway(len, w, rail0, rail1), a[0], a[1], crot);
  height.rect(a[0] + (cux * len) / 2, a[1] + (cuz * len) / 2, w / 2, len / 2, crot, 0.22, 0.22);
  const rl = rail1 - rail0;
  for (const s of [-1, 1]) {
    const off = s * (w / 2 - 0.15);
    const mid = rail0 + rl / 2;
    collide.box(a[0] + cux * mid + cuz * off, a[1] + cuz * mid - cux * off, 0.25, rl / 2, crot);
  }

  const group = new THREE.Group();
  group.name = "precinct";
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = all.mesh(mat);
  if (mesh) group.add(mesh);
  return {
    group,
    dispose() {
      mesh?.geometry.dispose();
      mat.dispose();
    },
  };
}
