/**
 * Street furniture along the real streets: trees (each city's own mix),
 * lamp posts, bus shelters at the mapped bus stops, and festival bunting
 * strung across the bazaar street. Everything is instanced or merged.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Landmark } from "../assets";
import { mulberry32 } from "../props";
import { CITY_TRAFFIC } from "../transit";
import type { MapData, Pt } from "./mapData";
import type { CollisionWorld } from "./collide";
import { isDrivable } from "./roads";
import { RoadNet } from "./network";
import { Parts, paint } from "./vc";

type TreeMix = {
  /** Canopy colours for the ordinary shade trees (neem, peepal, rain tree). */
  shade: number[];
  /** Flowering trees and their share: gulmohar, amaltas, jacaranda. */
  flower: number[];
  flowerShare: number;
  /** Share of coconut palms. */
  palm: number;
};

const NEEM = [0x3f7f3a, 0x4f8f3f, 0x356f35, 0x5a9a45];
const TREES: Record<Landmark, TreeMix> = {
  delhi: { shade: NEEM, flower: [0xf2c230], flowerShare: 0.15, palm: 0 },
  mumbai: { shade: NEEM, flower: [0xe8452c, 0xf05a28], flowerShare: 0.3, palm: 0.15 },
  chennai: { shade: NEEM, flower: [0xe8452c], flowerShare: 0.1, palm: 0.45 },
  bengaluru: { shade: [0x3f7f3a, 0x4a8a3c, 0x2f6a33], flower: [0x8e6fd1, 0xe8452c], flowerShare: 0.3, palm: 0.05 },
  kolkata: { shade: [0x2f6a33, 0x3f7f3a], flower: [0xe8452c], flowerShare: 0.12, palm: 0.05 },
  hyderabad: { shade: NEEM, flower: [0xf2c230], flowerShare: 0.08, palm: 0.05 },
  kochi: { shade: [0x2f7a3a, 0x3f8f3a], flower: [0xe8452c], flowerShare: 0.1, palm: 0.6 },
  ahmedabad: { shade: NEEM, flower: [0xf2c230], flowerShare: 0.1, palm: 0.02 },
  amritsar: { shade: NEEM, flower: [0xf2c230], flowerShare: 0.1, palm: 0 },
  bhubaneswar: { shade: NEEM, flower: [0xe8452c], flowerShare: 0.1, palm: 0.35 },
};

function broadleafGeometry(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = BufferGeometryUtils.mergeGeometries([
    paint(new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6).translate(0, 1.6, 0), 0x6b5238),
    paint(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5).rotateZ(0.6).translate(0.5, 3.2, 0), 0x6b5238),
    paint(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5).rotateZ(-0.7).translate(-0.5, 3.1, 0.2), 0x6b5238),
  ])!;
  // Canopy clumps: white here, the instance colour tints them; underside
  // clumps darker so the crown reads as self-shadowed.
  const canopy = BufferGeometryUtils.mergeGeometries([
    paint(new THREE.IcosahedronGeometry(1.7, 0).translate(0, 4.4, 0), 0xffffff),
    paint(new THREE.IcosahedronGeometry(1.3, 0).translate(1.1, 3.9, 0.4), 0xd8d8d8),
    paint(new THREE.IcosahedronGeometry(1.2, 0).translate(-1.0, 3.8, -0.3), 0xd0d0d0),
    paint(new THREE.IcosahedronGeometry(1.1, 0).translate(0.2, 5.3, -0.5), 0xffffff),
  ])!;
  return { trunk, canopy };
}

function palmGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // A gently leaning, ringed trunk.
  for (let i = 0; i < 6; i++) {
    parts.push(paint(new THREE.CylinderGeometry(0.15, 0.17, 1.3, 6).translate(i * 0.08, 0.65 + i * 1.25, 0), i % 2 ? 0x8a7152 : 0x7c6548));
  }
  const top = 7.6;
  for (let k = 0; k < 8; k++) {
    const frond = new THREE.ConeGeometry(0.35, 3.2, 4);
    frond.scale(1, 1, 0.25);
    frond.translate(0, 1.6, 0);
    frond.rotateZ(1.1 + (k % 2) * 0.25);
    frond.rotateY((k / 8) * Math.PI * 2);
    frond.translate(0.48, top, 0);
    parts.push(paint(frond, k % 2 ? 0x4f8f3f : 0x3f7f3a));
  }
  parts.push(paint(new THREE.IcosahedronGeometry(0.35, 0).translate(0.5, top - 0.2, 0), 0x6b5a2a));
  return BufferGeometryUtils.mergeGeometries(parts)!;
}

