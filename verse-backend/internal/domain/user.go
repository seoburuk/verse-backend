// user.go — 사용자 도메인 타입.
package domain

import "time"

type User struct {
	ID                   int64
	Username             string
	DisplayName          string
	PasswordHash         string // argon2id. 절대 외부로 노출 금지. 구글 계정은 빈 문자열.
	Email                string // 구글 계정에서 받은 이메일. 자체 가입은 빈 문자열.
	GoogleSub            string // 구글 계정 고유 ID(sub). 자체 가입은 빈 문자열.
	CreatedAt            time.Time
	Theme                string
	Language             string
	DisplayNameUpdatedAt *time.Time
	EmailVerified        bool // 복구 이메일로 등록되어 인증까지 마쳤는지
}

// Lives — 목숨 상태(코스 §Phase4). 실패 시도(비초록)마다 1 소모, 시간 경과로 자동 리필.
type Lives struct {
	Count     int32
	UpdatedAt time.Time
}

// AuthCode — 이메일 인증/비밀번호 재설정용 1회용 코드.
type AuthCode struct {
	ID        int64
	UserID    int64
	Purpose   string
	CodeHash  string
	Email     string
	Attempts  int32
	ExpiresAt time.Time
}
