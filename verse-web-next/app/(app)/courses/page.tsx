"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listCourses, type Course } from "../../../lib/api/courses";
import { getProgress, type CourseProgress, type Streak } from "../../../lib/api/progress";
import { getLives, type Lives } from "../../../lib/api/lives";
import { getResume, type ResumeTarget } from "../../../lib/api/resume";
import { useAuth } from "../../../lib/hooks/useAuth";
import { bookRef } from "../../../lib/bookRef";

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

function resumeUrl(r: ResumeTarget): string {
  if (r.section_id != null) {
    return `/courses/${r.course_slug}/sections/${r.section_id}/memorize/${r.course_item_id}`;
  }
  return `/courses/${r.course_slug}/memorize/${r.course_item_id}`;
}

interface CourseCardProps {
  course: Course;
  progress: Map<number, CourseProgress>;
  onClick: () => void;
}

function CourseCard({ course, progress, onClick }: CourseCardProps) {
  const p = progress.get(course.id);
  const done = p ? p.cleared === p.total && p.total > 0 : false;

  return (
    <button className="course-card" onClick={onClick}>
      <span className="course-title">{course.title}</span>
      <span className="course-meta">
        {p && (
          <span className={`course-progress${done ? " is-done" : ""}`}>
            {done ? "✓ " : ""}{p.cleared}/{p.total}
          </span>
        )}
        <span className="course-theme">{course.theme}</span>
      </span>
    </button>
  );
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

        {groupByCategory(courses).map(([category, group]) => (
          <div key={category} className="section-group">
            <h2 className="section-title">{CATEGORY_LABELS[category] ?? category}</h2>
            <div className="course-list">
              {group.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  progress={progress}
                  onClick={() => router.push(`/courses/${c.slug}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
