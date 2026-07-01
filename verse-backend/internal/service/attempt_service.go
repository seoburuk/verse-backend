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
	"errors"

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
	users    repository.UserRepo
}

func NewAttemptService(courses repository.CourseRepo, attempts repository.AttemptRepo, users repository.UserRepo) *AttemptService {
	return &AttemptService{courses: courses, attempts: attempts, users: users}
}

// SubmitAttempt — 시도 제출, 서버 재채점, 진도·연속일 갱신.
// 목숨이 0이면 시도 자체를 거부한다(domain.ErrNoLives). 비초록 결과는 목숨 1을 소모한다.
func (s *AttemptService) SubmitAttempt(
	ctx context.Context,
	userID, courseItemID int64,
	mode domain.Mode,
	clientGrade domain.Grade,
	tokens []string,
) (AttemptResult, error) {
	// 0. 목숨 확인 — 0이면 채점 없이 즉시 거부
	lives, err := GetLives(ctx, s.users, userID)
	if err != nil {
		return AttemptResult{}, err
	}
	if lives.Count <= 0 {
		return AttemptResult{}, domain.ErrNoLives
	}

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

	// 6. 비초록 결과는 목숨 1 소모. 이미 시도는 기록됐으므로 동시성 경합으로 목숨이
	// 먼저 소진된 예외적인 경우(ErrNoLives)는 무시하고 결과를 그대로 반환한다.
	if !cleared {
		if _, err := ConsumeLife(ctx, s.users, userID); err != nil && !errors.Is(err, domain.ErrNoLives) {
			return AttemptResult{}, err
		}
	}

	return AttemptResult{Attempt: attempt, ServerGrade: serverGrade}, nil
}

// GetLives — 현재 목숨 상태(정산 반영)를 조회한다.
func (s *AttemptService) GetLives(ctx context.Context, userID int64) (domain.Lives, error) {
	return GetLives(ctx, s.users, userID)
}

// ProgressSummary — 사용자 진도 조회 결과(스트릭 + 코스별 집계 + 절별 진도).
type ProgressSummary struct {
	Streak  domain.Streak
	Courses []domain.CourseProgress
	Items   []domain.ItemProgress
}

// Stats — 대시보드용 집계(스트릭, 카테고리별 완료율, 등급 분포, 총 암송 절 수).
type Stats struct {
	Streak       domain.Streak
	TotalCleared int
	Categories   []domain.CategoryProgress
	Grades       domain.GradeDistribution
}

// GetStats — 대시보드에 필요한 집계를 한 번에 조회.
func (s *AttemptService) GetStats(ctx context.Context, userID int64) (Stats, error) {
	streak, err := s.attempts.GetStreak(ctx, userID)
	if err != nil {
		return Stats{}, err
	}
	totalCleared, err := s.attempts.GetTotalCleared(ctx, userID)
	if err != nil {
		return Stats{}, err
	}
	categories, err := s.attempts.GetCategoryProgress(ctx, userID)
	if err != nil {
		return Stats{}, err
	}
	grades, err := s.attempts.GetGradeDistribution(ctx, userID)
	if err != nil {
		return Stats{}, err
	}
	return Stats{Streak: streak, TotalCleared: totalCleared, Categories: categories, Grades: grades}, nil
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
