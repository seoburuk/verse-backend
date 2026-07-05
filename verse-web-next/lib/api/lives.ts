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

// 암송 중 이탈 페널티 — 목숨 1 소모 후 남은 목숨을 반환한다.
export function consumeLife(): Promise<Lives> {
  return apiFetch<Lives>("/me/lives/consume", { method: "POST" });
}
