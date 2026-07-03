"use client";

import { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { getProgress } from "../../lib/api/progress";
import { bookRef } from "../../lib/bookRef";
import { pickLocalized, type CourseItem } from "../../lib/api/courses";
import { PixelIcon } from "../PixelIcon";

interface Props {
  slug: string;
  items: CourseItem[];
}

export default function CourseItemList({ slug, items }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  useEffect(() => {
    getProgress()
      .then((p) => {
        setCleared(new Set(p.items.filter((it) => it.cleared).map((it) => `${it.book}-${it.chapter}-${it.verse}`)));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="item-list">
      {items.map((item, index) => (
        <button
          key={item.course_item_id}
          className="item-card"
          onClick={() => router.push(`/courses/${slug}/memorize/${item.course_item_id}?i=${index}`)}
        >
          <span className="item-topic">
            {cleared.has(`${item.book}-${item.chapter}-${item.verse}`) && (
              <span className="item-cleared">
                <PixelIcon name="check" />{" "}
              </span>
            )}
            {pickLocalized(item.topic, item.topic_en, locale)}
          </span>
          <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
        </button>
      ))}
    </div>
  );
}
