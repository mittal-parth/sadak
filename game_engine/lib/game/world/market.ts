/**
 * Market grounds (OSM amenity=marketplace): rows of stalls under tarps down
 * aisles you can walk, heaped with whatever the market sells. Dadar's mandai,
 * Meena Bazaar under the Jama Masjid, Ahmedabad's fruit market. One merged
 * mesh per district; each stall's table is a collider, so the aisles are
 * the way through.
 */

import * as THREE from "three";
import { mulberry32 } from "../props";
import type { CollisionWorld } from "./collide";
import type { MapArea, MapData, Pt } from "./mapData";
import { Parts } from "./vc";

type Produce = "flowers" | "fruit" | "mixed";

const PRODUCE: Record<Produce, number[]> = {
  // Marigold, yellow marigold, rose, tuberose, orange marigold.
  flowers: [0xf5a623, 0xffd23f, 0xd7263d, 0xf4f1de, 0xe8702a],
  // Mango, orange, lime, pomegranate, banana.
  fruit: [0xffbe0b, 0xfb8500, 0x8ac926, 0xc1121f, 0xf4d35e],
  // Greens, tomato, brinjal, carrot, onion, marigold.
  mixed: [0x4f9d2d, 0xd62828, 0x6a4c93, 0xf4a259, 0xb5838d, 0xf5a623],
};

function produceFor(a: MapArea): Produce {
  const n = a.name ?? "";
  if (/flower|phool/i.test(n)) return "flowers";
  if (/fruit/i.test(n)) return "fruit";
  return "mixed";
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

const inArea = (x: number, z: number, a: MapArea) => inRing(x, z, a.pts) && !(a.holes ?? []).some((h) => inRing(x, z, h));

/** Direction of the polygon's longest edge: the stall rows run along it. */
function mainAxis(ring: Pt[]): number {
  let best = 0;
  let rot = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L > best) {
      best = L;
      rot = Math.atan2(bx - ax, bz - az);
    }
  }
  return rot;
}

export type StallSpot = { x: number; z: number; rot: number };

/** Stalls per market ground at most. */
export const MAX_STALLS = 700;

/**
 * Stall positions for every market on the map: rows along the market's long
 * side, a 2.6m aisle between each pair of back-to-back rows, clear of
 * buildings, carriageways and the task spots.
 */
export function marketStalls(
  map: MapData,
  blocked: (x: number, z: number, r: number) => boolean
): { area: MapArea; stalls: StallSpot[] }[] {
  const keepClear = [map.spawn, ...Object.values(map.spots), ...Object.values(map.errandSpots)];
  const roads = map.roads.filter((r) => r.cls !== "footway" && r.cls !== "steps" && r.cls !== "pedestrian");
  const onRoad = (x: number, z: number) =>
    roads.some((r) =>
      r.pts.some((p, i) => {
        if (i === r.pts.length - 1) return false;
        const [ax, az] = p;
        const [bx, bz] = r.pts[i + 1];
        const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
        return Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)) < r.w / 2 + r.foot + 1.2;
      })
    );

  const out: { area: MapArea; stalls: StallSpot[] }[] = [];
  for (const a of map.areas) {
    if (a.kind !== "market") continue;
    const rot = mainAxis(a.pts);
    // Along the rows (u) and across them (v).
    const ux = Math.sin(rot);
    const uz = Math.cos(rot);
    const vx = Math.cos(rot);
    const vz = -Math.sin(rot);
    let cx = 0;
    let cz = 0;
    for (const [x, z] of a.pts) {
      cx += x / a.pts.length;
      cz += z / a.pts.length;
    }
    let extent = 0;
    for (const [x, z] of a.pts) extent = Math.max(extent, Math.hypot(x - cx, z - cz));

    const rows: StallSpot[][] = [];
    // Back-to-back pairs of rows 2 x 1.8m deep, then a 2.6m aisle.
    for (let v = -extent; v <= extent; v += 6.2) {
      const stalls: StallSpot[] = [];
      rows.push(stalls);
      for (const [dv, face] of [[0.9, 1], [-0.9, -1]] as const) {
        for (let u = -extent; u <= extent; u += 2.7) {
          const x = cx + ux * u + vx * (v + dv);
          const z = cz + uz * u + vz * (v + dv);
          // The whole stall inside the market, on open ground.
          const corners: Pt[] = [
            [x + ux * 1.3 + vx * 0.9, z + uz * 1.3 + vz * 0.9],
            [x - ux * 1.3 + vx * 0.9, z - uz * 1.3 + vz * 0.9],
            [x + ux * 1.3 - vx * 0.9, z + uz * 1.3 - vz * 0.9],
            [x - ux * 1.3 - vx * 0.9, z - uz * 1.3 - vz * 0.9],
          ];
          if (!inArea(x, z, a) || !corners.every(([px, pz]) => inArea(px, pz, a))) continue;
          if (blocked(x, z, 1.4) || onRoad(x, z)) continue;
          if (keepClear.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
          // Facing the aisle: local +z toward it.
          stalls.push({ x, z, rot: Math.atan2(vx * face, vz * face) });
        }
      }
    }
    // A big market ground (Meena Bazaar runs 250m) keeps every n-th pair of
    // rows, so the open lanes between them read as cross streets.
    const total = rows.reduce((n, r) => n + r.length, 0);
    const every = Math.ceil(total / MAX_STALLS);
    out.push({ area: a, stalls: rows.filter((_, i) => i % every === 0).flat() });
  }
  return out;
}

