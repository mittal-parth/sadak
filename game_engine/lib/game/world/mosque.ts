/**
 * The great congregational mosques: Delhi's Jama Masjid, Ahmedabad's, and
 * Hyderabad's Mecca Masjid. A high plinth with a grand stair to the east
 * gate (and to the north and south gates in Delhi); arcaded cloisters round
 * a paved court with the hauz in the middle and domed pavilions at the
 * corners; the prayer hall across the west, its arched bays either side of a
 * tall pishtaq; above it three striped onion domes and two striped minarets
 * (Delhi), a field of small domes and the stumps of the shaking minarets
 * (Ahmedabad), or massive octagonal minarets over a flat roof (Hyderabad).
 *
 * Local frame as every monument: footprint centred on the origin, entrance
 * on +z; the prayer hall is at -z.
 */

import * as THREE from "three";
import { Parts, archedSlab, onion, stripedShaft } from "./vc";
import { archWindow, chhatri, finish, type LocalBox, type LocalRect, type Monument, type MosqueStyle } from "./monuments";

const MARBLE = 0xf4efe6;
const DEEP = 0x3a2c26;
const GOLD = 0xe0b23a;
const WATER = 0x3f7fc0;

/** Builds `sub` and merges it into `P` at (x, y, z) turned by `rot`. */
function put(P: Parts, sub: Parts, x: number, y: number, z: number, rot: number) {
  const g = sub.geometry();
  if (!g) return;
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z));
  P.list.push(g);
}

/** A collider given in a sub-frame at (x, z) turned by `rot`. */
function box(C: LocalBox[], x: number, z: number, rot: number, u: number, v: number, hw: number, hd: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  C.push({ x: x + u * c + v * s, z: z - u * s + v * c, hw, hd, rot });
}

/** Octagonal domed pavilion on a roof corner. */
function pavilion(P: Parts, x: number, y: number, z: number, s: number, stone: number, dome: number[]) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.box(0.22 * s, 1.7 * s, 0.22 * s, x + Math.sin(a) * s, y + 0.85 * s, z + Math.cos(a) * s, stone);
  }
  P.cyl(s * 1.3, s * 1.3, 0.2 * s, x, y + 1.8 * s, z, stone, 8);
  P.cyl(s * 0.8, s * 0.85, 0.35 * s, x, y + 2.05 * s, z, stone, 8);
  onion(P, s * 0.85, x, y + 2.2 * s, z, dome, 16);
  P.cyl(0.05 * s, 0.05 * s, 0.6 * s, x, y + 2.2 * s + s * 1.4, z, GOLD, 5);
}

/** Crenellations (kanguras) along x, `len` long, at height y, depth z. */
function kanguras(P: Parts, len: number, y: number, z: number, stone: number) {
  const n = Math.max(1, Math.floor(len / 1.3));
  for (let k = 0; k < n; k++) P.box(0.7, 0.6, 0.25, -len / 2 + (k + 0.5) * (len / n), y + 0.3, z, stone);
}

/**
 * One run of cloister, `len` along x: the outer wall at z 0..t, a roof on
 * arched piers out to z = `cd`, the court beyond. Returns its colliders in
 * the same frame.
 */
function cloister(len: number, cd: number, ch: number, st: MosqueStyle): { parts: Parts; walls: LocalBox[] } {
  const P = new Parts();
  const walls: LocalBox[] = [];
  const t = 1.2;
  P.box(len, ch, t, 0, ch / 2, t / 2, st.stone);
  P.box(len, 0.5, cd, 0, ch - 0.25, cd / 2, st.stone);
  // A band of marble under the eave, and the eave itself over the court.
  P.box(len, 0.3, 0.1, 0, ch - 0.7, cd + 0.02, st.accent);
  P.box(len, 0.12, 0.9, 0, ch - 0.45, cd + 0.4, st.stone);
  kanguras(P, len, ch, 0.15, st.stone);
  kanguras(P, len, ch, cd - 0.15, st.stone);
  walls.push({ x: 0, z: t / 2, hw: len / 2, hd: t / 2 });
  const n = Math.max(1, Math.round(len / 3.8));
  const bay = len / n;
  const pz = cd - 0.35;
  for (let k = 0; k <= n; k++) {
    const u = -len / 2 + k * bay;
    P.box(0.7, ch - 0.5, 0.7, u, (ch - 0.5) / 2, pz, st.stone);
    P.box(0.9, 0.3, 0.9, u, 0.15, pz, st.accent);
    walls.push({ x: u, z: pz, hw: 0.35, hd: 0.35 });
  }
  for (let k = 0; k < n; k++) {
    const u = -len / 2 + (k + 0.5) * bay;
    P.add(archedSlab(bay - 0.7, ch * 0.42, ch - 0.5, 0.6).translate(u, 0, pz), st.stone);
    // Blind arches on the inside of the outer wall.
    archWindow(P, u, 0.3, t + 0.05, Math.min(2.2, bay * 0.55), ch * 0.6, DEEP);
  }
  return { parts: P, walls };
}

