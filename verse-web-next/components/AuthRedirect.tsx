"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "../lib/hooks/useAuth";

// AuthRedirect — 이미 로그인한 사용자가 공개 랜딩(/)에 들어오면 /courses로 보낸다.
// 랜딩 자체는 서버 컴포넌트(정적 렌더 + metadata)로 유지하기 위해 리다이렉트만
// 별도 클라이언트 컴포넌트로 분리했다.
export function AuthRedirect() {
  const { isAuthed, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && isAuthed) {
      router.replace("/courses");
    }
  }, [ready, isAuthed, router]);

  return null;
}