function lampGeometry(): THREE.BufferGeometry {
  return BufferGeometryUtils.mergeGeometries([
    paint(new THREE.CylinderGeometry(0.07, 0.1, 7, 6).translate(0, 3.5, 0), 0x5d6168),
    paint(new THREE.BoxGeometry(0.08, 0.08, 1.8).translate(0, 7, 0.85), 0x5d6168),
    paint(new THREE.BoxGeometry(0.34, 0.14, 0.6).translate(0, 6.92, 1.75), 0x3a3d42),
    paint(new THREE.BoxGeometry(0.26, 0.04, 0.5).translate(0, 6.84, 1.75), 0xfff3c8),
  ])!;
}

export type StreetFurniture = { group: THREE.Group; dispose(): void };

export function buildStreet(
  map: MapData,
  landmark: Landmark,
  collide: CollisionWorld,
  groundAt: (x: number, z: number) => number
): StreetFurniture {
  const group = new THREE.Group();
  group.name = "street";
  const rand = mulberry32(8123);
  const mix = TREES[landmark];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const owned: THREE.BufferGeometry[] = [];

  /* ---- positions ---- */

  type Spot = { x: number; z: number; yaw: number };
  const trees: Spot[] = [];
  const lamps: Spot[] = [];
  const free = (x: number, z: number, r: number) => !collide.blocked(x, z, r) && Math.abs(x) < map.half - 2 && Math.abs(z) < map.half - 2;

  const net = new RoadNet(map, isDrivable);
  for (const ri of net.included()) {
    const road = net.roads[ri];
    const r = road.r;
    if (r.foot <= 0 && r.w < 6) continue;
    // Lamps every 30m, alternating sides; trees in runs on the footpath.
    let k = 0;
    for (let s = 8; s < road.len - 8; s += 30) {
      const pt = net.sample(ri, s);
      const side = k++ % 2 ? 1 : -1;
      const off = side * (r.w / 2 + 0.45);
      const x = pt.x + pt.dz * off;
      const z = pt.z - pt.dx * off;
      if (!free(x, z, 0.3)) continue;
      // Arm reaches back over the carriageway.
      lamps.push({ x, z, yaw: Math.atan2(-pt.dz * side, pt.dx * side) });
      collide.box(x, z, 0.15, 0.15);
    }
    if (r.foot <= 0) continue;
    for (let s = 12; s < road.len - 10; s += 13) {
      if (rand() < 0.45) continue;
      const pt = net.sample(ri, s);
      const side = rand() < 0.5 ? 1 : -1;
      const off = side * (r.w / 2 + Math.min(0.95, r.foot * 0.35));
      const x = pt.x + pt.dz * off;
      const z = pt.z - pt.dx * off;
      if (!free(x, z, 0.8)) continue;
      trees.push({ x, z, yaw: rand() * Math.PI * 2 });
      collide.box(x, z, 0.3, 0.3);
    }
  }
  // Parks: a loose grove.
  for (const a of map.areas) {
    if (a.kind !== "park") continue;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x, z] of a.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    for (let z = minZ + 4; z < maxZ - 4; z += 9) {
      for (let x = minX + 4; x < maxX - 4; x += 9) {
        const px = x + (rand() - 0.5) * 5;
        const pz = z + (rand() - 0.5) * 5;
        if (!inRing(px, pz, a.pts) || !free(px, pz, 1.5)) continue;
        trees.push({ x: px, z: pz, yaw: rand() * Math.PI * 2 });
        collide.box(px, pz, 0.3, 0.3);
      }
    }
  }

  /* ---- instancing ---- */

  const dummy = new THREE.Object3D();
  const instance = (geo: THREE.BufferGeometry, spots: Spot[], colour?: (i: number) => number, scale?: (i: number) => number) => {
    if (!spots.length) return;
    owned.push(geo);
    const m = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, i) => {
      dummy.position.set(s.x, groundAt(s.x, s.z), s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.setScalar(scale ? scale(i) : 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colour) m.setColorAt(i, new THREE.Color(colour(i)));
    });
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };

  const palms = trees.filter(() => rand() < mix.palm);
  const broad = trees.filter((t) => !palms.includes(t));
  const scales = broad.map(() => 0.85 + rand() * 0.5);
  const canopy = broad.map(() =>
    rand() < mix.flowerShare
      ? mix.flower[Math.floor(rand() * mix.flower.length)]
      : mix.shade[Math.floor(rand() * mix.shade.length)]
  );
  const { trunk, canopy: canopyGeo } = broadleafGeometry();
  instance(trunk, broad, undefined, (i) => scales[i]);
  instance(canopyGeo, broad, (i) => canopy[i], (i) => scales[i]);
  instance(palmGeometry(), palms, undefined, () => 0.9 + rand() * 0.35);
  instance(lampGeometry(), lamps);

  /* ---- bus shelters ---- */

  const livery = CITY_TRAFFIC[landmark].bus;
  const stops = map.pois.filter((p) => p.kind === "bus_stop");
  const shelterAt = (x: number, z: number) => {
    // Face the nearest drivable road.
    let best: { d: number; yaw: number } | null = null;
    for (const ri of net.included()) {
      const road = net.roads[ri];
      for (let s = 0; s <= road.len; s += 4) {
        const pt = net.sample(ri, s);
        const d = Math.hypot(pt.x - x, pt.z - z);
        if (!best || d < best.d) best = { d, yaw: Math.atan2(pt.x - x, pt.z - z) };
      }
    }
    const yaw = best?.yaw ?? 0;
    const y = groundAt(x, z);
    const g = new THREE.Group();
    const S = new Parts();
    for (const px of [-1.6, 1.6]) S.box(0.1, 2.5, 0.1, px, 1.25, -0.5, 0x5d6168);
    S.box(3.8, 0.12, 1.8, 0, 2.55, 0, livery.body);
    S.box(3.6, 1.8, 0.05, 0, 1.4, -0.75, 0xcfe0ea);
    S.box(3.2, 0.1, 0.45, 0, 0.5, -0.4, 0x8a8f96);
    S.box(1.1, 0.35, 0.05, 1.3, 2.9, 0.1, livery.stripe);
    const m = S.mesh(mat);
    if (m) g.add(m);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    group.add(g);
    collide.box(x - Math.sin(yaw) * 0.6, z - Math.cos(yaw) * 0.6, 1.9, 0.4, yaw);
  };
  for (const s of stops) if (free(s.x, s.z, 1)) shelterAt(s.x, s.z);
  if (!stops.some((s) => Math.hypot(s.x - map.spots.bus.x, s.z - map.spots.bus.z) < 12)) {
    // The bus task always has a proper stop.
    const b = map.spots.bus;
    shelterAt(b.x - Math.sin(b.yaw) * 2.5, b.z - Math.cos(b.yaw) * 2.5);
  }

  /* ---- bunting across the bazaar street ---- */

  const shop = map.spots.shop;
  let bazaar = -1;
  let bd = Infinity;
  for (const ri of net.included()) {
    const road = net.roads[ri];
    for (let s = 0; s <= road.len; s += 3) {
      const pt = net.sample(ri, s);
      const d = Math.hypot(pt.x - shop.x, pt.z - shop.z);
      if (d < bd) {
        bd = d;
        bazaar = ri;
      }
    }
  }
  if (bazaar >= 0) {
    const road = net.roads[bazaar];
    const flags: THREE.BufferGeometry[] = [];
    const cols = [0xe63946, 0xf4a261, 0xffd166, 0x2a9d8f, 0x3a86ff, 0xff70a6, 0xffffff, 0x8338ec];
    const reach = road.r.w / 2 + road.r.foot + 0.6;
    for (let s = 3; s < Math.min(road.len, 160); s += 6) {
      const pt = net.sample(bazaar, s);
      const a: Pt = [pt.x + pt.dz * reach, pt.z - pt.dx * reach];
      const b: Pt = [pt.x - pt.dz * reach, pt.z + pt.dx * reach];
      const h = 6.2 + rand() * 0.6;
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.floor(span / 0.5);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const y = h - 0.9 * 4 * t * (1 - t);
        const tri = new THREE.BufferGeometry();
        const ux = ((b[0] - a[0]) / span) * 0.17;
        const uz = ((b[1] - a[1]) / span) * 0.17;
        tri.setAttribute("position", new THREE.Float32BufferAttribute([x - ux, y, z - uz, x, y - 0.42, z, x + ux, y, z + uz], 3));
        tri.computeVertexNormals();
        flags.push(paint(tri, cols[(i + s) % cols.length]));
      }
    }
    if (flags.length) {
      const g = BufferGeometryUtils.mergeGeometries(flags)!;
      flags.forEach((f) => f.dispose());
      owned.push(g);
      const flagMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      flagMat.userData.celRamp = "soft";
      const m = new THREE.Mesh(g, flagMat);
      m.castShadow = true;
      group.add(m);
    }
  }

  return {
    group,
    dispose() {
      owned.forEach((g) => g.dispose());
    },
  };
}

function inRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
