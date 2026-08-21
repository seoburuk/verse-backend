// streak_service.go — 연속일(streak) 계산. 기획서 §8 리텐션 주력 장치.
//
// 규칙:
//   - 오늘 == last_day      → 변화 없음(하루 여러 번 해도 1일)
//   - 오늘 == last_day + 1  → current_len++, longest 갱신
//   - 그 외(하루 이상 공백) → current_len = 1로 리셋
//
// "오늘"은 클라이언트가 보낸 로컬 날짜(localDay, YYYY-MM-DD)를 우선 사용한다.
// 비어있거나 형식이 잘못되면(구버전 클라이언트) UTC 기준으로 폴백한다.
package service

import (
	"context"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

// resolveToday — localDay가 "2006-01-02" 형식으로 유효하면 그대로 쓰고,
// 아니면 UTC 기준 오늘로 폴백한다.
func resolveToday(localDay string) string {
	if _, err := time.Parse("2006-01-02", localDay); err != nil {
		return time.Now().UTC().Format("2006-01-02")
	}
	return localDay
}

// UpdateStreak — 시도 제출 후 streak를 갱신한다.
// attempt_service가 InsertAttempt 후 순차 호출.
func UpdateStreak(ctx context.Context, repo repository.AttemptRepo, userID int64, localDay string) error {
	today := resolveToday(localDay)

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
