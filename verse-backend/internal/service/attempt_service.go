// attempt_service.go — ★ 서버 도메인 로직의 핵심(포트폴리오 하이라이트) ★
//
// SubmitAttempt 흐름:
//   1) 클라 tokens → 정답 절 텍스트 조회 → Normalize
//   2) GradeRecall(LCS)로 server_grade 산출
//   3) InsertAttempt(client_grade + server_grade 둘 다 저장)
//   4) UpsertProgress(cleared = server_grade=="green")
//   5) UpdateStreak
//
// NOTE: 트랜잭션(sqlc WithTx) 래핑은 후속 리팩터. 현재는 순차 실행.
package service

import (
	"context"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

type AttemptResult struct {
	Attempt     domain.Attempt
	ServerGrade domain.Grade
}

type AttemptService struct {
	courses  repository.CourseRepo
	attempts repository.AttemptRepo
}

func NewAttemptService(courses repository.CourseRepo, attempts repository.AttemptRepo) *AttemptService {
	return &AttemptService{courses: courses, attempts: attempts}
}

// SubmitAttempt — 시도 제출, 서버 재채점, 진도·연속일 갱신.
func (s *AttemptService) SubmitAttempt(
	ctx context.Context,
	userID, courseItemID int64,
	mode domain.Mode,
	clientGrade domain.Grade,
	tokens []string,
) (AttemptResult, error) {
	// 1. 정답 절 텍스트 조회 → 정규화
	itemVerse, err := s.courses.GetCourseItemVerse(ctx, courseItemID)
	if err != nil {
		return AttemptResult{}, err
	}
	answer := Normalize(itemVerse.Text)

	// 2. 서버 재채점
	serverGradeStr := GradeRecall(answer, tokens)
	serverGrade := domain.Grade(serverGradeStr)

	// 3. 시도 기록(client_grade + server_grade 둘 다)
	attempt, err := s.attempts.InsertAttempt(ctx, repository.InsertAttemptParams{
		UserID:       userID,
		CourseItemID: courseItemID,
		Mode:         string(mode),
		ClientGrade:  string(clientGrade),
		ServerGrade:  string(serverGrade),
	})
	if err != nil {
		return AttemptResult{}, err
	}

	// 4. 진도 업데이트(cleared = 서버 기준 green)
	cleared := serverGrade == domain.GradeGreen
	if err := s.attempts.UpsertProgress(ctx, repository.UpsertProgressParams{
		UserID:       userID,
		CourseItemID: courseItemID,
		Grade:        string(serverGrade),
		Cleared:      cleared,
	}); err != nil {
		return AttemptResult{}, err
	}

	// 5. 연속일 갱신
	if err := UpdateStreak(ctx, s.attempts, userID); err != nil {
		return AttemptResult{}, err
	}

	return AttemptResult{Attempt: attempt, ServerGrade: serverGrade}, nil
}

// ProgressSummary — 사용자 진도 조회 결과(스트릭 + 코스별 집계 + 절별 진도).
type ProgressSummary struct {
	Streak  domain.Streak
	Courses []domain.CourseProgress
	Items   []domain.ItemProgress
}

// GetProgress — 사용자의 스트릭, 코스별 완료 집계, 절별 진도를 한 번에 조회.
func (s *AttemptService) GetProgress(ctx context.Context, userID int64) (ProgressSummary, error) {
	streak, err := s.attempts.GetStreak(ctx, userID)
	if err != nil {
		return ProgressSummary{}, err
	}
	courses, err := s.attempts.ListCourseProgress(ctx, userID)
	if err != nil {
		return ProgressSummary{}, err
	}
	items, err := s.attempts.ListUserProgress(ctx, userID)
	if err != nil {
		return ProgressSummary{}, err
	}
	return ProgressSummary{Streak: streak, Courses: courses, Items: items}, nil
}
