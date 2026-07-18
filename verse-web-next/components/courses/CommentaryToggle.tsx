"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// CommentaryToggle — 해설 접기/펼치기 토글 상태를 공유하는 컨텍스트 세트.
// SEO 핵심: 해설 콘텐츠(CommentaryBody의 children)는 항상 서버에서 렌더되어
// 초기 HTML에 존재한다. 여기서는 CSS display 전환만 하며, 클라이언트에서
// 콘텐츠를 지연 주입하지 않는다.
//
// 버튼(CommentaryToggleButton)은 헤더 쪽에, 본문(CommentaryBody)은 구절 목록
// 아래에 배치할 수 있도록 상태를 컨텍스트로 공유한다. 둘 다 CommentaryProvider
// 하위에 있어야 한다.

const CommentaryContext = createContext<{
  open: boolean;
  toggle: () => void;
} | null>(null);

export function CommentaryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <CommentaryContext.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      {children}
    </CommentaryContext.Provider>
  );
}

function useCommentaryToggle() {
  const ctx = useContext(CommentaryContext);
  if (!ctx) throw new Error("CommentaryToggleButton/Body must be used within CommentaryProvider");
  return ctx;
}

export function CommentaryToggleButton({ label }: { label: string }) {
  const { open, toggle } = useCommentaryToggle();
  return (
    <button
      type="button"
      className="btn-link commentary-toggle-btn"
      onClick={toggle}
      aria-expanded={open}
    >
      {label} {open ? "▲" : "▼"}
    </button>
  );
}

export function CommentaryBody({ children }: { children: ReactNode }) {
  const { open } = useCommentaryToggle();
  return (
    <div className="commentary-body" style={{ display: open ? "block" : "none" }}>
      {children}
    </div>
  );
}
