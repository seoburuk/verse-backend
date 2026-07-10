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

// BatchSubmitAttemptsRequest — 오프라인 우선 클라이언트(Flutter)가 로컬 큐에
// 쌓아둔 시도들을 한 번에 업로드할 때 사용. 항목 각각은 SubmitAttemptRequest와
// 동일한 필드를 갖되, 클라이언트가 로컬에서 부여한 순번(client_seq)을 함께
// 보내 응답에서 어떤 로컬 레코드가 어떤 결과를 받았는지 매칭할 수 있게 한다.
type BatchSubmitAttemptsRequest struct {
	Attempts []BatchAttemptItem `json:"attempts"`
}

type BatchAttemptItem struct {
	ClientSeq    string   `json:"client_seq"` // 클라 로컬 큐 항목 식별자(UUID 등), 응답 매칭용
	CourseItemID int64    `json:"course_item_id"`
	Mode         string   `json:"mode"`
	ClientGrade  string   `json:"client_grade"`
	Tokens       []string `json:"tokens"`
}

type BatchSubmitAttemptsResponse struct {
	Results []BatchAttemptResult `json:"results"`
}

// BatchAttemptResult — 배치 내 항목 하나의 처리 결과.
// Status: "ok" | "skipped_no_lives" | "error"
type BatchAttemptResult struct {
	ClientSeq   string `json:"client_seq"`
	Status      string `json:"status"`
	AttemptID   int64  `json:"attempt_id,omitempty"`
	ClientGrade string `json:"client_grade,omitempty"`
	ServerGrade string `json:"server_grade,omitempty"`
	Error       string `json:"error,omitempty"`
}
