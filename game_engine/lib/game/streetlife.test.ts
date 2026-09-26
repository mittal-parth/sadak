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
import { taskSpot, type MapData } from "./world/mapData";
import { CollisionWorld, hits } from "./world/collide";
import { HeightField } from "./world/height";
import { RoadNet } from "./world/network";
import { offsetPolyline, trimPolyline, polylineLength, footpathStrips, isDrivable } from "./world/roads";
import { createTraffic } from "./world/traffic";
import { buildLandmark, placeLandmarks } from "./world/landmarks";
import { planRoute } from "./world/route";
import { reachesInside, reachableFrom } from "./world/reach";
import { buildPrecinct } from "./world/precinct";
import { medians } from "./world/roads";
import { marketStalls, MAX_STALLS } from "./world/market";
import { createFlocks, flockCounts, flockSites } from "./world/birds";
import { beachSpots } from "./world/beach";
import { buildAreas } from "./world/areas";
import { busBays } from "./world/busyard";
import { OSM_CITIES } from "../../scripts/osm/cities";

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
    boards: [],
    barber: { x: 0, z: 0, yaw: 0 },
    flag: { x: 0, z: 0, yaw: 0 },
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

test("every district's traffic finds a street for every vehicle it fields", () => {
  const vehicleMats = createVehicleMaterials();
  const transitMat = createTransitMaterial();
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const traffic = createTraffic(map, {
      landmark: d.theme.landmark,
      autoCanopy: d.theme.autoCanopy,
      autos: d.theme.autos,
      cars: d.theme.cars,
      vehicleMats,
      transitMat,
    });
    const focus = new THREE.Vector3(map.spawn.x, 0, map.spawn.z);
    traffic.prime(focus);
    for (let i = 0; i < 20; i++) traffic.update(0.05, i * 0.05, focus);
    for (const v of traffic.vehicles) assert.ok(map.roads[v.road], `${d.id}: a ${v.kind} with no street`);
  }
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
      // Spread over the district, but not out at its edge.
      assert.ok(Math.abs(s.x) < map.half - 40 && Math.abs(s.z) < map.half - 40, `${d.id}: ${name} is at the map's edge`);
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

test("every district has its city errands, on dry open ground an auto can reach", () => {
  for (const pack of SEED_TASK_PACKS) {
    const map = loadMap(pack.districtId);
    const errands = pack.tasks.filter((t) => map.errandSpots[t.id]);
    assert.ok(errands.length >= 1, `${pack.districtId}: no city errand`);
    assert.equal(pack.tasks.length, 4 + errands.length, `${pack.districtId}: ${pack.tasks.length} tasks`);
    // The city errands come last, after auto, shop, temple and bus.
    assert.deepEqual(pack.tasks.slice(4).map((t) => t.id), errands.map((t) => t.id));
    for (const errand of errands) {
      const e = map.errandSpots[errand.id];

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
  }
});

test("city errands use the kinds the game knows", () => {
  const counters = SEED_TASK_PACKS.flatMap((p) => p.tasks).filter((t) => t.kind === "counter").map((t) => t.id).sort();
  assert.deepEqual(counters, ["dadar-chowk-local", "fort-kochi-ferry", "majestic-cross-metro"]);
});

test("districts carry the real place names, and migration 013 matches the seeds", () => {
  const sql = readFileSync(join(__dirname, "../../supabase/migrations/013_real_district_names.sql"), "utf8");
  const live = new Map([...sql.matchAll(/'"([^"]+)"'::jsonb\), updated_at = now\(\)\nwhere id = '([a-z-]+)'/g)].map((m) => [m[2], m[1]]));
  assert.equal(live.size, SEED_DISTRICTS.length);
  for (const d of SEED_DISTRICTS) assert.equal(live.get(d.id), d.name, `${d.id} name in migration 013`);
  const invented = ["Purani Sadak", "Marina Nagar", "Majestic Cross", "Park Gully", "Charminar Lane", "Dadar Chowk", "Hall Bazaar", "Lingaraj Lane"];
  for (const d of SEED_DISTRICTS) assert.ok(!invented.includes(d.name), `${d.id} still has an invented name`);
});

test("the player starts with the district's landmark in view", () => {
  for (const city of OSM_CITIES) {
    const map = loadMap(city.id);
    const mark = map.landmarks.find((l) => city.spawnNear.test(l.name))!;
    const world = new CollisionWorld();
    for (const p of map.plots) world.box(p.x, p.z, p.w / 2, p.d / 2, p.rot);
    for (const b of map.buildings) world.add({ kind: "poly", outer: b.pts, holes: b.holes ?? [] });
    const { x, z, yaw } = map.spawn;
    const L = Math.hypot(mark.x - x, mark.z - z);
    const reach = Math.hypot(mark.w, mark.d) / 2 + 1.5;
    for (let t = 1; t < L - reach; t += 0.5) {
      const px = x + ((mark.x - x) * t) / L;
      const pz = z + ((mark.z - z) * t) / L;
      assert.equal(world.blocked(px, pz, 0.1), false, `${city.id}: a building hides ${mark.name} from the spawn`);
    }
    // Facing it.
    const toward = Math.atan2(mark.x - x, mark.z - z);
    assert.ok(Math.abs(Math.atan2(Math.sin(toward - yaw), Math.cos(toward - yaw))) < 0.05, `${city.id}: spawn faces away`);
  }
});

test("Chandni Chowk is a red sandstone pedestrian street with a planted median", () => {
  const map = loadMap("purani-sadak");
  const cc = map.roads.filter((r) => r.name === "Chandni Chowk");
  assert.ok(cc.length > 10);
  for (const r of cc) {
    assert.equal(r.cls, "pedestrian");
    assert.equal(r.surface, "sandstone");
    assert.equal(isDrivable(r), false, "no cars on Chandni Chowk");
  }
  const strips = medians(map);
  assert.ok(strips.length >= 5, `${strips.length} median runs`);
  for (const m of strips) assert.ok(m.w > 1.5 && m.w < 6, `median ${m.w.toFixed(1)}m wide`);
  // Found once per pair of halves, never twice over the same ground.
  for (let i = 0; i < strips.length; i++) {
    for (let j = i + 1; j < strips.length; j++) {
      const a = strips[i].pts[Math.floor(strips[i].pts.length / 2)];
      const near = strips[j].pts.some((p) => Math.hypot(p[0] - a[0], p[1] - a[1]) < 1);
      assert.equal(near, false, "median laid twice");
    }
  }
  // Other cities keep their streets as OSM has them.
  for (const id of ["dadar-chowk", "park-gully"]) assert.equal(loadMap(id).roads.some((r) => r.surface), false);
});

test("a temple mapped as a point stands on its street, not mid-block", () => {
  const map = loadMap("purani-sadak");
  const t = map.landmarks.find((l) => /Gauri Shankar/.test(l.name))!;
  // Its front (local +z, half its depth out) meets Chandni Chowk's edge.
  const fx = t.x + Math.sin(t.rot) * (t.d / 2);
  const fz = t.z + Math.cos(t.rot) * (t.d / 2);
  let edge = Infinity;
  for (const r of map.roads.filter((r) => r.name === "Chandni Chowk")) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const u = Math.max(0, Math.min(1, ((fx - ax) * (bx - ax) + (fz - az) * (bz - az)) / L2));
      edge = Math.min(edge, Math.hypot(fx - ax - u * (bx - ax), fz - az - u * (bz - az)) - r.w / 2 - r.foot);
    }
  }
  assert.ok(edge > 0 && edge < 1.5, `front is ${edge.toFixed(1)}m from the street`);
  // One Central Baptist Church, not a second one for its school.
  assert.equal(map.landmarks.filter((l) => /Central Baptist/.test(l.name)).length, 1);
});

