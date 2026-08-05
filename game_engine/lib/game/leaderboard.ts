export type LeaderboardRow = {
  rank: number;
  user_id: string;
  display_name: string;
  total_xp: number;
  total_cash: number;
  errands_completed: number;
  cities_completed: number;
};

export type LeaderboardResponse = {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  meId: string;
};
