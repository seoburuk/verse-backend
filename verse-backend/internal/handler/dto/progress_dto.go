// progress_dto.go — 진도 조회 응답 DTO.
package dto

type StreakDTO struct {
	Current int32 `json:"current"`
	Longest int32 `json:"longest"`
}

type CourseProgressDTO struct {
	CourseID int64 `json:"course_id"`
	Cleared  int   `json:"cleared"`
	Total    int   `json:"total"`
}

type ItemProgressDTO struct {
	CourseItemID int64  `json:"course_item_id"`
	Grade        string `json:"grade"`
	Cleared      bool   `json:"cleared"`
	Book         int16  `json:"book"`
	Chapter      int16  `json:"chapter"`
	Verse        int16  `json:"verse"`
}

type ProgressResponse struct {
	Streak  StreakDTO           `json:"streak"`
	Courses []CourseProgressDTO `json:"courses"`
	Items   []ItemProgressDTO   `json:"items"`
}

// ReadingItemDTO — 통독한 절 하나.
type ReadingItemDTO struct {
	CourseItemID int64  `json:"course_item_id"`
	TypedAt      string `json:"typed_at"`
}

type ReadingProgressResponse struct {
	Items []ReadingItemDTO `json:"items"`
}
