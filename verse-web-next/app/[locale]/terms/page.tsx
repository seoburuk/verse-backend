import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("termsTitle") };
}

const COPY: Record<Locale, { title: string; sections: { h: string; p: string[] }[] }> = {
  ko: {
    title: "이용약관",
    sections: [
      {
        h: "1. 서비스 소개",
        p: ["PIX BIBLE(이하 '서비스')은 킹제임스 성경(KJV)을 절 단위로 암송할 수 있도록 돕는 학습용 웹앱입니다."],
      },
      {
        h: "2. 이용 계약",
        p: ["회원가입 시 입력한 정보는 정확해야 하며, 계정 관리 책임은 이용자 본인에게 있습니다."],
      },
      {
        h: "3. 콘텐츠",
        p: ["서비스에서 제공하는 성경 본문, 코스 구성, 진도 기록 등은 학습 목적으로만 사용해야 합니다."],
      },
      {
        h: "4. 서비스 변경 및 중단",
        p: ["운영상·기술상 필요에 따라 서비스의 전부 또는 일부가 변경되거나 중단될 수 있습니다."],
      },
      {
        h: "5. 면책",
        p: ["서비스는 무료로 제공되며, 서비스 이용으로 발생하는 손해에 대해 운영자는 고의 또는 중과실이 없는 한 책임을 지지 않습니다."],
      },
      {
        h: "6. 약관 변경",
        p: ["이 약관은 필요 시 개정될 수 있으며, 개정 시 서비스 내 공지를 통해 안내합니다."],
      },
    ],
  },
  en: {
    title: "Terms of Service",
    sections: [
      {
        h: "1. About the Service",
        p: ["PIX BIBLE (the \"Service\") is a learning web app that helps you memorize the King James Version (KJV) Bible verse by verse."],
      },
      {
        h: "2. Account",
        p: ["Information provided at signup must be accurate. You are responsible for maintaining the security of your own account."],
      },
      {
        h: "3. Content",
        p: ["Bible text, course structures, and progress records provided by the Service are for personal learning purposes only."],
      },
      {
        h: "4. Changes and Discontinuation",
        p: ["The Service, in whole or in part, may be modified or discontinued for operational or technical reasons."],
      },
      {
        h: "5. Disclaimer",
        p: ["The Service is provided free of charge. The operator is not liable for damages arising from use of the Service, except in cases of intent or gross negligence."],
      },
      {
        h: "6. Changes to Terms",
        p: ["These Terms may be revised as needed. Any changes will be announced within the Service."],
      },
    ],
  },
};

export default function TermsPage({ params: { locale } }: { params: { locale: Locale } }) {
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
          {copy.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
