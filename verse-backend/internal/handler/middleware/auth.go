// auth.go — JWT 검증 미들웨어. Authorization 헤더의 Bearer 토큰을 검증하고
// user_id를 request context에 심는다. 이후 핸들러는 context에서 user_id를 읽는다.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/seoburuk/verse-backend/internal/service"
)

// ctxKey — context key 타입. string 대신 전용 타입으로 충돌 방지.
type ctxKey string

// CtxUserID — JWT 검증 후 request context에 주입되는 userID key.
// 핸들러는 이 키로 userID를 꺼낸다.
const CtxUserID ctxKey = "userID"

// RequireAuth — Bearer 토큰을 검증하고 userID를 context에 주입.
// 실패 시 401을 반환하고 체인을 중단한다.
func RequireAuth(auth *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := bearerToken(r)
			if token == "" {
				http.Error(w, `{"error":"missing token"}`, http.StatusUnauthorized)
				return
			}

			userID, err := auth.VerifyToken(token)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), CtxUserID, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// bearerToken — "Authorization: Bearer <token>" 에서 토큰만 추출.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}
