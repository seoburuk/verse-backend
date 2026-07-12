"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/lib/hooks/useAuth";
import { getStats, type Stats } from "@/lib/api/stats";
import { CATEGORY_ORDER } from "@/lib/categories";
import { bookName } from "@/lib/bookRef";
import { buildMilestoneShareUrl } from "@/lib/share";
import { PixelIcon } from "@/components/PixelIcon";
import { ShareButton } from "@/components/ShareButton";

const HIDDEN_CATEGORIES = new Set(["ot", "nt", "topic"]);

export default function DashboardPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const tc = useTranslations("categories");
  const tShare = useTranslations("share");
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = stats
    ? CATEGORY_ORDER.filter(
        (cat) => !HIDDEN_CATEGORIES.has(cat) && stats.categories.some((c) => c.category === cat),
      ).map((cat) => stats.categories.find((c) => c.category === cat)!)
    : [];

  const books = stats ? stats.books.filter((b) => b.cleared > 0) : [];

  const totalGrades = stats ? stats.grades.green + stats.grades.yellow + stats.grades.red : 0;

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>{t("back")}</button>
        <h1 className="title">{t("title")}</h1>
      </header>
      <main className="content">
        {loading && <p className="muted">{t("loading")}</p>}
        {error && <p className="error-msg">{error}</p>}
        {stats && (
          <>
            <div className="dash-summary">
              <div className="dash-summary-item">
                <span className="dash-summary-value">{stats.total_cleared}</span>
                <span className="dash-summary-label">{t("memorizedVerses")}</span>
              </div>
              <div className="dash-summary-item">
                <span className="dash-summary-value">
                  <PixelIcon name="flame" size={16} /> {stats.streak.current}
                </span>
                <span className="dash-summary-label">{t("currentStreak")}</span>
              </div>
              <div className="dash-summary-item">
                <span className="dash-summary-value">{stats.streak.longest}</span>
                <span className="dash-summary-label">{t("longestStreak")}</span>
              </div>
            </div>

            {stats.total_cleared > 0 && (
              <ShareButton
                url={buildMilestoneShareUrl(locale, stats.total_cleared, user?.display_name ?? "")}
                title="PIX BIBLE"
                text={tShare("dashboardShareText", { count: stats.total_cleared })}
                label={tShare("milestoneShareButton")}
              />
            )}

            <div className="section-group">
              <h2 className="section-title">{t("categoryProgress")}</h2>
              <div className="dash-category-list">
                {categories.map((c) => {
                  const pct = c.total > 0 ? Math.round((c.cleared / c.total) * 100) : 0;
                  return (
                    <div key={c.category} className="dash-category-row">
                      <div className="dash-category-head">
                        <span>{tc(c.category)}</span>
                        <span className="muted">{c.cleared}/{c.total} ({pct}%)</span>
                      </div>
                      <div className="dash-bar-track">
                        <div className="dash-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {books.length > 0 && (
              <div className="section-group">
                <h2 className="section-title">{t("bookProgress")}</h2>
                <div className="dash-category-list">
                  {books.map((b) => {
                    const pct = b.total > 0 ? Math.round((b.cleared / b.total) * 100) : 0;
                    return (
                      <div key={b.book} className="dash-category-row">
                        <div className="dash-category-head">
                          <span>{bookName(b.book, locale)}</span>
                          <span className="muted">{b.cleared}/{b.total} ({pct}%)</span>
                        </div>
                        <div className="dash-bar-track">
                          <div className="dash-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="section-group">
              <h2 className="section-title">{t("gradeDistribution")}</h2>
              {totalGrades === 0 ? (
                <p className="muted">{t("noRecords")}</p>
              ) : (
                <div className="dash-grade-bar">
                  <div
                    className="dash-grade-seg dash-grade-green"
                    style={{ width: `${(stats.grades.green / totalGrades) * 100}%` }}
                  />
                  <div
                    className="dash-grade-seg dash-grade-yellow"
                    style={{ width: `${(stats.grades.yellow / totalGrades) * 100}%` }}
                  />
                  <div
                    className="dash-grade-seg dash-grade-red"
                    style={{ width: `${(stats.grades.red / totalGrades) * 100}%` }}
                  />
                </div>
              )}
              <div className="dash-grade-legend">
                <span className="grade-dot green-dot">● {t("green")} {stats.grades.green}</span>
                <span className="grade-dot yellow-dot">● {t("yellow")} {stats.grades.yellow}</span>
                <span className="grade-dot red-dot">● {t("red")} {stats.grades.red}</span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
