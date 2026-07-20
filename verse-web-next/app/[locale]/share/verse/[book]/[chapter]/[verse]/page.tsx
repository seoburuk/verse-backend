import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { getVerseServer } from "@/lib/api/server";
import { bookName } from "@/lib/bookRef";

// 공유받은 사람이 보는 공개 구절 페이지 — 구절 전문 + "나도 외워보기" CTA.
// generateStaticParams 없음: 3.1만 구절을 빌드 시 생성하지 않고 온디맨드 렌더링.

function parseRef(book: string, chapter: string, verse: string) {
  const b = Number(book);
  const c = Number(chapter);
  const v = Number(verse);
  if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(v) ||
      b < 1 || b > 66 || c < 1 || v < 1) {
    return null;
  }
  return { b, c, v };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; book: string; chapter: string; verse: string }>;
}): Promise<Metadata> {
  const { locale, book, chapter, verse } = await params;
  const ref = parseRef(book, chapter, verse);
  if (!ref) return {};
  try {
    const data = await getVerseServer(ref.b, ref.c, ref.v);
    const title = `${bookName(ref.b, locale)} ${ref.c}:${ref.v} (KJV)`;
    const description = data.text.length > 160 ? `${data.text.slice(0, 160)}…` : data.text;
    const path = `/share/verse/${ref.b}/${ref.c}/${ref.v}`;
    const ogImage = `/api/og/verse?b=${ref.b}&c=${ref.c}&v=${ref.v}&locale=${locale}`;
    return {
      title,
      description,
      alternates: {
        canonical: locale === "ko" ? path : `/en${path}`,
        languages: { ko: path, en: `/en${path}` },
      },
      openGraph: {
        title,
        description,
        images: [{ url: ogImage, width: 1200, height: 630 }],
      },
      twitter: { card: "summary_large_image" },
    };
  } catch {
    return {};
  }
}

export default async function ShareVersePage({
  params,
}: {
  params: Promise<{ locale: Locale; book: string; chapter: string; verse: string }>;
}) {
  const { locale, book, chapter, verse } = await params;
  const ref = parseRef(book, chapter, verse);
  if (!ref) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("share");

  let data;
  try {
    data = await getVerseServer(ref.b, ref.c, ref.v);
  } catch {
    notFound();
  }

  return (
    <div className="page share-page">
      <main className="content">
        <div className="share-card">
          <p className="verse-text share-verse-text">{data.text}</p>
          <p className="share-verse-ref">
            {bookName(ref.b, locale)} {ref.c}:{ref.v} (KJV)
          </p>
        </div>
        <p className="share-tagline">{t("versePageTagline")}</p>
        <div className="share-actions">
          <Link href="/courses" className="btn-primary">
            {t("verseCta")}
          </Link>
          <Link href="/" className="btn-link">
            PIXBIBLE
          </Link>
        </div>
      </main>
    </div>
  );
}
