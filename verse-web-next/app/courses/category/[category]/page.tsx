import type { Metadata } from "next";
import Link from "next/link";
import { listCoursesServer } from "../../../../lib/api/server";
import { CATEGORY_LABELS } from "../../../../lib/categories";
import type { Course } from "../../../../lib/api/courses";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    title: `${label} 코스`,
    description: `KJV 성경 ${label} 카테고리 암송 코스 목록.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  let courses: Course[] = [];
  try {
    const all = await listCoursesServer();
    courses = all.filter((c) => c.category === category).sort((a, b) => a.ord - b.ord);
  } catch {
    // 빈 목록
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link href="/courses" className="btn-link">← 코스 목록</Link>
        <h1 className="title">{CATEGORY_LABELS[category] ?? category}</h1>
      </header>
      <main className="content">
        <div className="course-list">
          {courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="course-card">
              <span className="course-title">{c.title}</span>
              <span className="course-meta">
                <span className="course-theme">{c.theme}</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
