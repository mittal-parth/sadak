"use client";

import { useState } from "react";
import { DISTRICTS, type District } from "@/lib/game/districts";

/** The district's own in-game sky, reused as the card wash. */
function skyWash(d: District) {
  return `linear-gradient(160deg, ${d.theme.sky.join(", ")})`;
}

export default function Title({ onEnter }: { onEnter: (d: District) => void }) {
  const [picked, setPicked] = useState<District>(DISTRICTS[0]);

  return (
    <main className="title">
      {/* Ikat strip, echoing Sarvam's own top border. */}
      <div className="ikat" aria-hidden="true" />

      <div className="title-wash" aria-hidden="true" />

      <div className="title-body">
        <div className="masthead">
          <span className="brand">
            <span className="brand-deva" lang="hi">सड़क</span>
            <span className="brand-latin">sadak</span>
          </span>
          <span className="brand-tag">A third-person street, in four languages</span>
        </div>

        <header className="title-head">
          <p className="eyebrow">
            <span>Sarvam Epoch Buildathon</span>
          </p>

          <h1 className="wordmark">
            Maha Chori Motor Gaadi
          </h1>

          <p className="lede">
            Four Indian cities. One stolen vehicle in each.
            <br />
            Nobody speaks English, so you talk your way there.
          </p>

          <div className="title-cta">
            <button className="enter" onClick={() => onEnter(picked)}>
              Enter {picked.name}
            </button>
            <span className="cta-note">
              {picked.npcs.length} people to talk to, spoken in {picked.languageLabel}
            </span>
          </div>
        </header>

        <section className="picker" aria-label="Choose a district">
          <h2 className="label">Choose your district</h2>

          <div className="picker-grid" role="radiogroup" aria-label="District">
            {DISTRICTS.map((d) => {
              const on = d.id === picked.id;
              return (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={on}
                  className={`card ${on ? "on" : ""}`}
                  onClick={() => setPicked(d)}
                >
                  <span
                    className="card-sky"
                    style={{ background: skyWash(d) }}
                    aria-hidden="true"
                  />
                  <span className="card-native" lang={d.language.slice(0, 2)}>
                    {d.native}
                  </span>
                  <span className="card-meta">
                    <strong>{d.name}</strong>
                    <em>{d.city}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="brief" aria-live="polite">
          <h3 className="label">The job in {picked.name}</h3>
          <p>{picked.premise}</p>
          <ul className="phrase-preview">
            {picked.phrases.slice(0, 3).map((p) => (
              <li key={p.native}>
                <span lang={picked.language.slice(0, 2)}>{p.native}</span>
                <em>{p.en}</em>
              </li>
            ))}
          </ul>
        </section>

        <footer className="title-foot">
          <ul className="keys">
            <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</li>
            <li><kbd>←</kbd><kbd>→</kbd> look</li>
            <li><kbd>E</kbd> talk</li>
            <li><kbd>Space</kbd> hold to speak</li>
            <li><kbd>P</kbd> phrasebook</li>
          </ul>
          <p className="built">
            Speech, voice and dialogue by <strong>Sarvam AI</strong>
          </p>
        </footer>
      </div>
    </main>
  );
}
