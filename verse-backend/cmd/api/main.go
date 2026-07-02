// main.go — 애플리케이션 진입점.
//
// 책임: 오직 "조립(wiring)"만 한다. 비즈니스 로직은 한 줄도 없다.
//  1. config 로드 (환경변수 → 구조체)
//  2. DB 풀(pgxpool) 연결
//  3. repository → service → handler 순서로 의존성 주입(DI)
//  4. chi 라우터에 핸들러 등록 후 HTTP 서버 기동
//
// 왜 main을 얇게 두는가:
//
//	"조립"과 "로직"을 섞으면 테스트가 불가능해진다. main은 테스트하기 가장
//	어려운 지점이므로, 여기에 로직이 없어야 나머지를 전부 단위 테스트할 수 있다.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/seoburuk/verse-backend/internal/config"
	"github.com/seoburuk/verse-backend/internal/handler"
	"github.com/seoburuk/verse-backend/internal/repository"
	"github.com/seoburuk/verse-backend/internal/service"
)

// main은 의도적으로 얇다. 유일한 역할:
// (1) run()을 호출하고, (2) 에러가 나면 종료코드 1로 죽는다.
//
// os.Exit는 defer를 무시한다.
// 그래서 defer db.Close() 같은 정리 코드가 필요한
// 모든 로직은 run() 안에 둬야 한다.
// run()은 error를 반환하므로 테스트도 가능하다.
func main() {
	if err := run(); err != nil {
		log.Printf("fatal: %v", err)
		os.Exit(1)
	}
}

func run() error {
	// 1) 설정 로드 — 실패하면 즉시 종료 (fail fast)
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// 2) DB 커넥션 풀 연결

	// context.Background()를 쓰는 이유: 아직 서버가 안 떴으므로
	// 요청 context가 없다. 부팅 전용 context는 Background가 맞다.
	ctx := context.Background()
	pool, err := repository.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("db connect: %w", err)
	}
	defer pool.Close() // run()이 끝날 때 연결 정리 (os.Exit와 달리 defer가 동작)
	log.Println("db connected")

	// 3) repository → service → handler 순서로 DI 조립
	userRepo    := repository.NewUserRepo(pool)
	courseRepo  := repository.NewCourseRepo(pool)
	attemptRepo := repository.NewAttemptRepo(pool)

	authSvc    := service.NewAuthService(userRepo, cfg.JWTSecret, cfg.JWTAccessTTL)
	courseSvc  := service.NewCourseService(courseRepo)
	attemptSvc := service.NewAttemptService(courseRepo, attemptRepo, userRepo)

	h := handler.NewHandler(authSvc, courseSvc, attemptSvc)

	// 4) HTTP 서버 조립
	srv := &http.Server{
		Addr:    ":" + cfg.HTTPPort,
		Handler: handler.NewRouter(pool, h, authSvc, cfg.CORSOrigin),

		// 타임아웃을 반드시 명시해야 하는 이유:
		// 기본 http.Server는 타임아웃이 0(=무한)이다.
		// 느리거나 악의적인 클라이언트가 커넥션을 붙잡아
		// 고루틴/메모리를 고갈시킬 수 있다 (Slowloris 공격).
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// 3) 서버를 별도 고루틴에서 실행
	// ListenAndServe는 블로킹 호출이다.
	// 메인 흐름은 종료 신호를 기다려야 하므로
	// 고루틴 + 채널로 동시 처리한다.
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("server listening on :%s (env=%s)", cfg.HTTPPort, cfg.Env)
		if err := srv.ListenAndServe(); err != nil &&
			!errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// 4) OS 종료 신호 대기
	// SIGINT = Ctrl+C, SIGTERM = 도커·k8s의 정상 종료 요청
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	// 5) 먼저 오는 이벤트 처리
	select {
	case err := <-serverErr:
		// 포트 이미 사용 중 등 서버 자체 에러
		return err

	case sig := <-quit:
		log.Printf("shutdown started: signal=%v", sig)

		// Graceful shutdown:
		// 신규 요청은 거절하고, 진행 중인 요청은 끝까지 마무리한다.
		// 그냥 os.Exit() 하면 처리 중 요청이 잘려
		// DB 트랜잭션이 깨지거나 클라이언트가 에러를 받는다.
		ctx, cancel := context.WithTimeout(
			context.Background(),
			cfg.ShutdownTimeout,
		)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			// 타임아웃 내에 못 끝내면 강제 종료
			_ = srv.Close()
			return err
		}

		log.Println("shutdown complete")
	}

	return nil
}
