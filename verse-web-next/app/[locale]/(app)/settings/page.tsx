"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/hooks/useAuth";
import { deleteAccount } from "@/lib/api/auth";
import { getCourse, pickLocalized, type CourseDetail } from "@/lib/api/courses";
import { bookRef } from "@/lib/bookRef";
import { messiahReference } from "@/lib/messiahReference";

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("settings");
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [warmup, setWarmup] = useState<CourseDetail | null>(null);
  const [showReference, setShowReference] = useState<"warmup" | "messiah" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleLangToggle() {
    const next = locale === "ko" ? "en" : "ko";
    router.replace(pathname, { locale: next });
  }

  function loadReference(key: "warmup" | "messiah") {
    if (showReference === key) {
      setShowReference(null);
      return;
    }
    setShowReference(key);
    if (key === "warmup" && !warmup) {
      getCourse("warmup").then(setWarmup).catch(() => {});
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t("deleteConfirm"))) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      logout();
      router.push("/login");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>{t("backToCourses")}</button>
        <h1 className="title">{t("title")}</h1>
      </header>
      <main className="content">
        <div className="section-group">
          <h2 className="section-title">{t("display")}</h2>
          <div className="settings-row">
            <span>{t("theme")}</span>
            {mounted && (
              <button
                className="theme-toggle"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? t("dark") : t("light")}
              </button>
            )}
          </div>
          <div className="settings-row">
            <span>{t("language")}</span>
            <button className="theme-toggle" onClick={handleLangToggle}>
              {locale === "ko" ? "한국어" : "English"}
            </button>
          </div>
        </div>

        <div className="section-group">
          <h2 className="section-title">{t("account")}</h2>
          <div className="settings-row">
            <span>{t("username")}</span>
            <span className="muted">{user?.display_name}</span>
          </div>
          <button className="btn-secondary" onClick={logout}>{t("logout")}</button>
          <button className="btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
            {deleting ? t("deleting") : t("deleteAccount")}
          </button>
          {deleteError && <p className="error-msg">{deleteError}</p>}
        </div>

        <div className="section-group">
          <h2 className="section-title">{t("referenceTables")}</h2>
          <div className="settings-row-buttons">
            <button
              className={`btn-secondary${showReference === "warmup" ? " active" : ""}`}
              onClick={() => loadReference("warmup")}
            >
              {t("warmupSector")} {showReference === "warmup" ? "▲" : "▼"}
            </button>
            <button
              className={`btn-secondary${showReference === "messiah" ? " active" : ""}`}
              onClick={() => loadReference("messiah")}
            >
              {t("messiahProphecy")} {showReference === "messiah" ? "▲" : "▼"}
            </button>
          </div>

          {showReference === "warmup" && warmup && (
            <div className="reference-table">
              {warmup.sections?.map((sec) => (
                <div key={sec.section_id} className="reference-section">
                  <div className="reference-section-title">{pickLocalized(sec.title, sec.title_en, locale)}</div>
                  <table className="pixel-table">
                    <thead>
                      <tr>
                        <th>{t("colTopic")}</th>
                        <th>{t("colVerse")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.items.map((item) => (
                        <tr key={item.course_item_id}>
                          <td>{pickLocalized(item.topic, item.topic_en, locale)}</td>
                          <td className="ref-cell">{bookRef(item.book, item.chapter, item.verse)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {showReference === "messiah" && (
            <div className="reference-table">
              {messiahReference.map((sec) => (
                <div key={sec.title} className="reference-section">
                  <div className="reference-section-title">{pickLocalized(sec.title, sec.title_en, locale)}</div>
                  <table className="pixel-table">
                    <thead>
                      <tr>
                        <th>{t("colVerse")}</th>
                        <th>{t("colProphecy")}</th>
                        <th>{t("colFulfilled")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row, i) => (
                        <tr key={i}>
                          <td className="ref-cell">{row.ref}</td>
                          <td>{pickLocalized(row.topic, row.topic_en, locale)}</td>
                          <td className="ref-cell">{pickLocalized(row.fulfilled, row.fulfilled_en, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
