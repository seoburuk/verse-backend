"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCourse, getSection, type SectionDetail, type CourseDetail } from "../../../../../../../lib/api/courses";
import { getProgress, type ProgressSummary } from "../../../../../../../lib/api/progress";
import { sessionGradesKey } from "../../../../../../../lib/sessionGrades";

export default function SectionCompletePage() {
  const params = useParams<{ slug: string; id: string }>();
  const { slug, id: sectionId } = params;
  const router = useRouter();

  const [section, setSection] = useState<SectionDetail | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [grades, setGrades] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem(sessionGradesKey(sectionId));
    if (stored) setGrades(JSON.parse(stored) as string[]);

    Promise.all([
      getSection(Number(sectionId)),
      getCourse(slug),
      getProgress(),
    ])
      .then(([s, c, p]) => {
        setSection(s);
        setCourse(c);
        setProgress(p);
      })
      .finally(() => setLoading(false));
  }, [sectionId, slug]);

  if (loading) return <div className="page"><p className="muted">불러오는 중...</p></div>;
  if (!section || !course) return null;

  const sections = course.sections ?? [];
  const currentIdx = sections.findIndex((s) => s.section_id === Number(sectionId));
  const nextSection = currentIdx >= 0 && currentIdx < sections.length - 1 ? sections[currentIdx + 1] : null;

  const clearedIds = new Set(
    (progress?.items ?? []).filter((it) => it.cleared).map((it) => it.course_item_id),
  );
  const clearedCount = section.items.filter((it) => clearedIds.has(it.course_item_id)).length;
  const total = section.items.length;

  const greenCount = grades.filter((g) => g === "green").length;
  const yellowCount = grades.filter((g) => g === "yellow").length;
  const redCount = grades.filter((g) => g === "red").length;

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push(`/courses/${slug}`)}>← 코스로</button>
      </header>

      <main className="complete-main">
        <div className="complete-banner">
          <div className="complete-icon">★</div>
          <h1 className="complete-title">섹션 완료!</h1>
          <p className="complete-section-name">{section.title}</p>
        </div>

        <div className="complete-stats">
          <div className="stat-row">
            <span className="stat-label">암송한 절</span>
            <span className="stat-value">{clearedCount} / {total}</span>
          </div>
          {grades.length > 0 && (
            <div className="stat-row">
              <span className="stat-label">이번 세션</span>
              <span className="stat-grades">
                {greenCount > 0 && <span className="grade-dot green-dot">●{greenCount}</span>}
                {yellowCount > 0 && <span className="grade-dot yellow-dot">●{yellowCount}</span>}
                {redCount > 0 && <span className="grade-dot red-dot">●{redCount}</span>}
              </span>
            </div>
          )}
          {progress?.streak && progress.streak.current > 0 && (
            <div className="stat-row">
              <span className="stat-label">스트릭</span>
              <span className="stat-value streak-badge">🔥 {progress.streak.current}일</span>
            </div>
          )}
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
