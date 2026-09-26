import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { createCrowd, CITY_DRESS } from "./crowd";
import { CITY_TRAFFIC, makeBus, makeTwoWheeler, createTransitMaterial } from "./transit";
import { createVehicleMaterials, makeCar } from "./vehicles";
import { SEED_TASK_PACKS } from "./tasks";
import { SEED_DISTRICTS } from "./districts";
import type { Landmark } from "./assets";
import type { MapData } from "./world/mapData";
import { CollisionWorld, hits } from "./world/collide";
import { HeightField } from "./world/height";
import { RoadNet } from "./world/network";
import { offsetPolyline, trimPolyline, polylineLength, footpathStrips, isDrivable } from "./world/roads";
import { createTraffic } from "./world/traffic";
import { buildLandmark } from "./world/landmarks";
import { planRoute } from "./world/route";

const LANDMARKS: Landmark[] = [
  "delhi", "chennai", "bengaluru", "kolkata", "hyderabad",
  "kochi", "mumbai", "ahmedabad", "amritsar", "bhubaneswar",
];

const MAPS = join(__dirname, "../../public/maps");
const loadMap = (id: string) => JSON.parse(readFileSync(join(MAPS, `${id}.json`), "utf8")) as MapData;

/** A tiny street grid: a plus-shaped junction with a lane off one arm. */
function tinyMap(): MapData {
  const road = (a: number, b: number, pts: [number, number][], cls: "primary" | "residential" = "primary") => ({
    cls,
    w: cls === "primary" ? 12 : 6,
    foot: cls === "primary" ? 3 : 0,
    oneway: false,
    a,
    b,
    pts,
  });
  return {
    id: "tiny",
    half: 120,
    attribution: "test",
    nodes: [
      { id: 1, x: 0, z: 0 },
      { id: 2, x: 100, z: 0 },
      { id: 3, x: -100, z: 0 },
      { id: 4, x: 0, z: 100 },
      { id: 5, x: 0, z: -100 },
    ],
    roads: [
      road(1, 2, [[0, 0], [100, 0]]),
      road(3, 1, [[-100, 0], [0, 0]]),
      road(1, 4, [[0, 0], [0, 100]]),
      road(5, 1, [[0, -100], [0, 0]], "residential"),
    ],
    plots: [],
    buildings: [],
    landmarks: [],
    areas: [],
    rails: [],
    pois: [],
    errandSpots: {},
    spawn: { x: 10, z: 10, yaw: 0 },
    spots: {
      auto: { x: 20, z: 8, yaw: 0 },
      bus: { x: 40, z: 8, yaw: 0 },
      temple: { x: 8, z: 40, yaw: 0 },
      shop: { x: -30, z: 8, yaw: 0 },
    },
  };
}

/* ---------------- geometry helpers ---------------- */

test("trimPolyline cuts the ends and keeps the middle", () => {
  const line: [number, number][] = [[0, 0], [10, 0], [10, 10]];
  const t = trimPolyline(line, 2, 3)!;
  assert.deepEqual(t[0], [2, 0]);
  assert.deepEqual(t[t.length - 1], [10, 7]);
  assert.ok(Math.abs(polylineLength(t) - 15) < 1e-9);
  assert.equal(trimPolyline(line, 10, 10), null);
});

test("offsetPolyline shifts to the left of travel (+x east, +z south)", () => {
  // Travelling east, left is north (-z).
  const o = offsetPolyline([[0, 0], [10, 0]], 2);
  assert.deepEqual(o, [[0, -2], [10, -2]]);
  // Travelling south (+z), left is east (+x): the side left-hand traffic keeps to.
  const s = offsetPolyline([[0, 0], [0, 10]], 1);
  assert.deepEqual(s, [[1, 0], [1, 10]]);
});

/* ---------------- collision and height ---------------- */

test("rotated boxes collide in their own frame", () => {
  const c = { kind: "box" as const, x: 0, z: 0, hw: 4, hd: 1, rot: Math.PI / 2 };
  // Rotated a quarter turn, the long side runs along z.
  assert.equal(hits(c, 0, 3.5, 0), true);
  assert.equal(hits(c, 3.5, 0, 0), false);
  assert.equal(hits(c, 1.4, 0, 0.5), true);
});

