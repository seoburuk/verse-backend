// attempt_dto.go — 시도 제출 요청/응답 DTO.
package dto

type SubmitAttemptRequest struct {
	CourseItemID int64    `json:"course_item_id"`
	Mode         string   `json:"mode"`
	ClientGrade  string   `json:"client_grade"`
	Tokens       []string `json:"tokens"` // 서버 재채점용 사용자 입력 토큰
}

type AttemptResponse struct {
	AttemptID   int64  `json:"attempt_id"`
	ClientGrade string `json:"client_grade"`
	ServerGrade string `json:"server_grade"` // 클라와 다를 수 있음 — 사용자에게 표시
}
