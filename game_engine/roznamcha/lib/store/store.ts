/**
 * Persistent store for Households and VisitRecords.
 *
 * Persists to a JSON file at roznamcha/.data/roznamcha.json so it survives a
 * process restart (dev server reload, `next dev` restart, etc). This is a
 * hackathon-grade store: single JSON file, synchronous fs, in-memory cache
 * with write-through on every mutation. No concurrent-writer story is needed
 * for a single-worker demo.
 *
 * Workstream C owns this file. See roznamcha/CONTRACT.md.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  FieldKey,
  FieldValue,
  Household,
  VisitRecord,
  Extraction,
  LangCode,
} from "../types";
import { REQUIRED_TO_FILE } from "../types";

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

// Resolved from the repo root (process.cwd() when `next dev`/`node` is run
// from the project root, which is how this app is always started) rather
// than __dirname, since __dirname is not available when this file is
// executed directly as an ES module (as the selftest does) and is unreliable
// once bundled by Next's server build.
const DATA_DIR = path.join(process.cwd(), "roznamcha", ".data");
const DATA_FILE = path.join(DATA_DIR, "roznamcha.json");

type DB = {
  households: Record<string, Household>;
  visits: Record<string, VisitRecord>;
};

function emptyDb(): DB {
  return { households: {}, visits: {} };
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load(): DB {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const db = seedDb();
    save(db);
    return db;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DB;
    if (!parsed.households || !parsed.visits) return emptyDb();
    return parsed;
  } catch {
    // Corrupt or empty file: start fresh rather than crashing the process.
    return emptyDb();
  }
}

function save(db: DB): void {
  ensureDataDir();
  // Write to a temp file then rename, so a crash mid-write never leaves a
  // half-written JSON file that corrupts the next `load()`.
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
}

// One process-wide in-memory copy, loaded lazily and lazily on first use so
// that importing this module has no side effects at import time. Every
// mutating call reloads from disk first (cheap for a single JSON file) so
// that concurrent Next.js route handlers sharing a process stay coherent
// even if the module were ever re-evaluated.
let cached: DB | null = null;

function db(): DB {
  if (!cached) cached = load();
  return cached;
}

function persist(): void {
  if (cached) save(cached);
}

/* ------------------------------------------------------------------ *
 * Seed data — 3 households, Karnataka + UP villages, 2-3 members each.
 * Gives a demo prior history to recall on a returning household.
 * ------------------------------------------------------------------ */

