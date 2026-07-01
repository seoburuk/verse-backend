"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthed, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !isAuthed) router.replace("/login");
  }, [ready, isAuthed, router]);

  if (!ready || !isAuthed) return null;

  return <>{children}</>;
}
