import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { listCoursesServer } from "@/lib/api/server";
import { CATEGORY_ORDER } from "@/lib/categories";
import type { Course } from "@/lib/api/courses";
import { CourseHeaderPersonal, ResumeCard } from "@/components/courses/CourseListPersonal";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("coursesTitle"),
    description: t("coursesDesc"),
    openGraph: {
      title: t("coursesOgTitle"),
      description: t("coursesOgDesc"),
    },
  };
}

function groupByCategory(courses: Course[]): Array<[string, Course[]]> {
  const groups = new Map<string, Course[]>();
  for (const c of courses) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => [cat, groups.get(cat)!]);
}

export default async function CourseListPage({
  params: { locale },
}: {
  params: { locale: Locale };
}) {
  setRequestLocale(locale);
  const t = await getTranslations("courses");
  const tc = await getTranslations("categories");

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
              <span className="course-title">{tc(category)}</span>
              <span className="course-meta">
                <span className="course-progress">{group.length > 1 ? t("bookCount", { count: group.length }) : ""}</span>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
