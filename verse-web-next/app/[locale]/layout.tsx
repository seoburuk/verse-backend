import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "../lib/store/AuthContext";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pixbible.example";

const SITE_DESC = "성경 암기 앱 PIX BIBLE — 킹제임스 성경(KJV) 66권을 절 단위로 암기하세요. 주제별·권별 성경 암송 코스 제공.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PIX BIBLE — 성경 암기 앱",
    template: "%s | PIX BIBLE 성경 암기",
  },
  description: SITE_DESC,
  openGraph: {
    siteName: "PIX BIBLE",
    locale: "ko_KR",
    type: "website",
  },
  // 소유 확인 값은 Google Search Console / 네이버 서치어드바이저 등록 후 채울 것
  verification: {
    google: "REPLACE_WITH_GOOGLE_VERIFICATION",
    other: { "naver-site-verification": "REPLACE_WITH_NAVER_VERIFICATION" },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "PIX BIBLE",
      description: SITE_DESC,
      inLanguage: "ko",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "PIX BIBLE",
      url: SITE_URL,
      applicationCategory: "EducationalApplication",
      operatingSystem: "All",
      inLanguage: "ko",
      description: SITE_DESC,
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
