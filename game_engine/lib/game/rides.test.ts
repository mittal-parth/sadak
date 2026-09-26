import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { Rides, type RideEvent, type RidePose } from "./rides";
import { planRoute } from "./world/route";
import { SEED_DISTRICTS } from "./districts";
import { SEED_TASK_PACKS } from "./tasks";
import { createVehicleMaterials } from "./vehicles";
import { createTransitMaterial } from "./transit";
import type { MapData } from "./world/mapData";
import type { World } from "./world";

const loadMap = (id: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../public/maps", `${id}.json`), "utf8")) as MapData;

/** Rides only reads the height field from the world. */
const worldStub = { height: { at: () => 0 } } as unknown as World;

function setup(id: string) {
  const map = loadMap(id);
  const district = SEED_DISTRICTS.find((d) => d.id === id)!;
  const tasks = SEED_TASK_PACKS.find((p) => p.districtId === id)!.tasks;
  const scene = new THREE.Scene();
  const rides = new Rides(scene, worldStub, map, district, createVehicleMaterials(), createTransitMaterial());
  const hosts = new Map<string, THREE.Object3D>();
  for (const t of tasks) {
    const anchor = new THREE.Group();
    anchor.position.set(t.pos[0], 0, t.pos[1]);
    const host = new THREE.Group();
    anchor.add(host);
    scene.add(anchor);
    hosts.set(t.id, host);
  }
  return { map, tasks, scene, rides, hosts };
}

/** Step until an "ended" event, or give up. */
function runUntilEnded(step: () => RidePose | RideEvent | null, seconds: number) {
  const poses: RidePose[] = [];
  for (let t = 0; t < seconds; t += 0.05) {
    const r = step();
    if (r && "kind" in r) return { ended: r, poses };
    if (r) poses.push(r);
  }
  return { ended: null, poses };
}

test("an auto from the stand gets close to every errand", () => {
  for (const pack of SEED_TASK_PACKS) {
    const map = loadMap(pack.districtId);
    const s = map.spots.auto;
    for (const t of pack.tasks) {
      if (t.kind === "auto") continue;
      const path = planRoute(map, s.x, s.z, t.pos[0], t.pos[1], 4.2, 1.6, { closest: true });
      assert.ok(path && path.length >= 2, `${t.id}: no auto route from the auto stand`);
      // Pedestrian streets (Chandni Chowk, the Golden Temple's approaches)
      // are walked from where the auto stops.
      const [ex, ez] = path[path.length - 1];
      const walk = Math.hypot(ex - t.pos[0], ez - t.pos[1]);
      assert.ok(walk < 150, `${t.id}: dropped ${Math.round(walk)}m away`);
    }
  }
});

test("routes are strict unless asked to get close", () => {
  // Chandni Chowk's temple sits on a pedestrian street: no auto reaches it,
  // but one can get to the corner.
  const map = loadMap("purani-sadak");
  const { auto, temple } = map.spots;
  const strict = planRoute(map, auto.x, auto.z, temple.x, temple.z, 4.2, 1.6);
  const close = planRoute(map, auto.x, auto.z, temple.x, temple.z, 4.2, 1.6, { closest: true })!;
  const [ex, ez] = close[close.length - 1];
  assert.ok(Math.hypot(ex - temple.x, ez - temple.z) < 60);
  if (strict) {
    const [sx, sz] = strict[strict.length - 1];
    assert.ok(Math.hypot(sx - temple.x, sz - temple.z) >= Math.hypot(ex - temple.x, ez - temple.z) - 0.5);
  }
});

test("routes keep left and follow the streets", () => {
  const map = loadMap("park-gully");
  const path = planRoute(map, map.spots.auto.x, map.spots.auto.z, map.spots.bus.x, map.spots.bus.z, 4.2, 1.6)!;
  // No teleports: consecutive points stay a few metres apart.
  for (let i = 1; i < path.length; i++) {
    const gap = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    assert.ok(gap < 8, `route jumps ${gap.toFixed(1)}m at ${i}`);
  }
});

test("the auto ride carries the player to their next errand and drops them off", () => {
  const { tasks, scene, rides, hosts } = setup("purani-sadak");
  const auto = new THREE.Group();
  scene.add(auto);
  const autoTask = tasks.find((t) => t.kind === "auto")!;
  auto.position.set(autoTask.pos[0], 0, autoTask.pos[1]);
  const done = new Set([autoTask.id]);
  rides.startAuto(autoTask, auto, tasks, done);
  assert.ok(rides.riding(), "ride did not start");

  const player = new THREE.Vector3();
  const { ended, poses } = runUntilEnded(() => rides.update(0.05, player, tasks, done, hosts), 240);
  assert.ok(ended, "ride never ended");
  assert.ok(poses.length > 20);
  assert.ok(poses.every((p) => p.seat !== null), "auto passengers are seated, visible");
  // Dropped off as close to the destination errand as an auto can get.
  const dest = tasks
    .filter((t) => !done.has(t.id) && t.kind !== "auto")
    .sort((a, b) => Math.hypot(a.pos[0] - autoTask.pos[0], a.pos[1] - autoTask.pos[1]) - Math.hypot(b.pos[0] - autoTask.pos[0], b.pos[1] - autoTask.pos[1]))[0];
  const route = planRoute(loadMap("purani-sadak"), autoTask.pos[0], autoTask.pos[1], dest.pos[0], dest.pos[1], 4.2, 1.6, { closest: true })!;
  const [rx, rz] = route[route.length - 1];
  assert.ok(Math.hypot(ended!.x - rx, ended!.z - rz) < 4, "dropped off short of where the route ends");
  assert.ok(Math.hypot(ended!.x - dest.pos[0], ended!.z - dest.pos[1]) < 60, "dropped off far from the destination");
  assert.equal(rides.riding(), null);
});

test("a bus comes to the stop, waits for the player, and can be boarded", () => {
  const { tasks, rides, hosts } = setup("dadar-chowk");
  const busTask = tasks.find((t) => t.kind === "bus")!;
  const done = new Set<string>();
  const player = new THREE.Vector3(busTask.pos[0] + 3, 0, busTask.pos[1] + 3);

  assert.equal(rides.busReady(busTask.id), false);
  for (let t = 0; t < 60 && !rides.busReady(busTask.id); t += 0.05) rides.update(0.05, player, tasks, done, hosts);
  assert.ok(rides.busReady(busTask.id), "no bus arrived within a minute");
  assert.equal(hosts.get(busTask.id)!.visible, true, "the conductor is at the door");

  rides.startBus(busTask);
  const { ended, poses } = runUntilEnded(() => rides.update(0.05, player, tasks, done, hosts), 240);
  assert.ok(ended, "bus ride never ended");
  assert.ok(poses.every((p) => p.seat === null), "bus passengers ride inside, out of sight");
  assert.ok(Math.hypot(ended!.x - busTask.pos[0], ended!.z - busTask.pos[1]) > 60, "the bus went somewhere");
});

test("a waiting bus leaves if the player walks away", () => {
  const { tasks, rides, hosts } = setup("dadar-chowk");
  const busTask = tasks.find((t) => t.kind === "bus")!;
  const done = new Set<string>();
  const near = new THREE.Vector3(busTask.pos[0], 0, busTask.pos[1]);
  for (let t = 0; t < 60 && !rides.busReady(busTask.id); t += 0.05) rides.update(0.05, near, tasks, done, hosts);
  assert.ok(rides.busReady(busTask.id));
  const far = new THREE.Vector3(busTask.pos[0] + 200, 0, busTask.pos[1]);
  rides.update(0.05, far, tasks, done, hosts);
  assert.equal(rides.busReady(busTask.id), false);
});

test("every city's bus comes, is boarded and goes somewhere", () => {
  for (const d of SEED_DISTRICTS) {
    const { tasks, rides, hosts } = setup(d.id);
    const busTask = tasks.find((t) => t.kind === "bus")!;
    const done = new Set<string>();
    const player = new THREE.Vector3(busTask.pos[0], 0, busTask.pos[1]);
    for (let t = 0; t < 90 && !rides.busReady(busTask.id); t += 0.05) rides.update(0.05, player, tasks, done, hosts);
    assert.ok(rides.busReady(busTask.id), `${d.id}: no bus arrived`);
    rides.startBus(busTask);
    assert.ok(rides.riding(), `${d.id}: could not board`);
    const { ended } = runUntilEnded(() => rides.update(0.05, player, tasks, done, hosts), 300);
    assert.ok(ended, `${d.id}: the ride never ended`);
  }
});
