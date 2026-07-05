"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { normalize, tokenizeDisplay } from "../../lib/grading/normalize";
import { gradeRecall, type Grade } from "../../lib/grading/grade";
import { submitAttempt } from "../../lib/api/attempts";
import { ApiError } from "../../lib/api/client";
import { playHit, playMiss, playMilestone } from "../../lib/fx/sound";
import { vibrateHit, vibrateMiss, vibrateMilestone } from "../../lib/fx/haptics";
import { getStoredMode, setStoredMode } from "../../lib/recallMode";

export type RecallMode = "drag" | "type" | "dictation";

// 타자 모드 밑줄 스캐폴드 한 단어. filled = 해당 위치를 정확히 입력함.
export interface TypeHintWord {
  word: string;
  filled: boolean;
}

// 타격 효과 트리거. seq가 바뀔 때마다 애니메이션 1회 재생.
export interface HitFx {
  seq: number;
  index: number; // 방금 맞힌 단어 인덱스 (miss는 -1)
  kind: "hit" | "miss";
}

export interface MemorizeState {
  phase: "study" | "recall" | "result";
  mode: RecallMode;
  tiles: string[];       // 하단 타일 풀 (아직 배치 안 된 것)
  placed: string[];      // 상단 답안열
  typed: string;         // type 모드 입력값
  typeReveal: TypeHintWord[]; // type 모드 밑줄 스캐폴드 (단어별 공개 상태)
  liveGrade: Grade;
  submitting: boolean;
  serverGrade: Grade | null;
  mismatch: boolean;
  outOfLives: boolean;
  combo: number;
  fx: HitFx | null;
}

interface UseMemorizeReturn extends MemorizeState {
  setMode: (mode: RecallMode) => void;
  tapTile: (tile: string, fromPool: boolean) => void;
  setTyped: (text: string) => void;
  startRecall: () => void;
  submit: () => Promise<void>;
  reset: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DISTRACTORS = ["of", "the", "and", "in", "to", "is", "was", "that", "not", "his"];

function buildTilePool(answerTokens: string[]): string[] {
  const tokenSet = new Set(answerTokens);
  const extra = DISTRACTORS.filter((d) => !tokenSet.has(d)).slice(0, 2);
  return shuffle([...answerTokens, ...extra]);
}

export function useMemorize(
  courseItemId: number,
  text: string,
): UseMemorizeReturn {
  const answerTokens = useMemo(() => normalize(text), [text]);
  const answerDisplay = useMemo(() => tokenizeDisplay(text), [text]);

  const initTiles = useMemo(() => buildTilePool(answerDisplay), [answerDisplay]);

  const [phase, setPhase] = useState<MemorizeState["phase"]>("study");
  const [mode, setModeState] = useState<RecallMode>("drag");

  // 저장된 입력 모드 선호도를 마운트 후 반영(SSR 하이드레이션 안전).
  useEffect(() => {
    setModeState(getStoredMode());
  }, []);

  const setMode = useCallback((next: RecallMode) => {
    setModeState(next);
    setStoredMode(next);
  }, []);
  const [tiles, setTiles] = useState<string[]>(initTiles);
  const [placed, setPlaced] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverGrade, setServerGrade] = useState<Grade | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [outOfLives, setOutOfLives] = useState(false);
  const [combo, setCombo] = useState(0);
  const [fx, setFx] = useState<HitFx | null>(null);
  const fxSeqRef = useRef(0);

  const fireFx = useCallback((kind: HitFx["kind"], index: number) => {
    fxSeqRef.current += 1;
    setFx({ seq: fxSeqRef.current, index, kind });
    if (kind === "hit") {
      setCombo((c) => {
        const next = c + 1;
        if (next > 0 && next % 5 === 0) {
          playMilestone();
          vibrateMilestone();
        } else {
          playHit(next);
          vibrateHit();
        }
        return next;
      });
    } else {
      playMiss();
      vibrateMiss();
      setCombo(0);
    }
  }, []);

  const attemptTokens =
    mode === "drag" ? placed.flatMap((t) => normalize(t)) : normalize(typed);
  const liveGrade = gradeRecall(answerTokens, attemptTokens);

  const typeReveal = useMemo<TypeHintWord[]>(() => {
    const attempt = normalize(typed);
    return answerDisplay.map((w, i) => ({
      word: w,
      filled: attempt[i] === answerTokens[i],
    }));
  }, [answerDisplay, answerTokens, typed]);

  // type 모드: 새로 완성된 단어 → hit, 완성했던 단어가 깨짐 → miss
  const prevFilledRef = useRef(0);
  useEffect(() => {
    const filledCount = typeReveal.filter((w) => w.filled).length;
    const prev = prevFilledRef.current;
    prevFilledRef.current = filledCount;
    if ((mode !== "type" && mode !== "dictation") || phase !== "recall") return;
    if (filledCount > prev) {
      let lastIdx = -1;
      typeReveal.forEach((w, i) => {
        if (w.filled) lastIdx = i;
      });
      fireFx("hit", lastIdx);
    } else if (filledCount < prev) {
      fireFx("miss", -1);
    }
  }, [typeReveal, mode, phase, fireFx]);

  const tapTile = useCallback((tile: string, fromPool: boolean) => {
    if (phase !== "recall") return;
    if (fromPool) {
      setTiles((prev) => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setPlaced((prev) => [...prev, tile]);
      // 정답 순서대로 배치했으면 히트 효과
      const nextTokens = [...placed, tile].flatMap((t) => normalize(t));
      const correct =
        nextTokens.length <= answerTokens.length &&
        nextTokens.every((t, i) => t === answerTokens[i]);
      if (correct) fireFx("hit", nextTokens.length - 1);
      else fireFx("miss", -1);
    } else {
      setPlaced((prev) => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setTiles((prev) => [...prev, tile]);
      setCombo(0);
    }
  }, [phase, placed, answerTokens, fireFx]);

  const startRecall = useCallback(() => {
    setPhase("recall");
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await submitAttempt({
        course_item_id: courseItemId,
        mode,
        client_grade: liveGrade === "none" ? "red" : liveGrade,
        tokens: attemptTokens,
      });
      setServerGrade(result.server_grade);
      setMismatch(result.client_grade !== result.server_grade);
      setPhase("result");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setOutOfLives(true);
      } else {
        throw err;
      }
    } finally {
      setSubmitting(false);
    }
  }, [courseItemId, mode, liveGrade, attemptTokens]);

  const reset = useCallback(() => {
    setPhase("study");
    setTiles(buildTilePool(answerDisplay));
    setPlaced([]);
    setTyped("");
    setServerGrade(null);
    setMismatch(false);
    setCombo(0);
    setFx(null);
    prevFilledRef.current = 0;
  }, [answerDisplay]);

  return { phase, mode, tiles, placed, typed, typeReveal, liveGrade, submitting, serverGrade, mismatch, outOfLives, combo, fx, setMode, tapTile, setTyped, startRecall, submit, reset };
}
