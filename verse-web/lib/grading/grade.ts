// grade.ts — 회상 정확도 → 색 등급. 기획서 §4.3. 백엔드 GradeRecall과 미러링.
//
// 분모 = 정답 토큰 수, 분자 = 맞은 토큰 수
// == 1.0 green / ≥ 0.50 yellow / 그 미만 red
//
// 열린 결정(§4.4): "맞은 토큰 수"를 위치 일치로 셀지 LCS로 셀지.
// 어느 쪽이든 백엔드와 같은 방식이어야 한다.
export type Grade = "green" | "yellow" | "red" | "none";

export function gradeRecall(answer: string[], attempt: string[]): Grade {
  if (answer.length === 0) return "none";
  const lcs = lcsLength(answer, attempt);
  const ratio = lcs / answer.length;
  if (ratio >= 1) return "green";
  if (ratio >= 0.50) return "yellow";
  return "red";
}

function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else if (dp[j] < dp[j - 1]) {
        dp[j] = dp[j - 1];
      }
      prev = temp;
    }
  }
  return dp[n];
}