test("market grounds fill with stalls, inside the market and off the road", () => {
  const counts: Record<string, number> = {};
  for (const id of ["purani-sadak", "dadar-chowk", "hall-bazaar"]) {
    const map = loadMap(id);
    const keep = [map.spawn, ...Object.values(map.spots), ...Object.values(map.errandSpots)];
    for (const { area, stalls } of marketStalls(map, () => false)) {
      assert.ok(stalls.length <= MAX_STALLS);
      counts[`${id}:${area.name ?? "-"}`] = stalls.length;
      for (const st of stalls) {
        for (const k of keep) assert.ok(Math.hypot(k.x - st.x, k.z - st.z) >= 5, `${id}: a stall on a task spot`);
        for (const r of map.roads) {
          if (r.cls === "footway" || r.cls === "steps" || r.cls === "pedestrian") continue;
          for (let i = 0; i < r.pts.length - 1; i++) {
            const [ax, az] = r.pts[i];
            const [bx, bz] = r.pts[i + 1];
            const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
            const t = Math.max(0, Math.min(1, ((st.x - ax) * (bx - ax) + (st.z - az) * (bz - az)) / L2));
            const d = Math.hypot(st.x - ax - t * (bx - ax), st.z - az - t * (bz - az));
            assert.ok(d >= r.w / 2 + r.foot + 1.2, `${id}: a stall on the carriageway`);
          }
        }
      }
      // Neighbours stand apart: aisles and stall widths, never overlapping.
      for (let i = 0; i < stalls.length; i++) {
        for (let j = i + 1; j < stalls.length; j++) {
          assert.ok(Math.hypot(stalls[i].x - stalls[j].x, stalls[i].z - stalls[j].z) > 1.7, `${id}: stalls overlap`);
        }
      }
    }
  }
  assert.ok(counts["purani-sadak:Meena Bazaar"] > 100, "Meena Bazaar under the Jama Masjid is a market");
  assert.ok(counts["dadar-chowk:MUNCIPAL MARKED"] > 100, "Dadar's mandai is a market");
  // Everywhere else the plaza stays a plaza.
  assert.deepEqual(marketStalls(loadMap("park-gully"), () => false), []);
});

