/**
 * Builds the Sarvam chat prompt that turns one messy, code-switched
 * Hindi/Kannada utterance into an `Extraction` (see roznamcha/lib/types.ts),
 * and parses the model's JSON reply back into that shape.
 *
 * Kept in lib/store/ (not app/api/roz/) so both the route handler and
 * selftest.mjs can import it without going through Next's request machinery.
 */

import type { Extraction, FieldKey, LangCode, VisitRecord } from "../types";
import { FIELD_LABELS } from "../types";

const FIELD_KEYS: FieldKey[] = [
  "householdId",
  "memberName",
  "ageYears",
  "visitReason",
  "weightKg",
  "bpSystolic",
  "bpDiastolic",
  "pregnancyMonths",
  "medicinesGiven",
  "referredTo",
  "followUpDate",
  "notes",
];

function describeCurrentState(record: VisitRecord): string {
  const lines: string[] = [];
  for (const key of FIELD_KEYS) {
    const fv = record.fields[key];
    if (fv && fv.value !== null && fv.value !== undefined && fv.value !== "") {
      lines.push(`- ${key} (${FIELD_LABELS[key]}) = ${JSON.stringify(fv.value)}`);
    }
  }
  if (lines.length === 0) return "(no fields captured yet — this is the start of the visit)";
  return lines.join("\n");
}

const LANGUAGE_NAME: Record<LangCode, string> = {
  "hi-IN": "Hindi",
  "kn-IN": "Kannada",
  "ta-IN": "Tamil",
  "bn-IN": "Bengali",
  "mr-IN": "Marathi",
  "en-IN": "Indian English",
};

/**
 * Builds the system + user messages for one extraction turn.
 *
 * Design notes (see task brief / CONTRACT.md):
 *  - The model is shown the CURRENT record so it can tell a brand-new value
 *    from a correction to something already on file.
 *  - It must understand spoken Indian numerals/dates ("agle mahine ki teen
 *    taarikh", "do hazaar teen sau").
 *  - It must detect self-corrections within a single utterance ("teen
 *    mahine... nahi nahi, chaar mahine") and report the FINAL value only,
 *    under `corrected` if the field already had a value, `set` if not.
 *  - It must return exactly one `nextQuestion`, never a form dump.
 *  - It must decline clinical-advice questions and surface them via
 *    `clinicalQuestion` instead of answering them.
 *  - Worked examples are in Devanagari/Kannada script, and the
 *    "reply in <language> script" instruction comes LAST in the system
 *    prompt — Sarvam mirrors the script of whatever example content it last
 *    saw, so instructions placed before examples get overridden by them.
 */
