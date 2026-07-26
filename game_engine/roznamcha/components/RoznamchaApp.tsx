"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceTurn } from "@/roznamcha/lib/voice/useVoiceTurn";
import type {
  FieldKey,
  Household,
  LangCode,
  VisitRecord,
} from "@/roznamcha/lib/types";
import { REQUIRED_TO_FILE } from "@/roznamcha/lib/types";
import RecordCard from "./RecordCard";
import MemoryPanel from "./MemoryPanel";
import VoiceOrb from "./VoiceOrb";
import "./roznamcha.css";

const RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "ws://localhost:8787";

const LANGS: Array<{ code: LangCode; label: string; speaker: string }> = [
  { code: "hi-IN", label: "हिन्दी", speaker: "anand" },
  { code: "kn-IN", label: "ಕನ್ನಡ", speaker: "vijay" },
];

type Line = { who: "me" | "agent"; text: string };

/** Last-resort prompt so a turn can never end in silence. */
const ASK_FOR: Partial<Record<FieldKey, { "hi-IN": string; "kn-IN": string }>> = {
  memberName: {
    "hi-IN": "जी, बताइए किससे मुलाक़ात हुई?",
    "kn-IN": "ಹೇಳಿ, ಯಾರನ್ನು ಭೇಟಿ ಮಾಡಿದಿರಿ?",
  },
  visitReason: {
    "hi-IN": "जी हाँ, मैं सुन रही हूँ। यह मुलाक़ात किस लिए है?",
    "kn-IN": "ಹೌದು, ಕೇಳಿಸುತ್ತಿದೆ. ಈ ಭೇಟಿಯ ಕಾರಣ ಏನು?",
  },
  followUpDate: {
    "hi-IN": "अगली मुलाक़ात किस तारीख़ को रखें?",
    "kn-IN": "ಮುಂದಿನ ಭೇಟಿ ಯಾವ ದಿನಾಂಕಕ್ಕೆ?",
  },
};

function fallbackAsk(record: VisitRecord | null): string {
  const lang = record?.language === "kn-IN" ? "kn-IN" : "hi-IN";
  const missing = REQUIRED_TO_FILE.find((k) => !record?.fields[k]?.value);
  if (missing && ASK_FOR[missing]) return ASK_FOR[missing]![lang];
  return lang === "kn-IN"
    ? "ಸರಿ. ಇನ್ನೇನಾದರೂ ಸೇರಿಸಬೇಕೆ?"
    : "ठीक है। और कुछ जोड़ना है?";
}

