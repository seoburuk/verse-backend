// errors.go — 도메인 레벨 에러. handler가 이걸 보고 HTTP 상태코드로 변환한다.
//
// 왜 도메인 에러를 따로 두는가: service는 "찾을 수 없음"만 알면 되고, 그게
// 404인지 401인지는 HTTP의 관심사다. 계층 간 관심사를 분리하기 위함.
package domain

import "errors"

var (
	ErrNotFound     = errors.New("not found")
	ErrUnauthorized = errors.New("unauthorized")
	ErrConflict     = errors.New("conflict") // 중복 가입 등
	ErrInvalidInput = errors.New("invalid input")
	ErrNoLives      = errors.New("no lives remaining")
	ErrRateLimited  = errors.New("rate limited")
	ErrProfanity    = errors.New("username or display name contains banned words")
	ErrNoPassword   = errors.New("social login account has no password")
)
