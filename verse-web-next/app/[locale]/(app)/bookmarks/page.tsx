"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { getFavorites, removeFavorite, type FavoriteItem } from "@/lib/api/favorites";
import { bookRef } from "@/lib/bookRef";
import { pickLocalized } from "@/lib/api/courses";

function memorizeUrl(f: FavoriteItem): string {
  if (f.section_id != null) {
    return `/courses/${f.course_slug}/sections/${f.section_id}/memorize/${f.course_item_id}`;
  }
  return `/courses/${f.course_slug}/memorize/${f.course_item_id}`;
}

export default function BookmarksPage() {
  const router = useRouter();
  const t = useTranslations("bookmarks");
  const locale = useLocale();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFavorites()
      .then(({ items }) => setItems(items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function unbookmark(itemId: number) {
    const prev = items;
    setItems(items.filter((f) => f.course_item_id !== itemId));
    removeFavorite(itemId).catch(() => setItems(prev));
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>{t("back")}</button>
        <h1 className="title">{t("title")}</h1>
      </header>
      <main className="content">
        {loading && <p className="muted">{t("loading")}</p>}
        {error && <p className="error-msg">{error}</p>}
        {!loading && items.length === 0 && (
          <p className="muted">{t("empty")}</p>
        )}
        <div className="course-list">
          {items.map((f) => (
            <div key={f.course_item_id} className="bookmark-card">
              <div
                className="bookmark-body"
                role="button"
                tabIndex={0}
                onClick={() => router.push(memorizeUrl(f))}
                onKeyDown={(e) => e.key === "Enter" && router.push(memorizeUrl(f))}
              >
                <span className="bookmark-ref">{bookRef(f.book, f.chapter, f.verse)}</span>
                <span className="bookmark-text">{f.text}</span>
                <span className="muted bookmark-course">
                  {pickLocalized(f.course_title, f.course_title_en, locale)}
                  {f.section_title ? ` › ${pickLocalized(f.section_title, f.section_title_en, locale)}` : ""}
                </span>
              </div>
              <button
                className="fav-btn"
                aria-label={t("remove")}
                onClick={() => unbookmark(f.course_item_id)}
              >
                ★
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
