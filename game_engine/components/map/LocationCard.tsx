"use client";

/**
 * Where you are, the way an open-world game says it: walk into a new place
 * or onto a new street and its name slides in at the bottom right for a few
 * seconds, the place large and the street (or the district) under it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveState } from "@/lib/game/engine";
import type { District } from "@/lib/game/districts";
import type { MapData } from "@/lib/game/world/mapData";
import { createLocator } from "@/lib/game/world/mapLabels";
import { cn } from "@/lib/utils";

/** How long a new whereabouts must hold before it is announced (crossing a
 *  junction should not flash three street names). */
const SETTLE_MS = 600;
const SHOW_MS = 4200;

type Card = { title: string; subtitle: string; key: number };

export function LocationCard({
  map,
  live,
  district,
  compact,
}: {
  map: MapData;
  /** Engine-owned, mutated every frame. */
  live: LiveState | null;
  district: District;
  compact: boolean;
}) {
  const locator = useMemo(() => createLocator(map), [map]);
  const liveRef = useRef(live);
  liveRef.current = live;
  const [card, setCard] = useState<Card | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let lastKey: string | null = null;
    let pending: { key: string; since: number } | null = null;
    let hideAt = 0;
    let n = 0;
    const tick = () => {
      const l = liveRef.current;
      const now = performance.now();
      if (hideAt && now > hideAt) {
        hideAt = 0;
        setShown(false);
      }
      if (!l) return;
      const where = locator.locate(l.x, l.z);
      const key = `${where.place ?? ""}|${where.road ?? ""}`;
      if (key === lastKey) {
        pending = null;
        return;
      }
      if (!pending || pending.key !== key) {
        pending = { key, since: now };
        // The first reading, on arrival, shows at once.
        if (lastKey !== null) return;
      } else if (now - pending.since < SETTLE_MS) return;
      // Nothing named here: keep quiet rather than announce "nowhere".
      const title = where.place ?? where.road;
      lastKey = key;
      pending = null;
      if (!title && n > 0) return;
      // Under the name: the street you are on at a place, else the district
      // (just the city when the street is what the district is named for).
      const shown = title ?? district.name;
      const subtitle =
        where.place && where.road ? where.road : shown === district.name ? district.city : `${district.name}, ${district.city}`;
      setCard({ title: shown, subtitle, key: ++n });
      setShown(true);
      hideAt = now + SHOW_MS;
    };
    const id = window.setInterval(tick, 200);
    tick();
    return () => window.clearInterval(id);
  }, [locator, district]);

  if (!card) return null;
  return (
    <div
      key={card.key}
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute z-20 text-right text-white",
        compact ? "top-[7.5rem] right-4" : "right-6 bottom-[14rem]",
        shown
          ? "animate-in fade-in slide-in-from-right-8 duration-500 ease-out"
          : "opacity-0 transition-opacity duration-700"
      )}
      style={{ textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)" }}
    >
      <div className={cn("font-heading leading-none tracking-wide", compact ? "text-xl" : "text-4xl")}>{card.title}</div>
      <div className={cn("mt-1 ml-auto h-0.5 bg-white/80", compact ? "w-16" : "w-28")} />
      <div className={cn("mt-1 text-white/85", compact ? "text-xs" : "text-base")}>{card.subtitle}</div>
    </div>
  );
}
