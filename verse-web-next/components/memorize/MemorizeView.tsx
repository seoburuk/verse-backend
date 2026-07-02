"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMemorize } from "./useMemorize";
import { DragTiles } from "./DragTiles";
import { TypeScaffold } from "./TypeScaffold";
import { recordGrade, clearGrades } from "../../lib/sessionGrades";
import { getFavorites, addFavorite, removeFavorite } from "../../lib/api/favorites";
import { getLives } from "../../lib/api/lives";
import type { CourseItem } from "../../lib/api/courses";

const gradeLabel: Record<string, string> = {
  green: "🟢 완벽해요!",
  yellow: "🟡 조금 더!",
  red: "🔴 다시 해보세요",
  none: "",
};

const confettiColors = ["var(--green)", "var(--yellow)", "var(--pink)", "var(--pink-soft)"];

interface Props {
  items: CourseItem[];
  index: number;
  sectionId: string;
  backHref: string;
  doneHref: string;
  buildItemHref: (index: number) => string;
}

export function MemorizeView({ items, index, sectionId, backHref, doneHref, buildItemHref }: Props) {
  const item = items[index];
  return (
    <MemorizeContent
      key={item.course_item_id}
      items={items}
      index={index}
      sectionId={sectionId}
      backHref={backHref}
      doneHref={doneHref}
      buildItemHref={buildItemHref}
    />
  );
}

function MemorizeContent({ items, index, sectionId, backHref, doneHref, buildItemHref }: Props) {
  const router = useRouter();
  const item = items[index];
  const isLast = index >= items.length - 1;
  const {
    phase, mode, tiles, placed, typed, typeReveal, liveGrade, submitting, serverGrade, mismatch, outOfLives, combo, fx,
    setMode, tapTile, setTyped, startRecall, submit, reset,
  } = useMemorize(item.course_item_id, item.text);

  const [favorited, setFavorited] = useState(false);
  useEffect(() => {
    getFavorites()
      .then(({ items }) => setFavorited(items.some((f) => f.course_item_id === item.course_item_id)))
      .catch(() => {});
  }, [item.course_item_id]);

  function toggleFavorite() {
    const next = !favorited;
    setFavorited(next);
    const req = next ? addFavorite(item.course_item_id) : removeFavorite(item.course_item_id);
    req.catch(() => setFavorited(!next));
  }

  const [lives, setLives] = useState<number | null>(null);
  useEffect(() => {
    getLives().then((l) => setLives(l.lives)).catch(() => {});
  }, []);
  useEffect(() => {
    if (phase === "result") {
      getLives().then((l) => setLives(l.lives)).catch(() => {});
    }
  }, [phase]);

  if (outOfLives) {
    return (
      <div className="page">
        <header className="page-header">
          <button className="btn-link" onClick={() => router.push(backHref)}>← 뒤로</button>
          <span className="lives-badge">❤️ 0</span>
        </header>
        <main className="page-center">
          <div className="card out-of-lives">
            <div className="out-of-lives-icon">💔</div>
            <h2 className="title">목숨이 없어요</h2>
            <p className="muted">잠시 후 목숨이 채워지면 다시 도전하세요</p>
            <button className="btn-primary" onClick={() => router.push(backHref)}>
              뒤로 가기
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push(backHref)}>← 뒤로</button>
        <span className="item-ref">{item.topic}</span>
        <div className="header-right">
          {lives !== null && <span className="lives-badge">❤️ {lives}</span>}
          <button
            className="fav-btn"
            aria-label={favorited ? "책갈피 해제" : "책갈피"}
            onClick={toggleFavorite}
          >
            {favorited ? "★" : "☆"}
          </button>
        </div>
      </header>

      <main className="memorize-main">
        {phase === "study" && (
          <div className="study-phase">
            <div className="verse-box">
              <p className="verse-text">{item.text}</p>
            </div>
            <div className="mode-toggle">
              <button
                className={mode === "drag" ? "mode-btn mode-active" : "mode-btn"}
                onClick={() => setMode("drag")}
              >
                타일 탭
              </button>
              <button
                className={mode === "type" ? "mode-btn mode-active" : "mode-btn"}
                onClick={() => setMode("type")}
              >
                타이핑
              </button>
            </div>
            <button className="btn-primary" onClick={startRecall}>
              암송 시작
            </button>
          </div>
        )}

        {phase === "recall" && (
          <div className="recall-phase">
            {mode === "drag" ? (
              <>
                <div className="verse-box verse-hidden">
                  <p className="muted">절을 기억해서 아래에 배치하세요</p>
                </div>
                <DragTiles
                  placed={placed}
                  pool={tiles}
                  liveGrade={liveGrade}
                  onTap={tapTile}
                />
              </>
            ) : (
              <>
                <div className="verse-box">
                  <TypeScaffold reveal={typeReveal} fx={fx} />
                </div>
                <div className="type-input-wrap">
                  {combo >= 5 && <span className="combo-badge">x{combo}</span>}
                  <textarea
                    className={`type-input grade-border-${liveGrade}${
                      fx ? ` fx-${fx.kind}-${fx.seq % 2 ? "a" : "b"}` : ""
                    }`}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!submitting && typed.trim() !== "") submit();
                      }
                    }}
                    placeholder="절을 입력하세요"
                    rows={4}
                    autoFocus
                  />
                </div>
              </>
            )}
            <button
              className="btn-primary"
              onClick={submit}
              disabled={
                submitting ||
                (mode === "drag" ? placed.length === 0 : typed.trim() === "")
              }
            >
              {submitting ? "제출 중..." : "제출"}
            </button>
          </div>
        )}

        {phase === "result" && (
          <div className="result-phase">
            {serverGrade === "green" ? (
              <div className="complete-banner">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    className="confetti"
                    style={{
                      left: `${8 + i * 7.5}%`,
                      background: confettiColors[i % confettiColors.length],
                      animationDelay: `${0.25 + (i % 5) * 0.09}s`,
                    }}
                  />
                ))}
                <div className="complete-icon">★</div>
                <h1 className="complete-title">{isLast ? "완료!" : "완벽해요!"}</h1>
              </div>
            ) : (
              <div className={`result-badge grade-${serverGrade}`}>
                {gradeLabel[serverGrade ?? "none"]}
              </div>
            )}
            {mismatch && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                서버 채점으로 확정됐어요
              </p>
            )}
            <div className="verse-box">
              <p className="verse-text">{item.text}</p>
            </div>
            <div className="result-actions">
              {serverGrade === "green" ? (
                <>
                  <button className="btn-secondary" onClick={reset}>
                    다시 시도
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      recordGrade(sectionId, serverGrade!);
                      if (isLast) {
                        router.push(doneHref);
                      } else {
                        router.push(buildItemHref(index + 1));
                      }
                    }}
                  >
                    {isLast ? "섹션 완료!" : "다음으로"}
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={() => { clearGrades(sectionId); reset(); }}>
                  다시하기
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
