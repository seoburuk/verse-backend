import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacyTitle") };
}

const COPY: Record<Locale, { title: string; sections: { h: string; p: string[] }[] }> = {
  ko: {
    title: "개인정보처리방침",
    sections: [
      {
        h: "1. 수집하는 정보",
        p: [
          "회원가입 시 아이디, 비밀번호(암호화 저장), 이름을 수집합니다.",
          "서비스 이용 과정에서 암송 진도, 등급 기록, 책갈피, 설정(테마·언어)이 저장됩니다.",
        ],
      },
      {
        h: "2. 정보 이용 목적",
        p: ["수집한 정보는 로그인 인증, 학습 진도 관리, 서비스 개선을 위해서만 사용됩니다."],
      },
      {
        h: "3. 쿠키 및 광고",
        p: [
          "서비스는 로그인 유지를 위한 필수 쿠키와, Google AdSense를 통한 광고 게재를 위해 광고 쿠키(DoubleClick 쿠키 등)를 사용할 수 있습니다.",
          "Google을 비롯한 제3자 공급업체는 쿠키를 사용하여 이용자의 이전 방문 기록을 바탕으로 광고를 게재합니다.",
          "Google 광고 설정(adssettings.google.com)에서 맞춤 광고를 비활성화할 수 있으며, aboutads.info에서도 제3자 쿠키 사용을 거부할 수 있습니다.",
        ],
      },
      {
        h: "4. 정보 보관 및 삭제",
        p: ["이용자는 설정 페이지에서 언제든지 계정과 저장된 학습 기록을 삭제할 수 있습니다."],
      },
      {
        h: "5. 제3자 제공",
        p: ["법령에 근거하지 않는 한 수집한 개인정보를 제3자에게 제공하지 않습니다. 단, 광고 게재를 위해 Google 등 광고 사업자가 쿠키를 통해 정보를 처리할 수 있습니다."],
      },
      {
        h: "6. 문의",
        p: ["개인정보 관련 문의는 앱 내 채널을 통해 남겨주시면 확인 후 답변드립니다."],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    sections: [
      {
        h: "1. Information We Collect",
        p: [
          "At signup we collect a username, password (stored encrypted), and name.",
          "While using the Service, we store memorization progress, grades, bookmarks, and settings (theme, language).",
        ],
      },
      {
        h: "2. How We Use Information",
        p: ["Collected information is used only for login authentication, progress tracking, and improving the Service."],
      },
      {
        h: "3. Cookies and Advertising",
        p: [
          "The Service uses essential cookies to keep you logged in, and may use advertising cookies (such as DoubleClick cookies) to serve ads through Google AdSense.",
          "Google and other third-party vendors use cookies to serve ads based on a user's prior visits to this and other websites.",
          "You can opt out of personalized advertising via Google Ads Settings (adssettings.google.com), and opt out of third-party vendor cookies via aboutads.info.",
        ],
      },
      {
        h: "4. Data Retention and Deletion",
        p: ["You can delete your account and stored learning records at any time from the Settings page."],
      },
      {
        h: "5. Third-Party Sharing",
        p: ["We do not share collected personal information with third parties except as required by law. Advertising partners such as Google may process information via cookies to serve ads."],
      },
      {
        h: "6. Contact",
        p: ["For privacy-related inquiries, please reach out through the contact channel in the app."],
      },
    ],
  },
};

export default function PrivacyPage({ params: { locale } }: { params: { locale: Locale } }) {
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
