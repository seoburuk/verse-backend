// lives_service.go — 목숨(하트) 시스템. 실패 시도(비초록)마다 1을 소모하고,
// 시간이 지나면 자동으로 리필된다(20분당 1개, 최대 10개).
//
// 왜 크론/백그라운드 작업이 아니라 읽을 때 계산하는가:
// 목숨은 사용자가 조회하거나 소모할 때만 의미가 있다. 매분 모든 사용자를
// 스캔하는 배치 작업 없이, 읽는 시점에 경과 시간으로부터 리필량을 역산하면
// 상태를 정확히 유지하면서 인프라가 훨씬 단순해진다.
package service

import (
	"context"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

const (
	MaxLives       = 10
	LivesRefillTTL = 20 * time.Minute
)

// SettleLives — 저장된 목숨 상태에 경과 시간만큼의 리필을 반영한 새 상태를 계산한다.
// 순수 함수라 시간 주입만으로 단위 테스트가 가능하다.
func SettleLives(stored domain.Lives, now time.Time) domain.Lives {
	if stored.Count >= MaxLives {
		return domain.Lives{Count: MaxLives, UpdatedAt: stored.UpdatedAt}
	}

	elapsed := now.Sub(stored.UpdatedAt)
	refillCount := int32(elapsed / LivesRefillTTL)
	if refillCount <= 0 {
		return stored
	}

	newCount := stored.Count + refillCount
	if newCount >= MaxLives {
		return domain.Lives{Count: MaxLives, UpdatedAt: now}
	}
	// 정확히 소진된 리필 구간만큼만 시계를 전진시켜, 다음 리필까지 남은
	// 잔여 시간(나머지)을 보존한다.
	return domain.Lives{
		Count:     newCount,
		UpdatedAt: stored.UpdatedAt.Add(time.Duration(refillCount) * LivesRefillTTL),
	}
}

// GetLives — 현재 시각 기준으로 정산한 목숨 상태를 조회한다.
func GetLives(ctx context.Context, users repository.UserRepo, userID int64) (domain.Lives, error) {
	stored, err := users.GetLives(ctx, userID)
	if err != nil {
		return domain.Lives{}, err
	}
	return SettleLives(stored, time.Now().UTC()), nil
}

// ConsumeLife — 정산 후 목숨을 1 소모하고 저장한다. 남은 목숨이 없으면 domain.ErrNoLives.
func ConsumeLife(ctx context.Context, users repository.UserRepo, userID int64) (domain.Lives, error) {
	stored, err := users.GetLives(ctx, userID)
	if err != nil {
		return domain.Lives{}, err
	}
	settled := SettleLives(stored, time.Now().UTC())
	if settled.Count <= 0 {
		return settled, domain.ErrNoLives
	}
	settled.Count--
	if err := users.UpdateLives(ctx, userID, settled); err != nil {
		return domain.Lives{}, err
	}
	return settled, nil
}
