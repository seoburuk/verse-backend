// recallMode.ts — 암송 입력 모드(타일 탭 / 타이핑) 선호도 저장.
// 페이지를 나갔다 와도 마지막 선택을 유지한다.
import type { RecallMode } from "../components/memorize/useMemorize";

const MODE_KEY = "kjv_recall_mode";

export function getStoredMode(): RecallMode {
  if (typeof window === "undefined") return "drag";
  return (localStorage.getItem(MODE_KEY) as RecallMode) ?? "drag";
}

export function setStoredMode(mode: RecallMode): void {
  localStorage.setItem(MODE_KEY, mode);
}
