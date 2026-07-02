// stats_dto.go — 대시보드 조회 응답 DTO.
package dto

type CategoryProgressDTO struct {
	Category string `json:"category"`
	Cleared  int    `json:"cleared"`
	Total    int    `json:"total"`
}

type GradeDistributionDTO struct {
	Green  int `json:"green"`
	Yellow int `json:"yellow"`
	Red    int `json:"red"`
}

type StatsResponse struct {
	Streak       StreakDTO             `json:"streak"`
	TotalCleared int                   `json:"total_cleared"`
	Categories   []CategoryProgressDTO `json:"categories"`
	Grades       GradeDistributionDTO  `json:"grades"`
}
