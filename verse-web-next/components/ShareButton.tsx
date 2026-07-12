"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface ShareButtonProps {
  url: string;
  title: string;
  text: string;
  className?: string;
  label?: string;
}

// 공유 버튼 — 모바일은 OS 공유시트(Web Share API), PC는 클립보드 복사 폴백.
export function ShareButton({ url, title, text, className, label }: ShareButtonProps) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  async function handleShare() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // 사용자가 공유시트를 닫은 경우 등 — 클립보드 폴백으로 진행하지 않고 종료
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한 거부 — 조용히 무시
    }
  }

  return (
    <button className={className ?? "btn-secondary"} onClick={handleShare}>
      {copied ? t("copied") : label ?? t("shareButton")}
    </button>
  );
}
