// attempt.go — 암송 시도와 채점 등급 타입. 기획서 §4, §6.2.
package domain

import "time"

// Grade — 색 등급. 정밀 점수 대신 색으로 표현(기획서 §0 점수 비중 낮춤 결정).
type Grade string

const (
	GradeGreen  Grade = "green"  // ≥ 75% 회상
	GradeYellow Grade = "yellow" // ≥ 50% 회상
	GradeRed    Grade = "red"    // < 50% 회상
	GradeNone   Grade = "none"   // 미시도
)

// Mode — 입력 방식. drag 먼저, type/hard는 이후(기획서 §0).
type Mode string

const (
	ModeDrag Mode = "drag"
	ModeType Mode = "type"
	ModeHard Mode = "hard"
)

// Attempt — 한 번의 암송 시도 기록.
// client_grade는 클라가 보낸 등급, server_grade는 서버가 재채점한 등급.
// 둘을 모두 저장해 "조작 여부"를 사후에 감사할 수 있다(기획서 §3 서버 검증).
type Attempt struct {
	ID           int64
	UserID       int64
	CourseItemID int64
	Mode         Mode
	ClientGrade  Grade
	ServerGrade  Grade
	CreatedAt    time.Time
}

// Streak — 연속 학습일 기록. 기획서 §8.
type Streak struct {
	UserID     int64
	CurrentLen int32
	LongestLen int32
	LastDay    *string // YYYY-MM-DD, nil이면 미시작
}

// ItemProgress — 코스아이템(절) 단위 진도. 진도 조회용.
type ItemProgress struct {
	CourseItemID int64
	Grade        Grade
	Cleared      bool
}

// CourseProgress — 코스 단위 완료 집계(클리어한 수 / 전체 절 수).
type CourseProgress struct {
	CourseID int64
	Cleared  int
	Total    int
}

// CategoryProgress — 카테고리(ot/nt/topic/warmup/messiah) 단위 완료 집계. 대시보드용.
type CategoryProgress struct {
	Category string
	Cleared  int
	Total    int
}

// GradeDistribution — 사용자의 현재 절별 등급 분포(진도 기준, 최신 상태).
type GradeDistribution struct {
	Green  int
	Yellow int
	Red    int
}
