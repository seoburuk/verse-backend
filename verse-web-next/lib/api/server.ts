import type { Course, CourseDetail } from "./courses";

export type { Course, CourseDetail };

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
