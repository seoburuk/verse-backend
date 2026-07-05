"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { pickLocalized } from "../../lib/api/courses";
import { getProgress, type Streak } from "../../lib/api/progress";
import { getLives, type Lives } from "../../lib/api/lives";
import { getResume, type ResumeTarget } from "../../lib/api/resume";
import { useAuth } from "../../lib/hooks/useAuth";
import { bookRef } from "../../lib/bookRef";
import { PixelIcon } from "../PixelIcon";

function resumeUrl(r: ResumeTarget): string {
  if (r.section_id != null) {
    return `/courses/${r.course_slug}/sections/${r.section_id}/memorize/${r.course_item_id}`;
  }
  return `/courses/${r.course_slug}/memorize/${r.course_item_id}`;
}

export function CourseHeaderPersonal() {
  const { user, isAuthed, logout } = useAuth();
  const router = useRouter();
  const t = useTranslations("nav");
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
      {lives && (
        <span className="lives-badge">
          <PixelIcon name="heart" /> {lives.lives}
        </span>
      )}
      {streak && (
        <span className="streak-badge">
          <PixelIcon name="flame" /> {streak.current}
        </span>
      )}
      {isAuthed ? (
        <>
          <span className="user-name">{user?.display_name}</span>
          <button className="btn-link" onClick={() => router.push("/bookmarks")}>{t("bookmarks")}</button>
          <button className="btn-link" onClick={() => router.push("/dashboard")}>{t("dashboard")}</button>
          <button className="btn-link" onClick={() => router.push("/rankings")}>{t("rankings")}</button>
          <button className="btn-link" onClick={() => router.push("/settings")}>{t("settings")}</button>
          <button className="btn-link" onClick={logout}>{t("logout")}</button>
        </>
      ) : (
        <button className="btn-link" onClick={() => router.push("/login")}>{t("login")}</button>
      )}
    </div>
  );
}

export function ResumeCard() {
  const { isAuthed } = useAuth();
  const router = useRouter();
  const t = useTranslations("nav");
  const locale = useLocale();
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
      <span className="resume-label">
        <PixelIcon name="play" /> {t("resume")}
      </span>
      <span className="resume-title">
        {pickLocalized(resume.course_title, resume.course_title_en, locale)}
        {resume.section_title ? ` › ${pickLocalized(resume.section_title, resume.section_title_en, locale)}` : ""}
      </span>
      <span className="muted resume-ref">{bookRef(resume.book, resume.chapter, resume.verse)}</span>
    </div>
  );
}