test("polygons with holes block the ring but not the courtyard", () => {
  const w = new CollisionWorld();
  // A ring of buildings round a 10m courtyard, like the Golden Temple complex.
  w.add({
    kind: "poly",
    outer: [[-20, -20], [20, -20], [20, 20], [-20, 20]],
    holes: [[[-10, -10], [10, -10], [10, 10], [-10, 10]]],
  });
  assert.equal(w.blocked(15, 0, 0.3), true);
  assert.equal(w.blocked(0, 0, 0.3), false);
  assert.equal(w.blocked(9.9, 0, 0.3), true, "radius reaches the courtyard wall");
  assert.equal(w.blocked(30, 0, 0.3), false);
});

test("height field: platforms, stairs and footpath bands", () => {
  const h = new HeightField(50);
  h.rect(0, 0, 5, 5, 0, 2);
  assert.ok(Math.abs(h.at(0, 0) - 2) < 1e-6);
  // A flight of steps rising from 0 at +z to 2 at -z.
  h.rect(0, 8, 2, 3, 0, 2, 0);
  assert.ok(h.at(0, 10.9) < 0.3);
  assert.ok(h.at(0, 5.2) > 1.7);
  assert.ok(h.at(0, 8) > 0.8 && h.at(0, 8) < 1.2, "mid-flight is mid-height");
  h.band([[-40, 30], [40, 30]], 0, 3, 0.2);
  assert.ok(Math.abs(h.at(0, 28.5) - 0.2) < 0.05, "left of eastward travel is -z");
  assert.equal(h.at(0, 40), 0);
});

/* ---------------- network, traffic, crowd ---------------- */

test("road network samples by arc length and lists roads at a node", () => {
  const net = new RoadNet(tinyMap(), () => true);
  assert.equal(net.at(1).length, 4);
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  const s = net.sample(0, 25);
  assert.ok(near([s.x, s.z, s.dx, s.dz], [25, 0, 1, 0]));
  const back = net.along(0, -1, 25);
  assert.ok(near([back.x, back.z, back.dx, back.dz], [75, 0, -1, 0]));
});

test("traffic keeps left, stays on its roads and fits the road width", () => {
  const map = tinyMap();
  const traffic = createTraffic(map, {
    landmark: "delhi",
    autoCanopy: 0x2ecc71,
    autos: 3,
    cars: 3,
    vehicleMats: createVehicleMaterials(),
    transitMat: createTransitMaterial(),
    population: 20,
  });
  const focus = new THREE.Vector3(0, 0, 0);
  traffic.prime(focus);
  for (let i = 0; i < 200; i++) traffic.update(0.05, i * 0.05, focus);
  for (const v of traffic.vehicles) {
    const r = map.roads[v.road];
    assert.ok(r.w >= (v.kind === "bus" ? 9.5 : v.kind === "car" ? 5.8 : 2.4), `${v.kind} on a ${r.w}m road`);
    // Keep-left: on the east-west road, eastbound (+x) traffic sits north (-z).
    if (v.road === 0 && v.dir === 1 && v.p > 5 && v.p < 95) assert.ok(v.mesh.position.z < 0, "eastbound keeps left");
    assert.ok(Number.isFinite(v.mesh.position.x) && Number.isFinite(v.mesh.position.z));
  }
  // Nothing drives the residential arm if it does not fit it.
  const onLane = traffic.vehicles.filter((v) => v.road === 3);
  assert.ok(onLane.every((v) => v.kind !== "bus"));
});

test("crowd walks the network, one mesh per body part", () => {
  const map = tinyMap();
  const crowd = createCrowd({
    landmark: "amritsar",
    map,
    groundAt: () => 0.2,
    blocked: () => false,
    gatherings: [{ x: 20, z: 8, size: 3 }],
    walkers: 30,
  });
  assert.ok(crowd.count > 30);
  assert.equal(crowd.group.children.length, 8);
  const focus = new THREE.Vector3(0, 0, 0);
  crowd.prime(focus);
  const legs = crowd.group.children[0] as THREE.InstancedMesh;
  const before = Array.from(legs.instanceMatrix.array);
  crowd.update(0.5, focus);
  assert.notDeepEqual(Array.from(legs.instanceMatrix.array), before);
  crowd.dispose();
});

/* ---------------- vehicles ---------------- */

