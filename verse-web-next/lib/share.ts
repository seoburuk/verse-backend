// 공유 URL 생성 — 모든 공유 링크에 UTM을 붙여 GA에서 유입을 추적한다.
import { SITE_URL } from "./site";

function localePrefix(locale: string): string {
  return locale === "en" ? "/en" : "";
}

export function buildVerseShareUrl(
  locale: string,
  book: number,
  chapter: number,
  verse: number,
): string {
  return `${SITE_URL}${localePrefix(locale)}/share/verse/${book}/${chapter}/${verse}?utm_source=share&utm_medium=link&utm_campaign=verse_share`;
}

export function buildMilestoneShareUrl(
  locale: string,
  count: number,
  name: string,
): string {
  const params = new URLSearchParams({
    count: String(count),
    utm_source: "share",
    utm_medium: "link",
    utm_campaign: "milestone_share",
  });
  if (name) params.set("name", name.slice(0, 20));
  return `${SITE_URL}${localePrefix(locale)}/share/milestone?${params.toString()}`;
}
