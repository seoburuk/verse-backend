// streak_service.go — 연속일(streak) 계산. 기획서 §8 리텐션 주력 장치.
//
// 규칙:
//   - 오늘 == last_day      → 변화 없음(하루 여러 번 해도 1일)
//   - 오늘 == last_day + 1  → current_len++, longest 갱신
//   - 그 외(하루 이상 공백) → current_len = 1로 리셋
//
// MVP에서는 서버 UTC 기준. 한국 사용자 로컬 날짜 판정은 후속 ADR.
package service

import (
	"context"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

// UpdateStreak — 시도 제출 후 streak를 갱신한다.
// attempt_service가 InsertAttempt 후 순차 호출.
func UpdateStreak(ctx context.Context, repo repository.AttemptRepo, userID int64) error {
	today := time.Now().UTC().Format("2006-01-02")

	streak, err := repo.GetStreak(ctx, userID)
	if err != nil && err != domain.ErrNotFound {
		return err
	}

	params := repository.UpsertStreakParams{
		UserID:     userID,
		CurrentLen: streak.CurrentLen,
		LongestLen: streak.LongestLen,
		LastDay:    &today,
	}

	switch {
	case streak.LastDay == nil:
		// 첫 시도
		params.CurrentLen = 1
		params.LongestLen = 1

	case *streak.LastDay == today:
		// 오늘 이미 했음 — 변화 없음

	case isNextDay(*streak.LastDay, today):
		// 연속
		params.CurrentLen++
		if params.CurrentLen > params.LongestLen {
			params.LongestLen = params.CurrentLen
		}

	default:
		// 공백 발생 — 리셋
		params.CurrentLen = 1
	}

	return repo.UpsertStreak(ctx, params)
}

// isNextDay — prev가 today의 바로 전날인지 확인. "2006-01-02" 형식.
func isNextDay(prev, today string) bool {
	prevT, err1 := time.Parse("2006-01-02", prev)
	todayT, err2 := time.Parse("2006-01-02", today)
	if err1 != nil || err2 != nil {
		return false
	}
	return todayT.Sub(prevT) == 24*time.Hour
}