test("buses and two-wheelers follow the traffic contract", () => {
  const mats = createVehicleMaterials();
  const mat = createTransitMaterial();
  const bus = makeBus(mats, mat, CITY_TRAFFIC.mumbai.bus, 1);
  assert.ok(bus.userData.halfLength > 4);
  assert.equal(bus.userData.wheels.length, 4);
  const bike = makeTwoWheeler(mat, 2);
  assert.equal(bike.children.length, 1, "one draw call for bike and riders");
  const parked = makeTwoWheeler(mat, 2, { parked: true });
  const ridden = (bike.children[0] as THREE.Mesh).geometry.attributes.position.count;
  const empty = (parked.children[0] as THREE.Mesh).geometry.attributes.position.count;
  assert.ok(empty < ridden, "parked bike has no rider");
});

test("taxi liveries follow the city", () => {
  const mats = createVehicleMaterials();
  const paintOf = (g: THREE.Group) =>
    g.children
      .filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
      .map((m) => (m.material as THREE.MeshStandardMaterial).color?.getHex());
  const kaali = paintOf(makeCar(mats, { kind: "taxi", taxiStyle: "kaaliPeeli" }));
  assert.ok(kaali.includes(0x141414) && kaali.includes(0xf2c21b), "black body, yellow roof");
});

test("every city has dress and traffic", () => {
  for (const l of LANDMARKS) {
    const mix = CITY_DRESS[l].mix;
    assert.ok(Math.abs(mix.reduce((a, b) => a + b, 0) - 1) < 1e-9, `${l} costume mix sums to 1`);
    assert.ok(CITY_TRAFFIC[l].bikes > 0 && CITY_TRAFFIC[l].buses > 0, `traffic ${l}`);
  }
});

/* ---------------- compiled maps ---------------- */

test("every shipped district has a compiled map", () => {
  const files = readdirSync(MAPS).filter((f) => f.endsWith(".json"));
  for (const d of SEED_DISTRICTS) assert.ok(files.includes(`${d.id}.json`), `map for ${d.id}`);
});

test("compiled maps: roads reference nodes, everything sits inside the square", () => {
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const ids = new Set(map.nodes.map((n) => n.id));
    const inside = (x: number, z: number) => Math.abs(x) <= map.half + 1e-6 && Math.abs(z) <= map.half + 1e-6;
    for (const r of map.roads) {
      assert.ok(ids.has(r.a) && ids.has(r.b), `${d.id}: road with unknown node`);
      assert.ok(r.pts.every(([x, z]) => inside(x, z)), `${d.id}: road outside the map`);
    }
    for (const p of map.plots) assert.ok(inside(p.x, p.z), `${d.id}: plot outside the map`);
    assert.ok(map.plots.length > 500, `${d.id}: only ${map.plots.length} plots`);
    assert.ok(map.attribution.includes("OpenStreetMap"));
  }
});

test("spawn and task spots are clear of buildings and within reach of each other", () => {
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const world = new CollisionWorld();
    for (const p of map.plots) world.box(p.x, p.z, p.w / 2, p.d / 2, p.rot);
    for (const b of map.buildings) world.add({ kind: "poly", outer: b.pts, holes: b.holes ?? [] });
    for (const [name, s] of [["spawn", map.spawn], ...Object.entries(map.spots)] as const) {
      assert.equal(world.blocked(s.x, s.z, 0.5), false, `${d.id}: ${name} is inside a building`);
      const dist = Math.hypot(s.x - map.spawn.x, s.z - map.spawn.z);
      assert.ok(dist < 260, `${d.id}: ${name} is ${Math.round(dist)}m from spawn`);
    }
    for (const [a, sa] of Object.entries(map.spots)) {
      for (const [b, sb] of Object.entries(map.spots)) {
        if (a < b) assert.ok(Math.hypot(sa.x - sb.x, sa.z - sb.z) > 5, `${d.id}: ${a} and ${b} overlap`);
      }
    }
  }
});

test("seeded task positions are their map spots (see migration 012)", () => {
  for (const pack of SEED_TASK_PACKS) {
    const map = loadMap(pack.districtId);
    for (const t of pack.tasks) {
      const s = map.errandSpots[t.id] ?? map.spots[t.kind as keyof MapData["spots"]];
      assert.ok(Math.abs(t.pos[0] - s.x) < 0.11 && Math.abs(t.pos[1] - s.z) < 0.11, `${t.id} is not on its ${t.kind} spot`);
    }
  }
});

