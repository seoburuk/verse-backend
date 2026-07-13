"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface ShareButtonProps {
  url: string;
  title: string;
  text: string;
  imageUrl?: string;
  className?: string;
  label?: string;
}

// 공유 버튼 — 모바일은 OS 공유시트(Web Share API), PC는 클립보드 복사 폴백.
// imageUrl이 있고 파일 공유가 지원되면 OG 이미지를 파일로 함께 공유한다.
export function ShareButton({ url, title, text, imageUrl, className, label }: ShareButtonProps) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // 이미지 파일 공유를 시도한다. 공유시트가 열렸으면(성공·사용자 취소 포함) true.
  async function tryShareWithImage(): Promise<boolean> {
    if (!imageUrl || typeof navigator.canShare !== "function") return false;
    let file: File;
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) return false;
      const blob = await res.blob();
      file = new File([blob], "pixbible.png", { type: "image/png" });
    } catch {
      // 오프라인 등 fetch 실패 — 텍스트 공유로 폴백
      return false;
    }
    // 일부 플랫폼은 files와 url 동시 공유를 지원하지 않으므로 순서대로 시도
    const candidates = [
      { files: [file], title, text, url },
      { files: [file], title, text: `${text}\n${url}` },
    ];
    for (const data of candidates) {
      if (!navigator.canShare(data)) continue;
      try {
        await navigator.share(data);
      } catch {
        // 사용자가 공유시트를 닫은 경우 등 — 폴백하지 않고 종료
      }
      return true;
    }
    return false;
  }

  async function handleShare() {
    if (sharing) return;
    if (typeof navigator.share === "function") {
      setSharing(true);
      try {
        if (await tryShareWithImage()) return;
        await navigator.share({ title, text, url });
      } catch {
        // 사용자가 공유시트를 닫은 경우 등 — 클립보드 폴백으로 진행하지 않고 종료
      } finally {
        setSharing(false);
      }
      return;
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
    <button className={className ?? "btn-secondary"} onClick={handleShare} disabled={sharing}>
      {sharing ? t("sharing") : copied ? t("copied") : label ?? t("shareButton")}
    </button>
  );
}
