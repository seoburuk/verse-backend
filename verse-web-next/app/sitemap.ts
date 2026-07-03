import type { MetadataRoute } from "next";
import { listCoursesServer } from "../lib/api/server";
import { CATEGORY_ORDER } from "../lib/categories";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixbible.example";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/courses`, changeFrequency: "weekly", priority: 0.9 },
  ];

  let courses: { slug: string; category: string }[] = [];
  try {
    courses = await listCoursesServer();
  } catch {
    return base;
  }

  const categoryEntries: MetadataRoute.Sitemap = CATEGORY_ORDER
    .filter((cat) => courses.some((c) => c.category === cat))
    .map((cat) => ({
      url: `${SITE_URL}/courses/category/${cat}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  const courseEntries: MetadataRoute.Sitemap = courses.map((c) => ({
    url: `${SITE_URL}/courses/${c.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...base, ...categoryEntries, ...courseEntries];
}
