// config.go — 환경변수를 타입 있는 구조체로 변환한다.
//
// 왜 따로 두는가: 설정 읽기를 한 곳에 모으면 "이 앱이 무엇에 의존하는지"(DB,
// 시크릿, 포트)가 한눈에 보인다. 코드 곳곳에서 os.Getenv를 흩뿌리면 추적이 안 된다.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config는 앱 구동에 필요한 모든 설정을 담는다.
// 설정을 하나의 구조체로 모으는 이유:
// - 의존성이 명시적으로 드러남
// - 함수 시그니처가 cfg 하나로 깔끔해짐
// - 테스트에서 임의 값 주입이 쉬움
type Config struct {
	HTTPPort        string
	DatabaseURL     string
	ShutdownTimeout time.Duration
	Env             string // "dev" | "prod"
	JWTSecret       string
	JWTAccessTTL    time.Duration // 액세스 토큰 유효기간
}

// Load — 환경변수에서 설정을 읽어 검증한다. 필수값 누락 시 에러.
// Load는 환경변수에서 읽되, 없으면 로컬 개발용 기본값을 사용한다.
// 12-Factor 원칙(설정은 환경변수로) + 로컬 편의성의 절충.

func Load() (*Config, error) {
	ttlMinutes, err := strconv.Atoi(getEnv("JWT_ACCESS_TTL", "15"))
	if err != nil {
		return nil, fmt.Errorf("JWT_ACCESS_TTL must be an integer (minutes): %w", err)
	}

	cfg := &Config{
		HTTPPort:        getEnv("HTTP_PORT", "8080"),
		DatabaseURL:     getEnv("DATABASE_URL", ""),
		ShutdownTimeout: 10 * time.Second,
		Env:             getEnv("APP_ENV", "dev"),
		JWTSecret:       getEnv("JWT_SECRET", ""),
		JWTAccessTTL:    time.Duration(ttlMinutes) * time.Minute,
	}

	// fail fast: 잘못된 설정으로 조용히 뜨는 것보다
	// 부팅 시점에 시끄럽게 죽는 게 훨씬 낫다.
	if cfg.HTTPPort == "" {
		return nil, fmt.Errorf("HTTP_PORT must not be empty")
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL must not be empty")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET must not be empty")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}
