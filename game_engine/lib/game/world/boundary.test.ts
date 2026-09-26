import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createBoundary, BOUNDARY_INSET, BOUNDARY_REACH } from "./boundary";

test("the boundary shows only near the edge, and brightest pressed against it", () => {
  const b = createBoundary(360);
  // Four curtains, one on each side, where the player is stopped.
  assert.equal(b.group.children.length, 4);
  const edge = 360 - BOUNDARY_INSET;
  const at = b.group.children.map((m) => Math.max(Math.abs(m.position.x), Math.abs(m.position.z)));
  assert.deepEqual(at, [edge, edge, edge, edge]);

  b.update(0, new THREE.Vector3(0, 0, 0));
  assert.equal(b.group.visible, false, "drawn in the middle of the map");
  assert.equal(b.glow(), 0);

  b.update(0, new THREE.Vector3(edge - BOUNDARY_REACH / 2, 0, 0));
  assert.equal(b.group.visible, true);
  const near = b.glow();
  b.update(0, new THREE.Vector3(0, 0, -(edge - 0.1)));
  assert.ok(b.glow() > near && b.glow() > 0.95, "no brighter at the wall");
  b.dispose();
});
