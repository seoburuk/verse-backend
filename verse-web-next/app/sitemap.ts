import type { MetadataRoute } from "next";
import { listCoursesServer } from "../lib/api/server";
import { CATEGORY_ORDER } from "../lib/categories";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixbible.example";

// path는 "/"로 시작하는 로케일 비의존 경로. ko(기본, 프리픽스 없음)와 en(/en) 두 URL을
// 각각 항목으로 내보내고, 둘 다 동일한 hreflang alternates를 갖게 한다.
function koUrl(path: string): string {
  return `${SITE_URL}${path}`;
}
function enUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/en` : `${SITE_URL}/en${path}`;
}

function entries(
  path: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number },
): MetadataRoute.Sitemap {
  const languages = { ko: koUrl(path), en: enUrl(path) };
  return [
    { url: koUrl(path), alternates: { languages }, ...opts },
    { url: enUrl(path), alternates: { languages }, ...opts },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    ...entries("/", { changeFrequency: "monthly", priority: 1 }),
    ...entries("/courses", { changeFrequency: "weekly", priority: 0.9 }),
  ];

  let courses: { slug: string; category: string }[] = [];
  try {
    courses = await listCoursesServer();
  } catch {
    return base;
  }

  const categoryEntries: MetadataRoute.Sitemap = CATEGORY_ORDER
    .filter((cat) => courses.some((c) => c.category === cat))
    .flatMap((cat) => entries(`/courses/category/${cat}`, { changeFrequency: "weekly", priority: 0.7 }));

  const courseEntries: MetadataRoute.Sitemap = courses.flatMap((c) =>
    entries(`/courses/${c.slug}`, { changeFrequency: "monthly", priority: 0.8 }),
  );

  return [...base, ...categoryEntries, ...courseEntries];
}
