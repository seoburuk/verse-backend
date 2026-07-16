// auth_service.go — 회원가입·로그인·JWT 발급.
// argon2id로 비밀번호를 해싱하고, golang-jwt로 액세스 토큰을 발급한다.
// bcrypt 대신 argon2id를 쓰는 이유: 메모리-하드 함수라 GPU 무차별 대입에 더 강함.
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"
	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/mailer"
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
	mailer         mailer.Mailer
}

func NewAuthService(users repository.UserRepo, jwtSecret string, accessTTL time.Duration, googleClientID, appleBundleID, appleServiceID string, m mailer.Mailer) *AuthService {
	return &AuthService{
		users:          users,
		jwtSecret:      []byte(jwtSecret),
		accessTTL:      accessTTL,
		googleClientID: googleClientID,
		appleBundleID:  appleBundleID,
		appleServiceID: appleServiceID,
		mailer:         m,
	}
}

// --- 인증 코드 공통 상수 ---
const (
	authCodeTTL          = 10 * time.Minute
	authCodeMaxAttempts  = 5
	authCodeMaxPerHour   = 3
	purposeVerifyEmail   = "verify_email"
	purposeResetPassword = "reset_password"
	minPasswordLen       = 8
)

// SetPendingEmail — 이메일을 미인증 상태로 저장만 한다(코드 발송 없음).
// 회원가입 시 선택 입력한 이메일을 받아둘 때 쓴다 — 인증은 나중에 설정에서
// RequestEmailVerification으로 별도 진행한다.
func (s *AuthService) SetPendingEmail(ctx context.Context, userID int64, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || !strings.Contains(email, "@") {
		return domain.ErrInvalidInput
	}
	return s.users.SetUserEmailPending(ctx, userID, email)
}

// RequestEmailVerification — 로그인 사용자가 복구 이메일을 등록하고 인증 코드를 받는다.
func (s *AuthService) RequestEmailVerification(ctx context.Context, userID int64, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || !strings.Contains(email, "@") {
		return domain.ErrInvalidInput
	}

	if err := s.checkCodeRateLimit(ctx, userID, purposeVerifyEmail); err != nil {
		return err
	}

	if err := s.users.SetUserEmailPending(ctx, userID, email); err != nil {
		return err
	}

	return s.issueAndSendCode(ctx, userID, purposeVerifyEmail, email,
		"이메일 인증", "인증 코드: %s (10분 내 입력)")
}

// ConfirmEmailVerification — 인증 코드를 검증하고 이메일을 확정한다.
func (s *AuthService) ConfirmEmailVerification(ctx context.Context, userID int64, code string) error {
	if err := s.verifyCode(ctx, userID, purposeVerifyEmail, code); err != nil {
		return err
	}
	if err := s.users.SetUserEmailVerified(ctx, userID); err != nil {
		return err
	}
	return s.users.DeleteAuthCodes(ctx, userID, purposeVerifyEmail)
}

// RequestPasswordReset — 인증된 이메일로 재설정 코드를 보낸다.
// 계정 존재 여부를 노출하지 않기 위해 어떤 경우든 nil을 반환한다(열거 공격 방지).
func (s *AuthService) RequestPasswordReset(ctx context.Context, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil
	}

	user, err := s.users.GetUserByVerifiedEmail(ctx, email)
	if err != nil {
		return nil // 계정 없음 → 조용히 성공 처리
	}
	if user.PasswordHash == "" {
		return nil // 소셜 전용 계정 → 비밀번호가 없으므로 조용히 성공 처리
	}

	if err := s.checkCodeRateLimit(ctx, user.ID, purposeResetPassword); err != nil {
		return nil // 레이트리밋도 외부에 노출하지 않는다
	}

	return s.issueAndSendCode(ctx, user.ID, purposeResetPassword, email,
		"비밀번호 재설정", "비밀번호 재설정 코드: %s (10분 내 입력)")
}

// ConfirmPasswordReset — 코드 확인 후 새 비밀번호로 교체한다.
func (s *AuthService) ConfirmPasswordReset(ctx context.Context, email, code, newPassword string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if utf8.RuneCountInString(newPassword) < minPasswordLen {
		return domain.ErrInvalidInput
	}

	user, err := s.users.GetUserByVerifiedEmail(ctx, email)
	if err != nil {
		return domain.ErrUnauthorized
	}

	if err := s.verifyCode(ctx, user.ID, purposeResetPassword, code); err != nil {
		return err
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.users.UpdatePasswordHash(ctx, user.ID, hash); err != nil {
		return err
	}
	return s.users.DeleteAuthCodes(ctx, user.ID, purposeResetPassword)
}

// ChangePassword — 로그인 상태에서 현재 비밀번호 확인 후 새 비밀번호로 교체한다.
func (s *AuthService) ChangePassword(ctx context.Context, userID int64, currentPassword, newPassword string) error {
	if utf8.RuneCountInString(newPassword) < minPasswordLen {
		return domain.ErrInvalidInput
	}

	user, err := s.users.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.PasswordHash == "" {
		return domain.ErrNoPassword
	}
	if !verifyPassword(currentPassword, user.PasswordHash) {
		return domain.ErrUnauthorized
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return s.users.UpdatePasswordHash(ctx, userID, hash)
}

// checkCodeRateLimit — 계정당 시간당 발급 횟수를 제한한다(메일 폭탄/브루트포스 방지).
func (s *AuthService) checkCodeRateLimit(ctx context.Context, userID int64, purpose string) error {
	count, err := s.users.CountRecentAuthCodes(ctx, userID, purpose)
	if err != nil {
		return err
	}
	if count >= authCodeMaxPerHour {
		return domain.ErrRateLimited
	}
	return nil
}

// issueAndSendCode — 6자리 코드를 생성해 해시로 저장하고 이메일로 발송한다.
func (s *AuthService) issueAndSendCode(ctx context.Context, userID int64, purpose, email, subject, bodyFormat string) error {
	code := generateCode()
	hash := hashCode(code)

	if err := s.users.CreateAuthCode(ctx, userID, purpose, hash, email, time.Now().Add(authCodeTTL)); err != nil {
		return err
	}

	return s.mailer.Send(ctx, email, subject, fmt.Sprintf(bodyFormat, code))
}

// verifyCode — 최신 코드를 조회해 만료/횟수/일치 여부를 확인한다.
func (s *AuthService) verifyCode(ctx context.Context, userID int64, purpose, code string) error {
	authCode, err := s.users.GetLatestAuthCode(ctx, userID, purpose)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.ErrUnauthorized
		}
		return err
	}
	if authCode.Attempts >= authCodeMaxAttempts {
		return domain.ErrRateLimited
	}
	if subtle.ConstantTimeCompare([]byte(hashCode(code)), []byte(authCode.CodeHash)) != 1 {
		_ = s.users.IncrementAuthCodeAttempts(ctx, authCode.ID)
		return domain.ErrUnauthorized
	}
	return nil
}

// generateCode — 6자리 숫자 인증 코드를 생성한다.
func generateCode() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	n := (uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])) % 1000000
	return fmt.Sprintf("%06d", n)
}

// hashCode — 코드 원문을 저장하지 않도록 sha256 해시로 변환한다.
func hashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
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
