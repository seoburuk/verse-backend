"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "../../../lib/hooks/useAuth";
import { deleteAccount } from "../../../lib/api/auth";
import { getCourse, type CourseDetail } from "../../../lib/api/courses";
import { getLanguage, setLanguage, type Language } from "../../../lib/store/languageStore";
import { bookRef } from "../../../lib/bookRef";
import { messiahReference } from "../../../lib/messiahReference";

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [lang, setLang] = useState<Language>("ko");
  const [mounted, setMounted] = useState(false);
  const [warmup, setWarmup] = useState<CourseDetail | null>(null);
  const [showReference, setShowReference] = useState<"warmup" | "messiah" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setLang(getLanguage());
  }, []);

  function handleLangToggle() {
    const next: Language = lang === "ko" ? "en" : "ko";
    setLang(next);
    setLanguage(next);
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
    if (!window.confirm("정말 계정을 삭제할까요? 모든 진도 기록이 사라지며 되돌릴 수 없어요.")) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      logout();
      router.push("/login");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "삭제에 실패했어요");
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>← 코스 목록</button>
        <h1 className="title">설정</h1>
      </header>
      <main className="content">
        <div className="section-group">
          <h2 className="section-title">화면</h2>
          <div className="settings-row">
            <span>테마</span>
            {mounted && (
              <button
                className="theme-toggle"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? "🌙 다크" : "☀️ 라이트"}
              </button>
            )}
          </div>
          <div className="settings-row">
            <span>언어</span>
            <button className="theme-toggle" onClick={handleLangToggle}>
              {lang === "ko" ? "한국어" : "English"}
            </button>
          </div>
        </div>

        <div className="section-group">
          <h2 className="section-title">계정</h2>
          <div className="settings-row">
            <span>아이디</span>
            <span className="muted">{user?.display_name}</span>
          </div>
          <button className="btn-secondary" onClick={logout}>로그아웃</button>
          <button className="btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
            {deleting ? "삭제 중..." : "계정 삭제"}
          </button>
          {deleteError && <p className="error-msg">{deleteError}</p>}
        </div>

        <div className="section-group">
          <h2 className="section-title">참고 표</h2>
          <div className="settings-row-buttons">
            <button
              className={`btn-secondary${showReference === "warmup" ? " active" : ""}`}
              onClick={() => loadReference("warmup")}
            >
              워밍업 섹터 {showReference === "warmup" ? "▲" : "▼"}
            </button>
            <button
              className={`btn-secondary${showReference === "messiah" ? " active" : ""}`}
              onClick={() => loadReference("messiah")}
            >
              메시아 예언 {showReference === "messiah" ? "▲" : "▼"}
            </button>
          </div>

          {showReference === "warmup" && warmup && (
            <div className="reference-table">
              {warmup.sections?.map((sec) => (
                <div key={sec.section_id} className="reference-section">
                  <div className="reference-section-title">{sec.title}</div>
                  <table className="pixel-table">
                    <thead>
                      <tr>
                        <th>주제</th>
                        <th>구절</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.items.map((item) => (
                        <tr key={item.course_item_id}>
                          <td>{item.topic}</td>
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
                  <div className="reference-section-title">{sec.title}</div>
                  <table className="pixel-table">
                    <thead>
                      <tr>
                        <th>구절</th>
                        <th>예언 내용</th>
                        <th>성취</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row, i) => (
                        <tr key={i}>
                          <td className="ref-cell">{row.ref}</td>
                          <td>{row.topic}</td>
                          <td className="ref-cell">{row.fulfilled}</td>
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
