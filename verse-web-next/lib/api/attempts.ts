import { apiFetch } from "./client";
import type { Grade } from "../grading/grade";

export interface AttemptRequest {
  course_item_id: number;
  mode: "drag" | "type" | "dictation";
  client_grade: Grade;
  tokens: string[];
}

export interface AttemptResult {
  attempt_id: number;
  client_grade: Grade;
  server_grade: Grade;
}

export function submitAttempt(req: AttemptRequest): Promise<AttemptResult> {
  return apiFetch<AttemptResult>("/attempts", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
