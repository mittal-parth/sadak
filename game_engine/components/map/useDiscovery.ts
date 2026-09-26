"use client";

/**
 * The district's places to find, kept in local storage between visits.
 */

import { useCallback, useEffect, useState } from "react";
import { createDiscovery, discoveryKey, type Discovery } from "@/lib/game/discovery";
import type { MapData } from "@/lib/game/world/mapData";

function readStored(districtId: string): string[] {
  const raw = localStorage.getItem(discoveryKey(districtId));
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "string")) {
    throw new Error(`[discovery] ${discoveryKey(districtId)} holds ${raw}, not a list of place names`);
  }
  return parsed;
}

export function useDiscovery(map: MapData | null, districtId: string | null) {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  // Bumped on every find, so the map re-reads the set.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!map || !districtId) return;
    setDiscovery(createDiscovery(map, readStored(districtId)));
  }, [map, districtId]);

  /** Mark a place found; its new tally the first time, else null. */
  const claim = useCallback(
    (name: string) => {
      if (!discovery || !districtId || !discovery.claim(name)) return null;
      localStorage.setItem(discoveryKey(districtId), JSON.stringify([...discovery.found]));
      setVersion((v) => v + 1);
      return discovery.progress();
    },
    [discovery, districtId]
  );

  return { discovery, claim };
}
