// lives_dto.go — 목숨 조회 응답 DTO.
package dto

type LivesResponse struct {
	Lives         int32  `json:"lives"`
	MaxLives      int32  `json:"max_lives"`
	NextRefillSec int64  `json:"next_refill_sec"` // 다음 1개 리필까지 남은 초. lives >= max면 0.
	UpdatedAt     string `json:"updated_at"`
}