test("pigeons peck at the Kabutar Khana, scatter when walked into, and settle again", () => {
  const map = loadMap("dadar-chowk");
  const sites = flockSites(map, [], () => 0);
  const kk = map.landmarks.find((l) => l.model === "kabutar_khana")!;
  const site = sites.find((s) => Math.hypot(s.x - kk.x, s.z - kk.z) < 0.1)!;
  assert.ok(site, "no flock at the Kabutar Khana");
  assert.equal(site.y, 0.5, "birds stand on the platform, not under it");
  const flocks = createFlocks(sites);
  const far = new THREE.Vector3(kk.x + 60, 0, kk.z);
  flocks.update(0.05, 0, far);
  const settled = flockCounts(flocks);
  assert.equal(settled.ground + settled.air, site.count);
  assert.ok(settled.ground > site.count * 0.7, "most of the flock on the ground");
  // Walk across the platform: the birds underfoot burst up.
  let t = 0;
  for (let k = 0; k < 40; k++, t += 0.05) {
    const p = new THREE.Vector3(kk.x - 4 + k * 0.2, 0, kk.z);
    flocks.update(0.05, t, p);
  }
  const scattered = flockCounts(flocks);
  assert.ok(scattered.air > settled.air + 5, `only ${scattered.air - settled.air} birds took off`);
  // Leave, and give them half a minute: they come back down.
  for (let k = 0; k < 600; k++, t += 0.05) flocks.update(0.05, t, far);
  const after = flockCounts(flocks);
  assert.ok(after.air <= settled.air + 2, `${after.air} still in the air`);
  // Nobody animates pigeons a street away.
  flocks.update(0.05, t, new THREE.Vector3(kk.x + 400, 0, kk.z));
  assert.deepEqual(flockCounts(flocks), { ground: 0, air: 0 });
  flocks.dispose();
});

