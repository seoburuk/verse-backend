import { apiFetch } from "./client";

export interface Streak {
  current: number;
  longest: number;
}

export interface CourseProgress {
  course_id: number;
  cleared: number;
  total: number;
}

export interface ItemProgress {
  course_item_id: number;
  grade: string;
  cleared: boolean;
  book: number;
  chapter: number;
  verse: number;
}

export interface ProgressSummary {
  streak: Streak;
  courses: CourseProgress[];
  items: ItemProgress[];
}

export function getProgress(): Promise<ProgressSummary> {
  return apiFetch<ProgressSummary>("/me/progress");
}
