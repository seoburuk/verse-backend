import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { PixelIcon } from "@/components/PixelIcon";

// 마일스톤 공유 랜딩 — 쿼리 파라미터 기반 공개 페이지 (DB 없음, 위조 가능하지만 v1 허용).

function parseCount(raw: string | undefined): number | null {
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 31102) return null;
  return count;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ count?: string; name?: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { count: rawCount, name: rawName } = await searchParams;
  const count = parseCount(rawCount);
  if (count === null) return {};
  const name = (rawName ?? "").trim().slice(0, 20);
  const t = await getTranslations({ locale, namespace: "share" });
  const title = name
    ? t("milestonePageTitle", { name, count })
    : t("milestoneTitle", { count });
  const ogImage = `/api/og/milestone?count=${count}&name=${encodeURIComponent(name)}&locale=${locale}`;
  return {
    title,
    description: t("versePageTagline"),
    robots: { index: false },
    openGraph: {
      title,
      description: t("versePageTagline"),
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ShareMilestonePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ count?: string; name?: string }>;
}) {
  const { locale } = await params;
  const { count: rawCount, name: rawName } = await searchParams;
  const count = parseCount(rawCount);
  if (count === null) notFound();
  const name = (rawName ?? "").trim().slice(0, 20);
  setRequestLocale(locale);
  const t = await getTranslations("share");

  return (
    <div className="page share-page">
      <main className="content">
        <div className="share-card share-milestone-card">
          <div className="share-milestone-star">
            <PixelIcon name="star" size={48} />
          </div>
          <div className="share-milestone-count">{count}</div>
          <p className="share-milestone-title">
            {name
              ? t("milestonePageTitle", { name, count })
              : t("milestoneTitle", { count })}
          </p>
        </div>
        <p className="share-tagline">{t("versePageTagline")}</p>
        <div className="share-actions">
          <Link href="/courses" className="btn-primary">
            {t("milestoneCta")}
          </Link>
          <Link href="/" className="btn-link">
            PIX BIBLE
          </Link>
        </div>
      </main>
    </div>
  );
}
