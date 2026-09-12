import { apiFetch } from "./client";
import type { Grade } from "../grading/grade";

export interface AttemptRequest {
  course_item_id: number;
  mode: "drag" | "type" | "dictation";
  client_grade: Grade;
  tokens: string[];
}

/// 사용자의 로컬 날짜(YYYY-MM-DD). 서버는 이 값으로 연속일을 판정한다 —
/// 보내지 않으면 UTC 기준으로 떨어져 KST 자정~오전 9시 학습이 전날로 기록된다.
export function localDayString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface AttemptResult {
  attempt_id: number;
  client_grade: Grade;
  server_grade: Grade;
}

export function submitAttempt(req: AttemptRequest): Promise<AttemptResult> {
  return apiFetch<AttemptResult>("/attempts", {
    method: "POST",
    body: JSON.stringify({ ...req, local_day: localDayString() }),
  });
}
