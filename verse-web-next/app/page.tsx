"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/hooks/useAuth";

export default function RootPage() {
  const { isAuthed, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(isAuthed ? "/courses" : "/login");
  }, [ready, isAuthed, router]);

  return null;
}