function seedDb(): DB {
  const households: Household[] = [
    {
      id: "HH-1001",
      village: "Hosahalli, Mandya Dist., Karnataka",
      members: [
        { name: "Lakshmamma", ageYears: 58, notes: "hypertension, on follow-up" },
        { name: "Ravi Kumar", ageYears: 34 },
        { name: "Chaitra", ageYears: 6 },
      ],
      visitRefs: ["RZ-1001"],
      lastVisitAt: "2026-06-20T05:30:00.000Z",
    },
    {
      id: "HH-1002",
      village: "Bhadrak Purwa, Barabanki Dist., Uttar Pradesh",
      members: [
        { name: "Suman Devi", ageYears: 27, notes: "pregnant, 3rd trimester at last visit" },
        { name: "Rajendra Yadav", ageYears: 31 },
      ],
      visitRefs: ["RZ-1002"],
      lastVisitAt: "2026-07-01T06:15:00.000Z",
    },
    {
      id: "HH-1003",
      village: "Kalasapura, Mysuru Dist., Karnataka",
      members: [
        { name: "Basavaraj", ageYears: 62, notes: "diabetic" },
        { name: "Girija", ageYears: 55 },
        { name: "Manju", ageYears: 19 },
      ],
      visitRefs: [],
      lastVisitAt: null,
    },
  ];

  const visits: VisitRecord[] = [
    {
      ref: "RZ-1001",
      householdId: "HH-1001",
      workerId: "ASHA-07",
      language: "kn-IN",
      startedAt: "2026-06-20T05:00:00.000Z",
      filedAt: "2026-06-20T05:30:00.000Z",
      status: "filed",
      fields: {
        memberName: {
          value: "Lakshmamma",
          confidence: "high",
          provenance: { at: "2026-06-20T05:05:00.000Z", heard: "Lakshmamma amma ge check up", via: "spoken" },
        },
        ageYears: {
          value: 58,
          confidence: "high",
          provenance: { at: "2026-06-20T05:05:00.000Z", heard: "avaru ainvattu entu varsha", via: "spoken" },
        },
        visitReason: {
          value: "BP follow-up",
          confidence: "high",
          provenance: { at: "2026-06-20T05:06:00.000Z", heard: "BP check madbeku antha bandidini", via: "spoken" },
        },
        bpSystolic: {
          value: 148,
          confidence: "high",
          provenance: { at: "2026-06-20T05:10:00.000Z", heard: "BP nooru nalvattu entu", via: "spoken" },
        },
        bpDiastolic: {
          value: 92,
          confidence: "high",
          provenance: { at: "2026-06-20T05:10:00.000Z", heard: "diastolic tonbattu eradu", via: "spoken" },
        },
        followUpDate: {
          value: "2026-07-20",
          confidence: "high",
          provenance: { at: "2026-06-20T05:25:00.000Z", heard: "next month idey date ge banni", via: "spoken" },
        },
      },
      corrections: [],
    },
    {
      ref: "RZ-1002",
      householdId: "HH-1002",
      workerId: "ASHA-07",
      language: "hi-IN",
      startedAt: "2026-07-01T06:00:00.000Z",
      filedAt: "2026-07-01T06:15:00.000Z",
      status: "filed",
      fields: {
        memberName: {
          value: "Suman Devi",
          confidence: "high",
          provenance: { at: "2026-07-01T06:02:00.000Z", heard: "Suman Devi ka checkup karne aayi hoon", via: "spoken" },
        },
        pregnancyMonths: {
          value: 7,
          confidence: "high",
          provenance: { at: "2026-07-01T06:04:00.000Z", heard: "saat mahine ki pregnancy hai", via: "spoken" },
        },
        weightKg: {
          value: 58,
          confidence: "high",
          provenance: { at: "2026-07-01T06:06:00.000Z", heard: "wazan atthawan kilo hai", via: "spoken" },
        },
        visitReason: {
          value: "Antenatal checkup",
          confidence: "high",
          provenance: { at: "2026-07-01T06:07:00.000Z", heard: "antenatal checkup ke liye aayi", via: "spoken" },
        },
        referredTo: {
          value: "PHC Barabanki",
          confidence: "high",
          provenance: { at: "2026-07-01T06:10:00.000Z", heard: "PHC Barabanki bhej rahi hoon", via: "spoken" },
        },
        followUpDate: {
          value: "2026-08-01",
          confidence: "high",
          provenance: { at: "2026-07-01T06:12:00.000Z", heard: "agle mahine ki ek taarikh ko phir aana", via: "spoken" },
        },
      },
      corrections: [],
    },
  ];

  const householdsMap: Record<string, Household> = {};
  for (const h of households) householdsMap[h.id] = h;
  const visitsMap: Record<string, VisitRecord> = {};
  for (const v of visits) visitsMap[v.ref] = v;

  return { households: householdsMap, visits: visitsMap };
}

/* ------------------------------------------------------------------ *
 * ID generation
 * ------------------------------------------------------------------ */

