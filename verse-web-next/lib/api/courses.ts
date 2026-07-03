import { apiFetch } from "./client";

export interface Course {
  id: number;
  slug: string;
  title: string;
  title_en?: string;
  theme: string;
  ord: number;
  category: string;
}

export interface CourseItem {
  course_item_id: number;
  ord: number;
  topic: string;
  topic_en?: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface CourseSection {
  section_id: number;
  title: string;
  title_en?: string;
  ord: number;
  items: CourseItem[];
}

export interface CourseDetail extends Course {
  items?: CourseItem[];
  sections?: CourseSection[];
}

export interface SectionDetail {
  section_id: number;
  title: string;
  title_en?: string;
  ord: number;
  items: CourseItem[];
}

// pickLocalized — en 로케일이고 영어 값이 있으면 영어를, 아니면 한글로 폴백.
export function pickLocalized(ko: string, en: string | undefined, locale: string): string {
  return locale === "en" && en ? en : ko;
}

export function listCourses(): Promise<Course[]> {
  return apiFetch<Course[]>("/courses");
}

export function getCourse(slug: string): Promise<CourseDetail> {
  return apiFetch<CourseDetail>(`/courses/${slug}`);
}

export function getSection(id: number): Promise<SectionDetail> {
  return apiFetch<SectionDetail>(`/sections/${id}`);
}
