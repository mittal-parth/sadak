"use client";

import { FIELD_LABELS, REQUIRED_TO_FILE, type FieldKey, type VisitRecord } from "@/roznamcha/lib/types";

const ORDER: FieldKey[] = [
  "memberName",
  "ageYears",
  "visitReason",
  "pregnancyMonths",
  "weightKg",
  "bpSystolic",
  "bpDiastolic",
  "medicinesGiven",
  "referredTo",
  "followUpDate",
  "notes",
];

function display(v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

/**
 * The record as it fills. This is the artifact the whole product exists to
 * produce, so it is the primary surface, not a sidebar.
 */
export default function RecordCard({
  record,
  activeField,
}: {
  record: VisitRecord | null;
  /** Field currently being read back, so the worker knows what to interrupt. */
  activeField?: FieldKey | null;
}) {
  const filled = record?.fields ?? {};
  const missing = REQUIRED_TO_FILE.filter((k) => !filled[k]?.value);

  return (
    <section className="card" aria-label="Visit record">
      <header className="card-head">
        <div>
          <p className="card-kicker">Visit record</p>
          <h2>{record?.ref ?? "—"}</h2>
        </div>
        <span className={`chip ${record?.status === "filed" ? "chip-ok" : ""}`}>
          {record?.status === "filed" ? "Filed" : "Draft"}
        </span>
      </header>

      <dl className="fields">
        {ORDER.map((key) => {
          const f = filled[key];
          const isActive = activeField === key;
          const corrected = f?.provenance.via === "correction";
          const carried = f?.provenance.via === "carried-forward";

          return (
            <div
              key={key}
              className={[
                "field",
                f ? "has-value" : "",
                isActive ? "reading" : "",
                corrected ? "corrected" : "",
                f?.confidence === "low" ? "low" : "",
              ].join(" ")}
            >
              <dt>{FIELD_LABELS[key]}</dt>
              <dd>
                {f ? (
                  <>
                    <span className="val">{display(f.value)}</span>
                    {corrected && (
                      <span className="was" title={`Was: ${display(f.provenance.replaced ?? null)}`}>
                        was {display(f.provenance.replaced ?? null)}
                      </span>
                    )}
                    {carried && <span className="tag-carried">from last visit</span>}
                    {f.confidence === "low" && <span className="tag-low">unsure</span>}
                  </>
                ) : (
                  <span className="empty">—</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {missing.length > 0 && (
        <p className="needs">
          Needed to file: {missing.map((k) => FIELD_LABELS[k]).join(", ")}
        </p>
      )}
    </section>
  );
}