function nextVisitRef(): string {
  const d = db();
  let n = 1002 + Object.keys(d.visits).length;
  let ref = `RZ-${n}`;
  // Guard against collisions if visits were deleted/re-seeded oddly.
  while (d.visits[ref]) {
    n += 1;
    ref = `RZ-${n}`;
  }
  return ref;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function getHousehold(id: string): Household | null {
  return db().households[id] ?? null;
}

export function upsertHousehold(h: Household): Household {
  const d = db();
  d.households[h.id] = h;
  persist();
  return h;
}

export function listHouseholds(): Household[] {
  return Object.values(db().households);
}

export function createVisit(
  householdId: string,
  workerId: string,
  language: LangCode
): VisitRecord {
  const d = db();
  const household = d.households[householdId];
  if (!household) {
    throw new Error(`Unknown household: ${householdId}`);
  }

  const ref = nextVisitRef();
  const now = new Date().toISOString();

  const record: VisitRecord = {
    ref,
    householdId,
    workerId,
    language,
    startedAt: now,
    filedAt: null,
    status: "draft",
    fields: {},
    corrections: [],
  };

  d.visits[ref] = record;
  household.visitRefs.unshift(ref);
  persist();
  return record;
}

export function getVisit(ref: string): VisitRecord | null {
  return db().visits[ref] ?? null;
}

export function listVisits(householdId: string): VisitRecord[] {
  const d = db();
  return Object.values(d.visits)
    .filter((v) => v.householdId === householdId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/**
 * Applies one extraction turn to a record.
 *
 * Rules (see CONTRACT.md / task brief):
 *  - `set` fields with no existing value become new fields, provenance
 *    "spoken".
 *  - `set` fields that already have a value but are re-sent by the model
 *    under `set` (not `corrected`) are treated as a no-op reaffirmation if
 *    the value is unchanged, or promoted to a correction if the value
 *    actually differs — a model can't always tell "new" from "correction",
 *    the store is the source of truth for that.
 *  - `corrected` fields always record provenance.via = "correction",
 *    provenance.replaced = old value, and append one entry to
 *    `corrections[]`.
 *  - Idempotency: replaying the exact same (field, heardUtterance, newValue)
 *    tuple does not append a second correction — if the field's current
 *    value already equals the requested new value AND the last correction
 *    for that field was produced by the same heard utterance, it's a no-op.
 */
export function applyExtraction(
  ref: string,
  extraction: Extraction,
  heardUtterance: string,
  /**
   * Stable id for the conversational turn. Supplying it makes replay
   * idempotent even when the transcript differs, which matters because the
   * same audio rarely re-transcribes byte-identically.
   */
  turnId?: string
): VisitRecord {
  const d = db();
  const record = d.visits[ref];
  if (!record) {
    throw new Error(`Unknown visit ref: ${ref}`);
  }

  const now = new Date().toISOString();

  /**
   * A patient's name is the one field where a wrong overwrite is genuinely
   * unsafe, and it is also the one the model most likes to clobber with a
   * symptom phrase ("sakkare kayile" is Kannada for diabetes, not a person).
   *
   * The household roster is the authority. If we already hold a name and the
   * incoming one matches nobody on the roster, we refuse the write rather than
   * corrupt the record. Prompting alone was not reliable enough here.
   */
  const nameIsPlausible = (incoming: string): boolean => {
    const hh = d.households[record.householdId];
    if (!hh) return true; // no roster to check against; allow it
    const norm = (x: string) => x.toLowerCase().replace(/[^a-zऀ-ൿ]/g, "");
    const target = norm(incoming);
    if (!target) return false;
    return hh.members.some((m) => {
      const known = norm(m.name);
      return known.includes(target) || target.includes(known);
    });
  };

  const applyOne = (
    field: FieldKey,
    value: string | number,
    confidence: "high" | "low",
    forceCorrection: boolean
  ) => {
    const existing = record.fields[field];

    if (
      field === "memberName" &&
      existing?.value &&
      typeof value === "string" &&
      !nameIsPlausible(value)
    ) {
      // Refused: keep the name we have. Nothing is logged as a correction,
      // because no correction happened.
      //
      // Salvage rather than discard. A phrase the model mistook for a name is
      // almost always the reason for the visit ("sakkare kayile pariksheg
      // bandidru" = came for a diabetes check), so if we have no reason yet,
      // that is where it belongs. Flagged low-confidence, and visitReason is
      // free text, so a wrong guess here is visible and harmless, unlike a
      // corrupted patient name.
      if (!record.fields.visitReason?.value) {
        record.fields.visitReason = {
          value,
          confidence: "low",
          provenance: { at: now, heard: heardUtterance, via: "spoken" },
        };
      }
      return;
    }

    const hasExisting = existing != null && existing.value !== null && existing.value !== undefined;

    if (!hasExisting) {
      // New field. Even if the model mislabeled it as "corrected", there is
      // nothing to replace, so it is spoken, not a correction.
      record.fields[field] = {
        value,
        confidence,
        provenance: { at: now, heard: heardUtterance, via: "spoken" },
      };
      return;
    }

    if (existing!.value === value) {
      // Same value already on file. Whether the model called this "set" or
      // "corrected", nothing actually changed — do not create a phantom
      // correction. This is what makes replaying the same utterance twice
      // idempotent.
      return;
    }

    if (!forceCorrection) {
      // Model reported this under `set`, not `corrected`, but the value
      // differs from what's on file. Treat it as an implicit correction
      // rather than silently overwriting — we never lose the old value
      // without a trail.
      forceCorrection = true;
    }

    // Idempotency guard. Prefer the turn id: the same audio rarely
    // re-transcribes byte-identically, so matching on the transcript alone
    // lets a retried turn register as a second, phantom correction. Fall back
    // to the transcript only when no turn id was supplied.
    const lastForField = [...record.corrections]
      .reverse()
      .find((c) => c.field === field);

    const isDuplicateReplay = turnId
      ? record.corrections.some((c) => c.field === field && c.turnId === turnId)
      : !!(
          lastForField &&
          lastForField.to === value &&
          lastForField.from === existing!.value &&
          lastForField.heard === heardUtterance
        );

    const oldValue = existing!.value;

    record.fields[field] = {
      value,
      confidence,
      provenance: { at: now, heard: heardUtterance, via: "correction", replaced: oldValue },
    };

    if (!isDuplicateReplay) {
      record.corrections.push({
        field,
        from: oldValue,
        to: value,
        at: now,
        heard: heardUtterance,
        ...(turnId ? { turnId } : {}),
      });
    }
  };

  for (const item of extraction.set ?? []) {
    applyOne(item.field, item.value, item.confidence, false);
  }
  for (const item of extraction.corrected ?? []) {
    applyOne(item.field, item.value, "high", true);
  }

  persist();
  return record;
}

export type FileVisitResult =
  | { ok: true; record: VisitRecord; summary: string }
  | { ok: false; missing: FieldKey[] };

export function fileVisit(ref: string): FileVisitResult {
  const d = db();
  const record = d.visits[ref];
  if (!record) {
    throw new Error(`Unknown visit ref: ${ref}`);
  }

  const missing = REQUIRED_TO_FILE.filter((f) => {
    const fv = record.fields[f];
    return !fv || fv.value === null || fv.value === undefined || fv.value === "";
  });

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  if (record.status !== "filed") {
    record.status = "filed";
    record.filedAt = new Date().toISOString();

    const household = d.households[record.householdId];
    if (household) {
      household.visitRefs = [record.ref, ...household.visitRefs.filter((r) => r !== record.ref)];
      household.lastVisitAt = record.filedAt;
    }

    persist();
  }

  return { ok: true, record, summary: buildSummary(record) };
}

function fieldText(record: VisitRecord, field: FieldKey): string | null {
  const fv = record.fields[field];
  if (!fv || fv.value === null || fv.value === undefined || fv.value === "") return null;
  return String(fv.value);
}

export function buildSummary(record: VisitRecord): string {
  const d = db();
  const household = d.households[record.householdId];
  const lines: string[] = [];

  lines.push(`Roznamcha visit ${record.ref}`);
  if (household) lines.push(`Household: ${household.id} (${household.village})`);

  const member = fieldText(record, "memberName");
  const age = fieldText(record, "ageYears");
  if (member) lines.push(`Member: ${member}${age ? `, age ${age}` : ""}`);

  const reason = fieldText(record, "visitReason");
  if (reason) lines.push(`Reason for visit: ${reason}`);

  const weight = fieldText(record, "weightKg");
  if (weight) lines.push(`Weight: ${weight} kg`);

  const sys = fieldText(record, "bpSystolic");
  const dia = fieldText(record, "bpDiastolic");
  if (sys || dia) lines.push(`BP: ${sys ?? "?"}/${dia ?? "?"}`);

  const preg = fieldText(record, "pregnancyMonths");
  if (preg) lines.push(`Pregnancy: ${preg} months`);

  const meds = fieldText(record, "medicinesGiven");
  if (meds) lines.push(`Medicines given: ${meds}`);

  const referred = fieldText(record, "referredTo");
  if (referred) lines.push(`Referred to: ${referred}`);

  const followUp = fieldText(record, "followUpDate");
  if (followUp) lines.push(`Follow-up date: ${followUp}`);

  const notes = fieldText(record, "notes");
  if (notes) lines.push(`Notes: ${notes}`);

  if (record.corrections.length > 0) {
    lines.push("");
    lines.push(`Corrections made during this visit (${record.corrections.length}):`);
    for (const c of record.corrections) {
      lines.push(`  - ${c.field}: "${c.from ?? "(empty)"}" -> "${c.to}"`);
    }
  }

  lines.push("");
  lines.push(`Status: ${record.status}${record.filedAt ? ` at ${record.filedAt}` : ""}`);

  return lines.join("\n");
}

/**
 * Test-only escape hatch: drop the in-memory cache so the next call to any
 * store function re-reads from disk. Used by selftest.mjs to simulate a
 * process restart without actually spawning a new process.
 */
export function __resetCacheForTest(): void {
  cached = null;
}

/** Test-only: wipe the persisted file and reseed. */
export function __wipeForTest(): void {
  const fresh = seedDb();
  cached = fresh;
  save(fresh);
}
