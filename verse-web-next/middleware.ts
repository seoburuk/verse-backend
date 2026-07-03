import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // /v1(백엔드 프록시), _next, opengraph-image, 확장자 포함 경로(robots.txt/sitemap.xml 등)는 제외
  matcher: ["/((?!api|v1|_next|_vercel|opengraph-image|.*\\..*).*)"],
};
