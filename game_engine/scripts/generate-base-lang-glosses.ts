/**
 * Pre-generates base-language glosses for lesson support text.
 *
 * Run from game_engine (requires SARVAM_API_KEY in .env):
 *   npm run generate:base-lang-glosses
 *
 * Idempotent: skips English strings that already have a translation for each target lang.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectEnglishGlossSources } from "../lib/i18n/collect-english-glosses";
import type { LangCode } from "../lib/sarvam";
import { sarvamChat } from "../lib/sarvam";
import type { GlossCatalog } from "../lib/i18n/gloss";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const GLOSS_PATH = join(__dirname, "../lib/i18n/glosses.json");

const TARGET_LANGS: LangCode[] = [
  "hi-IN",
  "bn-IN",
  "ta-IN",
  "te-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "gu-IN",
  "pa-IN",
  "od-IN",
];

const LANG_NAME: Record<LangCode, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "bn-IN": "Bengali",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "kn-IN": "Kannada",
  "ml-IN": "Malayalam",
  "mr-IN": "Marathi",
  "gu-IN": "Gujarati",
  "pa-IN": "Punjabi",
  "od-IN": "Odia",
};

function loadCatalog(): GlossCatalog {
  try {
    return JSON.parse(readFileSync(GLOSS_PATH, "utf8")) as GlossCatalog;
  } catch {
    return {};
  }
}

function saveCatalog(catalog: GlossCatalog) {
  const sorted: GlossCatalog = {};
  for (const key of Object.keys(catalog).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = catalog[key];
  }
  writeFileSync(GLOSS_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

async function translateBatch(
  strings: string[],
  targetLang: LangCode,
): Promise<Record<string, string>> {
  const langName = LANG_NAME[targetLang];
  const numbered = strings.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const content = await sarvamChat(
    [
      {
        role: "system",
        content: `You translate UI and lesson gloss text from English into ${langName}.
Write each translation in ${langName} using its native script only (never Latin transliteration unless the source is already Latin).
Return ONLY valid JSON: an object whose keys are the exact English source strings and values are the ${langName} translations.
Preserve punctuation, emoji, and placeholders like "→". Keep translations concise and natural for learners.`,
      },
      {
        role: "user",
        content: `Translate these English strings to ${langName}:\n\n${numbered}`,
      },
    ],
    {
      temperature: 0.2,
      maxTokens: 2048,
      responseFormat: { type: "json_object" },
      reasoningEffort: null,
    },
  );

  if (!content?.trim()) {
    throw new Error(`Empty translation response for ${targetLang}`);
  }

  const parsed = JSON.parse(content) as Record<string, string>;

  // Model may return numbered keys; remap by index if needed.
  const out: Record<string, string> = {};
  for (let i = 0; i < strings.length; i++) {
    const src = strings[i];
    const direct = parsed[src];
    if (typeof direct === "string" && direct.trim()) {
      out[src] = direct.trim();
      continue;
    }
    const byIndex = parsed[String(i + 1)] ?? parsed[`${i + 1}`];
    if (typeof byIndex === "string" && byIndex.trim()) {
      out[src] = byIndex.trim();
    }
  }
  return out;
}

async function main() {
  const sources = collectEnglishGlossSources();
  const catalog = loadCatalog();
  let added = 0;
  let skipped = 0;
  let failed = 0;

  const onlyLang = process.env.ONLY_LANG as LangCode | undefined;
  const langs = onlyLang
    ? TARGET_LANGS.filter((l) => l === onlyLang)
    : TARGET_LANGS;

  console.log(`Catalog has ${Object.keys(catalog).length} English keys; ${sources.length} sources in game.`);

  const BATCH = 5;

  for (const targetLang of langs) {
    const pending = sources.filter((s) => !catalog[s]?.[targetLang]?.trim());
    if (pending.length === 0) {
      console.log(`[${targetLang}] up to date`);
      continue;
    }

    console.log(`[${targetLang}] translating ${pending.length} strings…`);

    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      try {
        const translated = await translateBatch(batch, targetLang);
        for (const src of batch) {
          const value = translated[src];
          if (!value?.trim()) {
            console.warn(`  missing: ${src.slice(0, 60)}…`);
            failed++;
            continue;
          }
          if (!catalog[src]) catalog[src] = {};
          catalog[src][targetLang] = value;
          added++;
        }
        saveCatalog(catalog);
        console.log(`  batch ${Math.floor(i / BATCH) + 1}: saved`);
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`  batch failed:`, err instanceof Error ? err.message : err);
        failed += batch.length;
      }
    }
  }

  for (const src of sources) {
    for (const lang of TARGET_LANGS) {
      if (catalog[src]?.[lang]?.trim()) skipped++;
    }
  }

  console.log(`Done. Added ${added} entries; skipped existing ${skipped}; failures ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
