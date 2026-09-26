/**
 * Builds a district from its compiled OpenStreetMap map: ground and water,
 * the street surfaces, every building (streamed detail near the player), the
 * named landmarks, street furniture, traffic and the crowd. Replaces the old
 * procedural grid city.
 */

import * as THREE from "three";
import type { District } from "../districts";
import type { MaterialLibrary } from "../materials";
import type { VehicleMaterials } from "../vehicles";
import { createSignAtlas } from "../signage";
import { createCrowd, type Crowd } from "../crowd";
import { buildAreas } from "./areas";
import { buildRoads, footpathStrips, isDrivable, offsetPolyline } from "./roads";
import { createClutter, type ClutterSites } from "../clutter";
import { GROUND_H, FLOOR_H } from "../buildings";
import { buildBuildings } from "./buildings";
import { placeLandmarks, type InnerSpot } from "./landmarks";
import { buildStreet } from "./street";
import { createTraffic, type Traffic } from "./traffic";
import { buildRails } from "./rails";
import { createFlocks, flockSites } from "./birds";
import { buildMarkets, marketStalls } from "./market";
import { CollisionWorld } from "./collide";
import { HeightField } from "./height";
import { KERB_H, type MapData } from "./mapData";

export type World = {
  map: MapData;
  group: THREE.Group;
  collide: CollisionWorld;
  height: HeightField;
  traffic: Traffic;
  crowd: Crowd;
  /** Map edges the sea runs past; the skyline leaves these open. */
  seaEdges: string[];
  /** The monument interior nearest (x, z) within `max` metres, if any. */
  innerNear(x: number, z: number, max: number): InnerSpot | null;
  /** Populate traffic, crowd and nearby detail round `focus`. */
  prime(focus: THREE.Vector3): void;
  update(dt: number, t: number, focus: THREE.Vector3): void;
  dispose(): void;
};

export type WorldDeps = {
  mats?: MaterialLibrary;
  vehicleMats: VehicleMaterials;
  transitMat: THREE.Material;
  /** Cel conversion for materials used by meshes created after the scene
   *  is converted (streamed building detail). */
  toon: (m: THREE.Material) => THREE.Material;
};

