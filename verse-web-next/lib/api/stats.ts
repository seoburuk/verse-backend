import { apiFetch } from "./client";

export interface CategoryProgress {
  category: string;
  cleared: number;
  total: number;
}

export interface GradeDistribution {
  green: number;
  yellow: number;
  red: number;
}

export interface BookProgress {
  book: number;
  cleared: number;
  total: number;
}

export interface Stats {
  streak: { current: number; longest: number };
  total_cleared: number;
  categories: CategoryProgress[];
  books: BookProgress[];
  grades: GradeDistribution;
}

export function getStats(): Promise<Stats> {
  return apiFetch<Stats>("/me/stats");
}
