import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/dashboard",
        "/settings",
        "/bookmarks",
        "/en/login",
        "/en/dashboard",
        "/en/settings",
        "/en/bookmarks",
        // 인터랙티브 학습 페이지 — 클라이언트 렌더링 씬 콘텐츠라 색인 대상에서 제외
        "/courses/*/memorize",
        "/courses/*/complete",
        "/en/courses/*/memorize",
        "/en/courses/*/complete",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