export function buildWorld(map: MapData, district: District, deps: WorldDeps): World {
  const theme = district.theme;
  const group = new THREE.Group();
  group.name = "world";
  const collide = new CollisionWorld();
  const height = new HeightField(map.half);

  // Ground, water, parks. Water is not walkable.
  const areas = buildAreas(map, theme);
  group.add(areas.group);
  for (const a of map.areas) {
    if (a.kind === "water" || a.kind === "sea") collide.add({ kind: "poly", outer: a.pts, holes: a.holes ?? [] });
  }

  // Streets, and the kerbs you step up onto.
  const roads = buildRoads(map, theme, deps.mats);
  group.add(roads.group);
  for (const f of footpathStrips(map)) height.band(f.pts, f.o0, f.o1, KERB_H);

  // Buildings.
  const atlas = typeof document !== "undefined" ? createSignAtlas(district.language) : null;
  const glass = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.sky[1]).lerp(new THREE.Color(0x1b2331), 0.62),
    emissive: new THREE.Color(theme.sky[2]),
    emissiveIntensity: 0.1,
  });
  const signs = atlas ? new THREE.MeshLambertMaterial({ map: atlas.texture }) : null;
  const buildings = buildBuildings(
    map,
    theme,
    { glass: deps.toon(glass), signs: signs && deps.toon(signs), atlas, toon: deps.toon },
    collide
  );
  group.add(buildings.group);

  const landmarks = placeLandmarks(map.landmarks, theme.landmark, collide, height);
  group.add(landmarks.group);

  const rails = buildRails(map, theme.landmark, collide);
  group.add(rails.group);

  const groundAt = (x: number, z: number) => height.at(x, z);
  const street = buildStreet(map, theme.landmark, collide, groundAt);
  group.add(street.group);

  // Street clutter: poles and wires on the kerbs, junk at corners, posters
  // and bicycles on the shop fronts, never in the carriageway.
  const strips = footpathStrips(map);
  const carriage = carriagewayMask(map);
  const plazas = map.roads.filter((r) => r.cls === "pedestrian");
  const sites: ClutterSites = {
    kerbs: strips.map((f) => offsetPolyline(f.pts, f.o0 + Math.sign(f.o1 - f.o0) * 0.35)),
    ground(rand) {
      if (rand() < 0.8 && strips.length) {
        const f = strips[Math.floor(rand() * strips.length)];
        const pts = f.pts;
        const k = Math.floor(rand() * (pts.length - 1));
        const t = rand();
        const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t;
        const z = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t;
        const L = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) || 1;
        const nx = (pts[k + 1][1] - pts[k][1]) / L;
        const nz = -(pts[k + 1][0] - pts[k][0]) / L;
        // Kerb edge or shop edge of the footpath, clear of the walking line.
        const f01 = rand() < 0.5 ? 0.1 + rand() * 0.15 : 0.85 + rand() * 0.1;
        const o = f.o0 + (f.o1 - f.o0) * f01;
        return { x: x + nx * o, z: z + nz * o };
      }
      if (!plazas.length) return null;
      const r = plazas[Math.floor(rand() * plazas.length)];
      const k = Math.floor(rand() * (r.pts.length - 1));
      const t = rand();
      const side = rand() < 0.5 ? 1 : -1;
      const [ax, az] = r.pts[k];
      const [bx, bz] = r.pts[k + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const o = side * r.w * 0.42;
      return { x: ax + (bx - ax) * t + ((bz - az) / L) * o, z: az + (bz - az) * t - ((bx - ax) / L) * o };
    },
    junctions: junctionsOf(map),
    fronts: map.plots
      .filter((p) => p.front)
      .map((p) => ({
        x: p.x + Math.sin(p.rot) * (p.d / 2),
        z: p.z + Math.cos(p.rot) * (p.d / 2),
        rot: p.rot,
        w: p.w,
        top: GROUND_H + p.floors * FLOOR_H + 1,
      })),
    squares: [
      ...Object.values(map.spots),
      ...map.pois.filter((p) => p.kind === "market" || p.kind === "worship").map((p) => ({ x: p.x, z: p.z })),
    ],
    free: (x, z, m) =>
      Math.abs(x) < map.half - 2 && Math.abs(z) < map.half - 2 && !carriage(x, z) && !collide.blocked(x, z, m),
    groundAt: (x, z) => height.at(x, z),
    density: 0.6,
  };
  const clutter = createClutter(group, theme, deps.mats, sites);

  const traffic = createTraffic(map, {
    landmark: theme.landmark,
    autoCanopy: theme.autoCanopy,
    autos: theme.autos,
    cars: theme.cars,
    vehicleMats: deps.vehicleMats,
    transitMat: deps.transitMat,
  });
  group.add(traffic.group);

  // Market grounds: stall rows down walkable aisles. Laid out before the
  // stalls' own colliders go in, so the shoppers below use the same rows.
  const stallRows = marketStalls(map, (x, z, r) => collide.blocked(x, z, r));
  const markets = buildMarkets(map, theme.canopies, collide, groundAt);
  if (markets.stalls !== stallRows.reduce((n, r) => n + r.stalls.length, 0)) {
    throw new Error("market stalls and their shoppers were laid out differently");
  }
  group.add(markets.group);

  // People gather at the task spots, the bus stops and the shops nearby,
  // and in front of every third market stall.
  const gatherings = [
    ...stallRows.flatMap(({ stalls }) =>
      stalls
        .filter((_, i) => i % 3 === 0)
        .map((s) => ({ x: s.x + Math.sin(s.rot) * 1.9, z: s.z + Math.cos(s.rot) * 1.9, size: 2 }))
    ),
    ...Object.values(map.spots).map((s) => ({ x: s.x + Math.sin(s.yaw) * -2.5, z: s.z + Math.cos(s.yaw) * -2.5, size: 3 })),
    ...map.pois
      .filter((p) => p.kind === "bus_stop" || p.kind === "food" || p.kind === "market")
      .map((p) => ({ x: p.x, z: p.z, size: p.kind === "bus_stop" ? 4 : 2 })),
  ];
  const crowd = createCrowd({
    landmark: theme.landmark,
    map,
    groundAt,
    blocked: (x, z, r) => collide.blocked(x, z, r),
    gatherings,
  });
  group.add(crowd.group);

  // Pigeons where the city feeds them.
  const flocks = createFlocks(flockSites(map, landmarks.inners, groundAt));
  group.add(flocks.group);

  return {
    map,
    group,
    collide,
    height,
    traffic,
    crowd,
    seaEdges: areas.seaEdges,
    innerNear(x, z, max) {
      let best: InnerSpot | null = null;
      let bd = max;
      for (const s of landmarks.inners) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    },
    prime(focus) {
      buildings.prime(focus);
      traffic.prime(focus);
      crowd.prime(focus);
    },
    update(dt, t, focus) {
      buildings.update(focus);
      traffic.update(dt, t, focus);
      crowd.update(dt, focus);
      rails.update(dt);
      areas.update(t);
      flocks.update(dt, t, focus);
    },
    dispose() {
      buildings.dispose();
      crowd.dispose();
      street.dispose();
      rails.dispose();
      flocks.dispose();
      markets.dispose();
      clutter.dispose();
      areas.dispose();
      roads.textures.forEach((t) => t.dispose());
      atlas?.dispose();
    },
  };
}