test("Triplicane: Parthasarathy faces the sea, its car stands on Car Street, statues line the Marina", () => {
  const map = loadMap("marina-nagar");
  assert.equal(map.half, 420, "Triplicane's box takes in temple and beach");
  const t = map.landmarks.find((l) => l.model === "gopuram_temple")!;
  // Entrance (local +z) points east, give or take the street grid.
  assert.ok(Math.sin(t.rot) > 0.95, `gopuram faces ${((t.rot * 180) / Math.PI).toFixed(0)} deg`);
  // Temple spot and spawn in front of the gopuram, the spawn looking at it.
  for (const s of [map.spots.temple, map.spawn]) assert.ok(s.x > t.x + t.d / 2 - 1, "approached from the east");
  assert.ok(Math.abs(Math.atan2(Math.sin(map.spawn.yaw + Math.PI / 2), Math.cos(map.spawn.yaw + Math.PI / 2))) < 0.3, "spawn looks west at it");

  const car = map.landmarks.find((l) => l.model === "temple_car")!;
  assert.ok(Math.hypot(car.x - t.x, car.z - t.z) < 160, "the temple car is by its temple");
  const street = map.roads.filter((r) => r.name === "Car Street");
  let gap = Infinity;
  for (const r of street) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
      const u = Math.max(0, Math.min(1, ((car.x - ax) * (bx - ax) + (car.z - az) * (bz - az)) / L2));
      gap = Math.min(gap, Math.hypot(car.x - ax - u * (bx - ax), car.z - az - u * (bz - az)) - r.w / 2 - r.foot);
    }
  }
  assert.ok(gap > car.w / 2 - 0.1 && gap < car.w / 2 + 2, `car ${gap.toFixed(1)}m from Car Street's edge`);

  const statues = map.landmarks.filter((l) => l.model === "statue").map((l) => l.name).sort();
  assert.deepEqual(statues, ["Kannagi", "Subhas Chandra Bose", "Thiruvalluvar"]);
  // The skyline stays off the sea.
  assert.deepEqual(buildAreas(map, SEED_DISTRICTS.find((d) => d.id === "marina-nagar")!.theme).seaEdges, ["east"]);
});

test("the Marina: boats at the waterline, umbrellas and carts up the sand", () => {
  const map = loadMap("marina-nagar");
  const spots = beachSpots(map, () => false);
  const boats = spots.filter((s) => s.kind === "boat");
  const stalls = spots.filter((s) => s.kind !== "boat");
  assert.ok(boats.length > 30 && stalls.length > 60, `${boats.length} boats, ${stalls.length} stalls`);
  // The sea is east: boats nearer it than any stall, bows pointing at it.
  const minBoatX = Math.min(...boats.map((b) => b.x));
  const maxStallX = Math.max(...stalls.map((b) => b.x));
  assert.ok(minBoatX > maxStallX, "boats lie seaward of the stalls");
  for (const b of boats) assert.ok(Math.sin(b.rot) > 0.7, "bow to the sea");
  // No beach, no boats.
  assert.deepEqual(beachSpots(loadMap("purani-sadak"), () => false), []);
});

test("Majestic: platform roofs on posts, buses nosed in along them", () => {
  const map = loadMap("majestic-cross");
  const canopies = map.buildings.filter((b) => b.canopy);
  assert.ok(canopies.length >= 8, `${canopies.length} platform roofs`);
  for (const c of canopies) assert.equal(c.h, 5, "a roof, not a tower block");
  // Buses stand in the yard, clear of every real building.
  const world = new CollisionWorld();
  for (const b of map.buildings) if (!b.canopy) world.add({ kind: "poly", outer: b.pts, holes: b.holes ?? [] });
  const bays = busBays(map, (x, z, r) => world.blocked(x, z, r));
  assert.ok(bays.length > 40, `${bays.length} buses at Kempegowda`);
  for (let i = 0; i < bays.length; i++) {
    for (let j = i + 1; j < bays.length; j++) {
      assert.ok(Math.hypot(bays[i].x - bays[j].x, bays[i].z - bays[j].z) >= 3.2, "buses parked on top of each other");
    }
  }
  // Nowhere else has a bus stand's platforms to fill.
  assert.deepEqual(busBays(loadMap("park-gully"), () => false), []);
});

