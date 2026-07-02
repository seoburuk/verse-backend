import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "../lib/store/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pixel KJV",
    template: "%s | Pixel KJV",
  },
  description: "킹제임스 성경(KJV) 66권을 절별로 암송하는 레트로 픽셀 스타일 앱",
  openGraph: {
    siteName: "Pixel KJV",
    locale: "ko_KR",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
