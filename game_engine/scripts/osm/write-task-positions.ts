/**
 * Moves every street task onto its spot in the compiled district map.
 *
 * Task positions used to be offsets from the old grid's chowk; on the real
 * maps they are absolute map coordinates, taken from the spot the map
 * compiler reserved for the task's kind (the auto stand, the bus stop, the
 * temple gate, the bazaar). This rewrites them in the TypeScript seeds and
 * writes the Supabase migration that does the same to the live rows.
 *
 *   npx tsx scripts/osm/write-task-positions.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_TASK_PACKS } from "../../lib/game/tasks";
import type { MapData } from "../../lib/game/world/mapData";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const MIGRATION = join(ROOT, "supabase/migrations/012_osm_task_positions.sql");
const SEED_FILES = [join(ROOT, "lib/game/tasks.ts"), join(ROOT, "lib/game/tasks-six.ts")];

const r1 = (v: number) => Math.round(v * 10) / 10;

const positions = new Map<string, [number, number]>();
for (const pack of SEED_TASK_PACKS) {
  const map = JSON.parse(readFileSync(join(ROOT, "public/maps", `${pack.districtId}.json`), "utf8")) as MapData;
  for (const t of pack.tasks) {
    const spot = map.spots[t.kind];
    if (!spot) throw new Error(`${pack.districtId}: map has no ${t.kind} spot for ${t.id}`);
    positions.set(t.id, [r1(spot.x), r1(spot.z)]);
  }
}

// TypeScript seeds: replace the `pos` that follows each task id.
for (const file of SEED_FILES) {
  let src = readFileSync(file, "utf8");
  let changed = 0;
  for (const [id, [x, z]] of positions) {
    const at = src.indexOf(`id: "${id}"`);
    if (at < 0) continue;
    const re = /pos: \[[^\]]*\]/y;
    const posAt = src.indexOf("pos: [", at);
    re.lastIndex = posAt;
    if (!re.test(src)) throw new Error(`${file}: no pos after ${id}`);
    src = src.slice(0, posAt) + `pos: [${x}, ${z}]` + src.slice(re.lastIndex);
    changed++;
  }
  writeFileSync(file, src);
  console.log(`${file}: ${changed} task positions`);
}

// Migration: one update per district, patching tasks[].pos by id.
const lines = [
  "-- SADAK: move street tasks onto the OpenStreetMap district maps.",
  "-- Positions are now absolute map coordinates (metres from the map centre,",
  "-- +x east, +z south), from the spots in public/maps/<district>.json.",
  "-- Regenerate: npx tsx scripts/osm/write-task-positions.ts",
  "",
];
for (const pack of SEED_TASK_PACKS) {
  const cases = pack.tasks
    .map((t) => `          when '${t.id}' then jsonb_set(elem, '{pos}', '${JSON.stringify(positions.get(t.id))}'::jsonb)`)
    .join("\n");
  lines.push(
    "update public.districts",
    "set",
    "  task_pack = jsonb_set(",
    "    task_pack,",
    "    '{tasks}',",
    "    (",
    "      select jsonb_agg(",
    "        case elem->>'id'",
    cases,
    "          else elem",
    "        end",
    "        order by ord",
    "      )",
    "      from jsonb_array_elements(task_pack->'tasks') with ordinality as t(elem, ord)",
    "    ),",
    "    true",
    "  ),",
    "  updated_at = now()",
    `where id = '${pack.districtId}';`,
    ""
  );
}
writeFileSync(MIGRATION, lines.join("\n"));
console.log(`Wrote ${MIGRATION} (${positions.size} tasks)`);
