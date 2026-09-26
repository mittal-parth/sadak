import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapData } from "./mapData";
import { createLocator, placeLabels, roadLabels } from "./mapLabels";

const loadMap = (id: string) => JSON.parse(readFileSync(join(__dirname, "../../../public/maps", `${id}.json`), "utf8")) as MapData;

test("road labels sit on their road, upright, one per stretch", () => {
  const map = loadMap("purani-sadak");
  const labels = roadLabels(map);
  assert.ok(labels.length > 20, `${labels.length} road labels`);
  for (const l of labels) {
    assert.ok(l.angle > -Math.PI / 2 - 1e-9 && l.angle <= Math.PI / 2 + 1e-9, `${l.name} upside down`);
    const onIt = map.roads.some(
      (r) => r.name === l.name && r.pts.some((p, i) => i > 0 && distToSeg([l.x, l.z], r.pts[i - 1], p) < 0.5)
    );
    assert.ok(onIt, `${l.name} label is off its road`);
  }
  // Chandni Chowk runs the length of the map: labelled more than once, apart.
  const cc = labels.filter((l) => l.name === "Chandni Chowk");
  assert.ok(cc.length >= 2, `Chandni Chowk labelled ${cc.length} times`);
  for (let i = 1; i < cc.length; i++) assert.ok(Math.hypot(cc[i].x - cc[0].x, cc[i].z - cc[0].z) >= 120);
  // Major roads come first, for drawing when space is short.
  for (let i = 1; i < labels.length; i++) assert.ok(labels[i - 1].rank >= labels[i].rank);
});

test("places: landmarks, named parks and markets, stations, each once", () => {
  const places = placeLabels(loadMap("dadar-chowk"));
  const names = places.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, "a place labelled twice");
  for (const n of ["Kabutar Khana", "Plaza Cinema"]) assert.ok(names.includes(n), `no ${n}`);
  assert.ok(places.some((p) => p.kind === "station"), "no station");
});

test("the locator knows the street you are on and the place you are at", () => {
  const map = loadMap("purani-sadak");
  const where = createLocator(map);
  // At the spawn: across Chandni Chowk from the Gauri Shankar temple.
  const here = where.locate(map.spawn.x, map.spawn.z);
  assert.equal(here.road, "Chandni Chowk");
  // On the steps of the Jama Masjid.
  const jm = map.landmarks.find((l) => l.name === "Jama Masjid")!;
  assert.equal(where.locate(jm.x, jm.z).place, "Jama Masjid");
  // Mid-block, away from any named street or place.
  const plot = map.plots.find((p) => !p.front && where.locate(p.x, p.z).road === null);
  assert.ok(plot, "every plot is on a named street");
  // Every point along a long straight stretch finds it, not just its ends.
  const long = map.roads.filter((r) => r.name && r.cls !== "footway").sort((a, b) => b.pts.length - a.pts.length)[0];
  for (let i = 0; i < long.pts.length - 1; i++) {
    const [ax, az] = long.pts[i];
    const [bx, bz] = long.pts[i + 1];
    assert.equal(where.locate((ax + bx) / 2, (az + bz) / 2).road !== null, true, "lost the road mid-segment");
  }
});

function distToSeg(p: [number, number], a: [number, number], b: [number, number]) {
  const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2));
  return Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1]));
}
