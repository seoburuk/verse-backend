import { apiFetch } from "./client";

export interface Lives {
  lives: number;
  max_lives: number;
  next_refill_sec: number;
  updated_at: string;
}

export function getLives(): Promise<Lives> {
  return apiFetch<Lives>("/me/lives");
}
