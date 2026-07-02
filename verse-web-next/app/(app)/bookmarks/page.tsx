"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFavorites, removeFavorite, type FavoriteItem } from "../../../lib/api/favorites";
import { bookRef } from "../../../lib/bookRef";

function memorizeUrl(f: FavoriteItem): string {
  if (f.section_id != null) {
    return `/courses/${f.course_slug}/sections/${f.section_id}/memorize/${f.course_item_id}`;
  }
  return `/courses/${f.course_slug}/memorize/${f.course_item_id}`;
}

export default function BookmarksPage() {
  const router = useRouter();
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
        <button className="btn-link" onClick={() => router.push("/courses")}>← 코스 목록</button>
        <h1 className="title">책갈피</h1>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        {!loading && items.length === 0 && (
          <p className="muted">아직 책갈피한 절이 없어요. 암송 화면에서 ☆ 를 눌러 저장하세요.</p>
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
                  {f.course_title}
                  {f.section_title ? ` › ${f.section_title}` : ""}
                </span>
              </div>
              <button
                className="fav-btn"
                aria-label="책갈피 해제"
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