test("cinemas and colonial fronts turn to their street", () => {
  for (const id of ["majestic-cross", "park-gully", "dadar-chowk"]) {
    const map = loadMap(id);
    for (const l of map.landmarks.filter((x) => ["cinema", "colonial", "church", "church_small"].includes(x.model))) {
      let best: { d: number; x: number; z: number } | null = null;
      for (const r of map.roads) {
        if (r.cls === "footway" || r.cls === "steps") continue;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, az] = r.pts[i];
          const [bx, bz] = r.pts[i + 1];
          const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
          const t = Math.max(0, Math.min(1, ((l.x - ax) * (bx - ax) + (l.z - az) * (bz - az)) / L2));
          const x = ax + t * (bx - ax);
          const z = az + t * (bz - az);
          const d = Math.hypot(l.x - x, l.z - z);
          if (!best || d < best.d) best = { d, x, z };
        }
      }
      const toStreet = Math.atan2(best!.x - l.x, best!.z - l.z);
      const off = Math.abs(Math.atan2(Math.sin(toStreet - l.rot), Math.cos(toStreet - l.rot)));
      assert.ok(off <= Math.PI / 4 + 0.01, `${id}: ${l.name} faces ${((off * 180) / Math.PI).toFixed(0)} deg off its street`);
    }
  }
});

test("real shops carry their own names: Park Street's Mocambo, Trincas, Peter Cat", () => {
  let total = 0;
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const names = [...map.plots.flatMap((p) => (p.sign ? [p.sign] : [])), ...map.boards.map((b) => b.name)];
    assert.ok(names.length <= 40, `${d.id}: ${names.length} names overflow the sign atlas`);
    total += names.length;
    for (const p of map.plots) if (p.sign) assert.ok(p.front, `${d.id}: "${p.sign}" on a back-lot block`);
    // Every board hangs on its building's street wall, facing out.
    for (const b of map.boards) {
      const home = map.buildings.find((x) => {
        let inside = false;
        const px = b.x - Math.sin(b.rot) * 0.6;
        const pz = b.z - Math.cos(b.rot) * 0.6;
        for (let i = 0, j = x.pts.length - 1; i < x.pts.length; j = i++) {
          const [xi, zi] = x.pts[i];
          const [xj, zj] = x.pts[j];
          if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
        }
        return inside;
      });
      assert.ok(home, `${d.id}: board "${b.name}" hangs on no building`);
    }
  }
  assert.ok(total > 150, `${total} real names across the cities`);
  const park = loadMap("park-gully").boards.map((b) => b.name);
  for (const n of ["Mocambo", "Trincas", "Peter Cat"]) assert.ok(park.includes(n), `no ${n} on Park Street`);
});

test("every district has room for the barber's lock-up and the tricolour near the spawn", () => {
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const solid = new CollisionWorld();
    for (const p of map.plots) solid.box(p.x, p.z, p.w / 2, p.d / 2, p.rot);
    for (const b of map.buildings) if (!b.canopy) solid.add({ kind: "poly", outer: b.pts, holes: b.holes ?? [] });
    for (const a of map.areas) if (a.kind === "water" || a.kind === "sea") solid.add({ kind: "poly", outer: a.pts, holes: a.holes ?? [] });

    const { barber, flag, spawn } = map;
    assert.ok(Math.hypot(barber.x - spawn.x, barber.z - spawn.z) <= 150, `${d.id}: barber far from the spawn`);
    // The lock-up's whole footprint is clear, and its door looks onto a street.
    const c = Math.cos(barber.yaw);
    const sn = Math.sin(barber.yaw);
    for (const [u, v] of [[-3, -2.2], [3, -2.2], [-3, 2.2], [3, 2.2], [0, 0]]) {
      assert.equal(solid.blocked(barber.x + u * c + v * sn, barber.z - u * sn + v * c, 0.2), false, `${d.id}: barber overlaps a building`);
    }
    const door = [barber.x + sn * 6, barber.z + c * 6];
    const onStreet = map.roads.some((r) =>
      r.pts.some((p, i) => {
        if (i === r.pts.length - 1) return false;
        const [ax, az] = p;
        const [bx, bz] = r.pts[i + 1];
        const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
        const t = Math.max(0, Math.min(1, ((door[0] - ax) * (bx - ax) + (door[1] - az) * (bz - az)) / L2));
        return Math.hypot(door[0] - ax - t * (bx - ax), door[1] - az - t * (bz - az)) < r.w / 2 + r.foot + 1;
      })
    );
    assert.ok(onStreet, `${d.id}: the barber's door faces no street`);
    for (const s of [spawn, ...Object.values(map.spots), ...Object.values(map.errandSpots)]) {
      assert.ok(Math.hypot(s.x - barber.x, s.z - barber.z) >= 14, `${d.id}: barber on a task spot`);
    }

    assert.equal(solid.blocked(flag.x, flag.z, 1), false, `${d.id}: the flag stands in a building or the water`);
    assert.ok(Math.hypot(flag.x - spawn.x, flag.z - spawn.z) <= 120, `${d.id}: the flag is out of sight`);
  }
});

