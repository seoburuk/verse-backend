// apple_auth.go — Sign in with Apple ID 토큰 검증 + 로그인/가입.
// GoogleLogin(auth_service.go)과 동일한 흐름: 토큰 검증 → sub 조회 → 없으면 신규 가입.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/seoburuk/verse-backend/internal/domain"
)

const appleJWKSURL = "https://appleid.apple.com/auth/keys"
const appleIssuer = "https://appleid.apple.com"

// appleKeys — JWKS는 무겁게 자주 받지 않도록 keyfunc가 백그라운드 갱신·캐시한다.
var (
	appleKeysOnce sync.Once
	appleKeys     keyfunc.Keyfunc
	appleKeysErr  error
)

// audienceAllowed — 토큰의 aud가 네이티브 앱(bundleID) 또는 웹(serviceID) 중
// 설정된 값과 하나라도 일치하면 통과. 둘 다 미설정이면 거부(설정 누락을 통과로 착각하지 않도록).
func audienceAllowed(aud []string, bundleID, serviceID string) bool {
	for _, a := range aud {
		if (bundleID != "" && a == bundleID) || (serviceID != "" && a == serviceID) {
			return true
		}
	}
	return false
}

func appleKeyfunc(ctx context.Context) (keyfunc.Keyfunc, error) {
	appleKeysOnce.Do(func() {
		// 프로세스 수명 동안 유지되는 컨텍스트로 초기화(요청 컨텍스트에 묶으면 갱신이 끊김).
		appleKeys, appleKeysErr = keyfunc.NewDefaultCtx(context.Background(), []string{appleJWKSURL})
	})
	return appleKeys, appleKeysErr
}

// AppleLogin — 애플 ID 토큰을 검증하고, 해당 계정으로 로그인 또는 신규 가입 후 JWT 발급.
// 애플은 이름을 최초 로그인 1회만 클라이언트에 주므로 name을 별도 파라미터로 받는다.
// audience는 네이티브 앱(Bundle ID)과 웹(Services ID) 중 어느 쪽에서 왔든 허용한다 —
// 두 플랫폼이 애플 계정으로 같은 사용자를 식별해야 하므로 둘 다 유효한 클라이언트다.
func (s *AuthService) AppleLogin(ctx context.Context, idToken, name string) (domain.User, string, error) {
	if s.appleBundleID == "" && s.appleServiceID == "" {
		return domain.User{}, "", fmt.Errorf("apple login not configured")
	}
	if idToken == "" {
		return domain.User{}, "", domain.ErrInvalidInput
	}

	kf, err := appleKeyfunc(ctx)
	if err != nil {
		return domain.User{}, "", fmt.Errorf("apple jwks: %w", err)
	}

	claims := jwt.MapClaims{}
	_, err = jwt.ParseWithClaims(idToken, claims, kf.Keyfunc,
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(appleIssuer),
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return domain.User{}, "", domain.ErrUnauthorized
	}
	aud, err := claims.GetAudience()
	if err != nil || !audienceAllowed(aud, s.appleBundleID, s.appleServiceID) {
		return domain.User{}, "", domain.ErrUnauthorized
	}

	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return domain.User{}, "", domain.ErrUnauthorized
	}
	email, _ := claims["email"].(string)
	if name == "" {
		name = defaultDisplayName(email)
	}

	// 기존 애플 계정이면 그대로 로그인.
	user, err := s.users.GetUserByAppleSub(ctx, sub)
	if err == nil {
		token, err := s.issueToken(user.ID)
		if err != nil {
			return domain.User{}, "", err
		}
		return user, token, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return domain.User{}, "", err
	}

	// 신규 가입 — username 충돌 시 랜덤 접미사를 붙여 재시도(GoogleLogin과 동일 정책).
	base := usernameFromEmail(email)
	if base == "user" && email == "" {
		// 애플 비공개 릴레이/이메일 미제공 대비
		base = "apple_" + strings.ToLower(randomSuffix())
	}
	for attempt := 0; attempt < 5; attempt++ {
		username := base
		if attempt > 0 {
			username = base + "_" + randomSuffix()
		}
		user, err = s.users.CreateAppleUser(ctx, username, name, email, sub)
		if err == nil {
			token, err := s.issueToken(user.ID)
			if err != nil {
				return domain.User{}, "", err
			}
			return user, token, nil
		}
		if !isDuplicateError(err) {
			return domain.User{}, "", err
		}
	}
	return domain.User{}, "", domain.ErrConflict
}
