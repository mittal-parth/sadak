import type { ComfortLevel } from "@/lib/game/levels";

export type DistrictProgress = {
  districtId: string;
  comfort: ComfortLevel;
  cash: number;
  xp: number;
  completedTaskIds: string[];
};

export type DistrictProgressRow = {
  user_id: string;
  district_id: string;
  comfort: ComfortLevel;
  cash: number;
  xp: number;
  completed_task_ids: string[];
  updated_at: string;
};

export function defaultProgress(districtId: string): DistrictProgress {
  return {
    districtId,
    comfort: "medium",
    cash: 0,
    xp: 0,
    completedTaskIds: [],
  };
}

export function rowToProgress(row: DistrictProgressRow): DistrictProgress {
  return {
    districtId: row.district_id,
    comfort: row.comfort,
    cash: row.cash,
    xp: row.xp,
    completedTaskIds: row.completed_task_ids ?? [],
  };
}

export function progressToUpsert(
  userId: string,
  progress: DistrictProgress,
): Omit<DistrictProgressRow, "updated_at"> {
  return {
    user_id: userId,
    district_id: progress.districtId,
    comfort: progress.comfort,
    cash: progress.cash,
    xp: progress.xp,
    completed_task_ids: progress.completedTaskIds,
  };
}