test("a task's place comes from the map, whatever position its pack row carries", () => {
  for (const pack of SEED_TASK_PACKS) {
    const map = loadMap(pack.districtId);
    for (const t of pack.tasks) {
      // A row still holding the old grid's chowk offset.
      const stale = { ...t, pos: [12, -30] as [number, number] };
      const s = taskSpot(map, stale);
      assert.deepEqual([s.x, s.z], [map.errandSpots[t.id]?.x ?? map.spots[t.kind as keyof MapData["spots"]].x, map.errandSpots[t.id]?.z ?? map.spots[t.kind as keyof MapData["spots"]].z]);
    }
  }
  assert.throws(() => taskSpot(loadMap("park-gully"), { id: "park-gully-nowhere", kind: "ferry" }), /no spot for task/);
});

test("traffic stops short of someone standing in the lane", () => {
  const map = loadMap("dadar-chowk");
  const traffic = createTraffic(map, {
    landmark: "mumbai",
    autoCanopy: 0xf1c40f,
    autos: 6,
    cars: 6,
    vehicleMats: createVehicleMaterials(),
    transitMat: createTransitMaterial(),
  });
  const start = new THREE.Vector3(map.spawn.x, 0, map.spawn.z);
  traffic.prime(start);
  // Stand 6m ahead of one vehicle with a clear run of road before its next
  // junction, in its lane, and let the street run.
  const v = traffic.vehicles.find((x) => x.speed >= 0 && polylineLength(map.roads[x.road].pts) - x.p > 30)!;
  assert.ok(v, "no vehicle with a clear run ahead");
  const ahead = new THREE.Vector3(
    v.mesh.position.x + Math.sin(v.yaw) * (v.halfLength + 6),
    0,
    v.mesh.position.z + Math.cos(v.yaw) * (v.halfLength + 6)
  );
  let closest = Infinity;
  for (let i = 0; i < 200; i++) {
    traffic.update(0.05, i * 0.05, ahead);
    const c = Math.cos(v.yaw);
    const sn = Math.sin(v.yaw);
    const dx = ahead.x - v.mesh.position.x;
    const dz = ahead.z - v.mesh.position.z;
    if (Math.abs(dx * c - dz * sn) < v.halfWidth + 0.5) closest = Math.min(closest, dx * sn + dz * c - v.halfLength);
  }
  assert.ok(closest < 5, `never came up to the player (gap ${closest.toFixed(2)}m)`);
  assert.ok(closest > 0.3, `drove into the player (gap ${closest.toFixed(2)}m)`);
});

