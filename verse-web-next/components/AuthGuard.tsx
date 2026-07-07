"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "../lib/hooks/useAuth";

export default function AuthGuard({
  children,
  allowGuest = false,
}: {
  children: React.ReactNode;
  allowGuest?: boolean;
}) {
  const { isAuthed, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !isAuthed && !allowGuest) router.replace("/login");
  }, [ready, isAuthed, allowGuest, router]);

  if (!ready || (!isAuthed && !allowGuest)) return null;

  return <>{children}</>;
}
