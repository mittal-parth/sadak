"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type Telemetry } from "@/lib/game/engine";
import { totalReward, CLUES_TO_UNLOCK, type District, type Npc } from "@/lib/game/districts";
import Title from "./Title";
import Hud from "./Hud";
import Dialogue from "./Dialogue";

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [district, setDistrict] = useState<District | null>(null);
  const [tel, setTel] = useState<Telemetry | null>(null);
  const [talking, setTalking] = useState<Npc | null>(null);
  const [cash, setCash] = useState(0);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [clues, setClues] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [heat, setHeat] = useState(0);
  const [busted, setBusted] = useState(false);
  const [card, setCard] = useState<Npc | null>(null);

  // The engine emits telemetry every frame. Refs let the key handler read the
  // latest values without re-binding the listener on each one.
  const nearbyRef = useRef<string | null>(null);
  const talkingRef = useRef<Npc | null>(null);
  const menuRef = useRef(false);
  /** NPCs already introduced, so the mission card only plays once each. */
  const metRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    talkingRef.current = talking;
    menuRef.current = menuOpen;

    const g = gameRef.current;
    if (!g) return;
    // Any overlay freezes the world so keys don't drive the player behind it.
    const frozen = talking !== null || menuOpen || busted || card !== null;
    g.paused = frozen;
    if (frozen) g.releasePointer();
  }, [talking, menuOpen, busted, card]);

  useEffect(() => {
    if (gameRef.current) gameRef.current.clues = clues.length;
  }, [clues]);

  // The street forgets. One star cools off every 40 seconds of good behaviour.
  useEffect(() => {
    if (heat <= 0 || busted) return;
    const t = setTimeout(() => setHeat((h) => Math.max(0, h - 1)), 40000);
    return () => clearTimeout(t);
  }, [heat, busted]);

  // Five stars and the chowk constable picks you up.
  useEffect(() => {
    if (heat < 5 || busted) return;
    setBusted(true);
    setTalking(null);
    setCash((c) => Math.max(0, Math.round(c * 0.5)));
  }, [heat, busted]);

  useEffect(() => {
    if (!district || !canvasRef.current) return;

    const game = new Game(canvasRef.current, district, (t) => {
      nearbyRef.current = t.nearby;
      setTel(t);
    });
    gameRef.current = game;
    // Dev-only handle so the headless end-to-end checks can drive the player.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__game = game;
    }
    game.start();

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [district]);

  const openTalk = useCallback(() => {
    if (!district || talkingRef.current) return;
    const npc = district.npcs.find((n) => n.id === nearbyRef.current);
    if (!npc) return;

    if (npc.requiresClues && clues.length < npc.requiresClues) {
      setToast(`${npc.name} needs ${npc.requiresClues} clues, you have ${clues.length}`);
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // First approach gets a mission card before the conversation opens.
    if (!metRef.current.has(npc.id)) {
      metRef.current.add(npc.id);
      setCard(npc);
      setTimeout(() => {
        setCard(null);
        setTalking(npc);
      }, 2200);
      return;
    }
    setTalking(npc);
  }, [district, clues.length]);

  // Escape backs out one layer at a time: conversation, then pause menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (talkingRef.current) setTalking(null);
        else setMenuOpen((m) => !m);
        return;
      }
      if (talkingRef.current || menuRef.current) return;

      if (e.code === "KeyE") {
        // The dialogue input focuses itself on open; without this the same
        // keystroke lands in it and the box starts with a stray "e".
        e.preventDefault();
        openTalk();
      }
      if (e.code === "KeyP") setPhrasesOpen((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTalk]);

  const onAnger = useCallback((amount: number) => {
    if (amount <= 0) return;
    setHeat((h) => Math.min(5, h + amount));
  }, []);

  const onPoints = useCallback((points: number) => {
    setXp((x) => x + points);
  }, []);

  const onComplete = useCallback(
    (npcId: string, reward: number, clue: string | null) => {
      if (!district) return;

      setCompleted((prev) => {
        if (prev.has(npcId)) return prev;
        return new Set(prev).add(npcId);
      });
      setCash((c) => c + reward);
      if (clue) setClues((prev) => (prev.includes(clue) ? prev : [...prev, clue]));
      gameRef.current?.markDone(npcId);

      const npc = district.npcs.find((n) => n.id === npcId);
      setToast(npc ? `Mission passed: ${npc.mission.title}` : "Mission passed");
      setTimeout(() => setToast(null), 4000);
    },
    [district]
  );

  const leaveDistrict = useCallback(() => {
    setDistrict(null);
    setTel(null);
    setTalking(null);
    setCash(0);
    setXp(0);
    setCompleted(new Set());
    setClues([]);
    setToast(null);
    setMenuOpen(false);
    setPhrasesOpen(false);
    setHeat(0);
    setBusted(false);
    setCard(null);
    metRef.current = new Set();
  }, []);

  /** Released from the chowk lockup: heat cleared, progress kept, cash halved. */
  const release = useCallback(() => {
    setBusted(false);
    setHeat(0);
  }, []);

  if (!district) return <Title onEnter={setDistrict} />;

  const allDone = completed.size === district.npcs.length;

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="scene" />

      <Hud
        district={district}
        tel={tel}
        cash={cash}
        xp={xp}
        clues={clues}
        completed={completed}
        heat={heat}
        onOpen={openTalk}
        phrasesOpen={phrasesOpen}
        onTogglePhrases={() => setPhrasesOpen((p) => !p)}
        onMenu={() => setMenuOpen(true)}
      />

      {toast && <div className="toast">{toast}</div>}

      {card && (
        <div className="mission-card">
          <p className="mission-card-kicker">{card.role}</p>
          <h2>{card.mission.title}</h2>
          <p className="mission-card-brief">{card.mission.brief}</p>
        </div>
      )}

      {busted && (
        <div className="busted">
          <h2>BUSTED</h2>
          <p>
            Havaldar Singh had heard enough. A night in the chowk lockup, and half
            of what you were carrying is gone.
          </p>
          <button className="menu-primary" onClick={release}>
            Back to the street
          </button>
        </div>
      )}

      {menuOpen && (
        <div className="menu-backdrop" onMouseDown={() => setMenuOpen(false)}>
          <div className="menu" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Paused</h2>
            <p>
              {district.name}, {district.city}
            </p>
            <button className="menu-primary" onClick={() => setMenuOpen(false)}>
              Resume
            </button>
            <button className="menu-secondary" onClick={leaveDistrict}>
              Leave for another district
            </button>
            <p className="menu-note">
              Progress in this district is not saved.
            </p>
          </div>
        </div>
      )}

      {allDone && (
        <div className="finale">
          <h2>{district.finale.title}</h2>
          <p>{district.finale.text}</p>
          <p className="cta-note">
            ₹{totalReward(district).toLocaleString("en-IN")} earned in {district.name}
          </p>
          <button className="again" onClick={leaveDistrict}>
            Choose another district
          </button>
        </div>
      )}

      {talking && (
        <Dialogue
          key={talking.id}
          district={district}
          npc={talking}
          clues={clues}
          onClose={() => setTalking(null)}
          onComplete={onComplete}
          onAnger={onAnger}
          onPoints={onPoints}
        />
      )}
    </div>
  );
}
