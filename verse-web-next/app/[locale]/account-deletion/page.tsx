import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const path = "/account-deletion";
  return {
    title: locale === "ko" ? "계정 삭제" : "Account Deletion",
    alternates: {
      canonical: locale === "ko" ? path : `/en${path}`,
      languages: { ko: path, en: `/en${path}` },
    },
  };
}

const COPY: Record<
  Locale,
  { title: string; effective: string; sections: { h: string; p: string[] }[] }
> = {
  ko: {
    title: "계정 삭제 안내 — PIX BIBLE",
    effective: "시행일자: 2026년 7월 16일",
    sections: [
      {
        h: "1. 앱 내에서 직접 삭제하기",
        p: [
          "PIX BIBLE 앱을 실행한 뒤 [설정] → [계정 삭제]로 이동하세요.",
          "본인 계정임을 확인하기 위해 사용자 이름(아이디)을 입력하는 화면이 표시됩니다. 사용자 이름을 정확히 입력하고 [영구 삭제]를 누르면 계정이 즉시 삭제됩니다.",
          "이 절차는 로그인 방식(아이디/비밀번호, Google 로그인, Apple 로그인)에 관계없이 동일하게 적용됩니다.",
        ],
      },
      {
        h: "2. 앱을 삭제했거나 로그인할 수 없는 경우",
        p: [
          "앱에 접근할 수 없는 경우, 가입 시 사용한 아이디(또는 Google·Apple 계정 이메일)를 명시하여 dksk1234234@gmail.com 으로 삭제를 요청하실 수 있습니다.",
          "본인 확인 후 영업일 기준 7일 이내에 계정과 데이터를 삭제 처리합니다.",
        ],
      },
      {
        h: "3. 삭제되는 데이터 및 보관 기간",
        p: [
          "삭제 즉시 다음 데이터가 파기됩니다: 아이디, 비밀번호(암호화된 값), 이름, 이메일, 소셜 로그인(Google·Apple) 식별자, 암송 진도·등급 기록, 책갈피, 앱 설정(테마·언어).",
          "계정 및 위 데이터는 삭제 요청 처리 즉시 파기되며, 별도로 보관되는 개인정보는 없습니다.",
          "다만 관련 법령상 보관 의무가 있는 정보(예: 결제 기록)가 있는 경우, 해당 법령이 정한 기간 동안만 예외적으로 보관 후 파기합니다.",
        ],
      },
      {
        h: "4. 계정을 유지하면서 일부 데이터만 삭제하고 싶은 경우",
        p: [
          "현재는 계정 삭제 없이 일부 데이터만 선택적으로 삭제하는 기능은 제공하지 않습니다.",
          "특정 데이터 항목만 삭제하고 싶다면 dksk1234234@gmail.com 으로 문의해 주시면 개별적으로 확인 후 처리해 드립니다.",
        ],
      },
      {
        h: "5. 문의",
        p: ["계정 삭제 관련 문의는 dksk1234234@gmail.com 으로 연락해 주세요."],
      },
    ],
  },
  en: {
    title: "Account Deletion — PIX BIBLE",
    effective: "Effective date: July 16, 2026",
    sections: [
      {
        h: "1. Delete your account in the app",
        p: [
          "Open the PIX BIBLE app and go to Settings → Delete account.",
          "You'll be asked to type your username to confirm it's your account. Once you type it correctly and tap \"Delete permanently,\" your account is deleted immediately.",
          "This process is the same regardless of how you signed in (username/password, Google Sign-In, or Apple Sign-In).",
        ],
      },
      {
        h: "2. If you no longer have the app or can't sign in",
        p: [
          "If you can't access the app, you can request deletion by emailing dksk1234234@gmail.com and stating the username (or the Google/Apple account email) used to sign up.",
          "After we verify your identity, your account and data will be deleted within 7 business days.",
        ],
      },
      {
        h: "3. What is deleted, and how long we retain it",
        p: [
          "Deletion is immediate and destroys the following: username, password (stored encrypted), name, email, social sign-in (Google/Apple) identifiers, memorization progress and grade records, bookmarks, and app settings (theme, language).",
          "Your account and the data above are destroyed as soon as a deletion request is processed; we do not retain a separate copy.",
          "Where the law requires us to retain certain records (e.g., payment records), we retain only that data for the legally required period before deleting it.",
        ],
      },
      {
        h: "4. Deleting only some data without deleting your account",
        p: [
          "We do not currently offer a way to delete only specific data while keeping your account active.",
          "If you want a specific piece of data removed, email dksk1234234@gmail.com and we will review and process your request individually.",
        ],
      },
      {
        h: "5. Contact",
        p: ["For account deletion questions, contact dksk1234234@gmail.com."],
      },
    ],
  },
};

export default function AccountDeletionPage({ params: { locale } }: { params: { locale: Locale } }) {
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