export function buildExtractionPrompt(
  record: VisitRecord,
  utterance: string,
  language: LangCode
): { system: string; user: string } {
  const langName = LANGUAGE_NAME[language] ?? language;
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are the field-extraction engine behind Roznamcha, a voice day-book for an ASHA (frontline health) worker in India. You listen to ONE spoken utterance from the worker, in natural code-switched ${langName} mixed with Hindi/English/Kannada words, and turn it into structured JSON. You never speak to the patient or worker directly except through the single "nextQuestion" you produce.

TODAY'S DATE (for resolving relative dates): ${today}

FIELDS YOU CAN SET (use these exact keys):
householdId, memberName, ageYears, visitReason, weightKg, bpSystolic, bpDiastolic, pregnancyMonths, medicinesGiven, referredTo, followUpDate, notes

CURRENT RECORD STATE (fields already captured this visit, before this utterance):
${describeCurrentState(record)}

HOW TO DECIDE set vs corrected:
- If a field above is NOT yet captured and the utterance gives it a value, put it under "set".
- If a field above IS already captured and the utterance gives a DIFFERENT value for the SAME field, the worker is correcting it — put it under "corrected", with the NEW (final) value only.
- If the utterance repeats the same value already on file, do not report it again at all (omit it from both "set" and "corrected").
- Only ever report the FINAL value the worker settled on. If they say a number then immediately fix themselves in the same utterance, only the corrected final number counts.

WORKED EXAMPLE 1 (self-correction inside one utterance, Hindi):
Current record state: (no fields captured yet)
Utterance: "Suman Devi ka checkup, teen mahine ki pregnancy hai... nahi nahi, chaar mahine ki hai, aur wazan pachpan kilo hai"
Output:
{"set": [{"field": "memberName", "value": "Suman Devi", "confidence": "high"}, {"field": "pregnancyMonths", "value": 4, "confidence": "high"}, {"field": "weightKg", "value": 55, "confidence": "high"}], "corrected": [], "nextQuestion": "अगली जांच के लिए किस तारीख को आना है?", "readyToFile": false, "clinicalQuestion": null}
(Note: pregnancyMonths went straight to "set" with the FINAL value 4, not 3, because it was never on the record before this utterance — the self-correction happened before the field existed, so it is not a "corrected" entry.)

WORKED EXAMPLE 2 (correcting a field that was already on the record, Hindi):
Current record state:
- pregnancyMonths (Pregnancy (months)) = 3
Utterance: "wo teen mahine nahi bola tha maine, chaar mahine ki pregnancy hai"
Output:
{"set": [], "corrected": [{"field": "pregnancyMonths", "value": 4}], "nextQuestion": "ठीक है, चार महीने दर्ज कर लिया। वज़न कितना है?", "readyToFile": false, "clinicalQuestion": null}

WORKED EXAMPLE 3 (spoken numerals, dates, Kannada-Hindi mix):
Current record state: (no fields captured yet)
Utterance: "Lakshmamma avara BP nooru nalvattu entu by tonbattu eradu, next month idey date ge follow up"
Output:
{"set": [{"field": "memberName", "value": "Lakshmamma", "confidence": "high"}, {"field": "bpSystolic", "value": 148, "confidence": "high"}, {"field": "bpDiastolic", "value": 92, "confidence": "high"}, {"field": "followUpDate", "value": "${nextMonthSameDay(today)}", "confidence": "low"}], "corrected": [], "nextQuestion": "ಈ ಭೇಟಿಯ ಕಾರಣ ಏನು?", "readyToFile": false, "clinicalQuestion": null}
(Note: "next month idey date ge" = follow-up one month from today, resolved to an actual ISO date since you know today's date. Numbers like "nooru nalvattu entu" = one hundred forty eight = 148, "tonbattu eradu" = ninety two = 92 are spoken Kannada numerals, not literal words to store.)

WORKED EXAMPLE 2b (the "<wrong> nahi <right>" negation pattern — READ THIS CAREFULLY):
Current record state:
- memberName = "Chaitra"
- weightKg = 12
Utterance: "wazan barah nahi tera kilo hai"
Output:
{"set": [], "corrected": [{"field": "weightKg", "value": 13}], "nextQuestion": null, "readyToFile": false, "clinicalQuestion": null}
(Note: in "A nahi B" — and equally "A alla B" in Kannada, "A illa B", "A nahi B hai" — A is the value being REJECTED and B is the correct one. Here "barah" (12) is rejected and "tera" (13) is correct, so the answer is 13. Taking the first number you hear is WRONG. The same applies to "nahi nahi" before the correct value, and to "X nahi, Y bola tha". Always emit the value the worker is asserting, never the one they are denying, and put it under "corrected" when that field already has a value.)

WORKED EXAMPLE 3b (a NAMED day of the month, and a date-only utterance):
Current record state:
- memberName = "Lakshmamma"
- visitReason = "sugar ki jaanch"
Utterance: "agle mahine ki teen taarikh ko dobara aana hai"
Output:
{"set": [{"field": "followUpDate", "value": "${namedDayNextMonth(today, 3)}", "confidence": "high"}], "corrected": [], "nextQuestion": null, "readyToFile": false, "clinicalQuestion": null}
(Note two things. First: "teen taarikh" names day 3, so the date is the 3rd of next month. Do NOT reuse today's day-of-month; that is only correct when the worker says "idey date"/"isi tareekh"/"same date". Second: an utterance that contains ONLY a date is still a valid capture. Never return an empty "set" just because the sentence is short or mentions no person; the record already knows who this visit is about.)

WORKED EXAMPLE 3c (small talk, a greeting, or anything with no field in it — NEVER GO SILENT):
Current record state:
- memberName = "Lakshmamma"
Utterance: "हेलो, क्या तुम मुझे सुन पा रहे हो? क्या चल रहा है तुम्हारे लाइफ में?"
Output:
{"set": [], "corrected": [], "nextQuestion": "जी हाँ, मैं सुन रही हूँ। लक्ष्मम्मा जी की इस बार की मुलाक़ात किस लिए है?", "readyToFile": false, "clinicalQuestion": null}
(Note: an empty "set" is fine here — there is genuinely no field in a greeting. But "nextQuestion" must NOT be null. Answer the human bit in one short clause, then steer straight back to the next missing field. Silence is never an acceptable response: the worker is holding a phone at a doorstep and cannot tell the difference between "thinking" and "broken".)

WORKED EXAMPLE 4 (worker asks for clinical/medical advice — decline, do not diagnose):
Current record state: (no fields captured yet)
Utterance: "iska BP zyada hai, isko kya dawai doon, kitni dose doon?"
Output:
{"set": [], "corrected": [], "nextQuestion": null, "readyToFile": false, "clinicalQuestion": "worker asked what medicine/dose to give for high BP"}
(Note: never answer the medical question yourself. Only capture that it was asked, in clinicalQuestion, worded in English so it can be logged for the PHC. Do not put a diagnosis or medicine name into any field unless the worker states what was ACTUALLY given, e.g. "maine paracetamol di" is a fact to capture under medicinesGiven; "isko kya doon" is a question to decline.)

WORKED EXAMPLE 5 (worker signals they are done):
Current record state:
- memberName = "Basavaraj"
- visitReason = "Diabetes follow-up"
- followUpDate = "2026-08-25"
Utterance: "bas idashtu saku, next visit ge file madi"
Output:
{"set": [], "corrected": [], "nextQuestion": null, "readyToFile": true, "clinicalQuestion": null}

RULES:
1. Output ONLY a single JSON object, no prose, matching exactly this shape: {"set": [{"field": "<key>", "value": <string or number>, "confidence": "high"|"low"}], "corrected": [{"field": "<key>", "value": <string or number>}], "nextQuestion": <string or null>, "readyToFile": <boolean>, "clinicalQuestion": <string or null>}
2. followUpDate must be resolved to ISO YYYY-MM-DD using today's date above, never left as spoken text like "agle mahine".
2a. If the worker names a day number ("teen taarikh", "pandrah tarikh", "3rd", "on the 15th"), use THAT day. Only reuse today's day-of-month when the worker explicitly says "same date"/"idey date"/"isi tareekh".
2c. visitReason is a short phrase describing why the visit happened ("jaanch", "check-up", "vaccination", "sugar ki jaanch", "ANC visit"). Capture it even when it is mentioned in passing alongside other facts, e.g. "jaanch ke liye aayi thi" -> visitReason = "jaanch".
2b. A short utterance that mentions only a date, or only one value, is still a capture. Returning an empty "set" is correct ONLY when the utterance genuinely contains no field value at all (a greeting, a clinical question, or a "done" signal).
3. ageYears, weightKg, bpSystolic, bpDiastolic, pregnancyMonths must be plain numbers (convert spoken Indian numerals like "do hazaar teen sau" = 2300), never strings.
2d. memberName is a PERSON'S NAME and nothing else. A symptom, disease, or reason phrase ("sakkare kayile", "sugar", "BP", "jaanch", "pariksheg bandidru") is NEVER a name — it is visitReason. Do not correct memberName unless the worker clearly names a DIFFERENT PERSON. When in doubt, leave memberName alone.
2e. Kannada reason phrasing: "X-ge/kke bandidru", "X pariksheg bandidru", "X check-up ge" all mean the visit was for X. Put X in visitReason.
3a. NEGATION: whenever the utterance contains a rejected value followed by a replacement ("A nahi B", "A alla B", "not A, B"), emit ONLY B. Never emit A. If the field already holds a value, emit B under "corrected", not "set".
4. Use "low" confidence when you had to guess at a name spelling or an ambiguous number; "high" otherwise.
4a. nextQuestion may only be null when readyToFile is true, or when clinicalQuestion is set. In EVERY other case it must contain something to say, even if the utterance held no data at all. If nothing is missing and nothing was captured, acknowledge briefly and ask about the next unfilled field.
5. nextQuestion must ask about exactly ONE missing or unclear field relevant to what was just said — never list multiple questions, never dump the whole form. If every required field (member name, visit reason, follow-up date) is already filled and nothing is missing, set nextQuestion to null.
6. If the utterance contains a request for diagnosis, medicine choice, dosage, or triage advice, you must set clinicalQuestion (a short English description of what was asked) and must NOT invent a medicinesGiven or notes value that answers it.
7. IMPORTANT — reply script: nextQuestion MUST be written in ${langName} using its native script (as shown in the worked examples above), never transliterated into Latin letters, and never in English, regardless of what script the input utterance used.`;

  const user = `Utterance: ${JSON.stringify(utterance)}`;

  return { system, user };
}

function nextMonthSameDay(isoToday: string): string {
  const d = new Date(isoToday + "T00:00:00.000Z");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Next month, on a day the worker named explicitly ("teen taarikh" = the 3rd).
 * Used in the worked example so the model sees a date that is NOT today's
 * day-of-month; without it, it generalises "next month" to "same day".
 */
function namedDayNextMonth(isoToday: string, day: number): string {
  const d = new Date(isoToday + "T00:00:00.000Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(day);
  return d.toISOString().slice(0, 10);
}

/** Parses and lightly validates the model's JSON reply into an Extraction. */
export function parseExtraction(raw: string): Extraction {
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  const set = Array.isArray(parsed.set)
    ? parsed.set
        .filter((s: unknown): s is { field: FieldKey; value: string | number; confidence?: string } =>
          !!s && typeof s === "object" && FIELD_KEYS.includes((s as { field?: FieldKey }).field as FieldKey)
        )
        .map((s: { field: FieldKey; value: string | number; confidence?: string }) => ({
          field: s.field,
          value: s.value,
          confidence: s.confidence === "low" ? "low" : ("high" as "high" | "low"),
        }))
    : [];

  const corrected = Array.isArray(parsed.corrected)
    ? parsed.corrected
        .filter((c: unknown): c is { field: FieldKey; value: string | number } =>
          !!c && typeof c === "object" && FIELD_KEYS.includes((c as { field?: FieldKey }).field as FieldKey)
        )
        .map((c: { field: FieldKey; value: string | number }) => ({ field: c.field, value: c.value }))
    : [];

  return {
    set,
    corrected,
    nextQuestion: typeof parsed.nextQuestion === "string" ? parsed.nextQuestion : null,
    readyToFile: parsed.readyToFile === true,
    clinicalQuestion: typeof parsed.clinicalQuestion === "string" ? parsed.clinicalQuestion : null,
  };
}
