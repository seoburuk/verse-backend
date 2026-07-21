"use client";

import { useState, useEffect } from "react";
import { getProgress, type Streak } from "../lib/api/progress";
import { getLives, type Lives } from "../lib/api/lives";
import { useAuth } from "../lib/hooks/useAuth";
import { PixelIcon } from "./PixelIcon";

// 목숨/스트릭 배지 — 암송 화면 밖(코스 목록/상세, 섹션)에서도 보이도록
// CourseHeaderPersonal에서 쓰던 로직을 분리해 재사용한다.
export function LivesStreakBadges() {
  const { isAuthed } = useAuth();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [lives, setLives] = useState<Lives | null>(null);

  useEffect(() => {
    if (!isAuthed) return;
    Promise.all([getProgress(), getLives()])
      .then(([p, l]) => {
        setStreak(p.streak);
        setLives(l);
      })
      .catch(() => {});
  }, [isAuthed]);

  if (!isAuthed) return null;

  return (
    <>
      {lives && (
        <span className="lives-badge">
          <PixelIcon name="heart" /> {lives.lives}
        </span>
      )}
      {streak && (
        <span className="streak-badge">
          <img src="/mascot/dove-idle.svg" alt="" width={18} height={18} className="streak-mascot" />
          <PixelIcon name="flame" /> {streak.current}
        </span>
      )}
    </>
  );
}