test("you can walk under Charminar's arches and into a cinema's forecourt, not through their walls", () => {
  const hyd = loadMap("charminar-lane");
  const cm = hyd.landmarks.find((l) => l.model === "charminar")!;
  const world = new CollisionWorld();
  placeLandmarks([cm], "hyderabad", world, new HeightField(hyd.half));
  const at = (l: typeof cm, u: number, v: number): [number, number] => [
    l.x + u * Math.cos(l.rot) + v * Math.sin(l.rot),
    l.z - u * Math.sin(l.rot) + v * Math.cos(l.rot),
  ];
  const half = Math.min(cm.w, cm.d) / 2;
  assert.equal(world.blocked(...at(cm, 0, 0), 0.35), false, "under the dome is blocked");
  for (const [u, v] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    assert.equal(world.blocked(...at(cm, u * half * 0.8, v * half * 0.8), 0.35), false, "an arch is walled up");
  }
  assert.equal(world.blocked(...at(cm, half * 0.7, half * 0.7), 0.1), true, "a pier is not solid");

  const blr = loadMap("majestic-cross");
  const cinema = blr.landmarks.find((l) => l.model === "cinema")!;
  const cw = new CollisionWorld();
  placeLandmarks([cinema], "bengaluru", cw, new HeightField(blr.half));
  // Just inside the front edge of the footprint: under the marquee.
  assert.equal(cw.blocked(...at(cinema, 0, cinema.d / 2 - 1.5), 0.35), false, "the forecourt is walled off");
  assert.equal(cw.blocked(...at(cinema, 0, 0), 0.1), true, "the hall is not solid");
});

/** The map's static collision, as buildWorld registers it. */
function mapCollision(map: MapData, landmark: Landmark) {
  const world = new CollisionWorld();
  const height = new HeightField(map.half);
  for (const a of map.areas) if (a.kind === "water" || a.kind === "sea") world.add({ kind: "poly", outer: a.pts, holes: a.holes ?? [], open: a.bridges });
  for (const p of map.plots) world.box(p.x, p.z, p.w / 2, p.d / 2, p.rot);
  for (const b of map.buildings) if (!b.canopy) world.add({ kind: "poly", outer: b.pts, holes: b.holes ?? [] });
  const { inners } = placeLandmarks(map.landmarks, landmark, world, height);
  if (map.precinct) buildPrecinct(map.precinct, map.half, world, height);
  for (const { stalls } of marketStalls(map, (x, z, r) => world.blocked(x, z, r))) for (const s of stalls) world.box(s.x, s.z, 1.17, 0.72, s.rot);
  return { world, inners };
}

test("every monument can be walked into from the street, and stands inside its map", () => {
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const { world, inners } = mapCollision(map, d.theme.landmark);
    for (const inner of inners) {
      const l = map.landmarks.find((x) => x.name === inner.name)!;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = l.x + (u * l.w * Math.cos(l.rot)) / 2 + (v * l.d * Math.sin(l.rot)) / 2;
        const z = l.z - (u * l.w * Math.sin(l.rot)) / 2 + (v * l.d * Math.cos(l.rot)) / 2;
        assert.ok(Math.abs(x) <= map.half && Math.abs(z) <= map.half, `${d.id}: ${l.name} runs off the map`);
      }
      assert.ok(reachesInside(world, l, inner), `${d.id}: ${l.name} cannot be walked into`);
    }
  }
});

test("from the spawn you can walk to every errand, every monument's host and the barber", () => {
  for (const d of SEED_DISTRICTS) {
    const map = loadMap(d.id);
    const { world, inners } = mapCollision(map, d.theme.landmark);
    assert.equal(world.blocked(map.spawn.x, map.spawn.z, 0.55), false, `${d.id}: the spawn is inside something`);
    const walk = reachableFrom(world, map.spawn.x, map.spawn.z, map.half);
    const places: [string, { x: number; z: number }][] = [
      ...Object.entries(map.spots),
      ...Object.entries(map.errandSpots),
      ["barber", map.barber],
      ...inners.map((i): [string, { x: number; z: number }] => [i.name, i]),
    ];
    for (const [name, p] of places) assert.ok(walk.reached(p.x, p.z, 2), `${d.id}: ${name} cannot be reached from the spawn`);
  }
});

