// ranking.go — 전역 랭킹(리더보드) 타입.
package domain

// RankingRaw — 유저별 원시 집계(점수·순위 계산 전).
type RankingRaw struct {
	UserID        int64
	Username      string
	Streak        int
	ClearedVerses int
	DictationPts  int
}

// RankingEntry — 점수·순위가 매겨진 랭킹 한 줄.
type RankingEntry struct {
	Rank          int
	UserID        int64
	Username      string
	Streak        int
	ClearedVerses int
	DictationPts  int
	Score         int
}
