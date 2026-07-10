// 사이트 절대 URL 단일 정의 — canonical/OG/sitemap/robots가 모두 이 값을 쓴다.
// 폴백이 실제 프로덕션 도메인이어야 환경변수 누락 시에도 SEO 신호가 깨지지 않는다.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pixbible.cloud";
