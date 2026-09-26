/**
 * The chime when the location card shows: a quick rising figure in the
 * city's own raga on santoor, capped with a manjira's ching. Plays through
 * the SFX bus, so the SFX mute silences it.
 */

import { getAudioContext, sfxOutput } from "@/lib/audio/engine";
import { DISTRICT_MUSIC } from "./cities";
import { PERC, pluck } from "./instruments";
import { midiToHz, swaraHz, type Swara } from "./theory";

/** Sa, the raga's third and fifth notes, and Sa above. */
export function chimeNotes(swaras: Swara[]): [Swara, number][] {
  const third = swaras[Math.min(2, swaras.length - 1)];
  const fifth = swaras.includes("P") ? "P" : swaras[Math.min(4, swaras.length - 1)];
  return [
    ["S", 1],
    [third, 1],
    [fifth, 1],
    ["S", 2],
  ];
}

export function playPlaceChime(districtId: string): void {
  const c = DISTRICT_MUSIC[districtId];
  if (!c) throw new Error(`[chime] no music for ${districtId}`);
  const ctx = getAudioContext();
  const out = ctx.createGain();
  out.gain.value = 0.15;
  out.connect(sfxOutput());
  const sa = midiToHz(c.sa);
  const t = ctx.currentTime + 0.02;
  const strings = pluck(ctx, out, "santoor");
  chimeNotes(c.raga.swaras).forEach(([s, o], i) => strings.note(t + i * 0.085, { hz: swaraHz(sa, s, o), dur: 1.2, vel: 0.95 - i * 0.08 }));
  PERC(sa)(ctx, out, t + 0.3, "m", 0.4);
  setTimeout(() => out.disconnect(), 3000);
}
