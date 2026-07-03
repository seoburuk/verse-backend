import { apiFetch } from "./client";

export interface FavoriteItem {
  course_item_id: number;
  topic: string;
  course_slug: string;
  course_title: string;
  course_title_en?: string;
  section_id: number | null;
  section_title: string | null;
  section_title_en?: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export function getFavorites(): Promise<{ items: FavoriteItem[] }> {
  return apiFetch<{ items: FavoriteItem[] }>("/me/favorites");
}

export function addFavorite(itemId: number): Promise<void> {
  return apiFetch<void>(`/me/favorites/${itemId}`, { method: "PUT" });
}

export function removeFavorite(itemId: number): Promise<void> {
  return apiFetch<void>(`/me/favorites/${itemId}`, { method: "DELETE" });
}