/** One stall at the origin facing local +z: table, heaped produce in
 *  baskets, sacks behind, bamboo poles. The tarp is its own mesh. */
function stallGeometry(produce: number[], rand: () => number): THREE.BufferGeometry {
  const P = new Parts();
  // Table on trestles, boarded in all round (the stall blocks its whole
  // footprint, so it has to look solid from every side).
  P.box(2.3, 0.08, 1.4, 0, 0.78, 0, 0x8a6a4a);
  P.box(2.3, 0.7, 0.05, 0, 0.4, 0.68, 0x6f5238);
  P.box(2.3, 0.7, 0.05, 0, 0.4, -0.68, 0x6f5238);
  for (const u of [-1.13, 1.13]) P.box(0.05, 0.7, 1.4, u, 0.4, 0, 0x6f5238);
  // Produce: a row of heaps in baskets.
  for (let k = 0; k < 4; k++) {
    const u = -0.85 + k * 0.57;
    P.box(0.5, 0.12, 0.55, u, 0.88, 0.2, 0xb08a58);
    P.add(new THREE.IcosahedronGeometry(0.24, 0).scale(1, 0.6, 1).translate(u, 0.98, 0.2), produce[Math.floor(rand() * produce.length)]);
  }
  // Sacks and crates behind the seller.
  P.box(0.5, 0.45, 0.4, -0.6, 0.23, -0.5, 0xd8c8a0);
  P.box(0.45, 0.35, 0.45, 0.55, 0.18, -0.5, 0x9c7a50);
  // Poles, taller at the back so the tarp sheds rain to the front.
  for (const [u, v, h] of [[-1.15, 0.65, 2.1], [1.15, 0.65, 2.1], [-1.15, -0.65, 2.5], [1.15, -0.65, 2.5]] as const) {
    P.box(0.06, h, 0.06, u, h / 2, v, 0x9b7b4f);
  }
  return P.geometry()!;
}

function tarpGeometry(): THREE.BufferGeometry {
  return new Parts().add(new THREE.BoxGeometry(2.6, 0.04, 1.9).rotateX(-0.2).translate(0, 2.32, 0), 0xffffff).geometry()!;
}

export type Markets = { group: THREE.Group; stalls: number; dispose(): void };

const VARIANTS = 4;

export function buildMarkets(
  map: MapData,
  canopies: number[],
  collide: CollisionWorld,
  groundAt: (x: number, z: number) => number
): Markets {
  const group = new THREE.Group();
  group.name = "markets";
  const rand = mulberry32(7717);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const owned: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const colour = new THREE.Color();
  let count = 0;

  // Placed first, then registered as colliders, so no stall rules out the
  // next one.
  const rows = marketStalls(map, (x, z, r) => collide.blocked(x, z, r));
  const all = rows.flatMap(({ area, stalls }) => stalls.map((s) => ({ s, produce: produceFor(area) })));
  const put = (m: THREE.InstancedMesh, i: number, s: StallSpot) => {
    dummy.position.set(s.x, groundAt(s.x, s.z), s.z);
    dummy.rotation.set(0, s.rot, 0);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  };

  // Stall bodies: a few variants of each kind of produce.
  for (const kind of Object.keys(PRODUCE) as Produce[]) {
    const mine = all.filter((x) => x.produce === kind);
    for (let v = 0; v < VARIANTS; v++) {
      const these = mine.filter((_, i) => i % VARIANTS === v);
      if (!these.length) continue;
      const geo = stallGeometry(PRODUCE[kind], rand);
      owned.push(geo);
      const m = new THREE.InstancedMesh(geo, mat, these.length);
      these.forEach(({ s }, i) => put(m, i, s));
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  // Tarps in the city's canopy colours, a blue plastic sheet here and there.
  if (all.length) {
    const geo = tarpGeometry();
    owned.push(geo);
    const tarps = new THREE.InstancedMesh(geo, mat, all.length);
    all.forEach(({ s }, i) => {
      put(tarps, i, s);
      tarps.setColorAt(i, colour.setHex(rand() < 0.3 ? 0x2e6db4 : canopies[Math.floor(rand() * canopies.length)]));
    });
    tarps.castShadow = true;
    group.add(tarps);
  }
  for (const { s } of all) {
    collide.box(s.x, s.z, 1.17, 0.72, s.rot);
    count++;
  }
  return {
    group,
    stalls: count,
    dispose() {
      owned.forEach((g) => g.dispose());
      mat.dispose();
    },
  };
}
