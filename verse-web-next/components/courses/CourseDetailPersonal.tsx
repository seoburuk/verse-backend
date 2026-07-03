"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";

export default function CourseDetailPersonal() {
  const { isAuthed, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="header-right">
      {isAuthed ? (
        <>
          <button className="btn-link" onClick={() => router.push("/courses")}>목록</button>
          <button className="btn-link" onClick={logout}>로그아웃</button>
        </>
      ) : (
        <button className="btn-link" onClick={() => router.push("/login")}>로그인</button>
      )}
    </div>
  );
}
