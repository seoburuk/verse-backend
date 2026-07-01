// user.go — 사용자 도메인 타입.
package domain

import "time"

type User struct {
	ID           int64
	Username     string
	DisplayName  string
	PasswordHash string // argon2id. 절대 외부로 노출 금지.
	CreatedAt    time.Time
}
