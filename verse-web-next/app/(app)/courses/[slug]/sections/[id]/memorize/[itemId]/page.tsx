"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getSection, type CourseItem } from "../../../../../../../../lib/api/courses";
import { itemsCacheKey } from "../../../../../../../../lib/itemsCache";
import { MemorizeView } from "../../../../../../../../components/memorize/MemorizeView";

export default function SectionMemorizePage() {
  const params = useParams<{ slug: string; id: string; itemId: string }>();
  const { slug, id: sectionId, itemId } = params;
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CourseItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(itemsCacheKey.section(sectionId));
    if (cached) {
      setItems(JSON.parse(cached) as CourseItem[]);
      return;
    }
    getSection(Number(sectionId))
      .then((s) => setItems(s.items))
      .catch((e: Error) => setError(e.message));
  }, [sectionId]);

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

  const backHref = `/courses/${slug}/sections/${sectionId}`;
  const doneHref = `/courses/${slug}/sections/${sectionId}/complete`;

  return (
    <MemorizeView
      items={items}
      index={index}
      sectionId={sectionId}
      backHref={backHref}
      doneHref={doneHref}
      buildItemHref={(idx) => `/courses/${slug}/sections/${sectionId}/memorize/${items[idx].course_item_id}?i=${idx}`}
    />
  );
}
