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

func (s *AttemptService) GetResume(ctx context.Context, userID int64) (*domain.ResumeTarget, error) {
	return s.attempts.GetResume(ctx, userID)
}

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
	// 같은 절(verse_id)을 공유하는 모든 course_item(다른 코스/섹터에 속한 사본 포함)에
	// 진도를 함께 반영해, 한 곳에서 외운 절이 다른 코스에서도 완료로 집계되게 한다.
	// 단, 받아쓰기(ModeDictation)는 본문을 보고 따라 적는 연습 모드라 진도를 갱신하지 않는다
	// (완료 체크가 생기지 않음). 시도 기록·연속일·목숨은 다른 모드와 동일하게 처리한다.
	cleared := serverGrade == domain.GradeGreen
	if mode != domain.ModeDictation {
		siblingIDs, err := s.courses.ListSiblingCourseItemIDs(ctx, courseItemID)
		if err != nil {
			return AttemptResult{}, err
		}
		if len(siblingIDs) == 0 {
			siblingIDs = []int64{courseItemID}
		}
		for _, id := range siblingIDs {
			if err := s.attempts.UpsertProgress(ctx, repository.UpsertProgressParams{
				UserID:       userID,
				CourseItemID: id,
				Grade:        string(serverGrade),
				Cleared:      cleared,
			}); err != nil {
				return AttemptResult{}, err
			}
		}
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

// BatchAttemptInput — SubmitAttemptsBatch 항목 하나의 입력.
type BatchAttemptInput struct {
	ClientSeq    string
	CourseItemID int64
	Mode         domain.Mode
	ClientGrade  domain.Grade
	Tokens       []string
}

// BatchAttemptOutput — 배치 항목 하나의 처리 결과. 오프라인 우선 클라이언트가
// 로컬 큐 항목을 서버 확정값으로 갱신하거나 재시도 여부를 판단하는 데 쓴다.
type BatchAttemptOutput struct {
	ClientSeq   string
	Status      string // "ok" | "skipped_no_lives" | "error"
	Attempt     domain.Attempt
	ServerGrade domain.Grade
	Err         error
}

// SubmitAttemptsBatch — 오프라인 큐에 쌓인 시도들을 순서대로(로컬 발생 순서 =
// 배치 내 순서 가정) 처리한다. 각 항목은 SubmitAttempt와 동일한 로직을 타므로
// 목숨·연속일·진도가 실시간 제출과 동일하게 누적 반영된다.
//
// 목숨이 0이 되면 이후 항목은 채점하지 않고 "skipped_no_lives"로 표시한다
// (실시간 제출에서 목숨 0일 때 거부되는 것과 동일한 정책을 배치에도 적용).
// 그 외 개별 항목 에러는 배치 전체를 중단시키지 않고 해당 항목만 "error"로
// 기록한 뒤 다음 항목을 계속 처리한다 — 클라이언트가 부분 성공을 받아
// 실패한 항목만 재동기화할 수 있게 하기 위함이다.
func (s *AttemptService) SubmitAttemptsBatch(ctx context.Context, userID int64, items []BatchAttemptInput) ([]BatchAttemptOutput, error) {
	results := make([]BatchAttemptOutput, 0, len(items))
	noLives := false

	for _, item := range items {
		if noLives {
			results = append(results, BatchAttemptOutput{ClientSeq: item.ClientSeq, Status: "skipped_no_lives"})
			continue
		}

		result, err := s.SubmitAttempt(ctx, userID, item.CourseItemID, item.Mode, item.ClientGrade, item.Tokens)
		if err != nil {
			if errors.Is(err, domain.ErrNoLives) {
				noLives = true
				results = append(results, BatchAttemptOutput{ClientSeq: item.ClientSeq, Status: "skipped_no_lives"})
				continue
			}
			results = append(results, BatchAttemptOutput{ClientSeq: item.ClientSeq, Status: "error", Err: err})
			continue
		}

		results = append(results, BatchAttemptOutput{
			ClientSeq:   item.ClientSeq,
			Status:      "ok",
			Attempt:     result.Attempt,
			ServerGrade: result.ServerGrade,
		})
	}

	return results, nil
}

// GetLives — 현재 목숨 상태(정산 반영)를 조회한다.
func (s *AttemptService) GetLives(ctx context.Context, userID int64) (domain.Lives, error) {
	return GetLives(ctx, s.users, userID)
}

// ConsumeLife — 목숨 1을 소모한다(암송 중 이탈 페널티 등). 남은 목숨이 없으면 현재 상태를 반환한다.
func (s *AttemptService) ConsumeLife(ctx context.Context, userID int64) (domain.Lives, error) {
	lives, err := ConsumeLife(ctx, s.users, userID)
	if errors.Is(err, domain.ErrNoLives) {
		return lives, nil
	}
	return lives, err
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
	Books        []domain.BookProgress
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
	books, err := s.attempts.GetBookProgress(ctx, userID)
	if err != nil {
		return Stats{}, err
	}
	return Stats{Streak: streak, TotalCleared: totalCleared, Categories: categories, Books: books, Grades: grades}, nil
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
