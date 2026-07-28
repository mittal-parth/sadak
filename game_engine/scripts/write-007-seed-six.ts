/**
 * One-off: writes 007_seed_six_districts.sql for the six new TTS∩STT districts.
 * Run from game_engine: npx tsx scripts/write-007-seed-six.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SIX_SEED_DISTRICTS } from "../lib/game/districts-six";
import { SIX_SEED_TASK_PACKS } from "../lib/game/tasks-six";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../supabase/migrations/007_seed_six_districts.sql");

function sqlString(json: unknown): string {
  return `'${JSON.stringify(json).replace(/'/g, "''")}'::jsonb`;
}

const lines: string[] = [
  "-- SADAK: seed six additional districts (TTS∩STT languages).",
  "-- Paste into Supabase SQL editor after 001_worlds_and_progress.sql.",
  "-- Does not modify the original four districts from 002_seed_districts.sql.",
  "",
];

for (const d of SIX_SEED_DISTRICTS) {
  const pack = SIX_SEED_TASK_PACKS.find((p) => p.districtId === d.id);
  if (!pack) {
    throw new Error(`No task pack for district ${d.id}`);
  }
  lines.push("insert into public.districts (id, district, task_pack)");
  lines.push("values (");
  lines.push(`  '${d.id}',`);
  lines.push(`  ${sqlString(d)},`);
  lines.push(`  ${sqlString(pack)}`);
  lines.push(")");
  lines.push("on conflict (id) do update set");
  lines.push("  district = excluded.district,");
  lines.push("  task_pack = excluded.task_pack,");
  lines.push("  updated_at = now();");
  lines.push("");
}

writeFileSync(outPath, lines.join("\n"));
console.log(`Wrote ${outPath} (${SIX_SEED_DISTRICTS.length} districts)`);
