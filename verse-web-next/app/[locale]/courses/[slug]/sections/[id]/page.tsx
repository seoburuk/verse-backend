import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { getCourseServer, getSectionServer } from "@/lib/api/server";
import { pickLocalized } from "@/lib/api/courses";
import { bookRef } from "@/lib/bookRef";
import { SITE_URL } from "@/lib/site";
import SectionItemList from "@/components/courses/SectionItemList";

// 구절 텍스트가 초기 HTML에 담기도록 서버에서 fetch해 렌더링한다 (SEO 핵심 페이지).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string; id: string }>;
}): Promise<Metadata> {
  const { locale, slug, id } = await params;
  const path = `/courses/${slug}/sections/${id}`;
  try {
    const [section, course] = await Promise.all([getSectionServer(Number(id)), getCourseServer(slug)]);
    const sectionTitle = pickLocalized(section.title, section.title_en, locale);
    const courseTitle = pickLocalized(course.title, course.title_en, locale);
    const first = section.items[0];
    const description = first
      ? `${bookRef(first.book, first.chapter, first.verse)} — ${first.text.slice(0, 140)}`
      : sectionTitle;
    const title = locale === "en" ? `${sectionTitle} — ${courseTitle} (KJV Memory Verses)` : `${sectionTitle} — ${courseTitle}`;
    const coursePath = `/courses/${slug}`;
    return {
      title,
      description,
      robots: { index: false, follow: true },
      alternates: {
        canonical: locale === "ko" ? coursePath : `/en${coursePath}`,
        languages: { ko: path, en: `/en${path}` },
      },
      openGraph: {
        title,
        description,
      },
    };
  } catch {
    return { title: pickLocalized("구절 목록", "Verse list", locale), robots: { index: false, follow: true } };
  }
}

export default async function SectionDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string; id: string }>;
}) {
  const { locale, slug, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("section");
  const tMeta = await getTranslations("meta");

  let section, course;
  try {
    [section, course] = await Promise.all([getSectionServer(Number(id)), getCourseServer(slug)]);
  } catch {
    notFound();
  }

  const sectionTitle = pickLocalized(section.title, section.title_en, locale);
  const courseTitle = pickLocalized(course.title, course.title_en, locale);
  const prefix = locale === "ko" ? "" : "/en";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "PIXBIBLE", item: `${SITE_URL}${prefix || "/"}` },
      { "@type": "ListItem", position: 2, name: tMeta("coursesTitle"), item: `${SITE_URL}${prefix}/courses` },
      { "@type": "ListItem", position: 3, name: courseTitle, item: `${SITE_URL}${prefix}/courses/${slug}` },
      { "@type": "ListItem", position: 4, name: sectionTitle },
    ],
  };

  return (
    <div className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <header className="page-header">
        <Link href={`/courses/${slug}`} className="btn-link">
          {t("backToCourse", { title: courseTitle })}
        </Link>
        <h1 className="title">{sectionTitle}</h1>
      </header>
      <main className="content">
        <SectionItemList slug={slug} sectionId={section.section_id} items={section.items} />
      </main>
    </div>
  );
}
