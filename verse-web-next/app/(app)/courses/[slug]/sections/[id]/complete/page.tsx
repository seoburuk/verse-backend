"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCourse, getSection, type SectionDetail, type CourseDetail } from "../../../../../../../lib/api/courses";

export default function SectionCompletePage() {
  const params = useParams<{ slug: string; id: string }>();
  const { slug, id: sectionId } = params;
  const router = useRouter();

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

  if (loading) return <div className="page"><p className="muted">불러오는 중...</p></div>;
  if (!section || !course) return null;

  const sections = course.sections ?? [];
  const currentIdx = sections.findIndex((s) => s.section_id === Number(sectionId));
  const nextSection = currentIdx >= 0 && currentIdx < sections.length - 1 ? sections[currentIdx + 1] : null;

  const confettiColors = ["var(--green)", "var(--yellow)", "var(--pink)", "var(--pink-soft)"];

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push(`/courses/${slug}`)}>← 코스로</button>
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
          <h1 className="complete-title">섹션 완료!</h1>
          <p className="complete-section-name">{section.title}</p>
        </div>

        <div className="complete-actions">
          {nextSection ? (
            <button
              className="btn-primary"
              onClick={() => router.push(`/courses/${slug}/sections/${nextSection.section_id}`)}
            >
              다음 섹션: {nextSection.title} →
            </button>
          ) : (
            <button className="btn-primary" onClick={() => router.push(`/courses/${slug}`)}>
              코스 완료! 돌아가기
            </button>
          )}
          <button className="btn-secondary" onClick={() => router.push(`/courses/${slug}/sections/${sectionId}`)}>
            이 섹션 다시 보기
          </button>
        </div>
      </main>
    </div>
  );
}
