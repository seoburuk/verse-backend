import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/i18n/routing";
import { AuthRedirect } from "@/components/AuthRedirect";

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
          <div className="landing-cta">
            <Link href="/login" className="btn-primary landing-cta-link">
              {t("cta")}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
