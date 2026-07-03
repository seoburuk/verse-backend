"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getCourse, type CourseItem } from "../../../../../lib/api/courses";
import { itemsCacheKey } from "../../../../../lib/itemsCache";
import { MemorizeView } from "../../../../../components/memorize/MemorizeView";

export default function CourseMemorizePage() {
  const params = useParams<{ slug: string; itemId: string }>();
  const { slug, itemId } = params;
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CourseItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(itemsCacheKey.course(slug));
    if (cached) {
      setItems(JSON.parse(cached) as CourseItem[]);
      return;
    }
    getCourse(slug)
      .then((c) => setItems(c.items ?? []))
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <div className="page-center">
        <div className="card">
          <p className="error-msg">{error}</p>
        </div>
      </div>
    );
  }

  if (!items) return null;

  const index = Math.max(
    0,
    searchParams.get("i") !== null
      ? Number(searchParams.get("i"))
      : items.findIndex((it) => String(it.course_item_id) === itemId),
  );

  const backHref = `/courses/${slug}`;

  return (
    <MemorizeView
      items={items}
      index={index}
      sectionId={slug}
      backHref={backHref}
      doneHref={backHref}
      buildItemHref={(idx) => `/courses/${slug}/memorize/${items[idx].course_item_id}?i=${idx}`}
    />
  );
}
