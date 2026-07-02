"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { listCourses, type Course } from "../../../../../lib/api/courses";
import { getProgress, type CourseProgress } from "../../../../../lib/api/progress";
import { CATEGORY_LABELS } from "../../../../../lib/categories";

export default function CategoryPage() {
  const params = useParams<{ category: string }>();
  const category = params.category;
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<Map<number, CourseProgress>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listCourses(), getProgress()])
      .then(([cs, p]) => {
        setCourses(cs.filter((c) => c.category === category).sort((a, b) => a.ord - b.ord));
        setProgress(new Map(p.courses.map((c) => [c.course_id, c])));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>← 코스 목록</button>
        <h2 className="title">{CATEGORY_LABELS[category] ?? category}</h2>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        <div className="course-list">
          {courses.map((c) => {
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
      </main>
    </div>
  );
}
