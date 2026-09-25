/**
 * Traffic on the real street graph.
 *
 * Vehicles drive the OSM roads on the left, as in India, choose a way at
 * every junction (favouring straight on), respect one-way streets, follow
 * whoever is ahead in their lane and ease off into junctions. Width decides
 * who fits where: buses keep to the arterials, an Old Delhi gully gets
 * scooters, autos and cycle-rickshaws, never a bus.
 *
 * The population lives around the player, the way an open-world game does
 * it: anything that falls far behind is picked up and dropped back onto a
 * road ahead, out of view, so the streets stay busy at a fixed cost.
 */

import * as THREE from "three";
import type { Landmark } from "../assets";
import { makeAuto, mulberry32 } from "../props";
import { makeCar, TRAFFIC_KINDS, type CarKind, type VehicleMaterials } from "../vehicles";
import { CITY_TRAFFIC, makeBus, makeTwoWheeler } from "../transit";
import { makeCycleRickshaw, makeHandRickshaw, makeAmbassadorTaxi } from "../assets";
import type { MapData, MapRoad } from "./mapData";
import { isDrivable } from "./roads";
import { RoadNet } from "./network";

type Kind = "bike" | "auto" | "car" | "bus" | "rickshaw";

/** Narrowest carriageway each kind will drive. */
const MIN_WIDTH: Record<Kind, number> = { bike: 2.4, rickshaw: 3.5, auto: 4.2, car: 5.8, bus: 9.5 };

export type TrafficVehicle = {
  mesh: THREE.Group;
  kind: Kind;
  road: number;
  /** +1 travels a -> b, -1 travels b -> a. */
  dir: 1 | -1;
  /** Distance travelled along the road in the direction of travel. */
  p: number;
  speed: number;
  cruise: number;
  halfLength: number;
  halfWidth: number;
  /** Offset to the left of the centreline, metres. */
  lane: number;
  yaw: number;
  wheels: THREE.Object3D[];
  wheelRadius: number;
  /** Next road chosen at the junction ahead, and its direction. */
  next: { road: number; dir: 1 | -1 } | null;
};

export type Traffic = {
  group: THREE.Group;
  vehicles: TrafficVehicle[];
  /** Scatter the whole fleet round `focus`, close in included. */
  prime(focus: THREE.Vector3): void;
  update(dt: number, t: number, focus: THREE.Vector3): void;
  /** Does a circle at (x, z) overlap any vehicle? */
  hit(x: number, z: number, r: number): TrafficVehicle | null;
  dispose(): void;
};

export type TrafficOpts = {
  landmark: Landmark;
  autoCanopy: number;
  /** Relative mix from the district theme. */
  autos: number;
  cars: number;
  vehicleMats: VehicleMaterials;
  transitMat: THREE.Material;
  /** Vehicles alive at once, around the player. */
  population?: number;
};

const LIVE_RADIUS = 230;
const SPAWN_MIN = 120;
const SPAWN_MAX = 210;

