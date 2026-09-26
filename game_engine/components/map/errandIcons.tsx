"use client";

/**
 * The errand icons: one line-icon set for the errand list, the full map's
 * markers and its legend. Lucide where it has the thing; the three it does
 * not (the auto-rickshaw, a mandir, a gurdwara) drawn on Lucide's 24px grid
 * with its stroke, caps and joins, so they sit in the set.
 */

import {
  BusFront,
  CarTaxiFront,
  Check,
  Church,
  createLucideIcon,
  Mosque,
  Scissors,
  Ship,
  Soup,
  Store,
  Ticket,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import type { ErrandIconId } from "./mapKit";

/** A Bajaj RE side-on, nose to the left: the apron sloping down to the
 *  single front wheel, the tall rounded canopy, the open side behind the
 *  driver's pillar, the rear wheel under the passengers. */
const AutoRickshaw = createLucideIcon("auto-rickshaw", [
  ["path", { d: "M3 17.5 5.5 11C5.5 7.5 8 5 12 5h5a3 3 0 0 1 3 3v9.5", key: "body" }],
  ["path", { d: "M9 5.3V12h11", key: "open-side" }],
  ["path", { d: "M5.5 11H9", key: "dash" }],
  ["circle", { cx: "6", cy: "17.5", r: "2", key: "front" }],
  ["circle", { cx: "16", cy: "17.5", r: "2", key: "rear" }],
  ["path", { d: "M8 17.5h6M18 17.5h2", key: "sill" }],
]);

/** A mandir: the curving shikhara over the sanctum, its pennant, the
 *  doorway in the plinth. */
const Mandir = createLucideIcon("mandir", [
  ["path", { d: "M12 5V2l3 1.2L12 4.4", key: "pennant" }],
  ["path", { d: "M7.5 13C7.5 9.5 9.5 6.5 12 5c2.5 1.5 4.5 4.5 4.5 8", key: "shikhara" }],
  ["path", { d: "M5 13h14", key: "cornice" }],
  ["path", { d: "M6 13v8M18 13v8", key: "walls" }],
  ["path", { d: "M10 21v-3a2 2 0 0 1 4 0v3", key: "door" }],
  ["path", { d: "M3 21h18", key: "ground" }],
]);

/** A gurdwara: the ribbed onion dome and its kalash, the arched door, and
 *  the Nishan Sahib's pole and pennant beside it. */
const Gurdwara = createLucideIcon("gurdwara", [
  ["path", { d: "M10 2v2", key: "kalash" }],
  ["path", { d: "M10 4c-2.5 1.5-4.5 3.5-4.5 6.5h9C14.5 7.5 12.5 5.5 10 4z", key: "dome" }],
  ["path", { d: "M4 10.5h12", key: "cornice" }],
  ["path", { d: "M5 10.5V21M15 10.5V21", key: "walls" }],
  ["path", { d: "M8.5 21v-3.5a1.5 1.5 0 0 1 3 0V21", key: "door" }],
  ["path", { d: "M20 21V3l-3.5 2 3.5 2", key: "nishan" }],
  ["path", { d: "M2 21h20", key: "ground" }],
]);

export const ERRAND_ICONS: Record<ErrandIconId, LucideIcon> = {
  auto: AutoRickshaw,
  taxi: CarTaxiFront,
  shop: Store,
  langar: Soup,
  temple: Mandir,
  mosque: Mosque,
  church: Church,
  gurdwara: Gurdwara,
  bus: BusFront,
  ticket: Ticket,
  train: TrainFront,
  ferry: Ship,
  barber: Scissors,
  done: Check,
};

/** `size` and `color` are for an icon read back out of the page (the full
 *  map's canvas sprites), where CSS sizing and currentColor don't travel. */
export function ErrandIcon({
  id,
  className,
  strokeWidth = 2,
  size,
  color,
}: {
  id: ErrandIconId;
  className?: string;
  strokeWidth?: number;
  size?: number;
  color?: string;
}) {
  const Icon = ERRAND_ICONS[id];
  return <Icon className={className} strokeWidth={strokeWidth} size={size} color={color} aria-hidden />;
}
