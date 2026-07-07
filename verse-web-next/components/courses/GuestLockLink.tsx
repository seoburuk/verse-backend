"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useAuth } from "@/lib/hooks/useAuth";

// 게스트에게 잠긴 코스 카드. unlockedForGuest가 아니면 잠금 표시 + 가입 페이지로 유도.
export function GuestLockLink({
  href,
  unlockedForGuest,
  className,
  children,
}: {
  href: string;
  unlockedForGuest: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const { isAuthed, ready } = useAuth();
  const t = useTranslations("courses");
  const locked = ready && !isAuthed && !unlockedForGuest;

  if (!locked) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link href="/login?mode=signup" className={`${className} course-locked`}>
      {children}
      <span className="course-locked-hint">🔒 {t("lockedHint")}</span>
    </Link>
  );
}
