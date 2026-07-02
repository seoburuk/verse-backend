// languageStore.ts — 언어 선호도 저장. 실제 번역 적용은 Phase 6에서 이뤄진다(next-intl 도입 예정).
// 지금은 사용자의 선택을 영속화하는 토대만 둔다.
const LANG_KEY = "kjv_lang";

export type Language = "ko" | "en";

export function getLanguage(): Language {
  if (typeof window === "undefined") return "ko";
  return (localStorage.getItem(LANG_KEY) as Language) ?? "ko";
}

export function setLanguage(lang: Language): void {
  localStorage.setItem(LANG_KEY, lang);
}
