"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { useAuth } from "../../lib/hooks/useAuth";
import { useMemorize } from "./useMemorize";
import { DragTiles } from "./DragTiles";
import { TypeScaffold } from "./TypeScaffold";
import { recordGrade, clearGrades } from "../../lib/sessionGrades";
import { getFavorites, addFavorite, removeFavorite } from "../../lib/api/favorites";
import { getLives, consumeLife } from "../../lib/api/lives";
import { getStats } from "../../lib/api/stats";
import { pickLocalized, type CourseItem } from "../../lib/api/courses";
import { claimMilestone } from "../../lib/milestones";
import {
  buildVerseShareUrl,
  buildMilestoneShareUrl,
  buildVerseOgUrl,
  buildMilestoneOgUrl,
} from "../../lib/share";
import { bookName } from "../../lib/bookRef";
import { PixelIcon } from "../PixelIcon";
import { ShareButton } from "../ShareButton";

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
  const { isAuthed, user } = useAuth();
  const t = useTranslations("memorize");
  const tShare = useTranslations("share");
  const locale = useLocale();
  const gradeText = (g: string | null) =>
    g === "green" ? t("gradeGreen") : g === "yellow" ? t("gradeYellow") : g === "red" ? t("gradeRed") : "";
  const item = items[index];
  const isLast = index >= items.length - 1;
  const {
    phase, mode, tiles, placed, typed, typeReveal, liveGrade, submitting, serverGrade, mismatch, outOfLives, combo, fx,
    setMode, tapTile, setTyped, startRecall, submit, reset,
  } = useMemorize(item.course_item_id, item.text);

  // 진행 게이지 — recall 단계에서 채운 단어 비율 (드래그: 배치 수, 타자: 정확히 채운 수)
  const totalWords = typeReveal.length;
  const filledWords =
    mode === "drag" ? Math.min(placed.length, totalWords) : typeReveal.filter((w) => w.filled).length;
  const progressPct =
    phase === "study" ? 0 : phase === "result" ? 100 : totalWords === 0 ? 0 : Math.round((filledWords / totalWords) * 100);

  const [favorited, setFavorited] = useState(false);
  useEffect(() => {
    if (!isAuthed) return;
    getFavorites()
      .then(({ items }) => setFavorited(items.some((f) => f.course_item_id === item.course_item_id)))
      .catch(() => {});
  }, [item.course_item_id, isAuthed]);

  function toggleFavorite() {
    const next = !favorited;
    setFavorited(next);
    const req = next ? addFavorite(item.course_item_id) : removeFavorite(item.course_item_id);
    req.catch(() => setFavorited(!next));
  }

  // 타이핑·받아쓰기 공용 입력 블록. 콤보 배지 + 채점 테두리 + 타격 이펙트.
  const typeInput = (
    <div className="type-input-wrap">
      {combo >= 5 && (
        <span
          key={fx?.kind === "hit" && combo % 5 === 0 ? `combo-${combo}` : "combo"}
          className={fx?.kind === "hit" && combo % 5 === 0 ? "combo-badge milestone" : "combo-badge"}
          data-tier={combo >= 15 ? 3 : combo >= 10 ? 2 : 1}
        >
          x{combo}
        </span>
      )}
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
        placeholder={t("typePlaceholder")}
        rows={4}
        autoFocus
      />
    </div>
  );

  const [lives, setLives] = useState<number | null>(null);
  useEffect(() => {
    if (!isAuthed) return;
    getLives().then((l) => setLives(l.lives)).catch(() => {});
  }, [isAuthed]);

  // 마일스톤 감지 — green 판정 직후 최신 total_cleared를 조회해 임계값 통과 시 축하 카드.
  // 받아쓰기는 progress를 갱신하지 않으므로 제외.
  const [milestone, setMilestone] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "result" || serverGrade !== "green" || !isAuthed || mode === "dictation") return;
    getStats()
      .then((s) => setMilestone(claimMilestone(s.total_cleared)))
      .catch(() => {});
  }, [phase, serverGrade, isAuthed, mode]);

  // 뒤로가기 — 암송(recall) 진행 중 이탈은 목숨 1을 소모한다(포기 페널티). 게스트는 페널티 없음.
  function handleBack() {
    if (phase === "recall" && isAuthed) {
      setLives((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
      consumeLife().catch(() => {});
    }
    router.push(backHref);
  }
  useEffect(() => {
    if (phase === "result" && isAuthed) {
      getLives().then((l) => setLives(l.lives)).catch(() => {});
    }
  }, [phase, isAuthed]);

  if (outOfLives) {
    return (
      <div className="page">
        <header className="page-header">
          <button className="btn-link" onClick={() => router.push(backHref)}>{t("back")}</button>
          <span className="lives-badge">
            <PixelIcon name="heart" /> 0
          </span>
        </header>
        <main className="page-center">
          <div className="card out-of-lives">
            <div className="out-of-lives-icon">
              <PixelIcon name="heart" size={40} />
            </div>
            <h2 className="title">{t("outOfLivesTitle")}</h2>
            <p className="muted">{t("outOfLivesDesc")}</p>
            <button className="btn-primary" onClick={() => router.push(backHref)}>
              {t("goBack")}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={handleBack}>{t("back")}</button>
        <span className="item-ref">{pickLocalized(item.topic, item.topic_en, locale)}</span>
        <div className="header-right">
          {lives !== null && (
            <span className="lives-badge">
              <PixelIcon name="heart" /> {lives}
            </span>
          )}
          {isAuthed && (
            <button
              className="fav-btn"
              aria-label={favorited ? t("removeBookmark") : t("bookmark")}
              onClick={toggleFavorite}
            >
              {favorited ? "★" : "☆"}
            </button>
          )}
        </div>
      </header>

      <div className="memorize-progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="memorize-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

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
                {t("modeDrag")}
              </button>
              <button
                className={mode === "type" ? "mode-btn mode-active" : "mode-btn"}
                onClick={() => setMode("type")}
              >
                {t("modeType")}
              </button>
              <button
                className={mode === "dictation" ? "mode-btn mode-active" : "mode-btn"}
                onClick={() => setMode("dictation")}
              >
                {t("modeDictation")}
              </button>
            </div>
            <button className="btn-primary" onClick={startRecall}>
              {t("startRecall")}
            </button>
          </div>
        )}

        {phase === "recall" && (
          <div className="recall-phase">
            {mode === "drag" ? (
              <>
                <div className="verse-box verse-hidden">
                  <p className="muted">{t("dragHint")}</p>
                </div>
                <DragTiles
                  placed={placed}
                  pool={tiles}
                  liveGrade={liveGrade}
                  combo={combo}
                  fx={fx}
                  onTap={tapTile}
                  placeholder={t("tilePlaceholder")}
                />
              </>
            ) : mode === "dictation" ? (
              <>
                <div className="verse-box">
                  <p className="verse-text">{item.text}</p>
                </div>
                {typeInput}
              </>
            ) : (
              <>
                <div className="verse-box">
                  <TypeScaffold reveal={typeReveal} fx={fx} />
                </div>
                {typeInput}
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
              {submitting ? t("submitting") : t("submit")}
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
                <div className="complete-icon">
                  <PixelIcon name="star" size={48} />
                </div>
                <h1 className="complete-title">{isLast ? t("complete") : t("perfect")}</h1>
              </div>
            ) : (
              <div className={`result-badge grade-${serverGrade}`}>
                {gradeText(serverGrade)}
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
            {milestone !== null && (
              <div className="milestone-card">
                <div className="milestone-icon">
                  <PixelIcon name="star" size={32} />
                </div>
                <p className="milestone-title">{tShare("milestoneTitle", { count: milestone })}</p>
                <ShareButton
                  url={buildMilestoneShareUrl(locale, milestone, user?.display_name ?? "")}
                  imageUrl={buildMilestoneOgUrl(locale, milestone, user?.display_name ?? "")}
                  title="PIXBIBLE"
                  text={tShare("milestoneShareText", { count: milestone })}
                  label={tShare("milestoneShareButton")}
                />
              </div>
            )}
            <div className="result-actions">
              {serverGrade === "green" ? (
                <>
                  <button className="btn-secondary" onClick={reset}>
                    {t("retry")}
                  </button>
                  <ShareButton
                    url={buildVerseShareUrl(locale, item.book, item.chapter, item.verse)}
                    imageUrl={buildVerseOgUrl(locale, item.book, item.chapter, item.verse)}
                    title="PIXBIBLE"
                    text={tShare("verseShareText", {
                      ref: `${bookName(item.book, locale)} ${item.chapter}:${item.verse}`,
                    })}
                  />
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
                    {isLast ? t("sectionComplete") : t("next")}
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={() => { clearGrades(sectionId); reset(); }}>
                  {t("retryAll")}
                </button>
              )}
            </div>
            {!isAuthed && (
              <div className="guest-cta-banner">
                <p className="guest-cta-text">{t("guestCta")}</p>
                <Link href="/login?mode=signup" className="btn-primary">
                  {t("guestCtaButton")}
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
