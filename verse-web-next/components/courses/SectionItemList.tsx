"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { getProgress } from "../../lib/api/progress";
import { bookRef } from "../../lib/bookRef";
import { itemsCacheKey } from "../../lib/itemsCache";
import { type CourseItem } from "../../lib/api/courses";
import { PixelIcon } from "../PixelIcon";

interface Props {
  slug: string;
  sectionId: number;
  items: CourseItem[];
}

export default function SectionItemList({ slug, sectionId, items }: Props) {
  const router = useRouter();
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 게스트는 진행도 조회(401)가 실패해도 구절 목록은 보여준다.
    getProgress()
      .then((p) => {
        setCleared(new Set(p.items.filter((it) => it.cleared).map((it) => `${it.book}-${it.chapter}-${it.verse}`)));
      })
      .catch(() => {});
  }, []);

  // 연속된 topic 기준으로 그룹핑 (전체 인덱스는 memorize ?i= 파라미터에 그대로 사용)
  const groups: { topic: string; items: { item: CourseItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.topic === item.topic) {
      last.items.push({ item, index });
    } else {
      groups.push({ topic: item.topic, items: [{ item, index }] });
    }
  });

  return (
    <div className="item-list">
      {groups.map((group) => (
        <div key={group.topic + group.items[0].index} className="item-group">
          {group.items.map(({ item, index }) => (
            <button
              key={item.course_item_id}
              className="item-card"
              onClick={() => {
                localStorage.setItem(itemsCacheKey.section(String(sectionId)), JSON.stringify(items));
                router.push(`/courses/${slug}/sections/${sectionId}/memorize/${item.course_item_id}?i=${index}`);
              }}
            >
              <span className="item-topic">
                {cleared.has(`${item.book}-${item.chapter}-${item.verse}`) && (
                  <span className="item-cleared">
                    <PixelIcon name="check" />{" "}
                  </span>
                )}
                {item.text}
              </span>
              <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
