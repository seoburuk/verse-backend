import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { AuthRedirect } from "@/components/AuthRedirect";
import { TRIAL_COURSE_SLUG } from "@/lib/guest";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app";

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
  const badge = locale === "ko" ? "/app/appstore-badge-ko.svg" : "/app/appstore-badge-en.svg";
  const suffix = locale === "ko" ? "ko" : "en";

  const appStoreBadge = (
    <a
      className="appstore-badge"
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener"
      aria-label={t("appStoreAlt")}
    >
      <Image src={badge} alt={t("appStoreAlt")} width={162} height={50} unoptimized />
    </a>
  );

  const playStoreBadge = (
    <a
      className="playstore-badge"
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener"
      aria-label={t("playStoreAlt")}
    >
      {t("playStoreAlt")}
    </a>
  );

  const storeBadges = (
    <div className="landing-store-badges">
      {appStoreBadge}
      {playStoreBadge}
    </div>
  );

  const modes = [
    { key: "1", shot: `/app/shot-drag-${suffix}.png`, alt: t("shotAltDrag") },
    { key: "2", shot: `/app/shot-type-${suffix}.png`, alt: t("shotAltType") },
    { key: "3", shot: `/app/shot-dictation-${suffix}.png`, alt: t("shotAltDictation") },
  ] as const;

  return (
    <div className="page">
      <AuthRedirect />
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <Image
              className="landing-app-icon"
              src="/app/icon.png"
              alt=""
              width={72}
              height={72}
              priority
            />
            <p className="landing-app-sub">{t("appSub")}</p>
            <h1 className="landing-title">{t("heroHeadline")}</h1>
            <p className="landing-tagline">{t("heroValue")}</p>
            <div className="landing-cta">
              {storeBadges}
              <Link href={`/courses/${TRIAL_COURSE_SLUG}`} className="landing-web-link">
                {t("webFallback")}
              </Link>
            </div>
          </div>
          <div className="landing-hero-shot">
            <Image
              src={`/app/shot-drag-${suffix}.png`}
              alt={t("shotAltDrag")}
              width={416}
              height={900}
              priority
            />
          </div>
        </section>

        <section className="landing-stats" aria-label={t("modesTitle")}>
          <div className="landing-stat">
            <strong>{t("statVerses")}</strong>
            <span>{t("statVersesLabel")}</span>
          </div>
          <div className="landing-stat">
            <strong>{t("statBooks")}</strong>
            <span>{t("statBooksLabel")}</span>
          </div>
          <div className="landing-stat">
            <strong>{t("statModes")}</strong>
            <span>{t("statModesLabel")}</span>
          </div>
        </section>

        <section className="landing-modes">
          <h2 className="landing-section-title">{t("modesTitle")}</h2>
          <div className="landing-mode-list">
            {modes.map((m) => (
              <div className="landing-mode-card" key={m.key}>
                <Image src={m.shot} alt={m.alt} width={208} height={450} />
                <h3 className="landing-feature-title">{t(`mode${m.key}Title`)}</h3>
                <p className="landing-feature-desc">{t(`mode${m.key}Desc`)}</p>
              </div>
            ))}
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

        <section className="landing-final-cta">
          <h2 className="landing-section-title">{t("finalTitle")}</h2>
          <p className="landing-feature-desc">{t("finalDesc")}</p>
          <div className="landing-cta">
            {storeBadges}
            <Link href={`/courses/${TRIAL_COURSE_SLUG}`} className="landing-web-link">
              {t("webFallback")}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