/** Fetch a compiled district map. Throws on failure: there is no world
 *  without one. */
export async function loadMap(districtId: string): Promise<MapData> {
  const res = await fetch(`/maps/${encodeURIComponent(districtId)}.json`);
  if (!res.ok) throw new Error(`[world] map for ${districtId} failed to load: HTTP ${res.status}`);
  return (await res.json()) as MapData;
}

/** Road junctions (three or more drivable roads) and how wide they are. */
function junctionsOf(map: MapData): { x: number; z: number; r: number }[] {
  const byNode = new Map<number, number[]>();
  for (const r of map.roads) {
    if (!isDrivable(r)) continue;
    for (const n of [r.a, r.b]) {
      if (!byNode.has(n)) byNode.set(n, []);
      byNode.get(n)!.push(r.w / 2 + r.foot);
    }
  }
  const out: { x: number; z: number; r: number }[] = [];
  for (const n of map.nodes) {
    const list = byNode.get(n.id);
    if (list && list.length >= 3) out.push({ x: n.x, z: n.z, r: Math.max(...list) });
  }
  return out;
}

/** 1m raster of where the traffic drives, so props stay out of it. */
function carriagewayMask(map: MapData): (x: number, z: number) => boolean {
  const n = map.half * 2;
  const cells = new Uint8Array(n * n);
  for (const r of map.roads) {
    if (!isDrivable(r)) continue;
    const rad = r.w / 2 + 0.2;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [ax, az] = r.pts[k];
      const [bx, bz] = r.pts[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 0.7) {
        const cx = ax + ((bx - ax) * t) / (L || 1);
        const cz = az + ((bz - az) * t) / (L || 1);
        for (let dz = -rad; dz <= rad; dz += 0.7) {
          for (let dx = -rad; dx <= rad; dx += 0.7) {
            if (dx * dx + dz * dz > rad * rad) continue;
            const i = Math.floor(cx + dx + map.half);
            const j = Math.floor(cz + dz + map.half);
            if (i >= 0 && j >= 0 && i < n && j < n) cells[j * n + i] = 1;
          }
        }
      }
    }
  }
  return (x, z) => {
    const i = Math.floor(x + map.half);
    const j = Math.floor(z + map.half);
    return i < 0 || j < 0 || i >= n || j >= n ? true : cells[j * n + i] === 1;
  };
}
