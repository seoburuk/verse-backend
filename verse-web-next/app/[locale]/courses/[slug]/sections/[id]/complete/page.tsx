"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { getCourse, getSection, pickLocalized, type SectionDetail, type CourseDetail } from "@/lib/api/courses";

export default function SectionCompletePage() {
  const params = useParams<{ slug: string; id: string }>();
  const { slug, id: sectionId } = params;
  const router = useRouter();
  const t = useTranslations("complete");
  const locale = useLocale();

  const [section, setSection] = useState<SectionDetail | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getSection(Number(sectionId)),
      getCourse(slug),
    ])
      .then(([s, c]) => {
        setSection(s);
        setCourse(c);
      })
      .finally(() => setLoading(false));
  }, [sectionId, slug]);

  if (loading) return <div className="page"><p className="muted">{t("loading")}</p></div>;
  if (!section || !course) return null;

  const sections = course.sections ?? [];
  const currentIdx = sections.findIndex((s) => s.section_id === Number(sectionId));
  const nextSection = currentIdx >= 0 && currentIdx < sections.length - 1 ? sections[currentIdx + 1] : null;

  const confettiColors = ["var(--green)", "var(--yellow)", "var(--pink)", "var(--pink-soft)"];

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push(`/courses/${slug}`)}>{t("backToCourse")}</button>
      </header>

      <main className="complete-main">
        <div className="complete-banner">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="confetti"
              style={{
                left: `${8 + i * 7.5}%`,
                background: confettiColors[i % confettiColors.length],
                animationDelay: `${0.25 + (i % 5) * 0.09}s`,
              }}
            />
          ))}
          <div className="complete-icon">★</div>
          <h1 className="complete-title">{t("sectionComplete")}</h1>
          <p className="complete-section-name">{pickLocalized(section.title, section.title_en, locale)}</p>
        </div>

        <div className="complete-actions">
          {nextSection ? (
            <button
              className="btn-primary"
              onClick={() => router.push(`/courses/${slug}/sections/${nextSection.section_id}`)}
            >
              {t("nextSection", { title: pickLocalized(nextSection.title, nextSection.title_en, locale) })}
            </button>
          ) : (
            <button className="btn-primary" onClick={() => router.push(`/courses/${slug}`)}>
              {t("courseComplete")}
            </button>
          )}
          <button className="btn-secondary" onClick={() => router.push(`/courses/${slug}/sections/${sectionId}`)}>
            {t("reviewSection")}
          </button>
        </div>
      </main>
    </div>
  );
}
