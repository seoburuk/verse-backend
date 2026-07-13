import { apiFetch } from "./client";

export interface RankingEntry {
  rank: number;
  username: string;
  streak: number;
  cleared_verses: number;
  dictation_pts: number;
  score: number;
}

export interface Rankings {
  entries: RankingEntry[];
  me: RankingEntry | null;
  nearby?: RankingEntry[];
}

export function getRankings(): Promise<Rankings> {
  return apiFetch<Rankings>("/rankings");
}