test("errands are spread over each district, and one is at its signature place", () => {
  const SIGNATURE: Record<string, RegExp> = {
    "purani-sadak": /^Jama Masjid$/,
    "manek-chowk": /^Jama Masjid$/,
    "fort-kochi": /^Chinese Fishing Nets$/,
    "hall-bazaar": /^Shri Harmandir Sahib$/,
    "lingaraj-lane": /^Lord Lingaraj Temple$/,
    "charminar-lane": /^Charminar$/,
    "marina-nagar": /^Sri Parthasarathy Koil$/,
    "majestic-cross": /^Kempegowda Bus Station$/,
  };
  for (const pack of SEED_TASK_PACKS) {
    const map = loadMap(pack.districtId);
    const spots = pack.tasks.map((t) => taskSpot(map, t));
    const nearest = spots
      .map((s) => Math.min(...spots.filter((o) => o !== s).map((o) => Math.hypot(o.x - s.x, o.z - s.z))))
      .sort((a, b) => a - b);
    const median = nearest[Math.floor(nearest.length / 2)];
    assert.ok(median >= 120, `${pack.districtId}: errands bunched (median ${median.toFixed(0)} m to the next)`);
    const sig = SIGNATURE[pack.districtId];
    if (!sig) continue;
    const l = map.landmarks.find((x) => sig.test(x.name));
    assert.ok(l, `${pack.districtId}: ${sig} not on the map`);
    const at = (x: number, z: number) => spots.some((s) => Math.hypot(s.x - x, s.z - z) < Math.max(l.w, l.d) / 2 + 40);
    assert.ok(at(l.x, l.z) || (l.door && at(...l.door)), `${pack.districtId}: no errand at ${l.name}`);
  }
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
  for (const r of m.heights) h.rect(r.x, r.z, r.hw, r.hd, r.rot ?? 0, r.y0, r.y1);
  // Foot of the stair at the front edge, top on the plinth.
  assert.ok(h.at(0, 44.8) < 0.5, "stair starts near the ground");
  assert.ok(h.at(0, 0) > 3, "courtyard is up on the plinth");
  // The gate gap in the cloister is open.
  const w = new CollisionWorld();
  for (const c of m.colliders) w.box(c.x, c.z, c.hw, c.hd, c.rot ?? 0);
  assert.equal(w.blocked(0, 30, 0.4), false, "the way in through the gate is clear");
  // Delhi's north gate: its stair climbs from the ground to the plinth, and
  // the gate at its head is open while the cloister either side is shut.
  const run = Math.round(5 / 0.17) * 0.32;
  const wall = 45 - run - 0.6;
  const zc = (-45 + 45 - run) / 2;
  assert.ok(h.at(-44.8, zc) < 0.6, "the north stair starts near the ground");
  assert.ok(h.at(-wall - 1, zc) > 4, "and climbs to the plinth");
  assert.equal(w.blocked(-wall, zc, 0.4), false, "the north gate is open");
  assert.equal(w.blocked(-wall, zc - 25, 0.4), true, "the side cloister blocks");
});

test("a gateway mapped on its road stands across it, the road through its arches", () => {
  for (const [id, name, road] of [["manek-chowk", "Teen Darwaza", "Gandhi Road"]] as const) {
    const map = loadMap(id);
    const gate = map.landmarks.find((l) => l.name === name);
    assert.ok(gate, `${id}: no ${name}`);
    // The nearest drivable road, and its direction there.
    let best = { d: Infinity, dir: [0, 0] };
    for (const r of map.roads) {
      if (r.name !== road) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az) || 1;
        const t = Math.max(0, Math.min(1, ((gate.x - ax) * (bx - ax) + (gate.z - az) * (bz - az)) / (L * L)));
        const d = Math.hypot(ax + (bx - ax) * t - gate.x, az + (bz - az) * t - gate.z);
        if (d < best.d) best = { d, dir: [(bx - ax) / L, (bz - az) / L] };
      }
    }
    assert.ok(best.d < 6, `${name} is ${best.d.toFixed(1)}m off its road`);
    const along = Math.abs(Math.sin(gate.rot) * best.dir[0] + Math.cos(gate.rot) * best.dir[1]);
    assert.ok(along > 0.95, `${name}'s arches open ${Math.round((Math.acos(along) * 180) / Math.PI)}° off its road`);
  }
});
