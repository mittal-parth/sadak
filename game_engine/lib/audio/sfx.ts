/**
 * UI/gameplay sound effects, ported from kahani's `lib/sfx.ts` and remapped
 * onto SADAK's own event set (see the plan's SFX name map): clicks, the mic
 * hold, dialogue open/close, per-band scoring feedback, and errand cash-out.
 *
 * Components opt in by name; the shared `Button` plays "click" by default
 * and accepts a `sound` prop for anything else (or "none" to stay silent).
 */

import { playSound } from "@/lib/audio/engine";
import type { SoundAsset } from "@/lib/audio/assets/types";
import { click001Sound } from "@/lib/audio/assets/click-001";
import { clickSoftSound } from "@/lib/audio/assets/click-soft";
import { close001Sound } from "@/lib/audio/assets/close-001";
import { coinCollectSound } from "@/lib/audio/assets/coin-collect";
import { errorBuzzSound } from "@/lib/audio/assets/error-buzz";
import { hoverTickSound } from "@/lib/audio/assets/hover-tick";
import { notificationPopSound } from "@/lib/audio/assets/notification-pop";
import { successChimeSound } from "@/lib/audio/assets/success-chime";
import { switchOffSound } from "@/lib/audio/assets/switch-off";
import { switchOnSound } from "@/lib/audio/assets/switch-on";

/** Names of the available sound effects. */
export type SfxName =
  | "click"
  | "tap"
  | "hover"
  | "open"
  | "close"
  | "toggleOn"
  | "toggleOff"
  | "success"
  | "partial"
  | "error"
  | "cash";

/** Effect name -> asset it plays, and the volume it plays at (see VOLUME below). */
const SFX_LIBRARY: Record<SfxName, { asset: SoundAsset; volume?: number }> = {
  click: { asset: click001Sound },
  tap: { asset: clickSoftSound },
  hover: { asset: hoverTickSound },
  open: { asset: notificationPopSound },
  close: { asset: close001Sound },
  toggleOn: { asset: switchOnSound },
  toggleOff: { asset: switchOffSound },
  success: { asset: successChimeSound },
  // Reuses the "open" pop at a lower volume rather than a dedicated asset —
  // a partial-credit line is a lesser event than a fresh dialogue opening.
  partial: { asset: notificationPopSound, volume: 0.22 },
  error: { asset: errorBuzzSound },
  cash: { asset: coinCollectSound },
};

/** Level for all effects relative to the source clip; they sit under voice and music. */
const VOLUME = 0.35;
/** Hover plays much quieter than a deliberate click. */
const HOVER_VOLUME = 0.18;
/** Minimum gap between hover ticks, so sweeping the mouse across several
 *  buttons doesn't machine-gun the sound. */
const HOVER_DEBOUNCE_MS = 90;

let lastHoverAt = 0;

/**
 * Play a named effect. Safe anywhere: no-ops during SSR. Effects triggered
 * from real input handlers satisfy browser autoplay rules, since the
 * gesture itself creates/resumes the underlying AudioContext.
 */
export function playSfx(name: SfxName): void {
  if (typeof window === "undefined") return;
  if (name === "hover") {
    const now = performance.now();
    if (now - lastHoverAt < HOVER_DEBOUNCE_MS) return;
    lastHoverAt = now;
    void playSound(SFX_LIBRARY.hover.asset.dataUri, { volume: HOVER_VOLUME });
    return;
  }
  const { asset, volume } = SFX_LIBRARY[name];
  void playSound(asset.dataUri, { volume: volume ?? VOLUME });
}
