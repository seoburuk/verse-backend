"use client";

import { useEffect, useRef } from "react";

// Sign in with Apple JS. CSP/외부 스크립트 허용 필요(GoogleSignInButton과 동일 패턴).
const APPLE_JS_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
const CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_SERVICE_ID ?? "";
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";

interface AppleAuthorization {
  id_token: string;
  code?: string;
  state?: string;
}

interface AppleSignInResponse {
  authorization: AppleAuthorization;
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
}

// window.AppleID 타입은 Apple JS 스크립트가 런타임에 주입한다. 최소한만 선언.
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<AppleSignInResponse>;
      };
    };
  }
}

function loadAppleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AppleID?.auth) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_JS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Apple JS load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = APPLE_JS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Apple JS load failed"));
    document.head.appendChild(script);
  });
}

interface Props {
  // id_token과, 애플이 최초 1회만 주는 이름(있으면)을 함께 전달한다.
  onCredential: (idToken: string, name?: string) => void;
  onError?: (message: string) => void;
}

export default function AppleSignInButton({ onCredential, onError }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!CLIENT_ID || !REDIRECT_URI) return;
    loadAppleScript()
      .then(() => {
        if (!window.AppleID) return;
        // Apple JS는 GIS와 달리 init을 앱 생애주기 중 반복 호출해도 안전하지만,
        // 불필요한 재초기화를 피하기 위해 한 번만 수행한다.
        if (!initialized.current) {
          window.AppleID.auth.init({
            clientId: CLIENT_ID,
            scope: "name email",
            redirectURI: REDIRECT_URI,
            usePopup: true,
          });
          initialized.current = true;
        }
      })
      .catch(() => onError?.("Apple 로그인을 불러오지 못했습니다."));
  }, [onError]);

  async function handleClick() {
    try {
      await loadAppleScript();
      if (!window.AppleID) throw new Error("Apple JS not loaded");
      const res = await window.AppleID.auth.signIn();
      const name = [res.user?.name?.firstName, res.user?.name?.lastName]
        .filter((s): s is string => !!s)
        .join(" ");
      onCredential(res.authorization.id_token, name || undefined);
    } catch {
      onError?.("Apple 로그인에 실패했습니다.");
    }
  }

  // Services ID/리다이렉트 URI 미설정 시 버튼을 숨긴다(애플 개발자 포털 설정 전).
  if (!CLIENT_ID || !REDIRECT_URI) return null;

  return (
    <button type="button" className="apple-btn" onClick={handleClick}>
       Apple로 로그인
    </button>
  );
}
