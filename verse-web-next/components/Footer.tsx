import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";

export async function Footer() {
  const t = await getTranslations("footer");
  return (
    <footer className="site-footer">
      <nav className="site-footer-links">
        <Link href="/about">{t("about")}</Link>
        <Link href="/terms">{t("terms")}</Link>
        <Link href="/privacy">{t("privacy")}</Link>
      </nav>
      <p className="site-footer-copy">© {new Date().getFullYear()} PIX BIBLE</p>
    </footer>
  );
}
