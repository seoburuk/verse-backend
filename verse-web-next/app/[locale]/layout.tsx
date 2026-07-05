import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/lib/store/AuthContext";
import { Footer } from "@/components/Footer";
import { routing, type Locale } from "@/i18n/routing";
import "../globals.css";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixbible.example";

const SITE_META: Record<Locale, { title: string; template: string; desc: string; ogLocale: string }> = {
  ko: {
    title: "PIX BIBLE — 성경 암기 앱",
    template: "%s | PIX BIBLE 성경 암기",
    desc: "성경 암기 앱 PIX BIBLE — 킹제임스 성경(KJV) 66권을 절 단위로 암기하세요. 주제별·권별 성경 암송 코스 제공.",
    ogLocale: "ko_KR",
  },
  en: {
    title: "PIX BIBLE — Memorize the Bible",
    template: "%s | PIX BIBLE",
    desc: "PIX BIBLE is a retro-pixel Bible memory app. Memorize the King James Version (KJV) verse by verse with tile-ordering and typing drills. Topic and book courses included.",
    ogLocale: "en_US",
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const meta = SITE_META[locale] ?? SITE_META.ko;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: meta.title, template: meta.template },
    description: meta.desc,
    alternates: {
      canonical: locale === "ko" ? "/" : "/en",
      languages: { ko: "/", en: "/en" },
    },
    openGraph: {
      siteName: "PIX BIBLE",
      locale: meta.ogLocale,
      type: "website",
    },
    // 소유 확인 값은 Google Search Console / 네이버 서치어드바이저 등록 후 채울 것
    verification: {
      google: "REPLACE_WITH_GOOGLE_VERIFICATION",
      other: { "naver-site-verification": "REPLACE_WITH_NAVER_VERIFICATION" },
    },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();
  const meta = SITE_META[locale as Locale];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "PIX BIBLE",
        description: meta.desc,
        inLanguage: locale,
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: "PIX BIBLE",
        url: SITE_URL,
        applicationCategory: "EducationalApplication",
        operatingSystem: "All",
        inLanguage: locale,
        description: meta.desc,
      },
    ],
  };

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {ADSENSE_CLIENT && (
          <Script
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        )}
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          <NextIntlClientProvider messages={messages}>
            <AuthProvider>{children}</AuthProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
        <Footer />
      </body>
    </html>
  );
}
