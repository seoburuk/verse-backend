"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSection, getCourse, type SectionDetail } from "../../../../../../lib/api/courses";
import { getProgress } from "../../../../../../lib/api/progress";
import { bookRef } from "../../../../../../lib/bookRef";
import { itemsCacheKey } from "../../../../../../lib/itemsCache";

export default function SectionDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const { slug, id: sectionId } = params;
  const router = useRouter();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sectionId) return;
    Promise.all([getSection(Number(sectionId)), getCourse(slug), getProgress()])
      .then(([s, c, p]) => {
        setSection(s);
        setCourseTitle(c.title);
        setCleared(new Set(p.items.filter((it) => it.cleared).map((it) => it.course_item_id)));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sectionId, slug]);

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push(`/courses/${slug}`)}>← {courseTitle ?? "코스"}로</button>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        <div className="item-list">
          {section?.items.map((item, index) => (
            <button
              key={item.course_item_id}
              className="item-card"
              onClick={() => {
                localStorage.setItem(itemsCacheKey.section(sectionId), JSON.stringify(section.items));
                router.push(`/courses/${slug}/sections/${sectionId}/memorize/${item.course_item_id}?i=${index}`);
              }}
            >
              <span className="item-topic">
                {cleared.has(item.course_item_id) && <span className="item-cleared">✓ </span>}
                {item.text.slice(0, 40)}
              </span>
              <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
