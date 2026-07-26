/**
 * ROZNAMCHA shared contract. Every workstream imports from here.
 * Do not redefine any of these locally. See roznamcha/CONTRACT.md.
 */

export type LangCode = "hi-IN" | "kn-IN" | "ta-IN" | "bn-IN" | "mr-IN" | "en-IN";

/* ------------------------------------------------------------------ *
 * Wire protocol: browser <-> relay
 * ------------------------------------------------------------------ */

/**
 * What kind of moment the agent is speaking into. The relay maps this to
 * Bulbul's `pace`, so the speed is chosen by meaning rather than by callers
 * passing raw numbers around. Reading numbers back needs to be slower than
 * confirming "theek hai".
 */
export type Moment =
  | "readback"   // reading captured values back for verification: slow, careful
  | "question"   // asking for one missing field: normal
  | "confirm"    // short acknowledgement: brisk
  | "correction" // acknowledging a fix: slightly slow, deliberate
  | "decline";   // refusing a clinical question: calm, unhurried

export type ClientMsg =
  | { t: "start"; language: LangCode; sampleRate: 16000 }
  | { t: "audio"; b64: string }
  | { t: "stop" }
  | { t: "say"; text: string; speaker: string; language: LangCode; moment?: Moment }
  | { t: "shutup" };

export type ServerMsg =
  | { t: "ready" }
  | { t: "speech_start" }
  | { t: "speech_end" }
  | { t: "partial"; text: string }
  | { t: "final"; text: string }
  | { t: "tts_chunk"; b64: string; codec: string; sampleRate: number }
  | { t: "tts_done" }
  | { t: "error"; message: string };

/* ------------------------------------------------------------------ *
 * Domain
 * ------------------------------------------------------------------ */

/** A field the agent can capture, correct, and read back. */
export type FieldKey =
  | "householdId"
  | "memberName"
  | "ageYears"
  | "visitReason"
  | "weightKg"
  | "bpSystolic"
  | "bpDiastolic"
  | "pregnancyMonths"
  | "medicinesGiven"
  | "referredTo"
  | "followUpDate"
  | "notes";

export const FIELD_LABELS: Record<FieldKey, string> = {
  householdId: "Household",
  memberName: "Member",
  ageYears: "Age",
  visitReason: "Reason for visit",
  weightKg: "Weight (kg)",
  bpSystolic: "BP systolic",
  bpDiastolic: "BP diastolic",
  pregnancyMonths: "Pregnancy (months)",
  medicinesGiven: "Medicines given",
  referredTo: "Referred to",
  followUpDate: "Follow-up date",
  notes: "Notes",
};

/** Every value carries where it came from, so corrections are auditable. */
export type Provenance = {
  /** ISO timestamp. */
  at: string;
  /** Verbatim utterance the value was taken from. */
  heard: string;
  /** How it arrived. */
  via: "spoken" | "correction" | "carried-forward" | "manual";
  /** Present only on corrections: what it used to be. */
  replaced?: string | number | null;
};

export type FieldValue = {
  value: string | number | null;
  confidence: "high" | "low";
  provenance: Provenance;
};

export type VisitRecord = {
  /** Reference ID shown to the worker, e.g. "RZ-4821". */
  ref: string;
  householdId: string;
  workerId: string;
  language: LangCode;
  startedAt: string;
  filedAt: string | null;
  status: "draft" | "filed";
  fields: Partial<Record<FieldKey, FieldValue>>;
  /** Append-only. Every correction lands here as well as on the field. */
  corrections: Array<{
    field: FieldKey;
    from: string | number | null;
    to: string | number | null;
    at: string;
    heard: string;
    /**
     * The conversational turn this correction came from. Dedup keys on this
     * rather than on the transcript, because re-transcribing the same audio
     * rarely yields a byte-identical string.
     */
    turnId?: string;
  }>;
};

/** Persisted across sessions. This is what makes Memory score above L2. */
export type Household = {
  id: string;
  village: string;
  members: Array<{ name: string; ageYears: number | null; notes?: string }>;
  /** Refs of prior visits, newest first. */
  visitRefs: string[];
  lastVisitAt: string | null;
};

/* ------------------------------------------------------------------ *
 * Extraction API
 * ------------------------------------------------------------------ */

/** What the model returns for one utterance. */
export type Extraction = {
  /** Fields it is confident enough to set. */
  set: Array<{ field: FieldKey; value: string | number; confidence: "high" | "low" }>;
  /** Fields the worker explicitly corrected this turn. */
  corrected: Array<{ field: FieldKey; value: string | number }>;
  /** The single most useful next question, in the worker's language. */
  nextQuestion: string | null;
  /** True when the worker signalled they are finished. */
  readyToFile: boolean;
  /** Set when the utterance asked for clinical advice; we decline and log it. */
  clinicalQuestion: string | null;
};

export const REQUIRED_TO_FILE: FieldKey[] = [
  "memberName",
  "visitReason",
  "followUpDate",
];
