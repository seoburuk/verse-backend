"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listCourses, type Course } from "../../../lib/api/courses";
import { getStats, type Stats } from "../../../lib/api/stats";
import { getLives, type Lives } from "../../../lib/api/lives";
import { useAuth } from "../../../lib/hooks/useAuth";

const SECTOR_LABELS: Record<string, string> = {
  foundations: "기초",
  warmup: "워밍업",
  messiah: "예언",
  ot: "구약",
  nt: "신약",
};

// 기초/워밍업/예언은 코스가 하나뿐이라 목록 화면 없이 바로 진입한다.
const DIRECT_CATEGORIES = new Set(["foundations", "warmup", "messiah"]);

const SECTOR_ORDER = ["foundations", "warmup", "messiah", "ot", "nt"];

export default function CourseListPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lives, setLives] = useState<Lives | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listCourses(), getStats(), getLives()])
      .then(([cs, s, l]) => {
        setCourses(cs);
        setStats(s);
        setLives(l);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSectorClick(category: string) {
    if (DIRECT_CATEGORIES.has(category)) {
      const course = courses.find((c) => c.category === category);
      if (course) router.push(`/courses/${course.slug}`);
      return;
    }
    router.push(`/courses/sector/${category}`);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="title">Pixel KJV</h1>
        <div className="header-right">
          {lives && <span className="lives-badge">❤️ {lives.lives}</span>}
          {stats && <span className="streak-badge">🔥 {stats.streak.current}</span>}
          <span className="user-name">{user?.display_name}</span>
          <button className="btn-link" onClick={() => router.push("/dashboard")}>대시보드</button>
          <button className="btn-link" onClick={() => router.push("/settings")}>설정</button>
          <button className="btn-link" onClick={logout}>로그아웃</button>
        </div>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        <div className="course-list">
          {SECTOR_ORDER.filter((cat) => courses.some((c) => c.category === cat)).map((cat) => {
            const catProgress = stats?.categories.find((c) => c.category === cat);
            return (
              <button
                key={cat}
                className="course-card"
                onClick={() => handleSectorClick(cat)}
              >
                <span className="course-title">{SECTOR_LABELS[cat] ?? cat}</span>
                {catProgress && catProgress.total > 0 && (
                  <span className="course-meta">
                    <span className={`course-progress${catProgress.cleared === catProgress.total ? " is-done" : ""}`}>
                      {catProgress.cleared === catProgress.total ? "✓ " : ""}{catProgress.cleared}/{catProgress.total}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
