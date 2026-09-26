import { test } from "node:test";
import assert from "node:assert/strict";
import { knockFrom, type VehicleBox } from "./knock";

// A car heading +z (yaw 0) at 8 m/s, 1m either side, 2.2m front and back.
const car: VehicleBox = { x: 0, z: 0, yaw: 0, halfWidth: 1, halfLength: 2.2, speed: 8 };
const open = () => false;

test("a moving car throws the player aside, never along its path", () => {
  // Standing right in front of the bumper, a touch left of centre.
  const k = knockFrom(car, 0.2, 2.3, 0.35, open)!;
  assert.ok(k, "no contact");
  assert.ok(Math.abs(k.x) >= 1.35, `still in the car's path at x=${k.x}`);
  assert.equal(k.z, 2.3, "moved along the car's path: carried on the bumper");
  assert.ok(k.shove, "no shove");
  // Mostly across, a little forward with the car.
  assert.ok(Math.abs(k.shove!.x) > Math.abs(k.shove!.z), "shove runs along the path");
  assert.ok(Math.sign(k.shove!.x) === Math.sign(k.x), "shoved back into the car");
  assert.ok(k.shove!.z > 0, "shove against the car's travel");
});

test("the throw goes the other way when a wall is on that side", () => {
  const wallRight = (x: number) => x > 1;
  const k = knockFrom(car, 0.2, 1, 0.35, wallRight)!;
  assert.ok(k.x < -1.3, `thrown into the wall at x=${k.x}`);
  assert.ok(k.shove!.x < 0);
});

test("a parked car only nudges the player out of its box, no shove", () => {
  const parked = { ...car, speed: 0 };
  // Overlapping the rear corner: out through the nearer face.
  const k = knockFrom(parked, 0.2, -2.4, 0.35, open)!;
  assert.equal(k.shove, null);
  assert.ok(k.z <= -2.55 + 1e-6, "not out of the box");
  assert.equal(k.x, 0.2);
});

test("clear of the car, nothing happens", () => {
  assert.equal(knockFrom(car, 3, 0, 0.35, open), null);
  assert.equal(knockFrom(car, 0, 4, 0.35, open), null);
});

test("works in any heading", () => {
  const east = { ...car, yaw: Math.PI / 2 }; // heading +x
  const k = knockFrom(east, 2.3, 0.2, 0.35, open)!;
  assert.equal(k.x, 2.3, "carried along +x");
  assert.ok(Math.abs(k.z) >= 1.35);
});
