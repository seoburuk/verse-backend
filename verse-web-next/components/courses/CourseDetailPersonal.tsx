"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "../../lib/hooks/useAuth";
import { LivesStreakBadges } from "../LivesStreakBadges";

export default function CourseDetailPersonal() {
  const { isAuthed, logout } = useAuth();
  const router = useRouter();
  const t = useTranslations("nav");

  return (
    <div className="header-right">
      <LivesStreakBadges />
      {isAuthed ? (
        <>
          <button className="btn-link" onClick={logout}>{t("logout")}</button>
        </>
      ) : (
        <button className="btn-link" onClick={() => router.push("/login")}>{t("login")}</button>
      )}
    </div>
  );
}
