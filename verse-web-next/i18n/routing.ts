import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["ko", "en"],
  defaultLocale: "ko",
  // 한국어는 프리픽스 없음(기존 URL 유지), 영어만 /en 프리픽스
  localePrefix: "as-needed",
  // 브라우저 Accept-Language를 감지해 루트 접속 시 언어를 분기
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