/**
 * A gatehouse: an arched passage `pw` wide through a block `gd` deep, the
 * front a pishtaq framed in marble, kiosks along the top. The main gate is
 * taller and carries an onion dome.
 */
function gate(pw: number, gd: number, H: number, st: MosqueStyle, main: boolean): { parts: Parts; walls: LocalBox[] } {
  const P = new Parts();
  const walls: LocalBox[] = [];
  const pier = Math.max(2.2, pw * 0.45);
  const span = pw + pier * 2;
  const spring = Math.min(H * 0.45, pw * 0.9 + 1);
  for (const s of [-1, 1]) {
    const x = s * (pw / 2 + pier / 2);
    P.box(pier, H, gd, x, H / 2, gd / 2, st.stone);
    walls.push({ x, z: gd / 2, hw: pier / 2, hd: gd / 2 });
  }
  const archTop = spring + pw / 2 + 0.6;
  P.add(archedSlab(pw, spring, archTop, gd).translate(0, 0, gd / 2), st.stone);
  P.box(span, H - archTop, gd, 0, archTop + (H - archTop) / 2, gd / 2, st.stone);
  for (const [z, f] of [[-0.03, -1], [gd + 0.03, 1]] as const) {
    // The pishtaq's marble frame, the arch's rim, roundels in the spandrels.
    P.box(span - 0.6, 0.35, 0.08, 0, H - 0.9, z, st.accent);
    for (const s of [-1, 1]) P.box(0.35, H - 1.2, 0.08, s * (span / 2 - 0.5), (H - 1.2) / 2, z, st.accent);
    P.box(pw + 1.6, 0.25, 0.08, 0, archTop + 0.1, z, st.accent);
    for (const s of [-1, 1]) P.box(0.25, archTop, 0.08, s * (pw / 2 + 0.8), archTop / 2, z, st.accent);
    P.add(new THREE.TorusGeometry(pw / 2 + 0.15, 0.16, 6, 20, Math.PI).translate(0, spring, z), st.accent);
    for (const s of [-1, 1]) {
      P.add(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12).rotateX(Math.PI / 2).translate(s * (pw / 2 + 0.2), archTop - 0.8, z + f * 0.02), st.accent);
    }
    // A row of small arched windows over the arch.
    if (H - archTop > 2.4) {
      for (let k = -1; k <= 1; k++) archWindow(P, k * (span / 4), archTop + 0.6, z + f * 0.03, 0.9, 1.6, DEEP, f < 0 ? Math.PI : 0);
    }
  }
  kanguras(P, span, H, 0.2, st.stone);
  kanguras(P, span, H, gd - 0.2, st.stone);
  // Guldastas at the pishtaq's corners, kiosks along the top.
  for (const s of [-1, 1]) {
    for (const z of [0.4, gd - 0.4]) {
      stripedShaft(P, 0.28, 0.34, 2.4, s * (span / 2 - 0.4), H, z, st.stone, st.stripe ?? st.accent, 8);
      onion(P, 0.4, s * (span / 2 - 0.4), H + 2.4, z, [MARBLE]);
    }
  }
  const kiosks = main ? 5 : 3;
  for (let k = 0; k < kiosks; k++) chhatri(P, -span / 2 + 1.6 + (k * (span - 3.2)) / (kiosks - 1), H, gd - 0.9, 0.55, MARBLE, MARBLE);
  if (main) {
    const r = pw * 0.42;
    P.cyl(r * 0.9, r * 0.95, 1.2, 0, H + 0.6, gd / 2 + 0.5, st.accent, 16);
    onion(P, r, 0, H + 1.2, gd / 2 + 0.5, st.stripe ? [MARBLE, MARBLE, MARBLE, st.stripe] : [st.dome]);
    P.cyl(0.08, 0.08, 1.4, 0, H + 1.2 + r * 1.55 + 0.6, gd / 2 + 0.5, GOLD, 5);
  }
  return { parts: P, walls };
}

