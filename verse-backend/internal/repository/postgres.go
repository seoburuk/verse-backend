package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool — pgxpool 커넥션 풀을 생성하고 ping으로 연결을 검증한다.
//
// 왜 pgxpool인가:
// 요청마다 새 연결을 맺으면 TCP 핸드셰이크 + PostgreSQL 인증이 매번 발생한다.
// 풀은 연결을 미리 만들어 재사용하므로 latency가 크게 줄어든다.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("pgxpool config parse: %w", err)
	}

	// 풀 설정 — 운영 기본값
	cfg.MaxConns = 25                      // PostgreSQL 기본 max_connections(100)의 25%
	cfg.MinConns = 2                       // 유휴 상태에도 최소 2개 유지
	cfg.MaxConnLifetime = 1 * time.Hour    // 연결을 너무 오래 쓰면 DB 쪽이 끊음 → 주기적 교체
	cfg.MaxConnIdleTime = 30 * time.Minute // 오래 안 쓴 연결 정리

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pgxpool connect: %w", err)
	}

	// ping으로 실제 연결 가능 여부 검증
	// 여기서 실패하면 앱이 부팅 시점에 즉시 죽는다 (fail fast)
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pgxpool ping: %w", err)
	}

	return pool, nil
}
