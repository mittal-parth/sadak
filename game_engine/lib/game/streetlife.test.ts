import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loopPoint, createCrowd, CITY_DRESS } from "./crowd";
import { schedulePeriod, trainPosition, METRO, type Schedule } from "./metro";
import { CITY_TRAFFIC, makeBus, makeTwoWheeler, createTransitMaterial } from "./transit";
import { createVehicleMaterials, makeCar } from "./vehicles";
import { onWalkway, BLOCK, SPACING, CHOWK, WALK_LANES, FOOTPATH } from "./city";
import type { Landmark } from "./assets";

const LANDMARKS: Landmark[] = [
  "delhi", "chennai", "bengaluru", "kolkata", "hyderabad",
  "kochi", "mumbai", "ahmedabad", "amritsar", "bhubaneswar",
];

test("loopPoint walks the square continuously and faces its direction of travel", () => {
  const half = 10;
  let prev = loopPoint(half, 0);
  assert.deepEqual([prev.x, prev.z], [-10, -10]);
  for (let s = 0.25; s <= 80; s += 0.25) {
    const p = loopPoint(half, s);
    // Never jumps: each step moves at most the step length.
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= 0.25 + 1e-9, `jump at s=${s}`);
    // Always on the square's perimeter.
    assert.ok(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.z)) - half) < 1e-9);
    prev = p;
  }
  // Heading faces the direction of travel on each side.
  const east = loopPoint(half, 5);
  assert.equal(east.yaw, Math.PI / 2);
  const step = loopPoint(half, 5.1);
  assert.ok(Math.abs(step.x - east.x - Math.sin(east.yaw) * 0.1) < 1e-9);
  // Wraps and handles negative distances.
  assert.deepEqual(loopPoint(half, 80), loopPoint(half, 0));
  assert.deepEqual(loopPoint(half, -5), loopPoint(half, 75));
});

const sched: Schedule = { reach: 200, station: 60, cruise: 15, accel: 1.1, dwell: 14, layover: 22 };

test("train runs in from the far end, stops at the platform, and leaves", () => {
  const period = schedulePeriod(sched);
  assert.ok(period > 0);
  const start = trainPosition(sched, 0);
  assert.equal(start.pos, -sched.reach);
  assert.equal(start.speed, sched.cruise);

  let sawPlatform = false;
  let prev = start.pos;
  for (let t = 0; t < period; t += 0.05) {
    const p = trainPosition(sched, t);
    if (p.pos > sched.reach + 1) continue; // laid over, off the world
    assert.ok(p.pos >= prev - 1e-6, `train reversed at t=${t}`);
    assert.ok(p.speed >= -1e-9 && p.speed <= sched.cruise + 1e-9);
    if (p.atPlatform) {
      sawPlatform = true;
      assert.equal(p.pos, sched.station);
      assert.equal(p.speed, 0);
    }
    prev = p.pos;
  }
  assert.ok(sawPlatform, "never stopped at the platform");
  // Periodic.
  assert.deepEqual(trainPosition(sched, 3), trainPosition(sched, 3 + period));
});

test("braking arrives exactly at the station with zero speed", () => {
  const brake = (sched.cruise * sched.cruise) / (2 * sched.accel);
  const tArrive = (sched.station + sched.reach - brake) / sched.cruise + sched.cruise / sched.accel;
  const p = trainPosition(sched, tArrive - 1e-6);
  assert.ok(Math.abs(p.pos - sched.station) < 1e-3);
  assert.ok(p.speed < 1e-3);
});

test("every city has dress and traffic; metro only where it is elevated", () => {
  for (const l of LANDMARKS) {
    assert.ok(CITY_DRESS[l], `dress ${l}`);
    const mix = CITY_DRESS[l].mix;
    assert.ok(Math.abs(mix.reduce((a, b) => a + b, 0) - 1) < 1e-9, `${l} costume mix sums to 1`);
    assert.ok(CITY_TRAFFIC[l].bikes > 0 && CITY_TRAFFIC[l].buses > 0, `traffic ${l}`);
  }
  for (const l of ["kolkata", "amritsar", "bhubaneswar"] as const) assert.equal(METRO[l], undefined);
  assert.equal(Object.keys(METRO).length, 7);
});

test("buses and two-wheelers follow the traffic contract", () => {
  const mats = createVehicleMaterials();
  const mat = createTransitMaterial();
  const bus = makeBus(mats, mat, CITY_TRAFFIC.mumbai.bus, 1);
  assert.ok(bus.userData.halfLength > 4);
  assert.equal(bus.userData.wheels.length, 4);
  assert.ok(bus.userData.wheelRadius > 0);
  const bike = makeTwoWheeler(mat, 2);
  assert.equal(bike.userData.halfLength, 0.95);
  assert.deepEqual(bike.userData.wheels, []);
  // One draw call for the whole bike and its riders.
  assert.equal(bike.children.length, 1);
  const parked = makeTwoWheeler(mat, 2, { parked: true });
  const ridden = (bike.children[0] as THREE.Mesh).geometry.attributes.position.count;
  const empty = (parked.children[0] as THREE.Mesh).geometry.attributes.position.count;
  assert.ok(empty < ridden, "parked bike should have no rider");
});

test("taxi liveries follow the city", () => {
  const mats = createVehicleMaterials();
  const paintOf = (g: THREE.Group) =>
    g.children
      .filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
      .map((m) => (m.material as THREE.MeshStandardMaterial).color?.getHex());
  const kaali = paintOf(makeCar(mats, { kind: "taxi", taxiStyle: "kaaliPeeli" }));
  assert.ok(kaali.includes(0x141414) && kaali.includes(0xf2c21b), "black body, yellow roof");
  const yellow = paintOf(makeCar(mats, { kind: "taxi", taxiStyle: "yellow" }));
  assert.ok(yellow.includes(0xf0b71c));
});

test("walkway band is on the footpath lanes, off the chowk", () => {
  const cx = CHOWK.x + SPACING;
  const cz = CHOWK.z;
  const edge = cx + BLOCK / 2;
  for (const lane of WALK_LANES) assert.equal(onWalkway(edge - lane, cz), true, `lane ${lane}`);
  assert.equal(onWalkway(edge - 0.5, cz), false, "kerb zone");
  assert.equal(onWalkway(edge - FOOTPATH - 1, cz), false, "inside the buildings");
  assert.equal(onWalkway(CHOWK.x + BLOCK / 2 - WALK_LANES[0], CHOWK.z), false, "chowk");
});

test("crowd population, one mesh per body part", () => {
  const crowd = createCrowd({
    landmark: "amritsar",
    blocks: [{ cx: 0, cz: 0 }, { cx: 200, cz: 200 }],
    blockSize: 40,
    lanes: WALK_LANES,
    groundY: 0.26,
    chowk: { x: 0, z: 60, half: 19 },
    colliders: [],
    gatherings: [{ x: 0, z: 60, size: 3 }],
  });
  assert.ok(crowd.count > 20);
  assert.equal(crowd.group.children.length, 8);
  for (const m of crowd.group.children as THREE.InstancedMesh[]) {
    assert.equal(m.isInstancedMesh, true);
    assert.ok(m.instanceColor, `${m.geometry.uuid} has no instance colours`);
  }
  // Movers actually move.
  const legs = crowd.group.children[0] as THREE.InstancedMesh;
  const before = Array.from(legs.instanceMatrix.array);
  crowd.update(0.5);
  assert.notDeepEqual(Array.from(legs.instanceMatrix.array), before);
  crowd.dispose();
});
