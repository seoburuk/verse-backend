import type { Metadata } from "next";
import Link from "next/link";
import { listCoursesServer } from "../../lib/api/server";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../../lib/categories";
import type { Course } from "../../lib/api/courses";
import { CourseHeaderPersonal, ResumeCard } from "../../components/courses/CourseListPersonal";

export const metadata: Metadata = {
  title: "성경 암송 코스",
  description: "KJV 성경 66권을 주제별·카테고리별로 암송하는 코스 목록. 기초, 워밍업, 구약, 신약, 주제별 코스 제공.",
  openGraph: {
    title: "성경 암송 코스 | PIX BIBLE",
    description: "KJV 성경 66권을 주제별·카테고리별로 암송하는 코스 목록.",
  },
};

function groupByCategory(courses: Course[]): Array<[string, Course[]]> {
  const groups = new Map<string, Course[]>();
  for (const c of courses) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => [cat, groups.get(cat)!]);
}

export default async function CourseListPage() {
  let courses: Course[] = [];
  try {
    courses = await listCoursesServer();
  } catch {
    // 백엔드 미기동 시 빈 목록 표시
  }

  const grouped = groupByCategory(courses);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="title">PIX BIBLE</h1>
        <CourseHeaderPersonal />
      </header>
      <main className="content">
        <ResumeCard />
        <div className="course-list">
          {grouped.map(([category, group]) => (
            <Link
              key={category}
              href={group.length === 1 ? `/courses/${group[0].slug}` : `/courses/category/${category}`}
              className="course-card"
            >
              <span className="course-title">{CATEGORY_LABELS[category] ?? category}</span>
              <span className="course-meta">
                <span className="course-progress">{group.length > 1 ? `${group.length}권` : ""}</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
