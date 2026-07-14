// auth_service.go — 회원가입·로그인·JWT 발급.
// argon2id로 비밀번호를 해싱하고, golang-jwt로 액세스 토큰을 발급한다.
// bcrypt 대신 argon2id를 쓰는 이유: 메모리-하드 함수라 GPU 무차별 대입에 더 강함.
package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
	"golang.org/x/crypto/argon2"
	"google.golang.org/api/idtoken"
)

// argon2id 파라미터 — OWASP 권장값(메모리 64MB, 시간 1, 병렬 4)
const (
	argonTime    = 1
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

type AuthService struct {
	users          repository.UserRepo
	jwtSecret      []byte
	accessTTL      time.Duration
	googleClientID string
	appleBundleID  string
	appleServiceID string
}

func NewAuthService(users repository.UserRepo, jwtSecret string, accessTTL time.Duration, googleClientID, appleBundleID, appleServiceID string) *AuthService {
	return &AuthService{
		users:          users,
		jwtSecret:      []byte(jwtSecret),
		accessTTL:      accessTTL,
		googleClientID: googleClientID,
		appleBundleID:  appleBundleID,
		appleServiceID: appleServiceID,
	}
}

// SignUp — 새 사용자 등록. 아이디 중복 시 ErrConflict.
func (s *AuthService) SignUp(ctx context.Context, username, displayName, password string) (domain.User, string, error) {
	if username == "" || displayName == "" || password == "" {
		return domain.User{}, "", domain.ErrInvalidInput
	}
	if containsProfanity(username) || containsProfanity(displayName) {
		return domain.User{}, "", domain.ErrProfanity
	}

	hash, err := hashPassword(password)
	if err != nil {
		return domain.User{}, "", fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.CreateUser(ctx, username, displayName, hash)
	if err != nil {
		if isDuplicateError(err) {
			return domain.User{}, "", domain.ErrConflict
		}
		return domain.User{}, "", err
	}

	token, err := s.issueToken(user.ID)
	if err != nil {
		return domain.User{}, "", err
	}

	return user, token, nil
}

// Login — 아이디+비밀번호 검증 후 JWT 발급.
func (s *AuthService) Login(ctx context.Context, username, password string) (domain.User, string, error) {
	user, err := s.users.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.User{}, "", domain.ErrUnauthorized
		}
		return domain.User{}, "", err
	}

	if !verifyPassword(password, user.PasswordHash) {
		return domain.User{}, "", domain.ErrUnauthorized
	}

	token, err := s.issueToken(user.ID)
	if err != nil {
		return domain.User{}, "", err
	}

	return user, token, nil
}

