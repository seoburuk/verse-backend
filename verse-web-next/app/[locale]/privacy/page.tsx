import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "legal" });
  const path = "/privacy";
  return {
    title: t("privacyTitle"),
    alternates: {
      canonical: locale === "ko" ? path : `/en${path}`,
      languages: { ko: path, en: `/en${path}` },
    },
  };
}

const COPY: Record<Locale, { title: string; effective: string; sections: { h: string; p: string[] }[] }> = {
  ko: {
    title: "개인정보처리방침",
    effective: "시행일자: 2026년 7월 16일",
    sections: [
      {
        h: "1. 수집하는 정보",
        p: [
          "회원가입 시 아이디, 비밀번호(암호화 저장), 이름을 수집합니다.",
          "소셜 로그인(Google·Apple) 이용 시 해당 제공자가 전달하는 식별자 및 이메일을 수집합니다.",
          "서비스 이용 과정에서 암송 진도, 등급 기록, 책갈피, 설정(테마·언어)이 저장됩니다.",
          "광고 및 서비스 개선을 위해 광고 식별자(Android 광고 ID, Apple IDFA), 쿠키, 기기·이용 정보가 자동으로 처리될 수 있습니다.",
        ],
      },
      {
        h: "2. 정보 이용 목적",
        p: ["수집한 정보는 로그인 인증, 학습 진도 관리, 서비스 개선, 광고 게재를 위해서만 사용됩니다."],
      },
      {
        h: "3. 쿠키·광고 식별자 및 광고",
        p: [
          "웹에서는 로그인 유지를 위한 필수 쿠키와, Google AdSense를 통한 광고 게재를 위해 광고 쿠키(DoubleClick 쿠키 등)를 사용할 수 있습니다.",
          "앱에서는 Google AdMob을 통한 광고 게재를 위해 광고 식별자(Android 광고 ID / Apple IDFA)를 사용할 수 있습니다.",
          "Google을 비롯한 제3자 공급업체는 쿠키·광고 식별자를 사용하여 이용자의 이전 방문·이용 기록을 바탕으로 광고를 게재합니다.",
          "이용자는 Google 광고 설정(adssettings.google.com)에서 맞춤 광고를 비활성화할 수 있으며, aboutads.info에서 제3자 쿠키 사용을 거부할 수 있습니다. 앱에서는 기기 설정에서 광고 ID를 재설정하거나 맞춤 광고를 끌 수 있습니다.",
          "EEA·영국 등 동의가 필요한 지역의 이용자에게는 광고 표시 전 Google의 동의 관리 도구(UMP/Funding Choices)를 통한 동의 절차가 제공됩니다.",
          "Google의 광고 및 데이터 사용에 관한 자세한 내용은 policies.google.com/technologies/partner-sites에서 확인할 수 있습니다.",
        ],
      },
      {
        h: "4. 정보 보관 및 삭제",
        p: [
          "이용자는 설정 페이지에서 언제든지 계정과 저장된 학습 기록을 삭제할 수 있습니다.",
          "계정 삭제 시 수집된 개인정보는 지체 없이 파기하며, 법령에서 보관을 요구하는 경우 해당 기간 동안만 보관합니다.",
        ],
      },
      {
        h: "5. 제3자 제공",
        p: ["법령에 근거하지 않는 한 수집한 개인정보를 제3자에게 제공하지 않습니다. 단, 광고 게재를 위해 Google 등 광고 사업자가 쿠키·광고 식별자를 통해 정보를 처리할 수 있습니다."],
      },
      {
        h: "6. 아동의 개인정보",
        p: ["서비스는 아동을 주 대상으로 하지 않으며, 만 14세 미만 아동은 법정대리인의 동의 하에 이용할 수 있습니다."],
      },
      {
        h: "7. 문의",
        p: ["개인정보 관련 문의는 앱 내 채널 또는 이메일(dksk1234234@gmail.com)로 남겨주시면 확인 후 답변드립니다."],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    effective: "Effective date: July 16, 2026",
    sections: [
      {
        h: "1. Information We Collect",
        p: [
          "At signup we collect a username, password (stored encrypted), and name.",
          "If you sign in with Google or Apple, we collect the identifier and email address provided by that service.",
          "While using the Service, we store memorization progress, grades, bookmarks, and settings (theme, language).",
          "For advertising and service improvement, advertising identifiers (Android Advertising ID, Apple IDFA), cookies, and device/usage information may be processed automatically.",
        ],
      },
      {
        h: "2. How We Use Information",
        p: ["Collected information is used only for login authentication, progress tracking, improving the Service, and serving ads."],
      },
      {
        h: "3. Cookies, Advertising Identifiers, and Ads",
        p: [
          "On the web, the Service uses essential cookies to keep you logged in, and may use advertising cookies (such as DoubleClick cookies) to serve ads through Google AdSense.",
          "In the app, the Service may use advertising identifiers (Android Advertising ID / Apple IDFA) to serve ads through Google AdMob.",
          "Google and other third-party vendors use cookies and advertising identifiers to serve ads based on a user's prior visits and usage.",
          "You can opt out of personalized advertising via Google Ads Settings (adssettings.google.com), and opt out of third-party vendor cookies via aboutads.info. In the app, you can reset your advertising ID or opt out of personalized ads in your device settings.",
          "For users in regions requiring consent (EEA, UK, etc.), a consent flow is presented via Google's consent management tools (UMP/Funding Choices) before ads are shown.",
          "For more on how Google uses advertising and data, see policies.google.com/technologies/partner-sites.",
        ],
      },
      {
        h: "4. Data Retention and Deletion",
        p: [
          "You can delete your account and stored learning records at any time from the Settings page.",
          "Upon account deletion, collected personal information is destroyed without delay, except where retention is required by law.",
        ],
      },
      {
        h: "5. Third-Party Sharing",
        p: ["We do not share collected personal information with third parties except as required by law. Advertising partners such as Google may process information via cookies or advertising identifiers to serve ads."],
      },
      {
        h: "6. Children's Privacy",
        p: ["The Service is not directed primarily at children. Children under 14 may use the Service only with the consent of a parent or legal guardian."],
      },
      {
        h: "7. Contact",
        p: ["For privacy-related inquiries, please reach out through the contact channel in the app or by email at dksk1234234@gmail.com."],
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
          <p>{copy.effective}</p>
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
