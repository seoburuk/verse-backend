"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { getSection, getCourse, pickLocalized, type SectionDetail } from "@/lib/api/courses";
import { getProgress } from "@/lib/api/progress";
import { bookRef } from "@/lib/bookRef";
import { itemsCacheKey } from "@/lib/itemsCache";
import { PixelIcon } from "@/components/PixelIcon";

export default function SectionDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const { slug, id: sectionId } = params;
  const router = useRouter();
  const t = useTranslations("section");
  const locale = useLocale();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sectionId) return;
    Promise.all([getSection(Number(sectionId)), getCourse(slug), getProgress()])
      .then(([s, c, p]) => {
        setSection(s);
        setCourseTitle(pickLocalized(c.title, c.title_en, locale));
        setCleared(new Set(p.items.filter((it) => it.cleared).map((it) => `${it.book}-${it.chapter}-${it.verse}`)));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sectionId, slug]);

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push(`/courses/${slug}`)}>{t("backToCourse", { title: courseTitle ?? t("fallbackCourse") })}</button>
      </header>
      <main className="content">
        {loading && <p className="muted">{t("loading")}</p>}
        {error && <p className="error-msg">{error}</p>}
        <div className="item-list">
          {section && (() => {
            // 연속된 topic 기준으로 그룹핑 (전체 인덱스는 memorize ?i= 파라미터에 그대로 사용)
            const groups: { topic: string; items: { item: typeof section.items[0]; index: number }[] }[] = [];
            section.items.forEach((item, index) => {
              const last = groups[groups.length - 1];
              if (last && last.topic === item.topic) {
                last.items.push({ item, index });
              } else {
                groups.push({ topic: item.topic, items: [{ item, index }] });
              }
            });
            return groups.map((group) => (
              <div key={group.topic + group.items[0].index} className="item-group">
                {group.items.map(({ item, index }) => (
                  <button
                    key={item.course_item_id}
                    className="item-card"
                    onClick={() => {
                      localStorage.setItem(itemsCacheKey.section(sectionId), JSON.stringify(section.items));
                      router.push(`/courses/${slug}/sections/${sectionId}/memorize/${item.course_item_id}?i=${index}`);
                    }}
                  >
                    <span className="item-topic">
                      {cleared.has(`${item.book}-${item.chapter}-${item.verse}`) && (
                        <span className="item-cleared">
                          <PixelIcon name="check" />{" "}
                        </span>
                      )}
                      {item.text.slice(0, 40)}
                    </span>
                    <span className="item-ref">{bookRef(item.book, item.chapter, item.verse)}</span>
                  </button>
                ))}
              </div>
            ));
          })()}
        </div>
      </main>
    </div>
  );
}