// GoogleLogin — 구글 ID 토큰을 검증하고, 해당 계정으로 로그인 또는 신규 가입 후 JWT 발급.
// 구글 계정은 sub(고유 ID)로 식별한다. 이메일은 변경될 수 있으므로 식별자로 쓰지 않는다.
func (s *AuthService) GoogleLogin(ctx context.Context, idToken string) (domain.User, string, error) {
	if s.googleClientID == "" {
		return domain.User{}, "", fmt.Errorf("google login not configured")
	}
	if idToken == "" {
		return domain.User{}, "", domain.ErrInvalidInput
	}

	// audience(=우리 클라이언트 ID)와 구글 서명을 검증한다.
	payload, err := idtoken.Validate(ctx, idToken, s.googleClientID)
	if err != nil {
		return domain.User{}, "", domain.ErrUnauthorized
	}

	sub := payload.Subject
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	if name == "" {
		name = defaultDisplayName(email)
	}

	// 기존 구글 계정이면 그대로 로그인.
	user, err := s.users.GetUserByGoogleSub(ctx, sub)
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

	// 신규 가입 — username 충돌 시 랜덤 접미사를 붙여 재시도.
	base := usernameFromEmail(email)
	for attempt := 0; attempt < 5; attempt++ {
		username := base
		if attempt > 0 {
			username = base + "_" + randomSuffix()
		}
		user, err = s.users.CreateGoogleUser(ctx, username, name, email, sub)
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

// usernameFromEmail — 이메일 로컬파트에서 영숫자만 추려 username 후보를 만든다.
func usernameFromEmail(email string) string {
	local, _, _ := strings.Cut(email, "@")
	var b strings.Builder
	for _, r := range strings.ToLower(local) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if s == "" {
		return "user"
	}
	return s
}

// defaultDisplayName — 이름이 없을 때 이메일 로컬파트를 표시이름으로 쓴다.
func defaultDisplayName(email string) string {
	if local, _, ok := strings.Cut(email, "@"); ok && local != "" {
		return local
	}
	return "사용자"
}

// randomSuffix — username 충돌 회피용 짧은 랜덤 문자열.
func randomSuffix() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// DeleteAccount — 사용자 데이터 전체 삭제.
func (s *AuthService) DeleteAccount(ctx context.Context, userID int64) error {
	return s.users.DeleteUser(ctx, userID)
}

// maxDisplayNameLen — 표시이름 최대 길이(룬 기준).
const maxDisplayNameLen = 30

// displayNameChangeCooldown — 닉네임 변경 최소 간격.
const displayNameChangeCooldown = 24 * time.Hour

// UpdateDisplayName — 표시이름 변경. 공백 트림 후 1~30자만 허용하고, 하루 1회로 제한한다.
func (s *AuthService) UpdateDisplayName(ctx context.Context, userID int64, displayName string) (domain.User, error) {
	name := strings.TrimSpace(displayName)
	if name == "" || utf8.RuneCountInString(name) > maxDisplayNameLen {
		return domain.User{}, domain.ErrInvalidInput
	}
	if containsProfanity(name) {
		return domain.User{}, domain.ErrProfanity
	}

	user, err := s.users.GetUserByID(ctx, userID)
	if err != nil {
		return domain.User{}, err
	}
	if user.DisplayNameUpdatedAt != nil && time.Since(*user.DisplayNameUpdatedAt) < displayNameChangeCooldown {
		return domain.User{}, domain.ErrRateLimited
	}

	return s.users.UpdateDisplayName(ctx, userID, name)
}

// UpdateThemeLanguage — 테마·언어 선호도를 서버에 저장한다(기기 간 동기화용). 부분 갱신 지원.
func (s *AuthService) UpdateThemeLanguage(ctx context.Context, userID int64, theme, language *string) (domain.User, error) {
	if theme != nil && *theme != "light" && *theme != "dark" {
		return domain.User{}, domain.ErrInvalidInput
	}
	if language != nil && *language != "ko" && *language != "en" {
		return domain.User{}, domain.ErrInvalidInput
	}
	return s.users.UpdateThemeLanguage(ctx, userID, theme, language)
}

// GetMe — 프로필 전체 조회(테마/언어/가입일 포함).
func (s *AuthService) GetMe(ctx context.Context, userID int64) (domain.User, error) {
	return s.users.GetUserByID(ctx, userID)
}

// VerifyToken — JWT 검증 후 userID 반환. 미들웨어에서 사용.
func (s *AuthService) VerifyToken(tokenStr string) (int64, error) {
	t, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	}, jwt.WithExpirationRequired())
	if err != nil {
		return 0, domain.ErrUnauthorized
	}

	claims, ok := t.Claims.(jwt.MapClaims)
	if !ok {
		return 0, domain.ErrUnauthorized
	}

	sub, err := claims.GetSubject()
	if err != nil {
		return 0, domain.ErrUnauthorized
	}

	var userID int64
	if _, err := fmt.Sscanf(sub, "%d", &userID); err != nil {
		return 0, domain.ErrUnauthorized
	}

	return userID, nil
}

// issueToken — userID를 subject로 하는 액세스 토큰 발급.
func (s *AuthService) issueToken(userID int64) (string, error) {
	now := time.Now().UTC()
	claims := jwt.RegisteredClaims{
		Subject:   fmt.Sprintf("%d", userID),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(s.jwtSecret)
}

// hashPassword — argon2id로 해싱 후 "salt$hash" 형식 문자열 반환.
func hashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return base64.RawStdEncoding.EncodeToString(salt) + "$" +
		base64.RawStdEncoding.EncodeToString(hash), nil
}

// verifyPassword — 저장된 해시와 입력 비밀번호를 상수시간 비교(타이밍 공격 방지).
func verifyPassword(password, stored string) bool {
	parts := strings.SplitN(stored, "$", 2)
	if len(parts) != 2 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	if len(hash) != len(expected) {
		return false
	}
	diff := byte(0)
	for i := range hash {
		diff |= hash[i] ^ expected[i]
	}
	return diff == 0
}

// isDuplicateError — pgx unique 제약 위반 에러를 감지한다.
func isDuplicateError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "unique")
}
