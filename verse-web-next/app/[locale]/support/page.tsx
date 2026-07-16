import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const path = "/support";
  return {
    title: locale === "ko" ? "고객 지원" : "Support",
    alternates: {
      canonical: locale === "ko" ? path : `/en${path}`,
      languages: { ko: path, en: `/en${path}` },
    },
  };
}

const EMAIL = "dksk1234234@gmail.com";

const COPY: Record<
  Locale,
  {
    title: string;
    intro: string;
    contactH: string;
    contactP: string[];
    faqH: string;
    faq: { q: string; a: string[] }[];
    linksH: string;
    links: { href: string; label: string }[];
  }
> = {
  ko: {
    title: "고객 지원 — PIX BIBLE",
    intro:
      "PIX BIBLE 사용 중 궁금한 점이나 문제가 있으신가요? 아래 자주 묻는 질문을 먼저 확인하시고, 해결되지 않으면 이메일로 문의해 주세요.",
    contactH: "문의하기",
    contactP: [
      `문의는 ${EMAIL} 으로 보내주세요. 영업일 기준 2~3일 이내에 답변드립니다.`,
      "문제 상황을 빠르게 파악할 수 있도록 사용 중인 기기(예: 안드로이드/아이폰), 앱 버전, 그리고 문제가 발생한 화면을 함께 적어주시면 도움이 됩니다.",
    ],
    faqH: "자주 묻는 질문",
    faq: [
      {
        q: "비밀번호를 잊어버렸어요.",
        a: [
          "회원가입 시 이메일을 함께 등록받으며, 로그인 화면의 [비밀번호 찾기]를 눌러 그 이메일로 재설정 링크를 받으실 수 있습니다.",
          "Google 또는 Apple 계정으로 로그인한 경우 별도 비밀번호가 없으며, [Google로 계속하기] 또는 [Apple로 계속하기]로 로그인하시면 됩니다.",
        ],
      },
      {
        q: "암송 진도가 저장되지 않아요.",
        a: [
          "진도와 등급 기록은 로그인한 계정에 저장됩니다. 로그인 상태인지 먼저 확인해 주세요.",
          "네트워크가 불안정하면 동기화가 지연될 수 있습니다. 인터넷 연결을 확인한 뒤 앱을 다시 실행해 보세요.",
        ],
      },
      {
        q: "다른 기기에서도 진도를 이어서 볼 수 있나요?",
        a: [
          "같은 계정으로 로그인하면 어느 기기에서든 동일한 암송 진도와 책갈피를 이어서 이용할 수 있습니다.",
        ],
      },
      {
        q: "계정을 삭제하고 싶어요.",
        a: [
          "앱에서 [설정] → [계정 삭제]로 직접 삭제하거나, 아래 '계정 삭제 안내' 페이지의 절차를 따라주세요.",
        ],
      },
      {
        q: "버그를 발견했거나 개선 아이디어가 있어요.",
        a: [
          `언제든 ${EMAIL} 으로 알려주세요. 제보해 주시는 내용은 다음 업데이트에 반영하도록 노력하겠습니다.`,
        ],
      },
    ],
    linksH: "관련 링크",
    links: [
      { href: "/account-deletion", label: "계정 삭제 안내" },
      { href: "/privacy", label: "개인정보처리방침" },
      { href: "/terms", label: "이용약관" },
    ],
  },
  en: {
    title: "Support — PIX BIBLE",
    intro:
      "Have a question or running into a problem with PIX BIBLE? Check the frequently asked questions below first, and if that doesn't help, reach out by email.",
    contactH: "Contact us",
    contactP: [
      `Email us at ${EMAIL}. We usually reply within 2–3 business days.`,
      "To help us resolve your issue quickly, please include your device (e.g., Android/iPhone), the app version, and the screen where the problem occurred.",
    ],
    faqH: "Frequently asked questions",
    faq: [
      {
        q: "I forgot my password.",
        a: [
          "We collect your email at sign-up, and you can tap \"Forgot password\" on the sign-in screen to receive a reset link at that email.",
          "If you signed in with Google or Apple, you don't have a separate password — just use \"Continue with Google\" or \"Continue with Apple.\"",
        ],
      },
      {
        q: "My memorization progress isn't being saved.",
        a: [
          "Progress and grade records are saved to your signed-in account, so make sure you're signed in.",
          "An unstable network can delay syncing. Check your internet connection and restart the app.",
        ],
      },
      {
        q: "Can I continue my progress on another device?",
        a: [
          "Sign in with the same account on any device and your memorization progress and bookmarks will carry over.",
        ],
      },
      {
        q: "I want to delete my account.",
        a: [
          "Delete it directly in the app via Settings → Delete account, or follow the steps on the Account Deletion page below.",
        ],
      },
      {
        q: "I found a bug or have a suggestion.",
        a: [
          `Let us know anytime at ${EMAIL}. We do our best to address reports in an upcoming update.`,
        ],
      },
    ],
    linksH: "Related links",
    links: [
      { href: "/account-deletion", label: "Account Deletion" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
};

export default function SupportPage({ params: { locale } }: { params: { locale: Locale } }) {
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
          <p>{copy.intro}</p>

          <section>
            <h2>{copy.contactH}</h2>
            {copy.contactP.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>

          <section>
            <h2>{copy.faqH}</h2>
            {copy.faq.map((item) => (
              <div key={item.q}>
                <h3>{item.q}</h3>
                {item.a.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ))}
          </section>

          <section>
            <h2>{copy.linksH}</h2>
            <ul>
              {copy.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
