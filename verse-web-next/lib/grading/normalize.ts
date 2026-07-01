// normalize.ts — 입력 정규화. 기획서 §4.1.
//
// ┌──────────────────────────────────────────────────────────────────┐
// │ ★ 이 파일은 백엔드 internal/service/grading.go 의 Normalize와        │
// │   1:1로 동일해야 한다. 규칙이 어긋나면 클라 green ↔ 서버 red 불일치.  │
// │   변경 시 반드시 양쪽 동기화. 단일 명세: backend docs/adr/0002.       │
// └──────────────────────────────────────────────────────────────────┘
//
//   - 소문자화, 양끝 공백 제거
//   - 구두점 제거(드래그 타일에 구두점을 안 주는 것과 자동 일치)
//   - KJV 고어 철자(thee, thou, hast)는 그대로 유지
export function normalize(s: string): string[] {
  const lower = s.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]+/g, " ").trim();
  if (stripped === "") return [];
  return stripped.split(/\s+/);
}

// tokenizeDisplay — 표시용 토큰. 대소문자만 보존하고 normalize와 토큰 경계가 동일하다.
//   tokenizeDisplay(s)[i].toLowerCase() === normalize(s)[i] 가 항상 성립한다.
//   (드래그 타일은 원본 대소문자로 보여주되 채점은 normalize 결과로 한다.)
export function tokenizeDisplay(s: string): string[] {
  const stripped = s.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (stripped === "") return [];
  return stripped.split(/\s+/);
}
