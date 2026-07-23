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

// 공유용 OG 이미지 URL — same-origin fetch용이라 상대 경로로 충분하다.
export function buildVerseOgUrl(
  locale: string,
  book: number,
  chapter: number,
  verse: number,
): string {
  return `/api/og/verse?b=${book}&c=${chapter}&v=${verse}&locale=${locale === "en" ? "en" : "ko"}`;
}

// 메신저로 이미지 파일을 직접 공유할 때 쓰는 9:16 세로형 카드 (ShareButton의 imageUrl 전용).
// 링크 미리보기용 buildVerseOgUrl(1200x630)과는 별개 — 두 용도의 화면비가 다르다.
export function buildVerseStoryUrl(
  locale: string,
  book: number,
  chapter: number,
  verse: number,
): string {
  return `${buildVerseOgUrl(locale, book, chapter, verse)}&format=story`;
}

export function buildMilestoneOgUrl(
  locale: string,
  count: number,
  name: string,
): string {
  const params = new URLSearchParams({
    count: String(count),
    locale: locale === "en" ? "en" : "ko",
  });
  if (name) params.set("name", name.slice(0, 20));
  return `/api/og/milestone?${params.toString()}`;
}

// 메신저로 이미지 파일을 직접 공유할 때 쓰는 9:16 세로형 카드 (ShareButton의 imageUrl 전용).
export function buildMilestoneStoryUrl(
  locale: string,
  count: number,
  name: string,
): string {
  return `${buildMilestoneOgUrl(locale, count, name)}&format=story`;
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
