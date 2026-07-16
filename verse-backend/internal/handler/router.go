// router.go — chi 라우터 조립 + 미들웨어 체인 + 엔드포인트 등록.
//
// 왜 chi인가: 표준 net/http와 100% 호환되면서 라우팅·미들웨어만 얇게 얹는다.
// 거대한 프레임워크(gin 등)의 "마법" 없이 표준 핸들러 시그니처를 유지.
//
// 엔드포인트는 기획서 §9 기준.
package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/jackc/pgx/v5/pgxpool"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
	"github.com/seoburuk/verse-backend/internal/service"
)

// NewRouter — 라우팅 + 미들웨어 체인을 조립해 http.Handler를 반환한다.
func NewRouter(pool *pgxpool.Pool, h *Handler, auth *service.AuthService, corsOrigin string) http.Handler {
	r := chi.NewRouter()

	// 전역 미들웨어 — 순서가 의미를 가진다(위→아래로 요청을 감싼다)
	r.Use(middleware.RequestID) // 요청마다 고유 ID → 로그 추적
	r.Use(middleware.RealIP)    // 프록시 뒤에서도 실제 클라이언트 IP 복원
	r.Use(middleware.Logger)    // 메서드/경로/상태코드/소요시간 로깅
	r.Use(middleware.Recoverer) // 핸들러 panic → 500 변환
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   strings.Split(corsOrigin, ","),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// /healthz: 로드밸런서·도커·k8s가 "살아있나"를 묻는 표준 엔드포인트
	r.Get("/healthz", healthzHandler(pool))

	// /v1 — 모든 API 엔드포인트. Next.js rewrites가 /v1/* → :8080 으로 전달.
	r.Route("/v1", func(r chi.Router) {
		// 공개 엔드포인트 — 브루트포스 방지 레이트리밋(IP당 분당 10회)
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(10, time.Minute))
			r.Post("/auth/signup", h.Signup)
			r.Post("/auth/login", h.Login)
			r.Post("/auth/google", h.GoogleLogin)
			r.Post("/auth/apple", h.AppleLogin)
		})
		// 비밀번호 재설정 — 계정 열거/브루트포스 방지를 위해 더 빡빡한 레이트리밋(IP당 분당 5회)
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(5, time.Minute))
			r.Post("/auth/password-reset/request", h.RequestPasswordReset)
			r.Post("/auth/password-reset/confirm", h.ConfirmPasswordReset)
		})
		r.Get("/courses", h.ListCourses)
		r.Get("/courses/version", h.GetCoursesVersion)
		r.Get("/courses/{slug}", h.GetCourse)
		r.Get("/sections/{id}", h.GetSection)
		r.Get("/verses/{book}/{chapter}/{verse}", h.GetVerse)

		// 보호 엔드포인트 — JWT 필수
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireAuth(auth))
			r.Group(func(r chi.Router) {
				r.Use(httprate.LimitByIP(30, time.Minute))
				r.Post("/attempts", h.SubmitAttempt)
			})
			// 오프라인 우선 클라이언트(Flutter)의 배치 동기화 — 호출 빈도는
			// 낮지만 요청당 항목이 많으므로 단건 시도와 별도 레이트리밋을 둔다.
			r.Group(func(r chi.Router) {
				r.Use(httprate.LimitByIP(10, time.Minute))
				r.Post("/sync/attempts", h.SubmitAttemptsBatch)
			})
			r.Get("/me/progress", h.GetMyProgress)
			r.Get("/me/lives", h.GetMyLives)
			r.Post("/me/lives/consume", h.ConsumeLife)
			r.Get("/me/stats", h.GetMyStats)
			r.Get("/me/resume", h.GetMyResume)
			r.Get("/rankings", h.GetRankings)
			r.Get("/me/favorites", h.GetMyFavorites)
			r.Put("/me/favorites/{itemId}", h.AddFavorite)
			r.Delete("/me/favorites/{itemId}", h.RemoveFavorite)
			r.Patch("/me/profile", h.UpdateProfile)
			r.Get("/me", h.GetMe)
			r.Delete("/me", h.DeleteAccount)
			r.Group(func(r chi.Router) {
				r.Use(httprate.LimitByIP(5, time.Minute))
				r.Post("/me/email/request", h.RequestEmailVerification)
				r.Post("/me/email/confirm", h.ConfirmEmailVerification)
				r.Post("/me/password", h.ChangePassword)
			})
		})
	})

	return r
}

// healthzHandler — pool을 클로저로 캡처한다.
//
// 왜 인라인 func 대신 별도 함수로 뺐는가:
// 핸들러가 늘어날수록 NewRouter가 길어진다.
// 핸들러를 별도 함수로 분리하면 NewRouter는 "등록"만 담당하고
// 로직은 각 함수에 응집된다 (단일 책임).
func healthzHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// DB ping — 타임아웃 1초로 제한
		// 왜 타임아웃을 거는가: ping이 무한정 블로킹되면
		// 로드밸런서가 응답 없음으로 판단해 서버를 죽인다.
		ctx, cancel := context.WithTimeout(r.Context(), 1*time.Second)
		defer cancel()

		dbStatus := "ok"
		if err := pool.Ping(ctx); err != nil {
			dbStatus = "unreachable"
		}

		status := http.StatusOK
		if dbStatus != "ok" {
			status = http.StatusServiceUnavailable // 503
		}

		writeJSON(w, status, map[string]any{
			"status": "ok",
			"db":     dbStatus,
			"time":   time.Now().UTC(),
		})
	}
}

// writeJSON은 응답 직렬화의 단일 창구.
// 모든 핸들러가 같은 방식으로 응답하도록 강제 → 일관성 확보.
// 이후 에러 응답도 여기서 통일한다.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
