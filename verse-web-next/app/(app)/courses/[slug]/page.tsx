"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCourse, type CourseDetail } from "../../../../lib/api/courses";
import { getProgress } from "../../../../lib/api/progress";
import { bookRef } from "../../../../lib/bookRef";
import { itemsCacheKey } from "../../../../lib/itemsCache";

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [cleared, setCleared] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    Promise.all([getCourse(slug), getProgress()])
      .then(([c, p]) => {
        setCourse(c);
        setCleared(new Set(p.items.filter((it) => it.cleared).map((it) => it.course_item_id)));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>← 코스 목록</button>
        <h2 className="title">{course?.title ?? "..."}</h2>
      </header>
      <main className="content">
        {loading && <p className="muted">불러오는 중...</p>}
        {error && <p className="error-msg">{error}</p>}
        {course?.sections
          ? (
            <div className="item-list">
              {course.sections.map((section) => (
                <button
                  key={section.section_id}
                  className="item-card"
                  onClick={() => router.push(`/courses/${slug}/sections/${section.section_id}`)}
                >
                  <span className="item-topic">{section.title}</span>
                  <span className="item-ref">{section.items.length}구절</span>
                </button>
              ))}
            </div>
          )
          : (
            <div className="item-list">
              {course?.items?.map((item, index) => (
                <button
                  key={item.course_item_id}
                  className="item-card"
                  onClick={() => {
                    localStorage.setItem(itemsCacheKey.course(slug), JSON.stringify(course.items));
                    router.push(`/courses/${slug}/memorize/${item.course_item_id}?i=${index}`);
                  }}
                >
                  <span className="item-topic">
                    {cleared.has(item.course_item_id) && <span className="item-cleared">✓ </span>}
                    {item.topic}
                  </span>
                  <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
                </button>
              ))}
            </div>
          )
        }
      </main>
    </div>
  );
}
