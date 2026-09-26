/**
 * Life on a city beach (OSM natural=beach next to the sea): fishing boats
 * pulled up near the waterline with their bows to the sea, and toward the
 * road a line of umbrellas and snack carts (sundal, roasted corn, bajji)
 * where people gather. The Marina; Fort Kochi's shore.
 */

import * as THREE from "three";
import { mulberry32 } from "../props";
import type { CollisionWorld } from "./collide";
import type { MapArea, MapData, Pt } from "./mapData";
import { Parts } from "./vc";

function inRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Nearest point on the sea's edge to (x, z), and how far it is. */
function nearestSea(sea: MapArea[], x: number, z: number): { d: number; p: Pt } | null {
  let best: { d: number; p: Pt } | null = null;
  for (const a of sea) {
    const ring = a.pts;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i];
      const [bx, bz] = ring[(i + 1) % ring.length];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
      const p: Pt = [ax + (bx - ax) * t, az + (bz - az) * t];
      const d = inRing(x, z, ring) ? 0 : Math.hypot(x - p[0], z - p[1]);
      if (!best || d < best.d) best = { d, p };
    }
  }
  return best;
}

export type BeachSpot = { x: number; z: number; rot: number; kind: "boat" | "umbrella" | "cart" };

/** Where the boats and the stalls go on every beach that meets the sea. */
export function beachSpots(map: MapData, blocked: (x: number, z: number, r: number) => boolean): BeachSpot[] {
  const sea = map.areas.filter((a) => a.kind === "sea" || a.kind === "water");
  const rand = mulberry32(3313);
  const out: BeachSpot[] = [];
  for (const a of map.areas) {
    if (a.kind !== "beach") continue;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x, z] of a.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    for (let z = minZ + 3; z < maxZ - 3; z += 7) {
      for (let x = minX + 3; x < maxX - 3; x += 7) {
        const px = x + (rand() - 0.5) * 4;
        const pz = z + (rand() - 0.5) * 4;
        const roll = rand();
        if (!inRing(px, pz, a.pts) || (a.holes ?? []).some((h) => inRing(px, pz, h))) continue;
        if (Math.abs(px) > map.half - 3 || Math.abs(pz) > map.half - 3 || blocked(px, pz, 2)) continue;
        const s = nearestSea(sea, px, pz);
        if (!s || s.d === 0) continue;
        const toSea = Math.atan2(s.p[0] - px, s.p[1] - pz);
        if (s.d < 22) {
          // Boats in loose clusters near the water, bows to the sea.
          if (roll < 0.28) out.push({ x: px, z: pz, rot: toSea + (rand() - 0.5) * 0.5, kind: "boat" });
        } else if (s.d > 40) {
          // Toward the road, umbrellas with a cart beside every other one.
          if (roll < 0.22) out.push({ x: px, z: pz, rot: toSea, kind: roll < 0.1 ? "cart" : "umbrella" });
        }
      }
    }
  }
  return out;
}

const HULLS = [0x2a6fb0, 0xc0392b, 0xe6b422, 0x2e8b57, 0x1f3a5f];
const UMBRELLAS = [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xe67e22, 0x9b59b6];

/** A beached fishing boat, bow toward local +z. */
function boatGeometry(hull: number): THREE.BufferGeometry {
  const P = new Parts();
  P.box(1.5, 0.7, 6, 0, 0.45, 0, hull);
  P.add(new THREE.ConeGeometry(0.75, 1.6, 4).rotateY(Math.PI / 4).scale(1, 1, 0.45).rotateX(Math.PI / 2).translate(0, 0.45, 3.8), hull);
  P.box(1.55, 0.12, 6.05, 0, 0.82, 0, 0xf4efe4);
  P.box(1.3, 0.06, 5.6, 0, 0.72, 0, 0x8a6a4a);
  for (const z of [-1.5, 0.3, 1.8]) P.box(1.3, 0.08, 0.3, 0, 0.78, z, 0x6f5238);
  // Nets heaped amidships, an outboard at the stern.
  P.add(new THREE.IcosahedronGeometry(0.45, 0).scale(1.2, 0.5, 1.4).translate(0, 0.9, -0.5), 0x2f6f6f);
  P.box(0.3, 0.6, 0.3, 0, 0.9, -3.1, 0x2b2d31);
  return P.geometry()!;
}

function umbrellaGeometry(): THREE.BufferGeometry {
  const P = new Parts();
  P.cyl(0.04, 0.04, 2.4, 0, 1.2, 0, 0xdddddd, 6);
  P.box(0.9, 0.05, 0.6, 0.9, 0.02, 0.4, 0xd35400);
  return P.geometry()!;
}

/** The canopy alone, white, tinted per umbrella. */
function canopyGeometry(): THREE.BufferGeometry {
  return new Parts().add(new THREE.ConeGeometry(1.4, 0.55, 8).translate(0, 2.55, 0), 0xffffff).geometry()!;
}

/** A snack cart with a glass box and a stove, facing local +z. */
function cartGeometry(): THREE.BufferGeometry {
  const P = new Parts();
  P.box(1.6, 0.7, 0.9, 0, 0.8, 0, 0xc0392b);
  P.box(1.6, 0.5, 0.9, 0, 1.4, 0, 0xcfe0ea);
  P.box(1.7, 0.06, 1.0, 0, 1.68, 0, 0xf1c40f);
  for (const x of [-0.6, 0.6]) P.add(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10).rotateZ(Math.PI / 2).translate(x, 0.3, 0.5), 0x2b2d31);
  P.box(0.4, 0.2, 0.4, 0.5, 1.8, 0.1, 0x3a3d42);
  P.add(new THREE.IcosahedronGeometry(0.2, 0).scale(1.4, 0.6, 1).translate(-0.3, 1.25, 0.1), 0xe6b422);
  return P.geometry()!;
}

export type Beach = { group: THREE.Group; spots: BeachSpot[]; dispose(): void };

export function buildBeach(map: MapData, collide: CollisionWorld, groundAt: (x: number, z: number) => number): Beach {
  const group = new THREE.Group();
  group.name = "beach";
  const spots = beachSpots(map, (x, z, r) => collide.blocked(x, z, r));
  const rand = mulberry32(8817);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const owned: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  const instance = (geo: THREE.BufferGeometry, list: BeachSpot[], tint?: () => number) => {
    if (!list.length) return;
    owned.push(geo);
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      dummy.position.set(s.x, groundAt(s.x, s.z), s.z);
      dummy.rotation.set(0, s.rot, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (tint) m.setColorAt(i, colour.setHex(tint()));
    });
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  const boats = spots.filter((s) => s.kind === "boat");
  // One mesh per hull colour: the white trim stays white.
  HULLS.forEach((hull, k) => instance(boatGeometry(hull), boats.filter((_, i) => i % HULLS.length === k)));
  const umbrellas = spots.filter((s) => s.kind === "umbrella");
  instance(umbrellaGeometry(), umbrellas);
  instance(canopyGeometry(), umbrellas, () => UMBRELLAS[Math.floor(rand() * UMBRELLAS.length)]);
  instance(cartGeometry(), spots.filter((s) => s.kind === "cart"));
  for (const s of spots) {
    if (s.kind === "boat") collide.box(s.x, s.z, 0.8, 3.4, s.rot);
    else if (s.kind === "cart") collide.box(s.x, s.z, 0.85, 0.5, s.rot);
    else collide.box(s.x, s.z, 0.1, 0.1);
  }
  return {
    group,
    spots,
    dispose() {
      owned.forEach((g) => g.dispose());
      mat.dispose();
    },
  };
}
