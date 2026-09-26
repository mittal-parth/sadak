/**
 * Downloads the raw OpenStreetMap extract for every district into
 * scripts/osm/.cache/<id>.json (gitignored). Run once, or with a district id
 * to refresh one:
 *
 *   npx tsx scripts/osm/fetch.ts [district-id]
 *
 * Map data (c) OpenStreetMap contributors, ODbL 1.0.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OSM_CITIES } from "./cities";

const CACHE = join(dirname(fileURLToPath(import.meta.url)), ".cache");

/** The main instance is often overloaded; mirrors serve the same data. */
const ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function query(bbox: string): string {
  return `[out:json][timeout:150];
(
  way["highway"](${bbox});
  way["building"](${bbox});
  relation["building"](${bbox});
  way["natural"](${bbox});
  relation["natural"="water"](${bbox});
  way["waterway"](${bbox});
  relation["waterway"](${bbox});
  way["leisure"](${bbox});
  relation["leisure"](${bbox});
  way["landuse"](${bbox});
  way["railway"](${bbox});
  way["amenity"](${bbox});
  way["man_made"](${bbox});
  way["place"](${bbox});
  node["highway"="bus_stop"](${bbox});
  node["amenity"](${bbox});
  node["railway"](${bbox});
  node["public_transport"](${bbox});
  node["shop"](${bbox});
  node["tourism"](${bbox});
  node["historic"](${bbox});
);
out geom;`;
}

async function fetchCity(id: string, lat: number, lon: number, half: number) {
  const dLat = half / 111320;
  const dLon = half / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;
  let lastErr: unknown = null;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "sadak-map-builder/1.0" },
        body: new URLSearchParams({ data: query(bbox) }),
      });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      const text = await res.text();
      const json = JSON.parse(text) as { elements: unknown[] };
      writeFileSync(join(CACHE, `${id}.json`), text);
      console.log(`${id}: ${json.elements.length} elements, ${Math.round(text.length / 1024)} KB from ${url}`);
      return;
    } catch (err) {
      console.warn(`${id}: ${String(err)}`);
      lastErr = err;
    }
  }
  throw new Error(`${id}: every Overpass endpoint failed`, { cause: lastErr });
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const only = process.argv[2];
  const cities = only ? OSM_CITIES.filter((c) => c.id === only) : OSM_CITIES;
  if (only && cities.length === 0) throw new Error(`unknown district ${only}`);
  for (const c of cities) {
    await fetchCity(c.id, c.lat, c.lon, c.half);
    // Be polite to a shared public service.
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
