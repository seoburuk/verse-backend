"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/hooks/useAuth";
import { deleteAccount } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { getCourse, pickLocalized, type CourseDetail } from "@/lib/api/courses";
import { bookRef } from "@/lib/bookRef";
import { messiahReference } from "@/lib/messiahReference";
import { getStoredMode, setStoredMode } from "@/lib/recallMode";
import type { RecallMode } from "@/components/memorize/useMemorize";

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("settings");
  const { user, logout, updateDisplayName, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [recallMode, setRecallMode] = useState<RecallMode>("drag");
  const [warmup, setWarmup] = useState<CourseDetail | null>(null);
  const [showReference, setShowReference] = useState<"warmup" | "messiah" | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    setRecallMode(getStoredMode());
  }, []);

  function handleThemeToggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    updateProfile({ theme: next }).catch(() => {});
  }

  function handleLangToggle() {
    const next = locale === "ko" ? "en" : "ko";
    updateProfile({ language: next }).catch(() => {});
    router.replace(pathname, { locale: next });
  }

  function handleRecallModeChange(mode: RecallMode) {
    setRecallMode(mode);
    setStoredMode(mode);
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

  function startEditName() {
    setNameInput(user?.display_name ?? "");
    setNameMsg(null);
    setEditingName(true);
  }

  async function handleSaveName() {
    const name = nameInput.trim();
    if (name === "" || name.length > 30) {
      setNameMsg({ ok: false, text: t("nameInvalid") });
      return;
    }
    setSavingName(true);
    setNameMsg(null);
    try {
      await updateDisplayName(name);
      setEditingName(false);
      setNameMsg({ ok: true, text: t("nameUpdated") });
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setNameMsg({ ok: false, text: t("nameRateLimited") });
      } else if (e instanceof ApiError && e.status === 400 && e.message.includes("banned")) {
        setNameMsg({ ok: false, text: t("nameProfanity") });
      } else {
        setNameMsg({ ok: false, text: t("nameUpdateFailed") });
      }
    } finally {
      setSavingName(false);
    }
  }

  async function handleDeleteAccount() {
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
              <button className="theme-toggle" onClick={handleThemeToggle}>
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
          <div className="settings-row">
            <span>{t("recallMode")}</span>
            {mounted && (
              <button
                className="theme-toggle"
                onClick={() =>
                  handleRecallModeChange(
                    recallMode === "drag" ? "type" : recallMode === "type" ? "dictation" : "drag",
                  )
                }
              >
                {recallMode === "drag" ? t("modeDrag") : recallMode === "type" ? t("modeType") : t("modeDictation")}
              </button>
            )}
          </div>
        </div>

        <div className="section-group">
          <h2 className="section-title">{t("account")}</h2>
          {user?.username && (
            <div className="settings-row">
              <span>{t("loginId")}</span>
              <span className="muted">{user.username}</span>
            </div>
          )}
          {user?.created_at && (
            <div className="settings-row">
              <span>{t("memberSince")}</span>
              <span className="muted">
                {new Intl.DateTimeFormat(locale).format(new Date(user.created_at))}
              </span>
            </div>
          )}
          <div className="settings-row">
            <span>{t("username")}</span>
            {editingName ? (
              <div className="name-edit">
                <input
                  className="name-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={30}
                  autoFocus
                />
                <button className="btn-secondary" onClick={handleSaveName} disabled={savingName}>
                  {savingName ? t("saving") : t("save")}
                </button>
                <button className="btn-link" onClick={() => setEditingName(false)} disabled={savingName}>
                  {t("cancel")}
                </button>
              </div>
            ) : (
              <div className="name-edit">
                <span className="muted">{user?.display_name}</span>
                <button className="btn-link" onClick={startEditName}>{t("editName")}</button>
              </div>
            )}
          </div>
          {nameMsg && (
            <p className={nameMsg.ok ? "success-msg" : "error-msg"}>{nameMsg.text}</p>
          )}
          <button className="btn-secondary" onClick={logout}>{t("logout")}</button>
          <button
            className="btn-danger"
            onClick={() => { setDeleteConfirmInput(""); setShowDeleteModal(true); }}
            disabled={deleting}
          >
            {deleting ? t("deleting") : t("deleteAccount")}
          </button>
          {deleteError && <p className="error-msg">{deleteError}</p>}
        </div>

        {showDeleteModal && (
          <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <h2>{t("deleteTitle")}</h2>
              <p>{t("deleteWarning")}</p>
              <p>{t("deleteTypePrompt", { username: user?.username ?? "" })}</p>
              <input
                className="name-input"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                  {t("cancel")}
                </button>
                <button
                  className="btn-danger"
                  disabled={deleteConfirmInput !== user?.username || deleting}
                  onClick={() => { setShowDeleteModal(false); handleDeleteAccount(); }}
                >
                  {deleting ? t("deleting") : t("deleteConfirmButton")}
                </button>
              </div>
            </div>
          </div>
        )}

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
