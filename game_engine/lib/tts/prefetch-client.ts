export type TtsPrefetchMap = Map<string, string>;

/** Fetches cached WAVs into blob URLs keyed by prefetch item key. */
export async function prefetchTtsUrls(
  items: Array<{ key: string; url: string }>,
): Promise<TtsPrefetchMap> {
  const map: TtsPrefetchMap = new Map();

  await Promise.all(
    items.map(async (item) => {
      try {
        const res = await fetch(item.url, { cache: "force-cache" });
        if (!res.ok) return;
        const blob = await res.blob();
        map.set(item.key, URL.createObjectURL(blob));
      } catch {
        /* miss — live /api/speak fallback */
      }
    }),
  );

  return map;
}

export function revokeTtsPrefetchMap(map: TtsPrefetchMap): void {
  for (const url of map.values()) {
    URL.revokeObjectURL(url);
  }
  map.clear();
}
