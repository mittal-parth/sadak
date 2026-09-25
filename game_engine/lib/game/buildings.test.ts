import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildBuildingParts } from "./buildings";
import type { UvRect } from "./signage";

const W = 9;
const D = 12;
const FLOORS = 3;
const GROUND_H = 4.2;

const atlas = {
  cells: 4,
  rect(i: number): UvRect {
    return [(i % 2) / 2, Math.floor(i / 2) / 2, (i % 2) / 2 + 0.5, Math.floor(i / 2) / 2 + 0.5];
  },
};

function positions(g: THREE.BufferGeometry): THREE.Vector3[] {
  const p = g.attributes.position;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  return out;
}

test("returns every part, with geometry, and the right height", () => {
  const parts = buildBuildingParts(W, D, FLOORS, 42, { style: "colonial", signs: atlas });
  assert.equal(parts.height, GROUND_H + FLOORS * 3.2);
  for (const key of ["shell", "trim", "glass", "metal", "signage", "decor", "signs"] as const) {
    assert.ok(parts[key].attributes.position?.count > 0, `${key} is empty`);
  }
});

test("is deterministic for a seed", () => {
  const a = buildBuildingParts(W, D, FLOORS, 7, { style: "mughal", signs: atlas });
  const b = buildBuildingParts(W, D, FLOORS, 7, { style: "mughal", signs: atlas });
  for (const key of ["shell", "trim", "glass", "metal", "signage", "decor", "signs"] as const) {
    assert.deepEqual(
      Array.from(a[key].attributes.position.array),
      Array.from(b[key].attributes.position.array),
      key
    );
  }
});

test("decor carries a per-vertex colour for every vertex", () => {
  const { decor } = buildBuildingParts(W, D, FLOORS, 3, { style: "modern" });
  assert.ok(decor.attributes.color, "decor has no color attribute");
  assert.equal(decor.attributes.color.count, decor.attributes.position.count);
});

test("without a sign atlas, shops get no lettered faces", () => {
  const { signs } = buildBuildingParts(W, D, FLOORS, 3, { style: "modern" });
  assert.equal(signs.attributes.position, undefined);
});

test("sign faces map into exactly one atlas cell each", () => {
  const { signs } = buildBuildingParts(W, D, FLOORS, 11, { style: "dravidian", signs: atlas });
  const uv = signs.attributes.uv;
  const cells = Array.from({ length: atlas.cells }, (_, i) => atlas.rect(i));
  // Plane faces are 4 vertices each.
  for (let q = 0; q < uv.count; q += 4) {
    const inCell = cells.some(([u0, v0, u1, v1]) => {
      for (let i = q; i < q + 4; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        if (u < u0 - 1e-6 || u > u1 + 1e-6 || v < v0 - 1e-6 || v > v1 + 1e-6) return false;
      }
      return true;
    });
    assert.ok(inCell, `sign face ${q / 4} straddles atlas cells`);
  }
});

test("window glass sits on or outside the wall plane, never inside the core", () => {
  // Regression: glass used to be set 0.22m *into* a solid core box, so no
  // upper-floor window ever rendered.
  for (const style of ["modern", "mughal", "colonial", "dravidian"] as const) {
    const { glass } = buildBuildingParts(W, D, FLOORS, 5, { style });
    const upper = positions(glass).filter((p) => p.y > GROUND_H + 0.5);
    assert.ok(upper.length > 0, `${style}: no upper-floor glass`);
    for (const p of upper) {
      const outside = Math.abs(p.z) >= D / 2 - 1e-6 || Math.abs(p.x) >= W / 2 - 1e-6;
      assert.ok(outside, `${style}: glass vertex inside the core at ${p.toArray()}`);
    }
  }
});

test("a ray from the street into a shop opening travels into the recess", () => {
  // Regression: the core used to be a full-depth box, so the shop bay,
  // shutter and glass all sat inside solid wall and never rendered.
  const parts = buildBuildingParts(W, D, FLOORS, 5, { style: "modern" });
  const shell = new THREE.Mesh(parts.shell, new THREE.MeshBasicMaterial());
  const bays = Math.floor(W / 3.2);
  const bayCx = -W / 2 + W / bays / 2;
  const ray = new THREE.Raycaster(new THREE.Vector3(bayCx, 1.5, D / 2 + 1), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(shell)[0];
  assert.ok(hit, "ray hit nothing");
  assert.ok(Math.abs(hit.distance - (1 + 0.35)) < 1e-3, `first shell hit at ${hit.distance}, expected the recess at 1.35`);

  // Upper floors stay full depth: the same ray a storey up meets the wall face.
  ray.set(new THREE.Vector3(bayCx + 1.2, GROUND_H + 1.6, D / 2 + 1), new THREE.Vector3(0, 0, -1));
  const upper = ray.intersectObject(shell)[0];
  assert.ok(upper && Math.abs(upper.distance - 1) < 1e-3, `upper wall hit at ${upper?.distance}`);
});
