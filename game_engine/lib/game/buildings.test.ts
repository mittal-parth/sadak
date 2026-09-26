import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildBuildingParts, KIND_OF_TRADE } from "./buildings";
import { SHOP_SIGNS, SIGN_TRADES, type SignTrade, type UvRect } from "./signage";

const W = 9;
const D = 12;
const FLOORS = 3;
const GROUND_H = 4.2;

const atlas = {
  cells: 4,
  rect(i: number): UvRect {
    return [(i % 2) / 2, Math.floor(i / 2) / 2, (i % 2) / 2 + 0.5, Math.floor(i / 2) / 2 + 0.5];
  },
  trade(i: number): SignTrade {
    return SIGN_TRADES[i % SIGN_TRADES.length];
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

test("a named shop gets its own board over the middle bay, and nothing else changes", () => {
  const named: UvRect = [0.9, 0.9, 1, 1];
  const plain = buildBuildingParts(W, D, FLOORS, 23, { style: "colonial", signs: atlas, frontOnly: true });
  const withName = buildBuildingParts(W, D, FLOORS, 23, { style: "colonial", signs: atlas, frontOnly: true, named });
  const faces = (g: THREE.BufferGeometry) => {
    const uv = g.attributes.uv;
    const out: { u: number; v: number; x: number }[] = [];
    for (let q = 0; q < uv.count; q += 4) out.push({ u: uv.getX(q), v: uv.getY(q), x: g.attributes.position.getX(q) });
    return out;
  };
  const a = faces(plain.signs);
  const b = faces(withName.signs);
  assert.equal(a.length, b.length, "same number of boards");
  const changed = b.filter((f, i) => f.u !== a[i].u || f.v !== a[i].v);
  assert.equal(changed.length, 1, "exactly one board relettered");
  assert.ok(changed[0].u >= 0.9 - 1e-6 && changed[0].v >= 0.9 - 1e-6, "with the named cell");
  // Everything else is the same building (its stock may change: a real
  // shop's does not follow the generic board it replaced).
  for (const k of ["body", "glass"] as const) {
    const pa = (plain as unknown as Record<string, THREE.BufferGeometry>)[k];
    const pb = (withName as unknown as Record<string, THREE.BufferGeometry>)[k];
    if (!pa?.attributes?.position) continue;
    assert.deepEqual(Array.from(pb.attributes.position.array), Array.from(pa.attributes.position.array), `${k} moved`);
  }
});

test("a shop's stock follows its board: every language's boards run in the same trades", () => {
  // SIGN_TRADES reads a board's trade from its place in the list, so every
  // language must list the same eight trades in the same order.
  const expect = ["grocer|provision|kirana|daily", "chemist|pharmacy|medical|24", "sweet|ghee", "tea|chai", "tailor|ladies", "restaurant|hotel|dhaba|veg", "mobile|recharge", "bakery|fresh"];
  for (const [lang, signs] of Object.entries(SHOP_SIGNS)) {
    assert.equal(signs.length, SIGN_TRADES.length, lang);
    signs.forEach((sg, i) => assert.match(sg.en, new RegExp(expect[i], "i"), `${lang}: board ${i} (${sg.en}) is not a ${SIGN_TRADES[i]}`));
  }
  assert.equal(KIND_OF_TRADE.tailor, "cloth");
  assert.equal(KIND_OF_TRADE.grocer, "grocer");
  assert.equal(KIND_OF_TRADE.sweets, "sweets");
  // A tailor's street and a grocer's street stock their shops differently.
  const street = (trade: SignTrade) =>
    buildBuildingParts(W, D, FLOORS, 5, { style: "colonial", signs: { ...atlas, trade: () => trade } }).decor.attributes.position.count;
  assert.notEqual(street("tailor"), street("grocer"));
});
