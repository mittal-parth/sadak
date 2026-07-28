/**
 * Writes supabase/migrations/006_improve_lessons.sql from TS source.
 * Run after 001–005 migrations. Regenerate: npx tsx scripts/generate-lesson-patch-migration.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_DISTRICTS } from "../lib/game/districts";
import { SEED_TASK_PACKS } from "../lib/game/tasks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../supabase/migrations/006_improve_lessons.sql");

function sqlString(json: unknown): string {
  return `'${JSON.stringify(json).replace(/'/g, "''")}'::jsonb`;
}

const lines: string[] = [
  "-- SADAK: improve street-errand lesson dialogue (#40 — 3/5/7 steps, causal prompts).",
  "-- Run after 001_worlds_and_progress.sql through 005_plaza_and_nearby_task_positions.sql.",
  "-- Regenerate: npx tsx scripts/generate-lesson-patch-migration.ts",
  "",
];

for (const d of SEED_DISTRICTS) {
  const pack = SEED_TASK_PACKS.find((p) => p.districtId === d.id);
  if (!pack) {
    throw new Error(`No task pack for district ${d.id}`);
  }
  if (pack.districtId !== d.id) {
    throw new Error(`Task pack districtId mismatch for ${d.id}`);
  }
}

const packIds = new Set(SEED_TASK_PACKS.map((p) => p.districtId));
for (const id of packIds) {
  if (!SEED_DISTRICTS.some((d) => d.id === id)) {
    throw new Error(`Task pack ${id} has no matching district in SEED_DISTRICTS`);
  }
}

const rows = [...SEED_DISTRICTS].sort((a, b) => a.id.localeCompare(b.id));

for (const d of rows) {
  const pack = SEED_TASK_PACKS.find((p) => p.districtId === d.id)!;
  lines.push(
    `update public.districts`,
    `set`,
    `  district = ${sqlString(d)},`,
    `  task_pack = ${sqlString(pack)},`,
    `  updated_at = now()`,
    `where id = '${d.id}';`,
    "",
  );
}

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outPath} (${rows.length} districts)`);
