import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeAmbassadorTaxi, makeHandRickshaw } from "./kolkata";
import { makeCycleRickshaw } from "./delhi";
import { autoBodyFor, makeAuto } from "../props";

const size = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

test("the Ambassador is a car's shape: long the way it points, not wider than it is long", () => {
  const s = size(makeAmbassadorTaxi());
  assert.ok(s.z > 3.5 && s.z < 4.4, `length ${s.z.toFixed(2)}m`);
  assert.ok(s.x > 1.6 && s.x < 2.0, `width ${s.x.toFixed(2)}m`);
  assert.ok(s.y > 1.4 && s.y < 1.8, `height ${s.y.toFixed(2)}m`);
});

test("rickshaw wheels stand upright on axles across the vehicle", () => {
  for (const [name, g, r] of [
    ["cycle rickshaw", makeCycleRickshaw(), 0.42],
    ["hand rickshaw", makeHandRickshaw(), 0.5],
  ] as const) {
    // The tyres: the darkest mesh. Upright wheels are as tall as they are
    // across; flat ones would be a few centimetres tall.
    let tyres: THREE.Mesh | null = null;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const c = (m.material as THREE.MeshStandardMaterial).color;
      if (c && c.r + c.g + c.b < 0.15 && (!tyres || size(m).y > size(tyres).y)) tyres = m;
    });
    assert.ok(tyres, `${name}: no tyres`);
    const s = size(tyres!);
    assert.ok(s.y > r * 1.8, `${name}: wheels ${s.y.toFixed(2)}m tall, lying flat`);
  }
});

test("an auto: three wheels, auto-sized, the body in its city's colour", () => {
  const a = makeAuto(0xf5c518, autoBodyFor("delhi"));
  const s = size(a);
  assert.ok(s.z > 2.4 && s.z < 3.0, `length ${s.z.toFixed(2)}m`);
  assert.ok(s.x > 1.3 && s.x < 1.8, `width ${s.x.toFixed(2)}m`);
  assert.ok(s.y > 1.8 && s.y < 2.2, `height ${s.y.toFixed(2)}m`);
  assert.equal((a.userData.wheels as THREE.Object3D[]).length, 3);
  assert.notEqual(autoBodyFor("delhi"), autoBodyFor("mumbai"), "Delhi's CNG green, Mumbai's black");
});
