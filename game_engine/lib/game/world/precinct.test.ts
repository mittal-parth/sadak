import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { keyhole } from "../../../scripts/osm/precinct";
import { CollisionWorld } from "./collide";
import { HeightField } from "./height";
import { buildPrecinct, inRing } from "./precinct";
import type { MapData, Pt } from "./mapData";

test("a causeway cut through a tank joins its island to the shore", () => {
  const pool: Pt[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
  const island: Pt[] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
  // From the west shore to the island.
  const water = keyhole(pool, island, [-60, 0], [-6, 0], 6);
  const wet = (x: number, z: number) => inRing(x, z, water);
  assert.equal(wet(-30, 0), false, "the causeway is dry");
  assert.equal(wet(0, 0), false, "the island is dry");
  assert.equal(wet(-30, 5), true, "beside the causeway is water");
  assert.equal(wet(30, 0), true, "beyond the island is water");
  assert.equal(wet(0, 30), true);
  assert.equal(wet(-60, 0), false, "the shore is dry");
});

test("a bridge opens its corridor through water and nothing else", () => {
  const w = new CollisionWorld();
  w.add({ kind: "poly", outer: [[-20, -5], [20, -5], [20, 5], [-20, 5]], holes: [], open: [{ x: 0, z: 0, hw: 3, hd: 8, rot: 0 }] });
  assert.equal(w.blocked(0, 0, 0.55), false, "on the bridge");
  assert.equal(w.blocked(10, 0, 0.55), true, "in the canal");
  assert.equal(w.blocked(3.2, 0, 0.55), true, "off the bridge's edge");
});

test("the Golden Temple's precinct: walls between the gates, open gates, a dry causeway", () => {
  const map = JSON.parse(readFileSync(join(__dirname, "../../../public/maps/hall-bazaar.json"), "utf8")) as MapData;
  const p = map.precinct!;
  assert.ok(p, "Amritsar has its precinct");
  assert.equal(p.gates.filter((g) => g.main).length, 1, "one Darshani Deori");
  assert.ok(p.gates.length >= 4, "gates on every side");
  const w = new CollisionWorld();
  const height = new HeightField(map.half);
  buildPrecinct(p, map.half, w, height);
  for (const g of p.gates) {
    // Through the middle of the gate, from the courtyard side outward.
    for (const out of [-2, 2, 5]) assert.equal(w.blocked(g.x + Math.sin(g.rot) * out, g.z + Math.cos(g.rot) * out, 0.55), false, `gate at ${g.x},${g.z} is shut`);
  }
  // Halfway along the causeway: open, and raised onto its deck.
  const { a, b } = p.causeway;
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  assert.equal(w.blocked(mid[0], mid[1], 0.55), false);
  assert.ok(height.at(mid[0], mid[1]) > 0.1);
  // The ring is walled: arcade stretches and corner bungas besides the
  // gates' piers and the causeway's balustrades.
  assert.ok(w.all.length > p.gates.length * 2 + 2 + 10, `only ${w.all.length} walls`);
});
