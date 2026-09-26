/**
 * Buses nosed in along the platforms of a bus stand whose platform roofs OSM
 * maps (building=roof inside the station: Kempegowda's curved platforms).
 * One merged mesh; each bus is a collider.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../props";
import type { Landmark } from "../assets";
import type { CollisionWorld } from "./collide";
import type { MapData, MapLandmark, Pt } from "./mapData";
import { parkedBus } from "./monuments";
import { Parts } from "./vc";

type Livery = { body: number; stripe: number; upper: number };

/** State-transport buses at the long-distance stands, beside the city's
 *  own: KSRTC's red-and-cream ordinary, silver Rajahamsa, white Airavat. */
export const STAND_LIVERIES: Partial<Record<Landmark, Livery[]>> = {
  bengaluru: [
    { body: 0xc0392b, stripe: 0xf1e3c2, upper: 0xc0392b },
    { body: 0xb9bcc2, stripe: 0xc0392b, upper: 0xb9bcc2 },
    { body: 0xf2f2f2, stripe: 0x2a5caa, upper: 0xf2f2f2 },
  ],
};

const inBox = (l: MapLandmark, x: number, z: number, margin = 0) => {
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  const dx = x - l.x;
  const dz = z - l.z;
  // World -> local: u along local +x (cos, -sin), v along local +z (sin, cos).
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  return Math.abs(u) <= l.w / 2 - margin && Math.abs(v) <= l.d / 2 - margin;
};

export type BusBay = { x: number; z: number; yaw: number };

/** Where buses stand: nose to a platform edge, every 3.6m, most bays taken. */
export function busBays(map: MapData, blocked: (x: number, z: number, r: number) => boolean): BusBay[] {
  const rand = mulberry32(2207);
  const out: BusBay[] = [];
  for (const l of map.landmarks) {
    if (l.model !== "bus_station") continue;
    for (const b of map.buildings) {
      if (!b.canopy) continue;
      let cx = 0;
      let cz = 0;
      for (const [x, z] of b.pts) {
        cx += x / b.pts.length;
        cz += z / b.pts.length;
      }
      if (!inBox(l, cx, cz)) continue;
      const ring: Pt[] = b.pts;
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 4) continue;
        const ux = (bx - ax) / L;
        const uz = (bz - az) / L;
        for (let t = 2; t < L - 2; t += 3.6) {
          const px = ax + ux * t;
          const pz = az + uz * t;
          // Out from the platform on whichever side is open yard.
          for (const side of [1, -1]) {
            const nx = uz * side;
            const nz = -ux * side;
            const x = px + nx * 6.6;
            const z = pz + nz * 6.6;
            if (!inBox(l, x, z, 2) || blocked(x, z, 1.4)) continue;
            if (blocked(px + nx * 1.5, pz + nz * 1.5, 0.3)) continue;
            if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 3.2)) continue;
            if (rand() < 0.75) out.push({ x, z, yaw: Math.atan2(-nx, -nz) });
            break;
          }
        }
      }
    }
  }
  return out;
}

export function buildBusYards(map: MapData, liveries: Livery[], collide: CollisionWorld): { group: THREE.Group; buses: number; dispose(): void } {
  const group = new THREE.Group();
  group.name = "bus-yards";
  const bays = busBays(map, (x, z, r) => collide.blocked(x, z, r));
  const pieces: THREE.BufferGeometry[] = [];
  const models = liveries.map((lv) => {
    const P = new Parts();
    parkedBus(P, 0, 0, 11, lv);
    return P.geometry()!;
  });
  const m4 = new THREE.Matrix4();
  bays.forEach((b, i) => {
    pieces.push(models[i % models.length].clone().applyMatrix4(m4.makeRotationY(b.yaw).setPosition(b.x, 0, b.z)));
    collide.box(b.x, b.z, 1.3, 5.5, b.yaw);
  });
  models.forEach((g) => g.dispose());
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  let geo: THREE.BufferGeometry | null = null;
  if (pieces.length) {
    geo = BufferGeometryUtils.mergeGeometries(pieces, false);
    pieces.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo!, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return {
    group,
    buses: bays.length,
    dispose() {
      geo?.dispose();
      mat.dispose();
    },
  };
}
