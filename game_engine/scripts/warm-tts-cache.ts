/**
 * Pre-generates static lesson NPC TTS in Supabase Storage (all languages / tasks).
 *
 * Run from game_engine (requires SARVAM_API_KEY + SUPABASE_SECRET_KEY in .env):
 *   npm run warm-tts-cache
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sarvamTTS } from "../lib/sarvam";
import { createAdminSupabaseClient } from "../lib/supabase/admin";
import { collectAllLessonTtsEntries } from "../lib/tts/entries";
import {
  TTS_BUCKET,
  publicTtsUrl,
  ttsObjectExists,
  ttsObjectPath,
} from "../lib/tts/cache";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

function dataUrlToBuffer(dataUrl: string): Buffer {
  const prefix = "data:audio/wav;base64,";
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("Unexpected TTS response format (expected wav data URL).");
  }
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

async function main() {
  const supabase = createAdminSupabaseClient();
  const entries = collectAllLessonTtsEntries();

  const byLang = new Map<string, number>();
  let created = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Warming ${entries.length} unique lesson NPC lines…`);

  for (const entry of entries) {
    byLang.set(entry.lang, (byLang.get(entry.lang) ?? 0) + 1);

    const publicUrl = publicTtsUrl(entry.lang, entry.speaker, entry.text);
    if (await ttsObjectExists(publicUrl)) {
      skipped++;
      continue;
    }

    const dataUrl = await sarvamTTS(entry.text, entry.lang, entry.speaker);
    if (!dataUrl) {
      console.error(`TTS failed: [${entry.lang}] ${entry.text.slice(0, 40)}…`);
      failed++;
      continue;
    }

    const path = ttsObjectPath(entry.lang, entry.speaker, entry.text);
    const { error } = await supabase.storage
      .from(TTS_BUCKET)
      .upload(path, dataUrlToBuffer(dataUrl), {
        contentType: "audio/wav",
        upsert: false,
      });

    if (error) {
      console.error(`Upload failed (${path}):`, error.message);
      failed++;
      continue;
    }

    created++;
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log("\n\nPer language (unique lines queued):");
  for (const [lang, count] of [...byLang.entries()].sort()) {
    console.log(`  ${lang}: ${count}`);
  }
  console.log(`\nCreated: ${created}, skipped (exists): ${skipped}, failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
