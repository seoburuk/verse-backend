"use client";

import { useEffect, useRef } from "react";

// Google Identity Services 스크립트 URL. CSP/외부 스크립트 허용 필요.
const GIS_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface CredentialResponse {
  credential: string; // 구글 ID 토큰(JWT). 백엔드 /auth/google로 전달.
}

// window.google 타입은 GIS 스크립트가 런타임에 주입한다. 최소한만 선언.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: CredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GIS load failed"));
    document.head.appendChild(script);
  });
}

interface Props {
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
}

export default function GoogleSignInButton({ onCredential, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGisScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => onCredential(res.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          width: 280,
        });
      })
      .catch(() => onError?.("Google 로그인을 불러오지 못했습니다."));

    return () => {
      cancelled = true;
    };
  }, [onCredential, onError]);

  // 클라이언트 ID 미설정 시 버튼을 숨긴다(로컬 개발 등).
  if (!CLIENT_ID) return null;

  return <div ref={ref} className="google-btn" />;
}
