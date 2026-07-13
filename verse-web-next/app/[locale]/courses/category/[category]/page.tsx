import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { listCoursesServer } from "@/lib/api/server";
import { isTrialCourse } from "@/lib/guest";
import { pickLocalized, type Course } from "@/lib/api/courses";
import { GuestLockLink } from "@/components/courses/GuestLockLink";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; category: string }>;
}): Promise<Metadata> {
  const { locale, category } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const tc = await getTranslations({ locale, namespace: "categories" });
  const label = tc.has(category) ? tc(category) : category;
  const path = `/courses/category/${category}`;
  return {
    title: t("categoryTitle", { label }),
    description: t("categoryDesc", { label }),
    alternates: {
      canonical: locale === "ko" ? path : `/en${path}`,
      languages: { ko: path, en: `/en${path}` },
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: Locale; category: string }>;
}) {
  const { locale, category } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  const tc = await getTranslations("categories");
  const label = tc.has(category) ? tc(category) : category;

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
        <Link href="/courses" className="btn-link">{t("backToCourses")}</Link>
        <h1 className="title">{label}</h1>
      </header>
      <main className="content">
        <div className="course-list">
          {courses.map((c) => (
            <GuestLockLink
              key={c.id}
              href={`/courses/${c.slug}`}
              unlockedForGuest={isTrialCourse(c.slug)}
              className="course-card"
            >
              <span className="course-title">{pickLocalized(c.title, c.title_en, locale)}</span>
              <span className="course-meta">
                <span className="course-theme">{c.theme}</span>
              </span>
            </GuestLockLink>
          ))}
        </div>
      </main>
    </div>
  );
}
