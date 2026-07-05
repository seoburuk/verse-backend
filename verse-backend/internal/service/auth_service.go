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
	users     repository.UserRepo
	jwtSecret []byte
	accessTTL time.Duration
}

func NewAuthService(users repository.UserRepo, jwtSecret string, accessTTL time.Duration) *AuthService {
	return &AuthService{
		users:     users,
		jwtSecret: []byte(jwtSecret),
		accessTTL: accessTTL,
	}
}

// SignUp — 새 사용자 등록. 아이디 중복 시 ErrConflict.
func (s *AuthService) SignUp(ctx context.Context, username, displayName, password string) (domain.User, string, error) {
	if username == "" || displayName == "" || password == "" {
		return domain.User{}, "", domain.ErrInvalidInput
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

// DeleteAccount — 사용자 데이터 전체 삭제.
func (s *AuthService) DeleteAccount(ctx context.Context, userID int64) error {
	return s.users.DeleteUser(ctx, userID)
}

// maxDisplayNameLen — 표시이름 최대 길이(룬 기준).
const maxDisplayNameLen = 30

// UpdateDisplayName — 표시이름 변경. 공백 트림 후 1~30자만 허용한다.
func (s *AuthService) UpdateDisplayName(ctx context.Context, userID int64, displayName string) (domain.User, error) {
	name := strings.TrimSpace(displayName)
	if name == "" || utf8.RuneCountInString(name) > maxDisplayNameLen {
		return domain.User{}, domain.ErrInvalidInput
	}
	return s.users.UpdateDisplayName(ctx, userID, name)
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
