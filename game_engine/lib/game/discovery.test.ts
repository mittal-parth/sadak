import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDiscovery } from "./discovery";
import { createLocator } from "./world/mapLabels";
import type { MapData } from "./world/mapData";
import { SEED_DISTRICTS } from "./districts";

const loadMap = (id: string) => JSON.parse(readFileSync(join(__dirname, "../../public/maps", `${id}.json`), "utf8")) as MapData;

test("places are found by going there, once each, and remembered", () => {
  const map = loadMap("hall-bazaar");
  const d = createDiscovery(map);
  assert.equal(d.progress().found, 0);
  assert.ok(d.progress().total >= 5);
  assert.equal(d.claim("Shri Harmandir Sahib"), true);
  assert.equal(d.claim("Shri Harmandir Sahib"), false, "found twice");
  assert.equal(d.claim("Nowhere Street"), false, "not a place");
  assert.deepEqual(d.progress(), { found: 1, total: d.places.length });
  // Kept finds come back; stale ones (a renamed place) are dropped.
  const again = createDiscovery(map, ["Shri Harmandir Sahib", "Gone Chowk"]);
  assert.equal(again.progress().found, 1);
});

test("every place in every district can be found by walking to it", () => {
  for (const dist of SEED_DISTRICTS) {
    const map = loadMap(dist.id);
    const where = createLocator(map);
    const d = createDiscovery(map);
    const missed: string[] = [];
    for (const p of d.places) {
      // Somewhere within 25m of its label, being there counts (not "near").
      let ok = false;
      for (let r = 0; r <= 25 && !ok; r += 2.5) {
        for (let a = 0; a < 16 && !ok; a++) {
          const w = where.locate(p.x + Math.cos((a / 16) * Math.PI * 2) * r, p.z + Math.sin((a / 16) * Math.PI * 2) * r);
          ok = w.place === p.name && !w.near;
        }
      }
      // A tank or a big ground from anywhere round its edge.
      const area = map.areas.find((a) => a.name === p.name);
      for (const [x, z] of area?.pts ?? []) {
        if (ok) break;
        for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const w = where.locate(x + dx, z + dz);
          if (w.place === p.name && !w.near) ok = true;
        }
      }
      if (!ok) missed.push(p.name);
    }
    assert.deepEqual(missed, [], `${dist.id}: places no one can find`);
  }
});
