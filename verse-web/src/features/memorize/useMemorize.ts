import { useState, useCallback, useMemo } from "react";
import { normalize, tokenizeDisplay } from "../../grading/normalize";
import { gradeRecall, type Grade } from "../../grading/grade";
import { submitAttempt } from "../../api/attempts";

export type RecallMode = "drag" | "type";

export interface MemorizeState {
  phase: "study" | "recall" | "result";
  mode: RecallMode;
  tiles: string[];       // 하단 타일 풀 (아직 배치 안 된 것)
  placed: string[];      // 상단 답안열
  typed: string;         // type 모드 입력값
  liveGrade: Grade;
  submitting: boolean;
  serverGrade: Grade | null;
  mismatch: boolean;
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
  const [mode, setMode] = useState<RecallMode>("drag");
  const [tiles, setTiles] = useState<string[]>(initTiles);
  const [placed, setPlaced] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverGrade, setServerGrade] = useState<Grade | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const attemptTokens =
    mode === "drag" ? placed.flatMap((t) => normalize(t)) : normalize(typed);
  const liveGrade = gradeRecall(answerTokens, attemptTokens);

  const tapTile = useCallback((tile: string, fromPool: boolean) => {
    if (phase !== "recall") return;
    if (fromPool) {
      setTiles((prev) => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setPlaced((prev) => [...prev, tile]);
    } else {
      setPlaced((prev) => {
        const idx = prev.indexOf(tile);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setTiles((prev) => [...prev, tile]);
    }
  }, [phase]);

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
  }, [answerDisplay]);

  return { phase, mode, tiles, placed, typed, liveGrade, submitting, serverGrade, mismatch, setMode, tapTile, setTyped, startRecall, submit, reset };
}
