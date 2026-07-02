"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStats, type Stats } from "../../../lib/api/stats";
import { listCourses } from "../../../lib/api/courses";
import { getProgress, type CourseProgress } from "../../../lib/api/progress";

interface CourseRow {
  slug: string;
  title: string;
  cleared: number;
  total: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [courseRows, setCourseRows] = useState<CourseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), listCourses(), getProgress()])
      .then(([s, cs, p]) => {
        setStats(s);
        const progressByCourse = new Map<number, CourseProgress>(p.courses.map((c) => [c.course_id, c]));
        const rows = cs
          .map((c) => {
            const pr = progressByCourse.get(c.id);
            return { slug: c.slug, title: c.title, cleared: pr?.cleared ?? 0, total: pr?.total ?? 0 };
          })
          .filter((r) => r.cleared > 0)
          .sort((a, b) => b.cleared - a.cleared);
        setCourseRows(rows);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalGrades = stats ? stats.grades.green + stats.grades.yellow + stats.grades.red : 0;

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>← 코스 목록</button>
        <h1 className="title">대시보드</h1>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        {stats && (
          <>
            <div className="dash-summary">
              <div className="dash-summary-item">
                <span className="dash-summary-value">{stats.total_cleared}</span>
                <span className="dash-summary-label">암송한 절</span>
              </div>
              <div className="dash-summary-item">
                <span className="dash-summary-value">🔥 {stats.streak.current}</span>
                <span className="dash-summary-label">현재 스트릭</span>
              </div>
              <div className="dash-summary-item">
                <span className="dash-summary-value">{stats.streak.longest}</span>
                <span className="dash-summary-label">최장 스트릭</span>
              </div>
            </div>

            <div className="section-group">
              <h2 className="section-title">섹션별 진도</h2>
              {courseRows.length === 0 ? (
                <p className="muted">아직 암송 기록이 없어요</p>
              ) : (
                <div className="dash-category-list">
                  {courseRows.map((c) => {
                    const pct = c.total > 0 ? Math.round((c.cleared / c.total) * 100) : 0;
                    return (
                      <div key={c.slug} className="dash-category-row">
                        <div className="dash-category-head">
                          <span>{c.title}</span>
                          <span className="muted">{c.cleared}/{c.total} ({pct}%)</span>
                        </div>
                        <div className="dash-bar-track">
                          <div className="dash-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="section-group">
              <h2 className="section-title">등급 분포</h2>
              {totalGrades === 0 ? (
                <p className="muted">아직 암송 기록이 없어요</p>
              ) : (
                <div className="dash-grade-bar">
                  <div
                    className="dash-grade-seg dash-grade-green"
                    style={{ width: `${(stats.grades.green / totalGrades) * 100}%` }}
                  />
                  <div
                    className="dash-grade-seg dash-grade-yellow"
                    style={{ width: `${(stats.grades.yellow / totalGrades) * 100}%` }}
                  />
                  <div
                    className="dash-grade-seg dash-grade-red"
                    style={{ width: `${(stats.grades.red / totalGrades) * 100}%` }}
                  />
                </div>
              )}
              <div className="dash-grade-legend">
                <span className="grade-dot green-dot">● 초록 {stats.grades.green}</span>
                <span className="grade-dot yellow-dot">● 노랑 {stats.grades.yellow}</span>
                <span className="grade-dot red-dot">● 빨강 {stats.grades.red}</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
