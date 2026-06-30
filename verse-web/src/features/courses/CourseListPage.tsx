import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listCourses, type Course } from "../../api/courses";
import { getProgress, type CourseProgress, type Streak } from "../../api/progress";
import { useAuth } from "../../hooks/useAuth";

export function CourseListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
        <h2 className="section-title">코스</h2>
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
                onClick={() => navigate(`/courses/${c.slug}`)}
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
