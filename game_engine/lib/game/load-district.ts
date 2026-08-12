import { createClient } from "@/lib/supabase/server";
import type { District } from "@/lib/game/districts";
import { barberTaskFor, type DistrictTaskPack, type StreetTask } from "@/lib/game/tasks";
import { barberTaskId } from "@/lib/game/barber";

export type LoadedDistrict = {
  id: string;
  district: District;
  taskPack: DistrictTaskPack;
  tasks: StreetTask[];
};

type DistrictRow = {
  id: string;
  district: District;
  task_pack: DistrictTaskPack;
};

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { at: number; value: LoadedDistrict }>();
let listCache: { at: number; value: DistrictListItem[] } | null = null;

export type DistrictListItem = {
  id: string;
  name: string;
  city: string;
  blurb: string;
  language: string;
  languageLabel: string;
  native: string;
  coverImage: string;
  taskCount: number;
};

function rowToLoaded(row: DistrictRow): LoadedDistrict {
  const taskPack = row.task_pack;
  return {
    id: row.id,
    district: row.district,
    taskPack,
    tasks: taskPack.tasks ?? [],
  };
}

function isFresh(at: number): boolean {
  return Date.now() - at < CACHE_TTL_MS;
}

export async function loadDistrictById(
  id: string,
): Promise<LoadedDistrict | null> {
  const hit = cache.get(id);
  if (hit && isFresh(hit.at)) {
    return hit.value;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("districts")
    .select("id, district, task_pack")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("loadDistrictById", id, error);
    throw new Error("Failed to load district.");
  }
  if (!data) {
    return null;
  }

  const loaded = rowToLoaded(data as DistrictRow);
  cache.set(id, { at: Date.now(), value: loaded });
  return loaded;
}

export async function listDistricts(): Promise<DistrictListItem[]> {
  if (listCache && isFresh(listCache.at)) {
    return listCache.value;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("districts")
    .select("id, district, task_pack")
    .order("id");

  if (error) {
    console.error("listDistricts", error);
    throw new Error("Failed to list districts.");
  }

  const items = (data ?? []).map((row) => {
    const district = (row as DistrictRow).district;
    const pack = (row as DistrictRow).task_pack;
    return {
      id: row.id,
      name: district.name,
      city: district.city,
      blurb: district.blurb,
      language: district.language,
      languageLabel: district.languageLabel,
      native: district.native,
      coverImage: district.coverImage,
      taskCount: pack.tasks?.length ?? 0,
    };
  });

  listCache = { at: Date.now(), value: items };
  for (const row of data ?? []) {
    const loaded = rowToLoaded(row as DistrictRow);
    cache.set(loaded.id, { at: Date.now(), value: loaded });
  }

  return items;
}

export function findTaskInLoaded(
  loaded: LoadedDistrict,
  taskId: string,
): StreetTask | undefined {
  const inPack = loaded.tasks.find((t) => t.id === taskId);
  if (inPack) return inPack;
  // The haircut is optional and lives outside the stored pack, so it has to be
  // derived here or /api/talk and /api/speak would 404 on it.
  if (taskId === barberTaskId(loaded.id)) return barberTaskFor(loaded.id);
  return undefined;
}
