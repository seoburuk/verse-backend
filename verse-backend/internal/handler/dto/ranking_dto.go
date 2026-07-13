// ranking_dto.go — 랭킹 조회 응답 DTO.
package dto

type RankingEntryDTO struct {
	Rank          int    `json:"rank"`
	Username      string `json:"username"`
	Streak        int    `json:"streak"`
	ClearedVerses int    `json:"cleared_verses"`
	DictationPts  int    `json:"dictation_pts"`
	Score         int    `json:"score"`
}

type RankingResponse struct {
	Entries []RankingEntryDTO `json:"entries"`
	Me      *RankingEntryDTO  `json:"me"`
	Nearby  []RankingEntryDTO `json:"nearby,omitempty"`
}
