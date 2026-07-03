"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProgress, type Streak } from "../../lib/api/progress";
import { getLives, type Lives } from "../../lib/api/lives";
import { getResume, type ResumeTarget } from "../../lib/api/resume";
import { useAuth } from "../../lib/hooks/useAuth";
import { bookRef } from "../../lib/bookRef";

function resumeUrl(r: ResumeTarget): string {
  if (r.section_id != null) {
    return `/courses/${r.course_slug}/sections/${r.section_id}/memorize/${r.course_item_id}`;
  }
  return `/courses/${r.course_slug}/memorize/${r.course_item_id}`;
}

export function CourseHeaderPersonal() {
  const { user, isAuthed, logout } = useAuth();
  const router = useRouter();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [lives, setLives] = useState<Lives | null>(null);

  useEffect(() => {
    if (!isAuthed) return;
    Promise.all([getProgress(), getLives()])
      .then(([p, l]) => {
        setStreak(p.streak);
        setLives(l);
      })
      .catch(() => {});
  }, [isAuthed]);

  return (
    <div className="header-right">
      {lives && <span className="lives-badge">❤️ {lives.lives}</span>}
      {streak && <span className="streak-badge">🔥 {streak.current}</span>}
      {isAuthed ? (
        <>
          <span className="user-name">{user?.display_name}</span>
          <button className="btn-link" onClick={() => router.push("/bookmarks")}>책갈피</button>
          <button className="btn-link" onClick={() => router.push("/dashboard")}>대시보드</button>
          <button className="btn-link" onClick={() => router.push("/settings")}>설정</button>
          <button className="btn-link" onClick={logout}>로그아웃</button>
        </>
      ) : (
        <button className="btn-link" onClick={() => router.push("/login")}>로그인</button>
      )}
    </div>
  );
}

export function ResumeCard() {
  const { isAuthed } = useAuth();
  const router = useRouter();
  const [resume, setResume] = useState<ResumeTarget | null>(null);

  useEffect(() => {
    if (!isAuthed) return;
    getResume().then((res) => setResume(res.resume)).catch(() => {});
  }, [isAuthed]);

  if (!isAuthed || !resume) return null;

  return (
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
  );
}
