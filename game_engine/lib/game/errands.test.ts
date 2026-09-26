import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_DISTRICTS } from "./districts";
import { SEED_TASK_PACKS } from "./tasks";
import { CITY_TRAFFIC } from "./transit";
import { placeLabels } from "./world/mapLabels";
import type { MapData } from "./world/mapData";
import { taskLook } from "../../components/map/mapKit";
import { STREET_TASK_LESSONS } from "./street-task-lessons";

const loadMap = (id: string) => JSON.parse(readFileSync(join(__dirname, "../../public/maps", `${id}.json`), "utf8")) as MapData;
const districtOf = (id: string) => {
  const d = SEED_DISTRICTS.find((x) => x.id === id);
  if (!d) throw new Error(`no district ${id}`);
  return d;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

test("no ride or ticket is to where you already are", () => {
  for (const pack of SEED_TASK_PACKS) {
    const d = districtOf(pack.districtId);
    const places = placeLabels(loadMap(pack.districtId)).map((p) => norm(p.name));
    for (const t of pack.tasks) {
      if (t.kind !== "auto" && t.kind !== "bus" && t.kind !== "counter") continue;
      // Every tier opens with the destination, the same in each.
      const dests = new Set(Object.values(t.lessons).map((steps) => norm(steps[0].prompt.en)));
      assert.equal(dests.size, 1, `${t.id}: the tiers name different destinations`);
      const [dest] = dests;
      assert.ok(!dest.includes(norm(d.name)), `${t.id}: "${dest}" is ${d.name}, the district itself`);
      const here = places.find((p) => p === dest || p.startsWith(`${dest} `));
      assert.equal(here, undefined, `${t.id}: "${dest}" is on the district's own map (${here})`);
    }
  }
});

test("every host in a district has their own name", () => {
  for (const pack of SEED_TASK_PACKS) {
    const names = pack.tasks.map((t) => t.name);
    assert.deepEqual(names, [...new Set(names)], `${pack.districtId}: ${names.join(", ")}`);
  }
});

test("errand icons say what the errand is", () => {
  const look = (id: string) => {
    const pack = SEED_TASK_PACKS.find((p) => p.tasks.some((t) => t.id === id));
    const t = pack?.tasks.find((x) => x.id === id);
    if (!pack || !t) throw new Error(`no task ${id}`);
    return taskLook(t, districtOf(pack.districtId).theme.landmark);
  };
  assert.deepEqual(look("park-gully-auto"), { icon: "taxi", label: "Taxi" });
  assert.deepEqual(look("dadar-chowk-auto"), { icon: "taxi", label: "Taxi" });
  assert.deepEqual(look("purani-sadak-auto"), { icon: "auto", label: "Auto" });
  assert.deepEqual(look("purani-sadak-minaret"), { icon: "mosque", label: "Mosque" });
  assert.deepEqual(look("manek-chowk-masjid"), { icon: "mosque", label: "Mosque" });
  assert.deepEqual(look("park-gully-temple"), { icon: "church", label: "Church" });
  assert.deepEqual(look("fort-kochi-temple"), { icon: "church", label: "Church" });
  assert.deepEqual(look("hall-bazaar-temple"), { icon: "gurdwara", label: "Gurdwara" });
  assert.deepEqual(look("hall-bazaar-langar"), { icon: "langar", label: "Langar" });
  assert.deepEqual(look("purani-sadak-temple"), { icon: "temple", label: "Temple" });
  assert.deepEqual(look("fort-kochi-ferry"), { icon: "ferry", label: "Ferry" });
  assert.deepEqual(look("majestic-cross-metro"), { icon: "train", label: "Metro" });
  assert.deepEqual(look("dadar-chowk-local"), { icon: "train", label: "Train" });
  assert.deepEqual(look("marina-nagar-shop"), { icon: "shop", label: "Shop" });
});

test("Mumbai's island city has taxis, not autos; Kolkata hails the yellow taxi", () => {
  assert.equal(CITY_TRAFFIC.mumbai.noAutos, true);
  assert.equal(CITY_TRAFFIC.mumbai.hire, "taxi");
  assert.equal(CITY_TRAFFIC.kolkata.hire, "taxi");
  assert.equal(CITY_TRAFFIC.kolkata.noAutos, undefined);
  for (const city of ["delhi", "chennai", "bengaluru", "hyderabad", "kochi", "ahmedabad", "amritsar", "bhubaneswar"] as const) {
    assert.equal(CITY_TRAFFIC[city].hire, undefined, city);
    assert.equal(CITY_TRAFFIC[city].noAutos, undefined, city);
  }
});

test("every errand's lesson, the barber's too, runs 3, 5 and 7 steps", () => {
  const want = { easy: 3, medium: 5, hard: 7 } as const;
  const ids = Object.keys(STREET_TASK_LESSONS);
  assert.equal(ids.filter((id) => id.endsWith("-barber")).length, 10);
  for (const id of ids) {
    for (const tier of ["easy", "medium", "hard"] as const) {
      assert.equal(STREET_TASK_LESSONS[id][tier].length, want[tier], `${id} ${tier}`);
    }
  }
});

test("migration 012 stores every seed pack as authored, its barber beside the errands", () => {
  const sql = readFileSync(join(__dirname, "../../supabase/migrations/012_osm_task_packs.sql"), "utf8");
  const stored = new Map(
    [...sql.matchAll(/task_pack = '((?:[^']|'')*)'::jsonb,\s*updated_at = now\(\)\s*where id = '([^']+)';/g)].map((m) => [m[2], JSON.parse(m[1].replace(/''/g, "'"))])
  );
  assert.equal(stored.size, SEED_TASK_PACKS.length);
  for (const pack of SEED_TASK_PACKS) {
    assert.equal(pack.barber.id, `${pack.districtId}-barber`);
    assert.equal(pack.barber.kind, "barber");
    assert.ok(!pack.tasks.some((t) => t.kind === "barber"), `${pack.districtId}: the barber is counted as an errand`);
    assert.deepEqual(stored.get(pack.districtId), JSON.parse(JSON.stringify(pack)), `${pack.districtId}: migration 012 is stale`);
  }
});
