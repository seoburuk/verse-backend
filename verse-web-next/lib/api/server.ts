import type { Course, CourseDetail, SectionDetail } from "./courses";

export type { Course, CourseDetail, SectionDetail };

const API = process.env.API_URL ?? "http://localhost:8080/v1";

async function serverFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: 3600 } } as RequestInit);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export function listCoursesServer(): Promise<Course[]> {
  return serverFetch<Course[]>("/courses");
}

export function getCourseServer(slug: string): Promise<CourseDetail> {
  return serverFetch<CourseDetail>(`/courses/${slug}`);
}

export function getSectionServer(id: number): Promise<SectionDetail> {
  return serverFetch<SectionDetail>(`/sections/${id}`);
}

export interface Verse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export function getVerseServer(book: number, chapter: number, verse: number): Promise<Verse> {
  return serverFetch<Verse>(`/verses/${book}/${chapter}/${verse}`);
}
