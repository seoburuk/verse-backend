"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listCourses, type Course } from "../../../lib/api/courses";
import { getProgress, type CourseProgress, type Streak } from "../../../lib/api/progress";
import { useAuth } from "../../../lib/hooks/useAuth";

const CATEGORY_LABELS: Record<string, string> = {
  ot: "구약",
  nt: "신약",
  warmup: "워밍업",
  messiah: "예언",
  topic: "주제별",
};

const CATEGORY_ORDER = ["topic", "warmup", "messiah", "ot", "nt"];

function groupByCategory(courses: Course[]): Array<[string, Course[]]> {
  const groups = new Map<string, Course[]>();
  for (const c of courses) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => [cat, groups.get(cat)!]);
}

export default function CourseListPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [progress, setProgress] = useState<Map<number, CourseProgress>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listCourses(), getProgress()])
      .then(([cs, p]) => {
        setCourses(cs);
        setStreak(p.streak);
        setProgress(new Map(p.courses.map((c) => [c.course_id, c])));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="title">Pixel KJV</h1>
        <div className="header-right">
          {streak && <span className="streak-badge">🔥 {streak.current}</span>}
          <span className="user-name">{user?.display_name}</span>
          <button className="btn-link" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        {groupByCategory(courses).map(([category, group]) => (
          <div key={category} className="section-group">
            <h2 className="section-title">{CATEGORY_LABELS[category] ?? category}</h2>
            <div className="course-list">
              {group.map((c) => {
                const p = progress.get(c.id);
                const done = p ? p.cleared === p.total && p.total > 0 : false;
                return (
                  <button
                    key={c.id}
                    className="course-card"
                    onClick={() => router.push(`/courses/${c.slug}`)}
                  >
                    <span className="course-title">{c.title}</span>
                    <span className="course-meta">
                      {p && (
                        <span className={`course-progress${done ? " is-done" : ""}`}>
                          {done ? "✓ " : ""}{p.cleared}/{p.total}
                        </span>
                      )}
                      <span className="course-theme">{c.theme}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
