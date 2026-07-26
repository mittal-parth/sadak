import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural hard-surface geometry kit for the weapons.
 *
 * Ground rules that come out of the quality bar:
 *
 *  - There is no such thing as a 90-degree edge on a real firearm. Every box
 *    here is a RoundedBoxGeometry with a 0.3-1.5 mm chamfer, every extrusion is
 *    bevelled, every tube end gets a crowned lathe profile. That single fact is
 *    what separates "modelled" from "blocked out": chamfers catch a specular
 *    line and give the silhouette its read.
 *  - Parts are authored in metres at real scale, in weapon-local space:
 *    +X right, +Y up, -Z toward the muzzle (the camera convention), origin at
 *    the shooting hand's anchor point (web of the thumb, top-rear of the grip).
 *  - Everything funnels through `Assembly`, which transforms each piece into
 *    weapon space, buckets it by material and merges the buckets. A whole rifle
 *    lands in 6-8 draw calls.
 */

/** Axial primitives are authored along +Z, which is *rearward*, then mirrored. */
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

const KEEP_ATTRS = ['position', 'normal', 'uv'];

/** Strip everything merge cannot reconcile; keep P/N/UV only. */
function normalizeAttributes(geo) {
  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP_ATTRS.includes(name)) geo.deleteAttribute(name);
  }
  if (!geo.getAttribute('uv')) {
    const n = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

/* ========================================================================== */
/*  primitives                                                                */
/* ========================================================================== */

/**
 * Chamfered box. `chamfer` is the bevel radius in metres; `seg` 1 gives a hard
 * 45-degree chamfer, 2-3 gives a rounded fillet.
 */
export function box(w, h, d, chamfer = 0.0012, seg = 1) {
  const r = Math.min(chamfer, Math.min(w, Math.min(h, d)) * 0.49);
  if (r <= 1e-5) return normalizeAttributes(new THREE.BoxGeometry(w, h, d));
  return normalizeAttributes(new RoundedBoxGeometry(w, h, d, seg, r));
}

/** A softly rounded block — grips, palm swells, butt pads. */
export function blob(w, h, d, radius = 0.006, seg = 3) {
  return box(w, h, d, radius, seg);
}

/**
 * Lathe around the Z axis. `profile` is a flat list of [axialZ, radius] pairs
 * from rear to front (or any order); radius 0 closes the form.
 */
export function latheZ(profile, seg = 24, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = [];
  for (let i = 0; i < profile.length; i++) {
    pts.push(new THREE.Vector2(Math.max(1e-5, profile[i][1]), profile[i][0]));
  }
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  // Lathe spins around +Y; a +90 deg rotation about X maps (r, a) -> (r, 0, a),
  // so the axis becomes +Z and the axial coordinates survive untouched.
  g.rotateX(Math.PI / 2);
  return normalizeAttributes(g);
}

function flipWinding(geo) {
  const idx = geo.getIndex();
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i];
      a[i] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  const n = geo.getAttribute('normal');
  if (n) {
    const a = n.array;
    for (let i = 0; i < a.length; i++) a[i] = -a[i];
    n.needsUpdate = true;
  }
  return geo;
}

/**
 * Tube along Z with a real wall: outer surface, inner bore, and crowned ends.
 * Used for barrels, optic tubes, suppressors, buffer tubes.
 */
export function tubeZ(rOuter, rInner, len, seg = 24, crown = 0.0006) {
  const z0 = -len / 2;
  const z1 = len / 2;
  const c = Math.min(crown, (rOuter - rInner) * 0.4);
  return latheZ(
    [
      [z0 + c, rInner],
      [z0, rInner + c],
      [z0, rOuter - c],
      [z0 + c, rOuter],
      [z1 - c, rOuter],
      [z1, rOuter - c],
      [z1, rInner + c],
      [z1 - c, rInner],
    ],
    seg
  );
}

/** Solid cylinder along Z with chamfered rims. */
export function rodZ(r0, r1, len, seg = 20, chamfer = 0.0008) {
  const z0 = -len / 2;
  const z1 = len / 2;
  const c = Math.min(chamfer, len * 0.4, Math.min(r0, r1) * 0.5);
  return latheZ(
    [
      [z0, 0],
      [z0, r0 - c],
      [z0 + c, r0],
      [z1 - c, r1],
      [z1, r1 - c],
      [z1, 0],
    ],
    seg
  );
}

/** Sphere-ish detail blob (buttons, bosses, knuckle pads). */
export function dome(r, seg = 16, cut = 0.6) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.5)), 0, Math.PI * 2, 0, Math.PI * cut);
  g.rotateX(Math.PI / 2);
  return normalizeAttributes(g);
}

/**
 * Extrude a 2-D outline (in XY) along Z with a real bevel on both faces.
 * `pts` is a flat array of [x, y]; it is closed automatically.
 */
