"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setSfxMuted } from "@/lib/audio/engine";
import { DISTRICT_THEMES, MusicEngine } from "@/lib/audio/music";

const SFX_KEY = "sadak-sfx";
const MUSIC_KEY = "sadak-music";

/** SSR renders no audio state at all, so a client-only lazy read here cannot
 *  cause a hydration mismatch — the toggle only exists once mounted. */
function readPref(key: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(key) !== "off";
}

/**
 * Single React seam for game audio: owns the `sfxOn`/`musicOn` prefs
 * (persisted to localStorage), the `MusicEngine` instance, and ducking.
 * `Game.tsx` is the sole owner — it already holds all other game state.
 */
export function useGameAudio(districtId: string | undefined) {
  const [sfxOn, setSfxOn] = useState(() => readPref(SFX_KEY));
  const [musicOn, setMusicOn] = useState(() => readPref(MUSIC_KEY));
  const engineRef = useRef<MusicEngine | null>(null);

  // Start/switch the theme as the district changes. `MusicEngine.start()`
  // is idempotent per theme id, so a re-render with the same district
  // (e.g. a comfort-level change) is a no-op rather than a restart. Leaving
  // the district (back to Title) must explicitly `stop()` — the engine has
  // no other way to know the player walked away.
  useEffect(() => {
    const theme = districtId ? DISTRICT_THEMES[districtId] : undefined;
    if (!theme) {
      engineRef.current?.stop();
      return;
    }
    const engine = (engineRef.current ??= new MusicEngine());
    engine.start(theme);
    engine.setMuted(!musicOn);
  }, [districtId, musicOn]);

  // Dispose the audio context on unmount (leaving the district / app teardown).
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // SFX mute is a real gain change in the shared engine, applied whenever
  // the pref changes (including the initial mount read from localStorage).
  useEffect(() => {
    setSfxMuted(!sfxOn);
  }, [sfxOn]);

  const toggleSfx = useCallback(() => {
    setSfxOn((on) => {
      const next = !on;
      localStorage.setItem(SFX_KEY, next ? "on" : "off");
      return next;
    });
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicOn((on) => {
      const next = !on;
      localStorage.setItem(MUSIC_KEY, next ? "on" : "off");
      return next;
    });
  }, []);

  /** Duck music under dialogue TTS / the mic — the issue's one hard rule. */
  const duck = useCallback((ducked: boolean) => {
    engineRef.current?.setDucked(ducked);
  }, []);

  return { sfxOn, musicOn, toggleSfx, toggleMusic, duck };
}
