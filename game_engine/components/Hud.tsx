"use client";

import { useEffect, useRef } from "react";
import { roadLines, WORLD_LIMIT, ROAD_W } from "@/lib/game/city";
import type { Telemetry } from "@/lib/game/engine";
import type { District } from "@/lib/game/districts";

const MAP_PX = 168;
const MAP_RANGE = 90; // world units visible across the minimap

function Minimap({ tel }: { tel: Telemetry }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = MAP_PX * dpr;
    canvas.height = MAP_PX * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MAP_PX, MAP_PX);

    const R = MAP_PX / 2;
    const scale = R / MAP_RANGE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#1d2229";
    ctx.fillRect(0, 0, MAP_PX, MAP_PX);

    // Rotate the world so the player's heading is always "up".
    ctx.translate(R, R);
    ctx.rotate(tel.heading);
    ctx.translate(-tel.playerX * scale, -tel.playerZ * scale);

    ctx.strokeStyle = "#454f5a";
    ctx.lineWidth = ROAD_W * scale;
    const L = WORLD_LIMIT;
    for (const c of roadLines()) {
      ctx.beginPath();
      ctx.moveTo(c * scale, -L * scale);
      ctx.lineTo(c * scale, L * scale);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-L * scale, c * scale);
      ctx.lineTo(L * scale, c * scale);
      ctx.stroke();
    }

    for (const n of tel.npcs) {
      ctx.fillStyle = n.done ? "#3ddc84" : n.locked ? "#7c8896" : "#ffc247";
      ctx.beginPath();
      ctx.arc(n.x * scale, n.z * scale, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Player arrow, fixed at the centre.
    ctx.fillStyle = "#5ab0ff";
    ctx.beginPath();
    ctx.moveTo(R, R - 7);
    ctx.lineTo(R - 5, R + 5);
    ctx.lineTo(R + 5, R + 5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [tel]);

  return <canvas ref={ref} style={{ width: MAP_PX, height: MAP_PX }} />;
}

export default function Hud({
  district,
  tel,
  cash,
  clues,
  completed,
  heat,
  onOpen,
  phrasesOpen,
  onTogglePhrases,
  onMenu,
}: {
  district: District;
  tel: Telemetry | null;
  cash: number;
  clues: string[];
  completed: Set<string>;
  heat: number;
  onOpen: () => void;
  phrasesOpen: boolean;
  onTogglePhrases: () => void;
  onMenu: () => void;
}) {
  const nearby = tel?.nearby ? district.npcs.find((n) => n.id === tel.nearby) : null;
  const nearbyLocked = !!nearby?.requiresClues && clues.length < nearby.requiresClues;

  return (
    <>
      <div className="hud-top">
        <div className="hud-top-left">
          <div className="cash cash-plate panel">₹{cash.toLocaleString("en-IN")}</div>
          {heat > 0 && (
            <div className="wanted" aria-label={`Wanted level ${heat} of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < heat ? "star on" : "star"}>
                  ★
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="hud-top-right">
          <div className="hud-district panel">
            {district.name} · <strong>{district.native}</strong>
          </div>
          <button className="hud-btn panel" onClick={onTogglePhrases}>
            <kbd>P</kbd> Phrasebook
          </button>
          <button className="hud-btn panel" onClick={onMenu}>
            <kbd>Esc</kbd> Menu
          </button>
        </div>
      </div>

      {phrasesOpen && (
        <div className="phrasebook panel">
          <h3>Say it in {district.native}</h3>
          <dl>
            {district.phrases.map((p) => (
              <div key={p.native} className="phrase">
                <dt lang={district.language.slice(0, 2)}>{p.native}</dt>
                <dd>
                  <span className="roman">{p.roman}</span>
                  <span className="gloss">{p.en}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="phrase-note">
            Type or speak these. They work on anyone in this district.
          </p>
        </div>
      )}

      <div className="hud-missions panel">
        <h3>Missions</h3>
        {district.npcs.map((n) => {
          const done = completed.has(n.id);
          const locked = !done && !!n.requiresClues && clues.length < n.requiresClues;
          return (
            <div key={n.id} className={`mission ${done ? "done" : ""} ${locked ? "locked" : ""}`}>
              <span className="dot" />
              <div>
                <strong>{locked ? "???" : n.mission.title}</strong>
                <em>
                  {locked
                    ? `Needs ${n.requiresClues} clue${n.requiresClues === 1 ? "" : "s"}`
                    : n.name}
                </em>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hud-clues panel">
        <h3>Clues · {clues.length}</h3>
        {clues.length === 0 ? (
          <p className="clues-empty">Nothing yet. Go talk to someone.</p>
        ) : (
          <ol>
            {clues.map((c, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                {c}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="hud-map">{tel && <Minimap tel={tel} />}</div>

      {nearby && (
        <button
          className={`talk-prompt ${nearbyLocked ? "locked" : ""}`}
          onClick={onOpen}
        >
          <kbd>E</kbd>
          {nearbyLocked
            ? `${nearby.name} won't talk yet`
            : `Talk to ${nearby.name}`}
        </button>
      )}
    </>
  );
}
