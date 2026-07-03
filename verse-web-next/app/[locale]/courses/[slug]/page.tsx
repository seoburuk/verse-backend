import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { getCourseServer, listCoursesServer } from "@/lib/api/server";
import { pickLocalized } from "@/lib/api/courses";
import CourseDetailPersonal from "@/components/courses/CourseDetailPersonal";
import CourseItemList from "@/components/courses/CourseItemList";

export async function generateStaticParams() {
  try {
    const courses = await listCoursesServer();
    return courses.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  try {
    const course = await getCourseServer(slug);
    const title = pickLocalized(course.title, course.title_en, locale);
    const totalVerses =
      (course.items?.length ?? 0) +
      (course.sections?.reduce((n, s) => n + s.items.length, 0) ?? 0);
    return {
      title,
      description: t("courseDetailDesc", { title, count: totalVerses }),
      openGraph: {
        title: t("courseDetailOgTitle", { title }),
        description: t("courseDetailOgDesc", { count: totalVerses }),
      },
    };
  } catch {
    return { title: t("courseDetailFallback") };
  }
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  const tCourses = await getTranslations("courses");

  let course;
  try {
    course = await getCourseServer(slug);
  } catch {
    notFound();
  }

  const courseTitle = pickLocalized(course.title, course.title_en, locale);
  const totalVerses =
    (course.items?.length ?? 0) +
    (course.sections?.reduce((n, s) => n + s.items.length, 0) ?? 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: courseTitle,
    numberOfItems: totalVerses,
    itemListElement: course.sections
      ? course.sections.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: pickLocalized(s.title, s.title_en, locale),
        }))
      : (course.items ?? []).slice(0, 20).map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: pickLocalized(item.topic, item.topic_en, locale),
          description: item.text,
        })),
  };

  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="page-header">
        <Link href="/courses" className="btn-link">{t("backToCourses")}</Link>
        <h1 className="title">{courseTitle}</h1>
        <CourseDetailPersonal />
      </header>
      <main className="content">
        {course.sections ? (
          <div className="item-list">
            {course.sections.map((section) => (
              <Link
                key={section.section_id}
                href={`/courses/${slug}/sections/${section.section_id}`}
                className="item-card"
              >
                <span className="item-topic">{pickLocalized(section.title, section.title_en, locale)}</span>
                <span className="item-ref">{tCourses("verseCount", { count: section.items.length })}</span>
              </Link>
            ))}
          </div>
        ) : (
          <CourseItemList slug={slug} items={course.items ?? []} />
        )}
      </main>
    </div>
  );
}