export default function RoznamchaApp() {
  const [lang, setLang] = useState(LANGS[0]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [priorVisits, setPriorVisits] = useState<VisitRecord[]>([]);
  const [record, setRecord] = useState<VisitRecord | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [ask, setAsk] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const voice = useVoiceTurn({
    relayUrl: RELAY,
    language: lang.code,
    speaker: lang.speaker,
  });

  // The field currently being read back. Highlighting it tells the worker what
  // her interruption will correct.
  const [readingField, setReadingField] = useState<FieldKey | null>(null);

  const recordRef = useRef<VisitRecord | null>(null);
  recordRef.current = record;

  /* ---------------- session setup ---------------- */

  const openHousehold = useCallback(async (id: string) => {
    setErr(null);
    try {
      const h = await fetch(`/api/roz/household?id=${id}`).then((r) => r.json());
      if (h.error) throw new Error(h.error);
      setHousehold(h.household);
      setPriorVisits(h.visits ?? []);

      const v = await fetch("/api/roz/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: id, language: lang.code }),
      }).then((r) => r.json());
      if (v.error) throw new Error(v.error);

      setRecord(v.record);
      setLines([]);
      setAsk(null);
      setSummary(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open household.");
    }
  }, [lang.code]);

  useEffect(() => {
    openHousehold("HH-1001");
    // Only on mount: switching language mid-visit should not restart the visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    voice.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- the turn loop ---------------- */

  const submitUtterance = useCallback(
    async (utterance: string) => {
      const ref = recordRef.current?.ref;
      if (!ref || !utterance.trim()) return;

      setLines((l) => [...l, { who: "me", text: utterance }]);
      setBusy(true);
      setErr(null);

      try {
        const res = await fetch("/api/roz/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ref,
            utterance,
            language: lang.code,
            turnId: `${ref}-${Date.now()}`,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Extraction failed.");

        setRecord(json.record);

        const ex = json.extraction;

        if (ex.clinicalQuestion) {
          const decline =
            lang.code === "hi-IN"
              ? "यह सलाह मैं नहीं दे सकती। मैंने यह सवाल पी एच सी के लिए लिख लिया है।"
              : "ಈ ಸಲಹೆ ನಾನು ಕೊಡಲಾರೆ. ಈ ಪ್ರಶ್ನೆಯನ್ನು ಪಿ ಎಚ್ ಸಿ ಗೆ ಬರೆದಿದ್ದೇನೆ.";
          setLines((l) => [...l, { who: "agent", text: decline }]);
          voice.speak(decline, "decline");
          return;
        }

        // Never go silent. If the model returns nothing to say — which it does
        // on greetings and small talk — fall back to asking for the next
        // required field ourselves. A worker at a doorstep cannot tell the
        // difference between "thinking" and "broken".
        const nextQuestion: string = ex.nextQuestion ?? fallbackAsk(json.record);

        if (nextQuestion && !ex.readyToFile) {
          setAsk(nextQuestion);
          setLines((l) => [...l, { who: "agent", text: nextQuestion }]);
          // Highlight the field the question is about, if we can tell.
          const touched: FieldKey | undefined =
            ex.corrected?.[0]?.field ?? ex.set?.[ex.set.length - 1]?.field;
          setReadingField(touched ?? null);
          voice.speak(
            nextQuestion,
            ex.corrected?.length ? "correction" : "question"
          );
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [lang.code, voice]
  );

  // A finished transcript from the relay drives the next turn.
  const lastHandled = useRef("");
  useEffect(() => {
    const t = voice.transcript?.trim();
    if (!t || t === lastHandled.current) return;
    lastHandled.current = t;
    submitUtterance(t);
  }, [voice.transcript, submitUtterance]);

  /* ---------------- readback + filing ---------------- */

  const readBack = useCallback(() => {
    const r = recordRef.current;
    if (!r) return;
    const f = r.fields;
    const parts: string[] = [];
    if (f.memberName?.value) parts.push(`${f.memberName.value}`);
    if (f.ageYears?.value) parts.push(`${f.ageYears.value} साल`);
    if (f.visitReason?.value) parts.push(`${f.visitReason.value}`);
    if (f.weightKg?.value) parts.push(`वज़न ${f.weightKg.value} किलो`);
    if (f.followUpDate?.value) parts.push(`अगली मुलाक़ात ${f.followUpDate.value}`);

    const text =
      parts.length === 0
        ? "अभी तक कुछ दर्ज नहीं हुआ है।"
        : `मैंने यह दर्ज किया है: ${parts.join(", ")}. कुछ ग़लत हो तो बीच में टोक दीजिए।`;

    setLines((l) => [...l, { who: "agent", text }]);
    setReadingField("memberName");
    voice.speak(text, "readback");
  }, [voice]);

  const file = useCallback(async () => {
    const ref = recordRef.current?.ref;
    if (!ref) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/roz/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.missingLabels
            ? `Still needed: ${json.missingLabels.join(", ")}`
            : json.error ?? "Could not file."
        );
      }
      setRecord(json.record);
      setSummary(json.summary);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not file.");
    } finally {
      setBusy(false);
    }
  }, []);

  /* ---------------- render ---------------- */

  const listening = voice.status === "listening";

  return (
    <main className="roz">
      <div className="roz-shell">
        <header className="roz-head">
          <div className="roz-brand">
            <b>Roznamcha</b>
            <span lang="hi">रोज़नामचा</span>
          </div>
          <p className="roz-sub">
            Speak the visit. Interrupt to correct. File the record.
          </p>
          <div className="roz-actions">
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={`btn ${l.code === lang.code ? "btn-primary" : ""}`}
                onClick={() => setLang(l)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </header>

        <RecordCard record={record} activeField={readingField} />

        <div className="voice-col">
          <VoiceOrb
            status={voice.status}
            bargeInMs={voice.lastBargeInMs}
            onToggle={() => (listening ? voice.stopListening() : voice.startListening())}
          />

          <div className="transcript">
            {lines.length === 0 && !voice.partial && (
              <p className="t-partial">
                Tap the circle and describe the visit in {lang.label}.
              </p>
            )}
            {lines.map((l, i) => (
              <p key={i} className={`t-line ${l.who}`}>
                {l.text}
              </p>
            ))}
            {voice.partial && <p className="t-partial">{voice.partial}</p>}
            {busy && <p className="t-partial">…</p>}
          </div>

          {ask && <p className="ask">{ask}</p>}

          {(err || voice.error) && (
            <p className="roz-error">{err ?? voice.error}</p>
          )}

          <div className="roz-actions">
            <button className="btn" onClick={readBack} disabled={!record || busy}>
              Read it back
            </button>
            <button
              className="btn btn-primary"
              onClick={file}
              disabled={!record || busy || record?.status === "filed"}
            >
              File record
            </button>
          </div>

          {/* Typed fallback: drives the identical pipeline when audio fails. */}
          <form
            className="roz-actions"
            onSubmit={(e) => {
              e.preventDefault();
              const v = typed;
              setTyped("");
              submitUtterance(v);
            }}
          >
            <input
              className="btn"
              style={{ flex: 1, minWidth: 0, textAlign: "left" }}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="or type what was said"
            />
            <button className="btn" type="submit" disabled={busy || !typed.trim()}>
              Send
            </button>
          </form>
        </div>

        <MemoryPanel household={household} record={record} priorVisits={priorVisits} />

        {summary && (
          <section className="filed">
            <h2>Filed · {record?.ref}</h2>
            <pre>{summary}</pre>
            <div className="roz-actions">
              <button
                className="btn"
                onClick={() => navigator.clipboard?.writeText(summary)}
              >
                Copy summary
              </button>
              <button className="btn" onClick={() => openHousehold(household!.id)}>
                Start next visit
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
