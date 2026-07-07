import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { AuthRedirect } from "@/components/AuthRedirect";
import { TRIAL_COURSE_SLUG } from "@/lib/guest";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("landingTitle"),
    description: t("landingDesc"),
    openGraph: {
      title: t("landingTitle"),
      description: t("landingOgDesc"),
      type: "website",
    },
  };
}

export default async function LandingPage({
  params: { locale },
}: {
  params: { locale: Locale };
}) {
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  return (
    <div className="page">
      <AuthRedirect />
      <main className="landing-main">
        <section className="landing-hero">
          <h1 className="landing-title">PIX BIBLE</h1>
          <p className="landing-tagline">{t("tagline")}</p>
          <div className="landing-cta">
            <Link href={`/courses/${TRIAL_COURSE_SLUG}`} className="btn-primary landing-cta-link">
              {t("ctaTrial")}
            </Link>
            <Link href="/login" className="btn-secondary landing-cta-link">
              {t("cta")}
            </Link>
          </div>
        </section>
        <section className="landing-features">
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">{t("feature1Title")}</h2>
            <p className="landing-feature-desc">{t("feature1Desc")}</p>
          </div>
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">{t("feature2Title")}</h2>
            <p className="landing-feature-desc">{t("feature2Desc")}</p>
          </div>
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">{t("feature3Title")}</h2>
            <p className="landing-feature-desc">{t("feature3Desc")}</p>
          </div>
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">{t("feature4Title")}</h2>
            <p className="landing-feature-desc">{t("feature4Desc")}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