test("every district has one city errand, on dry open ground an auto can reach", () => {
  for (const pack of SEED_TASK_PACKS) {
    const map = loadMap(pack.districtId);
    const errands = pack.tasks.filter((t) => map.errandSpots[t.id]);
    assert.equal(errands.length, 1, `${pack.districtId}: ${errands.length} city errands`);
    assert.equal(pack.tasks.length, 5, `${pack.districtId}: ${pack.tasks.length} tasks`);
    // The city errand comes last, after auto, shop, temple and bus.
    assert.equal(pack.tasks[4].id, errands[0].id);
    const e = map.errandSpots[errands[0].id];

    const solid = new CollisionWorld();
    for (const p of map.plots) solid.box(p.x, p.z, p.w / 2, p.d / 2, p.rot);
    for (const b of map.buildings) solid.add({ kind: "poly", outer: b.pts, holes: b.holes ?? [] });
    assert.equal(solid.blocked(e.x, e.z, 0.5), false, `${pack.districtId}: errand inside a building`);
    const wet = new CollisionWorld();
    for (const a of map.areas) if (a.kind === "water" || a.kind === "sea") wet.add({ kind: "poly", outer: a.pts, holes: a.holes ?? [] });
    assert.equal(wet.blocked(e.x, e.z, 0.1), false, `${pack.districtId}: errand in the water`);

    assert.ok(Math.abs(e.x) < map.half - 20 && Math.abs(e.z) < map.half - 20, `${pack.districtId}: errand at the map edge`);
    for (const [kind, s] of Object.entries(map.spots)) {
      assert.ok(Math.hypot(e.x - s.x, e.z - s.z) > 5, `${pack.districtId}: errand on the ${kind} spot`);
    }
    const path = planRoute(map, map.spots.auto.x, map.spots.auto.z, e.x, e.z, 4.2, 1.6);
    assert.ok(path && path.length >= 2, `${pack.districtId}: no auto route to the errand`);
  }
});

test("city errands use the kinds the game knows", () => {
  const counters = SEED_TASK_PACKS.flatMap((p) => p.tasks).filter((t) => t.kind === "counter").map((t) => t.id).sort();
  assert.deepEqual(counters, ["dadar-chowk-local", "fort-kochi-ferry", "majestic-cross-metro"]);
});

test("footpaths stop short of junctions", () => {
  const map = loadMap("park-gully");
  const strips = footpathStrips(map);
  assert.ok(strips.length > 0);
  const junctions = map.nodes.filter((n) => map.roads.filter((r) => isDrivable(r) && (r.a === n.id || r.b === n.id)).length >= 3);
  // No footpath strip endpoint sits in the middle of a junction.
  for (const s of strips) {
    for (const end of [s.pts[0], s.pts[s.pts.length - 1]]) {
      for (const j of junctions) assert.ok(Math.hypot(end[0] - j.x, end[1] - j.z) > 2, "footpath runs into a junction");
    }
  }
});

test("every landmark on every map has a builder with colliders", () => {
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    for (const l of map.landmarks) {
      const warn = console.warn;
      let warned = "";
      console.warn = (m: string) => (warned = m);
      const m = buildLandmark(l, d.theme.landmark);
      console.warn = warn;
      assert.equal(warned, "", `${d.id}: ${l.model} (${l.name}) fell back: ${warned}`);
      assert.ok(m.group.children.length > 0, `${d.id}: ${l.model} built nothing`);
      assert.ok(m.colliders.length > 0, `${d.id}: ${l.model} has no colliders`);
    }
  }
});

test("walkable monuments: a mosque's stair climbs onto its plinth", () => {
  const m = buildLandmark({ model: "jama_masjid", name: "Jama Masjid", x: 0, z: 0, rot: 0, w: 90, d: 90 }, "delhi");
  const h = new HeightField(100);
  for (const r of m.heights) h.rect(r.x, r.z, r.hw, r.hd, 0, r.y0, r.y1);
  // Foot of the stair at the front edge, top on the plinth.
  assert.ok(h.at(0, 44.8) < 0.5, "stair starts near the ground");
  assert.ok(h.at(0, 0) > 3, "courtyard is up on the plinth");
  // The gate gap in the cloister is open.
  const w = new CollisionWorld();
  for (const c of m.colliders) w.box(c.x, c.z, c.hw, c.hd, c.rot ?? 0);
  assert.equal(w.blocked(0, 30, 0.4), false, "the way in through the gate is clear");
  assert.equal(w.blocked(-44, 0, 0.4), true, "the side cloister blocks");
});
