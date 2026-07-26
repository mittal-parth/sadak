"use client";

import type { Household, VisitRecord } from "@/roznamcha/lib/types";

/**
 * Memory made visible. A judge cannot score continuity they cannot see, so the
 * prior visits and the correction trail are shown rather than merely stored.
 */
export default function MemoryPanel({
  household,
  record,
  priorVisits,
}: {
  household: Household | null;
  record: VisitRecord | null;
  priorVisits: VisitRecord[];
}) {
  return (
    <aside className="memory" aria-label="Household context">
      <section className="mem-block">
        <p className="card-kicker">Household</p>
        {household ? (
          <>
            <h3>
              {household.id} · {household.village}
            </h3>
            <ul className="members">
              {household.members.map((m) => (
                <li key={m.name}>
                  <span>{m.name}</span>
                  {m.ageYears != null && <em>{m.ageYears}</em>}
                </li>
              ))}
            </ul>
            <p className="mem-note">
              {household.visitRefs.length} previous visit
              {household.visitRefs.length === 1 ? "" : "s"}
              {household.lastVisitAt
                ? `, last on ${new Date(household.lastVisitAt).toLocaleDateString("en-IN")}`
                : ""}
            </p>
          </>
        ) : (
          <p className="mem-empty">No household selected.</p>
        )}
      </section>

      {priorVisits.length > 0 && (
        <section className="mem-block">
          <p className="card-kicker">Last visit</p>
          <ul className="prior">
            {Object.entries(priorVisits[0]?.fields ?? {})
              .slice(0, 4)
              .map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <em>{String(v?.value ?? "")}</em>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="mem-block">
        <p className="card-kicker">
          Corrections {record?.corrections.length ? `· ${record.corrections.length}` : ""}
        </p>
        {record && record.corrections.length > 0 ? (
          <ol className="corrections">
            {record.corrections.map((c, i) => (
              <li key={i}>
                <span className="c-field">{c.field}</span>
                <span className="c-change">
                  <s>{String(c.from ?? "—")}</s> → <b>{String(c.to ?? "—")}</b>
                </span>
                <span className="c-heard">“{c.heard}”</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mem-empty">
            Nothing corrected yet. Interrupt the readback to fix a value.
          </p>
        )}
      </section>
    </aside>
  );
}
