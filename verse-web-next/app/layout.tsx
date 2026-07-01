import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "../lib/store/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pixel KJV",
  description: "KJV 성경 암송",
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