/** A tall minaret: striped tiers, balconies, a domed kiosk on top. */
function minaret(P: Parts, C: LocalBox[], x: number, z: number, y: number, h: number, st: MosqueStyle) {
  const r = Math.max(1.3, h * 0.045);
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const y0 = y + (h * t) / tiers;
    const hh = h / tiers;
    const r0 = r * (1 - t * 0.12);
    stripedShaft(P, r0 * 0.9, r0, hh, x, y0, z, st.stone, st.stripe ? MARBLE : st.accent, 16);
    // The balcony on its brackets, with a railing.
    P.cyl(r0 * 1.5, r0 * 1.1, 0.5, x, y0 + hh - 0.1, z, st.accent, 16);
    P.cyl(r0 * 1.5, r0 * 1.5, 0.12, x, y0 + hh + 0.15, z, st.accent, 16);
    P.cyl(r0 * 1.48, r0 * 1.48, 0.7, x, y0 + hh + 0.5, z, st.stone, 16);
  }
  pavilion(P, x, y + h + 0.7, z, r * 0.75, MARBLE, st.stripe ? [MARBLE, MARBLE, MARBLE, st.stripe] : [st.dome]);
  C.push({ x, z, hw: r, hd: r });
}

export function congregationalMosque(w: number, d: number, st: MosqueStyle): Monument {
  const P = new Parts();
  const C: LocalBox[] = [];
  const Hs: LocalRect[] = [];
  const ph = st.plinth;
  const domes = st.domes ?? "three";

  // Plinth, the east stair, and the side stairs.
  const n = Math.max(2, Math.round(ph / 0.17));
  const run = n * 0.32;
  const sr = st.sideGates ? run : 0;
  const Wp = w - 2 * sr;
  const top = -d / 2;
  const front = d / 2 - run;
  const Dp = front - top;
  const zc = (top + front) / 2;
  P.box(Wp, ph, Dp, 0, ph / 2, zc, st.stone);
  // A marble string course round the plinth, just under the court's paving.
  P.box(Wp + 0.3, 0.35, Dp + 0.3, 0, ph - 0.45, zc, st.accent);
  Hs.push({ x: 0, z: zc, hw: Wp / 2, hd: Dp / 2, y0: ph, y1: ph });
  const stairW = Math.min(Wp * 0.28, 30);
  P.steps(stairW, ph, 0, d / 2, st.stone);
  Hs.push({ x: 0, z: d / 2 - run / 2, hw: stairW / 2, hd: run / 2, y0: ph, y1: 0 });
  for (const s of [-1, 1]) {
    P.box(1, ph + 0.4, run, s * (stairW / 2 + 0.5), (ph + 0.4) / 2, d / 2 - run / 2, st.stone);
    C.push({ x: s * (stairW / 2 + 0.5), z: d / 2 - run / 2, hw: 0.5, hd: run / 2 });
  }
  const sw = Math.min(Dp * 0.2, 22);
  if (st.sideGates) {
    for (const s of [-1, 1]) {
      const rot = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      P.steps(sw, ph, s * (w / 2), zc, st.stone, rot);
      Hs.push({ x: s * (w / 2 - sr / 2), z: zc, hw: sw / 2, hd: sr / 2, y0: ph, y1: 0, rot });
      for (const f of [-1, 1]) {
        P.box(sr, ph + 0.4, 1, s * (w / 2 - sr / 2), (ph + 0.4) / 2, zc + f * (sw / 2 + 0.5), st.stone);
        C.push({ x: s * (w / 2 - sr / 2), z: zc + f * (sw / 2 + 0.5), hw: sr / 2, hd: 0.5 });
      }
    }
  }
  // Blind arcades round the plinth's faces (the shops under Delhi's).
  if (ph >= 2.5) {
    const cell = 3.4;
    for (let x = -Wp / 2 + cell / 2; x < Wp / 2; x += cell) {
      if (Math.abs(x) > stairW / 2 + 1.5) archWindow(P, x, 0.3, front + 0.03, 1.8, ph * 0.72, DEEP);
      archWindow(P, x, 0.3, top - 0.03, 1.8, ph * 0.72, DEEP, Math.PI);
    }
    for (const s of [-1, 1]) {
      for (let z = top + cell / 2; z < front; z += cell) {
        if (st.sideGates && Math.abs(z - zc) < sw / 2 + 1.5) continue;
        archWindow(P, s * (Wp / 2 + 0.03), 0.3, z, 1.8, ph * 0.72, DEEP, (s * Math.PI) / 2);
      }
    }
  }

  // Cloisters on the east, north and south; gates in them.
  const cd = Math.min(7, Math.max(4.5, Wp * 0.055));
  const ch = Math.min(7, Math.max(5, Wp * 0.055));
  const pw = Math.min(7, Math.max(4, stairW * 0.3));
  const gd = cd + 2;
  const gateH = ch * (domes === "three" ? 2.6 : 2);
  const gateSpan = pw + 2 * Math.max(2.2, pw * 0.45);
  const run2 = (x0: number, z0: number, x1: number, z1: number, rot: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const { parts, walls } = cloister(len, cd, ch, st);
    put(P, parts, cx, ph, cz, rot);
    for (const b of walls) box(C, cx, cz, rot, b.x, b.z, b.hw, b.hd);
  };
  // East (front), either side of the gate: inward is -z.
  const ex = Wp / 2;
  run2(-ex, front, -gateSpan / 2, front, Math.PI);
  run2(gateSpan / 2, front, ex, front, Math.PI);
  // North and south sides, from the back wall to the east run.
  for (const s of [-1, 1]) {
    const rot = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    const x = s * ex;
    if (st.sideGates) {
      run2(x, top, x, zc - gateSpan / 2, rot);
      run2(x, zc + gateSpan / 2, x, front - cd, rot);
    } else {
      run2(x, top, x, front - cd, rot);
    }
  }
  const mainGate = gate(pw, gd, gateH, st, true);
  put(P, mainGate.parts, 0, ph, front, Math.PI);
  for (const b of mainGate.walls) box(C, 0, front, Math.PI, b.x, b.z, b.hw, b.hd);
  if (st.sideGates) {
    for (const s of [-1, 1]) {
      const rot = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      const g = gate(pw, gd, gateH * 0.85, st, false);
      put(P, g.parts, s * ex, ph, zc, rot);
      for (const b of g.walls) box(C, s * ex, zc, rot, b.x, b.z, b.hw, b.hd);
    }
  }
  const corner = st.stripe ? [MARBLE, MARBLE, MARBLE, st.stripe] : [st.dome];
  for (const sx of [-1, 1]) for (const z of [front - cd / 2, top + cd / 2]) pavilion(P, sx * (ex - cd / 2), ph + ch, z, cd * 0.28, st.stone, corner);

  // The prayer hall across the west.
  const hw = Wp * (domes === "none" ? 0.7 : 0.62);
  const hd = Math.min(Dp * 0.22, 24);
  const hh = Math.min(13, Math.max(8, Wp * 0.1));
  const hb = top + 1.2;
  const hf = hb + hd;
  const hz = (hb + hf) / 2;
  const y = ph;
  P.box(hw, hh, hd, 0, y + hh / 2, hz, st.stone);
  C.push({ x: 0, z: hz, hw: hw / 2, hd: hd / 2 });
  // The back wall either side of the hall, to the cloisters.
  for (const s of [-1, 1]) {
    const x0 = hw / 2;
    const x1 = ex - 1.2;
    if (x1 - x0 < 0.5) continue;
    P.box(x1 - x0, ch, 1.2, s * (x0 + x1) / 2, y + ch / 2, top + 0.6, st.stone);
    C.push({ x: (s * (x0 + x1)) / 2, z: top + 0.6, hw: (x1 - x0) / 2, hd: 0.6 });
  }
  const bays = domes === "none" ? 5 : domes === "many" ? 7 : 11;
  const pishW = hw * (domes === "none" ? 0.24 : 0.2);
  const side = (bays - 1) / 2;
  const bayW = (hw - pishW) / 2 / side;
  for (const s of [-1, 1]) {
    for (let k = 0; k < side; k++) {
      const x = s * (pishW / 2 + (k + 0.5) * bayW);
      P.box(bayW * 0.78, hh * 0.74, 0.06, x, y + hh * 0.37 + 0.2, hf + 0.03, st.accent);
      archWindow(P, x, y + 0.3, hf + 0.07, bayW * 0.6, hh * 0.64, DEEP);
      // Marble strips between the bays.
      P.box(0.32, hh, 0.12, x + (s * bayW) / 2, y + hh / 2, hf + 0.06, st.accent);
    }
  }
  P.box(hw + 0.4, 0.35, hd + 0.4, 0, y + hh - 0.2, hz, st.accent);
  kanguras(P, hw, y + hh, hf - 0.2, st.stone);
  // The pishtaq: the tall central arch, framed in marble.
  const pishH = hh * 1.5;
  P.box(pishW, pishH, 2.2, 0, y + pishH / 2, hf + 1.1, st.stone);
  P.box(pishW * 0.82, pishH * 0.86, 0.06, 0, y + pishH * 0.43 + 0.2, hf + 2.23, st.accent);
  archWindow(P, 0, y + 0.3, hf + 2.27, pishW * 0.6, pishH * 0.76, DEEP);
  P.box(pishW * 0.5, 0.9, 0.06, 0, y + pishH * 0.9, hf + 2.24, 0x1f1a17);
  kanguras(P, pishW, y + pishH, hf + 2, st.stone);
  for (const s of [-1, 1]) {
    stripedShaft(P, 0.36, 0.42, pishH * 0.22, s * (pishW / 2 - 0.35), y + pishH, hf + 1.9, st.stone, st.stripe ? MARBLE : st.accent, 8);
    onion(P, 0.5, s * (pishW / 2 - 0.35), y + pishH * 1.22, hf + 1.9, [MARBLE]);
  }
  C.push({ x: 0, z: hf + 1.1, hw: pishW / 2, hd: 1.1 });

  const domeCols = st.stripe ? [MARBLE, MARBLE, MARBLE, st.stripe] : [st.dome];
  if (domes === "three") {
    const r = Math.min(hw * 0.12, hd * 0.46);
    for (const [x, k] of [[0, 1], [-hw * 0.3, 0.74], [hw * 0.3, 0.74]] as const) {
      const rr = r * k;
      const dy = y + hh + (k === 1 ? pishH - hh - 1 : 0);
      P.cyl(rr * 0.92, rr * 0.96, rr * 0.7, x, dy + rr * 0.35, hz, st.accent, 16);
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        archWindow(P, x + Math.sin(t) * rr * 0.95, dy + 0.1, hz + Math.cos(t) * rr * 0.95, rr * 0.22, rr * 0.5, DEEP, t);
      }
      onion(P, rr, x, dy + rr * 0.7, hz, domeCols);
      P.cyl(0.1, 0.1, rr * 0.5, x, dy + rr * 0.7 + rr * 1.55 + rr * 0.25, hz, GOLD, 6);
      P.cone(0.3, 0.6, x, dy + rr * 0.7 + rr * 1.55 + rr * 0.6, hz, GOLD, 8);
    }
    // Kiosks along the roof between the domes.
    for (const x of [-hw * 0.45, -hw * 0.15, hw * 0.15, hw * 0.45]) chhatri(P, x, y + hh, hf - 1.2, 0.7, MARBLE, MARBLE);
  } else if (domes === "many") {
    const cols = 5;
    const rows = 3;
    const r = Math.min(hw / cols, hd / rows) * 0.34;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = -hw / 2 + (i + 0.5) * (hw / cols);
        const z = hb + (j + 0.5) * (hd / rows);
        const big = i === 2 && j === 1;
        const rr = big ? r * 1.6 : r;
        P.cyl(rr * 0.95, rr, rr * 0.4, x, y + hh + rr * 0.2, z, st.accent, 12);
        P.dome(rr, x, y + hh + rr * 0.4, z, st.dome, 1.05);
      }
    }
  } else {
    // A flat roof and a gallery of small arches along the parapet.
    for (let k = 0; k < 12; k++) archWindow(P, -hw / 2 + ((k + 0.5) * hw) / 12, y + hh - 1.8, hf + 0.08, 0.7, 1.2, DEEP);
  }

  // Minarets.
  if (domes === "three") {
    const mh = Math.min(40, Wp * 0.3);
    const r = Math.max(1.3, mh * 0.045);
    for (const s of [-1, 1]) minaret(P, C, s * (hw / 2 + r + 0.2), hf + r, y, mh, st);
  } else if (domes === "many") {
    // The stumps of the minarets that fell in the 1819 earthquake.
    for (const s of [-1, 1]) {
      const x = s * (pishW / 2 + 1.1);
      for (let t = 0; t < 3; t++) {
        stripedShaft(P, 1.0, 1.1, pishH * 0.4, x, y + t * pishH * 0.4, hf + 1.3, st.stone, st.accent, 12);
        P.cyl(1.4, 1.2, 0.35, x, y + (t + 1) * pishH * 0.4, hf + 1.3, st.accent, 12);
      }
      C.push({ x, z: hf + 1.3, hw: 1.1, hd: 1.1 });
    }
  } else {
    // Hyderabad: massive octagonal minarets at the façade's ends.
    const mh = hh * 1.9;
    for (const s of [-1, 1]) {
      const x = s * (hw / 2 - 1.8);
      const z = hf + 0.4;
      P.cyl(1.9, 2.1, mh, x, y + mh / 2, z, st.stone, 8);
      for (const f of [0.45, 0.8]) P.cyl(2.5, 2.3, 0.45, x, y + mh * f, z, st.accent, 8);
      // An arcaded gallery on a ring of brackets, then the domed lantern.
      P.cyl(2.7, 2.1, 0.6, x, y + mh - 0.3, z, st.accent, 8);
      P.cyl(1.7, 1.8, 2.8, x, y + mh + 1.4, z, st.stone, 8);
      for (let a = 0; a < 8; a++) {
        const t = ((a + 0.5) / 8) * Math.PI * 2;
        archWindow(P, x + Math.sin(t) * 1.72, y + mh + 0.4, z + Math.cos(t) * 1.72, 0.8, 1.8, DEEP, t);
      }
      P.cyl(2.2, 2.2, 0.25, x, y + mh + 2.9, z, st.accent, 8);
      onion(P, 1.6, x, y + mh + 3, z, [st.dome]);
      P.cyl(0.06, 0.06, 1, x, y + mh + 3 + 2.5 + 0.5, z, GOLD, 5);
      C.push({ x, z, hw: 2.1, hd: 2.1 });
    }
  }

  // The hauz in the court: marble rim, water, a fountain in the middle.
  const court0 = hf + 2.3;
  const court1 = front - cd;
  const cz = (court0 + court1) / 2;
  const tw = Math.min(14, (Wp - 2 * cd) * 0.18);
  const td = Math.min(11, (court1 - court0) * 0.22);
  P.box(tw + 1.2, 0.55, td + 1.2, 0, y + 0.27, cz, MARBLE);
  P.box(tw, 0.57, td, 0, y + 0.29, cz, WATER);
  P.cyl(0.35, 0.5, 1, 0, y + 0.8, cz, MARBLE, 8);
  C.push({ x: 0, z: cz, hw: tw / 2 + 0.6, hd: td / 2 + 0.6 });

  return finish(P, C, Hs, { x: 0, z: Math.min(court1 - 2, cz + td / 2 + 3) });
}
