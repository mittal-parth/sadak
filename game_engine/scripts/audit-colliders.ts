/**
 * Finds invisible walls: places the player is stopped with nothing in view.
 * Builds each district's world headlessly, walks the edge of every blocked
 * area on a 1m grid, and from the open ground beside it looks in at chest
 * height; if nothing drawn (front faces only, as the camera sees them)
 * stands between, the player bumps into thin air there.
 *
 *   npx tsx scripts/audit-colliders.ts [district-id]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { SEED_DISTRICTS } from "../lib/game/districts";
import { buildWorld } from "../lib/game/world";
import type { MapData } from "../lib/game/world/mapData";
import { createVehicleMaterials } from "../lib/game/vehicles";
import { createTransitMaterial } from "../lib/game/transit";
import { hits } from "../lib/game/world/collide";

const only = process.argv[2];
const R = 0.35;
const ray = new THREE.Raycaster();

for (const d of SEED_DISTRICTS) {
  if (only && d.id !== only) continue;
  const map = JSON.parse(readFileSync(join(__dirname, "../public/maps", `${d.id}.json`), "utf8")) as MapData;
  const world = buildWorld(map, d, { vehicleMats: createVehicleMaterials(), transitMat: createTransitMaterial(), toon: (m) => m });
  world.prime(new THREE.Vector3(map.spawn.x, 0, map.spawn.z));
  const solids: THREE.Object3D[] = [];
  world.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) solids.push(o);
  });
  world.group.updateMatrixWorld(true);
  const water = map.areas.filter((a) => a.kind === "water" || a.kind === "sea");
  const inWater = (x: number, z: number) =>
    water.some((a) => {
      let inside = false;
      for (let i = 0, j = a.pts.length - 1; i < a.pts.length; j = i++) {
        const [xi, zi] = a.pts[i];
        const [xj, zj] = a.pts[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    });
  const blocked = (x: number, z: number) => world.collide.blocked(x, z, R);
  const ghosts: [number, number][] = [];
  const blame = new Map<string, number>();
  // What put a collider there, as far as the map can tell.
  const sourceOf = (c: (typeof world.collide.all)[number]): string => {
    if (c.kind === "poly") return map.buildings.some((b) => b.pts === c.outer) ? "osm building" : "water/area";
    if (map.plots.some((p) => Math.abs(p.x - c.x) < 0.01 && Math.abs(p.z - c.z) < 0.01)) return "plot";
    const l = map.landmarks.find((l) => {
      const cs = Math.cos(l.rot);
      const sn = Math.sin(l.rot);
      const u = (c.x - l.x) * cs - (c.z - l.z) * sn;
      const v = (c.x - l.x) * sn + (c.z - l.z) * cs;
      return Math.abs(u) < l.w / 2 + 3 && Math.abs(v) < l.d / 2 + 3;
    });
    if (l) return `landmark ${l.model}`;
    return `other ${(c.hw * 2).toFixed(1)}x${(c.hd * 2).toFixed(1)}`;
  };
  const H = map.half - 2;
  for (let z = -H; z <= H; z += 1) {
    for (let x = -H; x <= H; x += 1) {
      // Inside a collider proper, not just within a body's width of one
      // (a ray along a wall would graze past that margin).
      if (!world.collide.blocked(x, z, -0.4) || inWater(x, z)) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // Open ground a step away: the player could be standing there.
        const ox = x + dx * 1.2;
        const oz = z + dz * 1.2;
        if (blocked(ox, oz)) continue;
        // Look from there toward the blocked spot, at chest height, and from
        // the ground at shin height (low things: plinths, planters).
        const seen = [1.3, 0.35].some((y) => {
          const from = new THREE.Vector3(ox + dx * 1.5, world.height.at(ox, oz) + y, oz + dz * 1.5);
          ray.set(from, new THREE.Vector3(-dx, 0, -dz));
          ray.far = 4.2;
          return ray.intersectObjects(solids, false).length > 0;
        });
        if (!seen) {
          ghosts.push([x, z]);
          if (process.env.WHERE) {
            const l = map.landmarks.find((l) => Math.hypot(l.x - x, l.z - z) < Math.max(l.w, l.d));
            if (l) {
              const cs = Math.cos(l.rot), sn = Math.sin(l.rot);
              console.log(`    ${l.name}: local u=${((x - l.x) * cs - (z - l.z) * sn).toFixed(1)} v=${((x - l.x) * sn + (z - l.z) * cs).toFixed(1)} of ${l.w}x${l.d}, looking ${-dx},${-dz}`);
            }
          }
          for (const c of world.collide.all) if (hits(c, x, z, -0.4)) blame.set(sourceOf(c), (blame.get(sourceOf(c)) ?? 0) + 1);
        }
        break;
      }
    }
  }
  // Cluster neighbouring ghost cells into places.
  const places: { x: number; z: number; n: number }[] = [];
  for (const [x, z] of ghosts) {
    const p = places.find((q) => Math.hypot(q.x / q.n - x, q.z / q.n - z) < 6);
    if (p) {
      p.x += x;
      p.z += z;
      p.n++;
    } else places.push({ x, z, n: 1 });
  }
  // Posts, trunks and bollards are thinner than the grid can see into: aim
  // straight at each one's centre instead.
  let poles = 0;
  for (const c of world.collide.all) {
    if (c.kind !== "box" || Math.max(c.hw, c.hd) > 0.6) continue;
    const seen = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) =>
      [1.3, 0.35].some((y) => {
        ray.set(new THREE.Vector3(c.x + dx * 2.5, world.height.at(c.x, c.z) + y, c.z + dz * 2.5), new THREE.Vector3(-dx, 0, -dz));
        ray.far = 2.5 + Math.max(c.hw, c.hd) + 0.05;
        return ray.intersectObjects(solids, false).length > 0;
      })
    );
    if (!seen) {
      poles++;
      const k = sourceOf(c);
      blame.set(`${k} (thin)`, (blame.get(`${k} (thin)`) ?? 0) + 1);
    }
  }
  console.log(`${d.id}: ${ghosts.length} unseen blocked edge cells in ${places.length} places, ${poles} unseen posts`);
  for (const [k, n] of [...blame].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k}: ${n}`);
}
