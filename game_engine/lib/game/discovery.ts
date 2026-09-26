/**
 * Places to find: every named place on the district map (its landmarks,
 * parks and markets, tanks, stations and big named buildings) starts
 * undiscovered and is found by going there. The full map shows what is
 * still out there; the location card says when you have found something.
 */

import { placeLabels, type PlaceLabel } from "./world/mapLabels";
import type { MapData } from "./world/mapData";

export type Discovery = {
  places: PlaceLabel[];
  found: ReadonlySet<string>;
  /** Mark a place found; true the first time. Unknown names are ignored. */
  claim(name: string): boolean;
  progress(): { found: number; total: number };
};

export function createDiscovery(map: MapData, stored: readonly string[] = []): Discovery {
  const places = placeLabels(map);
  const names = new Set(places.map((p) => p.name));
  const found = new Set(stored.filter((n) => names.has(n)));
  return {
    places,
    found,
    claim(name) {
      if (!names.has(name) || found.has(name)) return false;
      found.add(name);
      return true;
    },
    progress: () => ({ found: found.size, total: places.length }),
  };
}

/** Where a district's finds are kept between visits. */
export const discoveryKey = (districtId: string) => `sadak:found:${districtId}`;
