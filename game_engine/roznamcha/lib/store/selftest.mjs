#!/usr/bin/env node
/**
 * Self-test for the Roznamcha store + extraction pipeline. Runs against the
 * LIVE Sarvam API (no mocks) and outside the browser/Next dev server, per
 * the workstream-C brief.
 *
 * Usage (from repo root, so relative paths and .env resolve correctly):
 *   node roznamcha/lib/store/selftest.mjs
 *
 * Proves:
 *   (a) a messy Hindi utterance sets several fields correctly
 *   (b) a follow-up correction produces exactly one corrections[] entry with
 *       the right from/to, and replaying it does not create a second one
 *   (c) the store survives a process restart (spawns a fresh `node` child)
 *   (d) filing validates REQUIRED_TO_FILE before marking a record filed
 */

import { register } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
process.chdir(repoRoot); // store.ts resolves its data dir off process.cwd()

// --- load SARVAM_API_KEY etc from repo-root .env (no dotenv dependency) ---
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.join(repoRoot, ".env"));

if (!process.env.SARVAM_API_KEY) {
  console.error("FAIL: SARVAM_API_KEY not set (checked repo-root .env). Cannot run live tests.");
  process.exit(1);
}

register("./ts-loader.mjs", import.meta.url);

const store = await import("./store.ts");
const { sarvamChat } = await import("@/lib/sarvam.ts");
const { buildExtractionPrompt, parseExtraction } = await import("./extract.ts");

let passCount = 0;
let failCount = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (ok) {
    passCount++;
    console.log(`PASS (${name})${detail ? ": " + detail : ""}`);
  } else {
    failCount++;
    console.log(`FAIL (${name})${detail ? ": " + detail : ""}`);
  }
}

async function extractOnce(ref, utterance, language) {
  const before = store.getVisit(ref);
  const { system, user } = buildExtractionPrompt(before, utterance, language);
  const raw = await sarvamChat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.2, maxTokens: 500, responseFormat: { type: "json_object" }, reasoningEffort: null }
  );
  let extraction;
  try {
    extraction = parseExtraction(raw);
  } catch (err) {
    throw new Error(`could not parse model JSON: ${err.message}\nraw: ${raw}`);
  }
  const after = store.applyExtraction(ref, extraction, utterance);
  return { extraction, record: after, raw };
}

console.log("=== Roznamcha store + extraction self-test ===");
console.log(`repo root: ${repoRoot}`);

// Fresh, known state for this run: wipe to the seeded 3 households so
// re-running the self-test repeatedly is deterministic.
store.__wipeForTest();

/* ------------------------------------------------------------------ *
 * (a) messy Hindi utterance sets several fields correctly
 * ------------------------------------------------------------------ */
let refA;
try {
  const visit = store.createVisit("HH-1003", "ASHA-07", "hi-IN");
  refA = visit.ref;

  const utterance =
    "Basavaraj ji ka checkup karne aayi hoon, unki umar baasath saal hai, sugar ki jaanch ke liye aaye the, wazan pachattar kilo hai";
  const { record: after } = await extractOnce(refA, utterance, "hi-IN");

  const name = after.fields.memberName?.value;
  const age = after.fields.ageYears?.value;
  const weight = after.fields.weightKg?.value;
  const reason = after.fields.visitReason?.value;

  const nameOk = typeof name === "string" && /basavaraj/i.test(name);
  const ageOk = age === 62;
  const weightOk = weight === 75;
  const reasonOk = typeof reason === "string" && reason.length > 0;

  const allOk = nameOk && ageOk && weightOk && reasonOk;
  record(
    "a: messy Hindi utterance sets multiple fields",
    allOk,
    `memberName=${JSON.stringify(name)} ageYears=${age} weightKg=${weight} visitReason=${JSON.stringify(reason)}`
  );
  if (!allOk) {
    console.log("  (full record for debugging)", JSON.stringify(after.fields, null, 2));
  }
} catch (err) {
  record("a: messy Hindi utterance sets multiple fields", false, err.message);
}

/* ------------------------------------------------------------------ *
 * (b) a follow-up correction produces exactly one corrections[] entry,
 *     and replaying the SAME correction utterance again does not add a
 *     second one (idempotency).
 * ------------------------------------------------------------------ */
