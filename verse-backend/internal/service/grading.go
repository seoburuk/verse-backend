// grading.go — 채점 알고리즘. 기획서 §4. ★ 이 프로젝트의 가장 중요한 단일 명세 ★
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ 경고: 이 파일의 규칙은 React(verse-web/src/grading)와 1:1로 미러링된다. │
// │ 한쪽을 바꾸면 반드시 다른 쪽도 바꿔야 한다. 어긋나면 클라가 green이라   │
// │ 띄운 절을 서버가 red로 재채점해 사용자 신뢰가 깨진다.                    │
// │ → 두 레포 분리의 유일한 진짜 리스크(기획서 §0, 지난 논의). docs로 단일화.│
// └─────────────────────────────────────────────────────────────────────┘
package service

import (
	"regexp"
	"strings"
)

// punctuation은 패키지 초기화 시 한 번만 컴파일한다(매 호출마다 컴파일하면 낭비).
var punctuation = regexp.MustCompile(`[^a-z0-9]+`)

// Normalize — 입력 정규화(기획서 §4.1). 드래그와 타자가 같은 규칙을 쓰게 한다.
//   - 소문자화, 양끝 공백 제거
//   - 구두점 제거(드래그 타일에 구두점을 안 주는 것과 자동 일치)
//   - KJV 고어 철자(thee, thou, hast)는 정답 그대로 유지
//
// 반환: 토큰 슬라이스. 빈 문자열 입력 → 길이 0 슬라이스.
func Normalize(s string) []string {
	// 1. 소문자화
	s = strings.ToLower(s)
	// 2. 구두점을 공백으로 치환 ([^a-z0-9]+ → " ")
	s = punctuation.ReplaceAllString(s, " ")
	// 3. 양끝 공백 제거 후 공백으로 분리
	s = strings.TrimSpace(s)
	if s == "" {
		return []string{}
	}
	return strings.Fields(s) // Fields는 연속 공백도 정확히 처리
}

// GradeRecall — 회상 정확도를 색 등급으로 변환(기획서 §4.3).
//
//	분모 = 정답 토큰 수(answer), 분자 = LCS 길이(answer ∩ attempt 최장 공통 부분수열)
//	== 1.0 → "green", ≥ 0.50 → "yellow", 그 미만 → "red"
//
// ADR 0002 §4.4: LCS 채택. 위치정확일치는 한 칸 밀림에 과도하게 엄격.
func GradeRecall(answer, attempt []string) string {
	if len(answer) == 0 {
		return "none"
	}

	lcs := lcsLength(answer, attempt)
	ratio := float64(lcs) / float64(len(answer))

	switch {
	case ratio >= 1.0:
		return "green"
	case ratio >= 0.50:
		return "yellow"
	default:
		return "red"
	}
}

// lcsLength — 표준 DP로 최장공통부분수열 길이를 구한다. O(m×n) 시간, O(n) 공간.
//
// DP 점화식:
//
//	dp[j] = answer[i-1]==attempt[j-1] 이면 prev+1, 아니면 max(dp[j], dp[j-1])
//
// 공간 최적화: 2차원 테이블 대신 1차원 배열 + prev 변수로 O(n)에 처리.
func lcsLength(a, b []string) int {
	m, n := len(a), len(b)
	dp := make([]int, n+1)

	for i := 1; i <= m; i++ {
		prev := 0
		for j := 1; j <= n; j++ {
			temp := dp[j]
			if a[i-1] == b[j-1] {
				dp[j] = prev + 1
			} else if dp[j] < dp[j-1] {
				dp[j] = dp[j-1]
			}
			prev = temp
		}
	}

	return dp[n]
}