export function createTraffic(map: MapData, opts: TrafficOpts): Traffic {
  const rand = mulberry32(4401);
  const group = new THREE.Group();
  group.name = "traffic";
  const city = CITY_TRAFFIC[opts.landmark];

  const net = new RoadNet(map, (r) => isDrivable(r));
  const roads = net.roads;
  const drivable = net.included().filter((i) => roads[i].len > 4);
  /* ---------------- fleet ---------------- */

  const population = opts.population ?? 64;
  const mix: [Kind, number][] = [
    ["bike", city.bikes * 1.6],
    ["auto", opts.autos * 1.4],
    ["car", opts.cars * 1.3],
    ["bus", city.buses],
    ["rickshaw", ["delhi", "amritsar", "hyderabad", "kolkata", "bhubaneswar", "ahmedabad"].includes(opts.landmark) ? 4 : 0],
  ];
  const total = mix.reduce((a, [, w]) => a + w, 0);
  const pickKind = (): Kind => {
    let r = rand() * total;
    for (const [k, w] of mix) {
      if ((r -= w) <= 0) return k;
    }
    return "bike";
  };

  const makeMesh = (kind: Kind, seed: number): THREE.Group => {
    switch (kind) {
      case "bike":
        return makeTwoWheeler(opts.transitMat, seed);
      case "auto":
        return makeAuto(opts.autoCanopy);
      case "bus":
        return makeBus(opts.vehicleMats, opts.transitMat, city.bus, seed);
      case "rickshaw":
        return opts.landmark === "kolkata" ? makeHandRickshaw(undefined, seed) : makeCycleRickshaw(undefined, seed);
      case "car": {
        if (opts.landmark === "kolkata" && seed % 3 === 0) return makeAmbassadorTaxi(undefined, seed);
        const k: CarKind = TRAFFIC_KINDS[seed % TRAFFIC_KINDS.length];
        return makeCar(opts.vehicleMats, { kind: k, seed, taxiStyle: city.taxi });
      }
    }
  };

  const vehicles: TrafficVehicle[] = [];
  for (let i = 0; i < population; i++) {
    const kind = pickKind();
    const seed = Math.floor(rand() * 1e6);
    const mesh = makeMesh(kind, seed);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const v: TrafficVehicle = {
      mesh,
      kind,
      road: -1,
      dir: 1,
      p: 0,
      speed: 0,
      cruise:
        kind === "bike" ? 8 + rand() * 3 : kind === "bus" ? 6 + rand() * 1.5 : kind === "rickshaw" ? 2.6 + rand() * 1 : kind === "auto" ? 6.5 + rand() * 2.5 : 8 + rand() * 3,
      halfLength: (mesh.userData.halfLength as number | undefined) ?? size.z / 2,
      halfWidth: Math.max(0.35, size.x / 2),
      lane: 0,
      yaw: 0,
      wheels: (mesh.userData.wheels as THREE.Object3D[] | undefined) ?? [],
      wheelRadius: (mesh.userData.wheelRadius as number | undefined) ?? 0.3,
      next: null,
    };
    vehicles.push(v);
    group.add(mesh);
  }

  /* ---------------- placement ---------------- */

  const fits = (v: TrafficVehicle, ri: number) => roads[ri].r.w >= MIN_WIDTH[v.kind];

  /** Left-of-centre offset for this vehicle on this road. */
  const laneFor = (v: TrafficVehicle, r: MapRoad) => {
    if (r.oneway) return v.kind === "bike" ? r.w / 2 - 1 : (rand() - 0.5) * Math.max(0, r.w / 2 - 1.6);
    if (v.kind === "bike") return Math.max(r.w / 4, r.w / 2 - 1.2);
    return Math.max(0.9, r.w / 4);
  };

  const place = (v: TrafficVehicle, focus: THREE.Vector3 | null, minDist = SPAWN_MIN) => {
    for (let tries = 0; tries < 60; tries++) {
      const ri = drivable[Math.floor(rand() * drivable.length)];
      if (!fits(v, ri)) continue;
      const road = roads[ri];
      const dir: 1 | -1 = road.r.oneway ? 1 : rand() < 0.5 ? 1 : -1;
      const p = rand() * road.len;
      const pt = net.sample(ri, dir === 1 ? p : road.len - p);
      if (focus) {
        const d = Math.hypot(pt.x - focus.x, pt.z - focus.z);
        if (d < minDist || d > SPAWN_MAX) continue;
      }
      v.road = ri;
      v.dir = dir;
      v.p = p;
      v.speed = v.cruise;
      v.lane = laneFor(v, road.r);
      v.next = null;
      pose(v, 0, true);
      return true;
    }
    return false;
  };

  const pose = (v: TrafficVehicle, dt: number, snap = false) => {
    const road = roads[v.road];
    const s = v.dir === 1 ? v.p : road.len - v.p;
    const pt = net.sample(v.road, s);
    const dx = pt.dx * v.dir;
    const dz = pt.dz * v.dir;
    // Left of travel in a +x east, +z south frame.
    const x = pt.x + dz * v.lane;
    const z = pt.z - dx * v.lane;
    const yaw = Math.atan2(dx, dz);
    if (snap) v.yaw = yaw;
    else {
      let d = yaw - v.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.yaw += d * (1 - Math.exp(-dt * 8));
    }
    v.mesh.position.set(x, 0.03, z);
    v.mesh.rotation.y = v.yaw;
  };


  /* ---------------- routing ---------------- */

  const endNode = (v: TrafficVehicle) => (v.dir === 1 ? roads[v.road].r.b : roads[v.road].r.a);

  const chooseNext = (v: TrafficVehicle): TrafficVehicle["next"] => {
    const road = roads[v.road];
    const node = endNode(v);
    const end = net.sample(v.road, v.dir === 1 ? road.len : 0);
    const inDx = end.dx * v.dir;
    const inDz = end.dz * v.dir;
    const options: { road: number; dir: 1 | -1; w: number }[] = [];
    for (const ri of net.at(node)) {
      if (ri === v.road || !fits(v, ri)) continue;
      const r = roads[ri].r;
      const dir: 1 | -1 = r.a === node ? 1 : -1;
      if (r.oneway && dir === -1) continue;
      const start = net.sample(ri, dir === 1 ? 0 : roads[ri].len);
      const align = start.dx * dir * inDx + start.dz * dir * inDz;
      // Straight on is likeliest; sharp turns least; wider roads attract.
      options.push({ road: ri, dir, w: (1.4 + align) * (0.6 + r.w / 12) });
    }
    if (!options.length) {
      // Dead end: turn round if the road allows, otherwise nothing.
      return road.r.oneway ? null : { road: v.road, dir: (-v.dir) as 1 | -1 };
    }
    let pick = rand() * options.reduce((a, o) => a + o.w, 0);
    for (const o of options) if ((pick -= o.w) <= 0) return { road: o.road, dir: o.dir };
    return options[0];
  };

  /* ---------------- step ---------------- */

  const laneKey = (v: TrafficVehicle) => v.road * 2 + (v.dir === 1 ? 0 : 1);
  const byLane = new Map<number, TrafficVehicle[]>();

  return {
    group,
    vehicles,
    prime(focus) {
      for (const v of vehicles) if (!place(v, focus, 10)) place(v, null);
    },
    update(dt, t, focus) {
      byLane.clear();
      for (const v of vehicles) {
        const k = laneKey(v);
        if (!byLane.has(k)) byLane.set(k, []);
        byLane.get(k)!.push(v);
      }
      for (const list of byLane.values()) list.sort((a, b) => a.p - b.p);

      for (const v of vehicles) {
        // Recycle anything the player has left behind.
        const d = Math.hypot(v.mesh.position.x - focus.x, v.mesh.position.z - focus.z);
        if (d > LIVE_RADIUS) {
          place(v, focus);
          continue;
        }

        const road = roads[v.road];
        let target = v.cruise;
        // Narrow streets are slow streets.
        if (road.r.w < 6) target = Math.min(target, 4.5);

        // Leader in the same lane.
        const lane = byLane.get(laneKey(v))!;
        const idx = lane.indexOf(v);
        const lead = lane[idx + 1];
        if (lead) {
          const gap = lead.p - v.p - v.halfLength - lead.halfLength;
          if (gap < 7) target = Math.min(target, lead.speed * Math.max(0, Math.min(1, gap / 7)));
          if (gap < 1) target = 0;
        }

        // Approaching the junction: choose a way, slow down, and wait if the
        // first stretch of it is occupied.
        const toEnd = road.len - v.p;
        if (toEnd < 14) {
          if (!v.next) v.next = chooseNext(v);
          target = Math.min(target, Math.max(2.5, v.cruise * 0.55));
          if (v.next) {
            const k = v.next.road * 2 + (v.next.dir === 1 ? 0 : 1);
            const occupied = (byLane.get(k) ?? []).some((o) => o !== v && o.p < o.halfLength + v.halfLength + 2);
            if (occupied && toEnd < v.halfLength + 1.5) target = 0;
          } else if (toEnd < v.halfLength + 1) {
            place(v, focus);
            continue;
          }
        }

        const rate = target < v.speed ? 5 : 1.8;
        v.speed += (target - v.speed) * (1 - Math.exp(-rate * dt));
        v.p += v.speed * dt;

        if (v.p >= road.len) {
          const over = v.p - road.len;
          if (!v.next) {
            place(v, focus);
            continue;
          }
          v.road = v.next.road;
          v.dir = v.next.dir;
          v.p = over;
          v.lane = laneFor(v, roads[v.road].r);
          v.next = null;
        }

        pose(v, dt);
        const spin = (v.speed * dt) / v.wheelRadius;
        for (const w of v.wheels) w.rotation.x -= spin;
        // Suspension jitter, only while moving.
        v.mesh.position.y = 0.03 + Math.sin(t * 11 + v.road) * 0.015 * Math.min(1, v.speed / v.cruise);
      }
    },
    hit(x, z, r) {
      for (const v of vehicles) {
        const dx = x - v.mesh.position.x;
        const dz = z - v.mesh.position.z;
        if (dx * dx + dz * dz > (v.halfLength + r + 1) ** 2) continue;
        const c = Math.cos(v.yaw);
        const s = Math.sin(v.yaw);
        const u = dx * c - dz * s;
        const w = dx * s + dz * c;
        if (Math.abs(u) < v.halfWidth + r && Math.abs(w) < v.halfLength + r) return v;
      }
      return null;
    },
    dispose() {
      // Meshes and materials are released by the engine's scene walk.
    },
  };
}
