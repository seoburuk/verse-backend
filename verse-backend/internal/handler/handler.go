// handler.go — Handler 구조체 정의 + context key + 에러→상태코드 변환.
package handler

import (
	"errors"
	"log"
	"net/http"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/service"
)

// Handler — 모든 HTTP 핸들러 메서드를 가지는 구조체.
// 서비스 의존성을 필드로 받아 DI한다.
type Handler struct {
	auth    *service.AuthService
	courses *service.CourseService
	attempt *service.AttemptService
}

func NewHandler(
	auth *service.AuthService,
	courses *service.CourseService,
	attempt *service.AttemptService,
) *Handler {
	return &Handler{auth: auth, courses: courses, attempt: attempt}
}

// errStatus — domain 에러를 HTTP 상태코드로 변환한다.
// 핸들러마다 switch 중복을 막는 단일 창구.
func errStatus(err error) int {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, domain.ErrUnauthorized):
		return http.StatusUnauthorized
	case errors.Is(err, domain.ErrConflict):
		return http.StatusConflict
	case errors.Is(err, domain.ErrInvalidInput):
		return http.StatusBadRequest
	case errors.Is(err, domain.ErrNoLives):
		return http.StatusForbidden
	case errors.Is(err, domain.ErrRateLimited):
		return http.StatusTooManyRequests
	case errors.Is(err, domain.ErrProfanity):
		return http.StatusBadRequest
	case errors.Is(err, domain.ErrNoPassword):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// writeError — 도메인 에러를 상태코드로 바꿔 응답한다.
// 500으로 떨어지는 예기치 못한 에러(주로 DB 실패)는 내부 메시지가 그대로
// 클라이언트에 노출되지 않도록 고정 문구로 바꾸고 서버 로그에만 남긴다.
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	status := errStatus(err)
	if status == http.StatusInternalServerError {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		writeJSON(w, status, map[string]string{"error": "internal error"})
		return
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
