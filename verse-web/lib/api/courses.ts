import { apiFetch } from "./client";

export interface Course {
  id: number;
  slug: string;
  title: string;
  theme: string;
  ord: number;
  category: string;
}

export interface CourseItem {
  course_item_id: number;
  ord: number;
  topic: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface CourseSection {
  section_id: number;
  title: string;
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
  ord: number;
  items: CourseItem[];
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
