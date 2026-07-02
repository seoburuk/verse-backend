"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listCourses, type Course } from "../../../lib/api/courses";
import { getProgress, type CourseProgress, type Streak } from "../../../lib/api/progress";
import { getLives, type Lives } from "../../../lib/api/lives";
import { getResume, type ResumeTarget } from "../../../lib/api/resume";
import { useAuth } from "../../../lib/hooks/useAuth";
import { bookRef } from "../../../lib/bookRef";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../../../lib/categories";

function groupByCategory(courses: Course[]): Array<[string, Course[]]> {
  const groups = new Map<string, Course[]>();
  for (const c of courses) {
    const list = groups.get(c.category) ?? [];
    list.push(c);
    groups.set(c.category, list);
  }
  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => [cat, groups.get(cat)!]);
}

function resumeUrl(r: ResumeTarget): string {
  if (r.section_id != null) {
    return `/courses/${r.course_slug}/sections/${r.section_id}/memorize/${r.course_item_id}`;
  }
  return `/courses/${r.course_slug}/memorize/${r.course_item_id}`;
}

export default function CourseListPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [progress, setProgress] = useState<Map<number, CourseProgress>>(new Map());
  const [lives, setLives] = useState<Lives | null>(null);
  const [resume, setResume] = useState<ResumeTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listCourses(), getProgress(), getLives()])
      .then(([cs, p, l]) => {
        setCourses(cs);
        setStreak(p.streak);
        setProgress(new Map(p.courses.map((c) => [c.course_id, c])));
        setLives(l);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    getResume().then((res) => setResume(res.resume)).catch(() => {});
  }, []);

  function categoryMeta(group: Course[]): string {
    if (group.length === 1) {
      const p = progress.get(group[0].id);
      return p ? `${p.cleared}/${p.total}` : "";
    }
    return `${group.length}권`;
  }

  function openCategory(category: string, group: Course[]) {
    if (group.length === 1) {
      router.push(`/courses/${group[0].slug}`);
    } else {
      router.push(`/courses/category/${category}`);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="title">Pixel KJV</h1>
        <div className="header-right">
          {lives && <span className="lives-badge">❤️ {lives.lives}</span>}
          {streak && <span className="streak-badge">🔥 {streak.current}</span>}
          <span className="user-name">{user?.display_name}</span>
          <button className="btn-link" onClick={() => router.push("/bookmarks")}>책갈피</button>
          <button className="btn-link" onClick={() => router.push("/dashboard")}>대시보드</button>
          <button className="btn-link" onClick={() => router.push("/settings")}>설정</button>
          <button className="btn-link" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}

        {resume && (
          <div
            className="resume-card"
            role="button"
            tabIndex={0}
            onClick={() => router.push(resumeUrl(resume))}
            onKeyDown={(e) => e.key === "Enter" && router.push(resumeUrl(resume))}
          >
            <span className="resume-label">▶ 이어가기</span>
            <span className="resume-title">
              {resume.course_title}
              {resume.section_title ? ` › ${resume.section_title}` : ""}
            </span>
            <span className="muted resume-ref">{bookRef(resume.book, resume.chapter, resume.verse)}</span>
          </div>
        )}

        <div className="course-list">
          {groupByCategory(courses).map(([category, group]) => (
            <button
              key={category}
              className="course-card"
              onClick={() => openCategory(category, group)}
            >
              <span className="course-title">{CATEGORY_LABELS[category] ?? category}</span>
              <span className="course-meta">
                <span className="course-progress">{categoryMeta(group)}</span>
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
