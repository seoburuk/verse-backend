import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("aboutTitle") };
}

const COPY: Record<Locale, { title: string; body: string[] }> = {
  ko: {
    title: "PIX BIBLE 소개",
    body: [
      "PIX BIBLE은 킹제임스 성경(KJV) 66권을 절 단위로 암송할 수 있도록 돕는 레트로 픽셀 스타일 학습 웹앱입니다.",
      "타일 배치 모드와 직접 입력 모드로 구절을 반복 암송하고, 주제별·권별로 구성된 코스를 통해 체계적으로 학습할 수 있습니다.",
      "암송 진도와 등급(그린·옐로우·레드)을 기록해 복습이 필요한 구절을 관리하고, 즐겨찾는 구절은 책갈피로 저장해 다시 볼 수 있습니다.",
      "PIX BIBLE은 개인이 만든 서비스이며, 문의 사항은 앱 내 채널을 통해 남겨주시면 확인 후 답변드립니다.",
    ],
  },
  en: {
    title: "About PIX BIBLE",
    body: [
      "PIX BIBLE is a retro-pixel learning web app that helps you memorize the King James Version (KJV) Bible verse by verse.",
      "Practice with tile-ordering or typing drills, and work through topic- and book-based courses built for systematic memorization.",
      "Your progress and grades (green, yellow, red) are tracked so you know which verses need review, and favorite verses can be saved as bookmarks.",
      "PIX BIBLE is an independently built app. If you have questions, please reach out through the contact channel in the app.",
    ],
  },
};

export default function AboutPage({ params: { locale } }: { params: { locale: Locale } }) {
  setRequestLocale(locale);
  const copy = COPY[locale] ?? COPY.ko;

  return (
    <div className="page">
      <header className="page-header">
        <Link href="/courses" className="btn-link">
          {locale === "ko" ? "← 코스 목록" : "← Courses"}
        </Link>
        <h1 className="title">{copy.title}</h1>
      </header>
      <main className="content">
        <div className="legal-content">
          {copy.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </main>
    </div>
  );
}