let refB;
try {
  refB = refA ?? store.createVisit("HH-1003", "ASHA-07", "hi-IN").ref;
  const before = store.getVisit(refB);
  const priorAge = before.fields.ageYears?.value;

  const correction = "maine baasath nahi bola, unki umar pacchees... nahi, painsath saal hai";
  const { record: afterCorrection } = await extractOnce(refB, correction, "hi-IN");

  const newCorrections = afterCorrection.corrections.filter((c) => c.field === "ageYears");
  const one = newCorrections.length === 1;
  const c = newCorrections[0];
  const fromOk = one && c.from === priorAge;
  const toOk = one && c.to === 65;

  record(
    "b1: correction produces exactly one corrections[] entry with right from/to",
    one && fromOk && toOk,
    one ? `corrections.length=${newCorrections.length} from=${c.from} to=${c.to} (expected from=${priorAge}, to=65)` : `corrections.length=${newCorrections.length}`
  );

  // Idempotency: replay the exact same utterance again.
  const { record: replayed } = await extractOnce(refB, correction, "hi-IN");
  const replayedCorrections = replayed.corrections.filter((c) => c.field === "ageYears");
  record(
    "b2: replaying the same correction utterance is idempotent (no duplicate entry)",
    replayedCorrections.length === newCorrections.length,
    `corrections.length after replay=${replayedCorrections.length} (expected ${newCorrections.length})`
  );
} catch (err) {
  record("b: correction + idempotency", false, err.message);
}

/* ------------------------------------------------------------------ *
 * (c) store survives a process restart
 * ------------------------------------------------------------------ */
try {
  const checkScript = `
    import { register } from "node:module";
    register("./ts-loader.mjs", import.meta.url);
    const store = await import("./store.ts");
    const rec = store.getVisit(${JSON.stringify(refB ?? refA)});
    if (!rec) { console.log("MISSING"); process.exit(1); }
    console.log(JSON.stringify({
      memberName: rec.fields.memberName?.value ?? null,
      ageYears: rec.fields.ageYears?.value ?? null,
      correctionsCount: rec.corrections.length,
    }));
  `;
  const tmpScriptPath = path.join(here, "_selftest_restart_check.mjs");
  fs.writeFileSync(tmpScriptPath, checkScript, "utf-8");
  const res = spawnSync(process.execPath, [tmpScriptPath], { cwd: repoRoot, encoding: "utf-8" });
  fs.unlinkSync(tmpScriptPath);

  if (res.status !== 0) {
    record("c: store survives a process restart", false, `child exited ${res.status}: ${res.stderr}`);
  } else {
    const parsed = JSON.parse(res.stdout.trim());
    const before = store.getVisit(refB ?? refA);
    const ok =
      parsed.memberName === (before.fields.memberName?.value ?? null) &&
      parsed.ageYears === (before.fields.ageYears?.value ?? null) &&
      parsed.correctionsCount === before.corrections.length;
    record(
      "c: store survives a process restart",
      ok,
      `fresh process read memberName=${JSON.stringify(parsed.memberName)} ageYears=${parsed.ageYears} correctionsCount=${parsed.correctionsCount}`
    );
  }
} catch (err) {
  record("c: store survives a process restart", false, err.message);
}

/* ------------------------------------------------------------------ *
 * (d) filing validates required fields
 * ------------------------------------------------------------------ */
try {
  const bare = store.createVisit("HH-1003", "ASHA-07", "kn-IN");
  const attempt1 = store.fileVisit(bare.ref);
  const rejectsIncomplete = attempt1.ok === false && Array.isArray(attempt1.missing) && attempt1.missing.length > 0;
  record(
    "d1: filing an incomplete record is rejected with missing fields listed",
    rejectsIncomplete,
    rejectsIncomplete ? `missing=${JSON.stringify(attempt1.missing)}` : JSON.stringify(attempt1)
  );

  // Now fill REQUIRED_TO_FILE (memberName, visitReason, followUpDate) directly
  // via applyExtraction-style set, then file should succeed.
  const fillExtraction = {
    set: [
      { field: "memberName", value: "Girija", confidence: "high" },
      { field: "visitReason", value: "General checkup", confidence: "high" },
      { field: "followUpDate", value: "2026-09-01", confidence: "high" },
    ],
    corrected: [],
    nextQuestion: null,
    readyToFile: true,
    clinicalQuestion: null,
  };
  store.applyExtraction(bare.ref, fillExtraction, "(test fixture, not model output)");
  const attempt2 = store.fileVisit(bare.ref);
  const filedOk = attempt2.ok === true && attempt2.record.status === "filed" && typeof attempt2.summary === "string" && attempt2.summary.length > 0;
  record(
    "d2: filing a complete record succeeds and returns a summary",
    filedOk,
    filedOk ? `status=${attempt2.record.status} summary.length=${attempt2.summary.length}` : JSON.stringify(attempt2)
  );

  // Household should now link the new ref.
  const household = store.getHousehold("HH-1003");
  const linked = household.visitRefs.includes(bare.ref);
  record("d3: filed visit ref is linked onto the household", linked, `household.visitRefs=${JSON.stringify(household.visitRefs)}`);
} catch (err) {
  record("d: filing validation", false, err.message);
}

console.log("\n=== summary ===");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
}
console.log(`\n${passCount} passed, ${failCount} failed`);

process.exit(failCount > 0 ? 1 : 0);