export function extrude(pts, depth, opts = {}) {
  const bevel = opts.bevel ?? 0.0008;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  if (opts.holes) {
    for (const hole of opts.holes) {
      const p = new THREE.Path();
      p.moveTo(hole[0][0], hole[0][1]);
      for (let i = 1; i < hole.length; i++) p.lineTo(hole[i][0], hole[i][1]);
      p.closePath();
      shape.holes.push(p);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - bevel * 2),
    bevelEnabled: bevel > 1e-6,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: opts.bevelSegments ?? 1,
    curveSegments: opts.curveSegments ?? 6,
    steps: opts.steps ?? 1,
  });
  g.translate(0, 0, -depth / 2 + bevel);
  // ExtrudeGeometry is non-indexed with correct flat normals; weld the exact
  // duplicates (keeping hard edges, since welding compares normals too) and
  // leave the normals alone.
  const merged = mergeVertices(normalizeAttributes(g), 1e-6);
  if (merged !== g) g.dispose();
  return normalizeAttributes(merged);
}

/** A rounded rectangle outline, for extruded plates that need soft corners. */
export function roundRect(w, h, r, seg = 3) {
  const pts = [];
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const corners = [
    [hw, hh, 0],
    [-hw, hh, Math.PI / 2],
    [-hw, -hh, Math.PI],
    [hw, -hh, -Math.PI / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Torus in the XY plane (sling loops, trigger guard bows, QD rings). */
export function ring(radius, thickness, seg = 20, rings = 8, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(radius, thickness, rings, seg, arc);
  return normalizeAttributes(g);
}

/**
 * Hex-socket cap screw, axis +Z, head at z=0 facing -Z.
 * The socket is a genuine counterbore (annular head + a plug at the bottom) so
 * it reads as a hole instead of a painted dot.
 */
export function screw(rHead, rShank, headH, shankL, seg = 12) {
  const rSocket = rHead * 0.52;
  const g = [];
  g.push(
    latheZ(
      [
        [0, rSocket],
        [0, rHead - 0.0002],
        [0.0002, rHead],
        [headH, rHead],
        [headH, rShank],
        [headH + shankL, rShank],
        [headH + shankL, 0],
      ],
      seg
    )
  );
  // counterbore wall + floor
  const bore = latheZ(
    [
      [headH * 0.62, 0],
      [headH * 0.62, rSocket],
      [0, rSocket],
    ],
    6
  );
  g.push(bore);
  return mergeAll(g);
}

/** Knurling / checkering: a band of tiny pyramids around a cylinder. */
export function knurlBand(radius, len, count = 28, depth = 0.0004, rows = 3) {
  const parts = [];
  const cell = new THREE.OctahedronGeometry(depth * 2.2, 0);
  cell.scale(1, 1, 0.55);
  for (let r = 0; r < rows; r++) {
    const z = -len / 2 + ((r + 0.5) / rows) * len;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (r % 2) * (Math.PI / count);
      const g = cell.clone();
      g.rotateZ(a);
      g.translate(Math.cos(a) * radius, Math.sin(a) * radius, z);
      parts.push(normalizeAttributes(g));
    }
  }
  cell.dispose();
  return mergeAll(parts);
}

/** Fine longitudinal serrations (slide grip, handguard panels, mag ribs). */
export function serrations(w, h, len, count, depth = 0.0006, axis = 'x') {
  const parts = [];
  const step = (axis === 'x' ? w : h) / count;
  const rib = box(axis === 'x' ? step * 0.55 : w, axis === 'x' ? h : step * 0.55, len, depth * 0.9, 1);
  for (let i = 0; i < count; i++) {
    const t = -0.5 + (i + 0.5) / count;
    const g = rib.clone();
    if (axis === 'x') g.translate(t * w, 0, 0);
    else g.translate(0, t * h, 0);
    parts.push(g);
  }
  rib.dispose();
  const merged = mergeAll(parts);
  merged.translate(0, 0, 0);
  return merged;
}

/**
 * MIL-STD-1913 Picatinny rail running along Z.
 *
 * Real dimensions: 21.2 mm across the top, 45-degree flanks down to a 15.7 mm
 * waist, 5.35 mm recoil slots on a 10.55 mm pitch (so a 5.2 mm crown), and the
 * slot floor 3 mm below the crown. Built as a run of crown-length blocks so the
 * slots are genuine gaps in the silhouette.
 *
 * THE UP-FACING AREA IS THE WHOLE PROBLEM. The previous cross-section put a
 * 20.4 mm flat directly on top of every tooth (the profile went from the full
 * half-width at 62% height to the full half-width minus 0.4 mm at full height —
 * a 0.4 mm chamfer, i.e. none). 21 mm x 4.65 mm of dead-flat metal pointing
 * straight up catches the entire GGX lobe of the viewmodel key at once, and the
 * measured result was a rail at 0.194 linear against a 0.076 receiver: a
 * 1.35-stop bright comb, the single most-cited "toy" tell on the weapon.
 *
 * The fix is the real cross-section: a 45-degree chamfer 1.5 mm wide on BOTH
 * top edges, which is what a machined rail actually has. That is 3 mm of the
 * 21.2 mm width converted from up-facing to 45-degree-facing, and — far more
 * importantly — it puts a hard geometric edge either side of the flat, so the
 * vertex curvature mask (which is what the wear layer rides) lands on the
 * chamfer instead of bleeding across the crown. See `alu` in materials.js.
 */
export function picatinny(len, opts = {}) {
  const width = opts.width ?? 0.0212;
  const waist = opts.waist ?? 0.0157;
  const baseH = opts.baseH ?? 0.0042;
  const topH = opts.topH ?? 0.0032;
  // 10.55 mm pitch - 5.35 mm slot = a 5.2 mm crown, per MIL-STD-1913.
  const pitch = opts.pitch ?? 0.01055;
  const slot = opts.slot ?? 0.00535;
  const chamfer = 0.00035;
  /** 45-degree chamfer on each top edge. Width == height, by definition. */
  const ch = opts.crownChamfer ?? 0.0015;

  // Cross-section of one tooth: base plate + trapezoid + chamfered flat top.
  const teeth = Math.max(1, Math.floor((len + slot) / pitch));
  const toothLen = pitch - slot;
  const parts = [];

  const base = box(width, baseH, len, chamfer, 1);
  base.translate(0, baseH / 2, 0);
  parts.push(base);

  const profile = [
    [-waist / 2, 0],
    [-width / 2, topH - ch],
    [-width / 2 + ch, topH],
    [width / 2 - ch, topH],
    [width / 2, topH - ch],
    [waist / 2, 0],
  ];
  const tooth = extrude(profile, toothLen, { bevel: 0.00025, bevelSegments: 1 });
  for (let i = 0; i < teeth; i++) {
    const z = len / 2 - toothLen / 2 - i * pitch;
    if (z - toothLen / 2 < -len / 2) break;
    const g = tooth.clone();
    g.translate(0, baseH, z);
    parts.push(g);
  }
  tooth.dispose();
  return mergeAll(parts);
}

/** M-LOK style slot: a recessed pocket with a raised lip, for handguard slats. */
export function mlokSlot(len = 0.032, wide = 0.0075, depth = 0.0022) {
  const parts = [];
  const outer = extrude(roundRect(len, wide + 0.0028, 0.0014, 3), 0.0016, { bevel: 0.0004 });
  const inner = extrude(roundRect(len - 0.0016, wide, 0.0012, 3), depth, { bevel: 0.0003 });
  inner.translate(0, 0, -depth * 0.35);
  parts.push(outer, inner);
  return mergeAll(parts);
}

/* ========================================================================== */
/*  assembly                                                                  */
/* ========================================================================== */

/**
 * Collects transformed geometry per material, then merges each bucket into one
 * mesh. Also carries the named attachment nodes (muzzle, sight axis, grips,
 * moving parts) the animation rig drives.
 */
export class Assembly {
  constructor(name) {
    this.name = name;
    this.buckets = new Map(); // matKey -> geometry[]
    this.nodes = new Map(); // name -> { pos:[x,y,z], rot:[x,y,z] }
  }

  /**
   * @param {THREE.BufferGeometry} geo    consumed (cloned internally)
   * @param {string} mat                  material key
   * @param {object} t   { x,y,z, rx,ry,rz, sx,sy,sz, mirror }
   */
  add(geo, mat, t = null) {
    const g = geo.clone();
    if (t) {
      _v.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
      _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'XYZ');
      _q.setFromEuler(_e);
      _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
      _m4.compose(_v, _q, _s);
      g.applyMatrix4(_m4);
      if ((t.sx ?? 1) * (t.sy ?? 1) * (t.sz ?? 1) < 0) flipWinding(g);
    }
    normalizeAttributes(g);
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(g);
    return this;
  }

  /** Same piece on both sides of the weapon. */
  addMirrored(geo, mat, t) {
    this.add(geo, mat, t);
    this.add(geo, mat, { ...t, x: -(t.x ?? 0), sx: -(t.sx ?? 1) });
    return this;
  }

  node(name, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.nodes.set(name, { pos: [x, y, z], rot: [rx, ry, rz] });
    return this;
  }

  /** @returns Map<matKey, THREE.BufferGeometry> */
  build() {
    const out = new Map();
    for (const [mat, list] of this.buckets) {
      const merged = mergeAll(list);
      if (merged) out.set(mat, merged);
    }
    this.buckets.clear();
    return out;
  }
}

/** Merge a list of geometries, tolerating mixed indexed/non-indexed input. */
export function mergeAll(list) {
  const clean = list.filter(Boolean);
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];
  const nonIndexed = clean.map((g) => (g.getIndex() ? g.toNonIndexed() : g));
  for (const g of nonIndexed) normalizeAttributes(g);
  const merged = mergeGeometries(nonIndexed, false);
  for (let i = 0; i < clean.length; i++) {
    if (nonIndexed[i] !== clean[i]) nonIndexed[i].dispose();
    clean[i].dispose();
  }
  if (!merged) return null;
  const welded = mergeVertices(merged, 1e-6);
  if (welded !== merged) merged.dispose();
  return normalizeAttributes(welded);
}

/** Triangle count of a finished geometry, for the budget log. */
export function triCount(geo) {
  const idx = geo.getIndex();
  return (idx ? idx.count : geo.getAttribute('position').count) / 3;
}

/** Re-exported so dev probes can reach the same THREE instance. */
export { THREE };
