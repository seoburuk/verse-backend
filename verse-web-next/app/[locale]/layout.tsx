import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/lib/store/AuthContext";
import { Footer } from "@/components/Footer";
import { routing, type Locale } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

const SITE_META: Record<Locale, { title: string; template: string; desc: string; keywords: string[]; ogLocale: string }> = {
  ko: {
    title: "PIX BIBLE — 성경 암기 앱",
    template: "%s | PIX BIBLE 성경 암기",
    desc: "성경 암기 앱 PIX BIBLE — 킹제임스 성경(KJV)으로 영어 성경 암기를 절 단위로 하세요. 주제별·권별 성경 암송 코스 제공.",
    keywords: ["성경 암기", "영어 성경 암기", "성경 암송", "KJV 암기", "킹제임스 성경 암기"],
    ogLocale: "ko_KR",
  },
  en: {
    title: "PIX BIBLE — KJV Memory Verses · Memorize Scripture",
    template: "%s | PIX BIBLE",
    desc: "Memorize Scripture one tile at a time with KJV memory verses. PIX BIBLE is a retro-pixel Bible memory app — memorize the King James Version verse by verse with tile-ordering and typing drills. Topic and book courses included.",
    keywords: ["kjv memory verse", "kjv memory verses", "memorize scripture", "scripture memory", "king james memory verses", "Bible memory app"],
    ogLocale: "en_US",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
    keywords: meta.keywords,
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
      google: "hDNPi-Jwwi_CJFq7Xd57qrWpcDuLDcIuyKw6eiPyJy8",
      other: { "naver-site-verification": "d43f7075412f4534b2557997ebf50ca9e76e01e4" },
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
      <head>
        <Script
          id="gtm"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-M45VZDW4');`,
          }}
        />
        <Script
          async
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-CXKCEXYT34"
        />
        <Script
          id="ga4"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-CXKCEXYT34');`,
          }}
        />
      </head>
      <body>
        <noscript>
          <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-M45VZDW4" height="0" width="0" style={{ display: "none", visibility: "hidden" }} />
        </noscript>
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
