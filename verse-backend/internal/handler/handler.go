// handler.go — Handler 구조체 정의 + context key + 에러→상태코드 변환.
package handler

import (
	"errors"
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
	default:
		return http.StatusInternalServerError
	}
}
