import { apiFetch } from "./client";

export interface ResumeTarget {
  course_item_id: number;
  course_slug: string;
  course_title: string;
  section_id: number | null;
  section_title: string | null;
  book: number;
  chapter: number;
  verse: number;
  last_attempted_at: string;
}

export function getResume(): Promise<{ resume: ResumeTarget | null }> {
  return apiFetch<{ resume: ResumeTarget | null }>("/me/resume");
}
