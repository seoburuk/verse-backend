import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { getCourseServer, listCoursesServer } from "@/lib/api/server";
import { pickLocalized } from "@/lib/api/courses";
import CourseDetailPersonal from "@/components/courses/CourseDetailPersonal";
import CourseItemList from "@/components/courses/CourseItemList";
import { CommentaryProvider, CommentaryToggleButton, CommentaryBody } from "@/components/courses/CommentaryToggle";
import { renderCommentaryMarkdown } from "@/lib/commentaryMarkdown";
import { SITE_URL } from "@/lib/site";

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
  const path = `/courses/${slug}`;
  const alternates = {
    canonical: locale === "ko" ? path : `/en${path}`,
    languages: { ko: path, en: `/en${path}` },
  };
  try {
    const course = await getCourseServer(slug);
    const title = pickLocalized(course.title, course.title_en, locale);
    const totalVerses =
      (course.items?.length ?? 0) +
      (course.sections?.reduce((n, s) => n + s.items.length, 0) ?? 0);
    const commentary = pickLocalized(course.commentary ?? "", course.commentary_en, locale);
    const firstSentence = commentary
      ? commentary.replace(/^#+\s*/gm, "").split(/\n+/).find((l) => l.trim().length > 0)?.slice(0, 150)
      : undefined;
    return {
      title,
      description: firstSentence || t("courseDetailDesc", { title, count: totalVerses }),
      alternates,
      openGraph: {
        title: t("courseDetailOgTitle", { title }),
        description: t("courseDetailOgDesc", { count: totalVerses }),
      },
    };
  } catch {
    return { title: t("courseDetailFallback"), alternates };
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

  const prefix = locale === "ko" ? "" : "/en";
  const tMeta = await getTranslations("meta");
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "PIX BIBLE", item: `${SITE_URL}${prefix || "/"}` },
      { "@type": "ListItem", position: 2, name: tMeta("coursesTitle"), item: `${SITE_URL}${prefix}/courses` },
      { "@type": "ListItem", position: 3, name: courseTitle },
    ],
  };

  const commentary = pickLocalized(course.commentary ?? "", course.commentary_en, locale);
  const articleJsonLd = commentary
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: locale === "en" ? `${courseTitle} Commentary` : `${courseTitle} 해설`,
        articleBody: commentary.replace(/^#+\s*/gm, "").slice(0, 500),
        url: `${SITE_URL}${prefix}/courses/${slug}`,
      }
    : null;

  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      <CommentaryProvider>
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
          {commentary && (
            <section className="commentary-section">
              <CommentaryToggleButton label={tCourses("commentaryToggle")} />
              <CommentaryBody>{renderCommentaryMarkdown(commentary)}</CommentaryBody>
            </section>
          )}
        </main>
      </CommentaryProvider>
    </div>
  );
}
