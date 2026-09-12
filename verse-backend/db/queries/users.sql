-- name: CreateUser :one
INSERT INTO users (username, display_name, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: GetUserByGoogleSub :one
SELECT * FROM users WHERE google_sub = $1;

-- name: CreateGoogleUser :one
INSERT INTO users (username, display_name, password_hash, email, google_sub)
VALUES ($1, $2, '', $3, $4)
RETURNING *;

-- name: GetUserByAppleSub :one
SELECT * FROM users WHERE apple_sub = $1;

-- name: CreateAppleUser :one
INSERT INTO users (username, display_name, password_hash, email, apple_sub)
VALUES ($1, $2, '', $3, $4)
RETURNING *;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: UpdateDisplayName :one
UPDATE users SET display_name = $2, display_name_updated_at = now() WHERE id = $1
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: UpdateUserPrefs :one
UPDATE users SET
  theme = COALESCE(sqlc.narg('theme'), theme),
  language = COALESCE(sqlc.narg('language'), language)
WHERE id = $1
RETURNING *;

-- name: GetUserLives :one
SELECT lives, lives_updated_at FROM users WHERE id = $1;

-- name: UpdateUserLives :exec
UPDATE users SET lives = $2, lives_updated_at = $3 WHERE id = $1;

-- name: GetUserByVerifiedEmail :one
SELECT * FROM users WHERE lower(email) = lower($1) AND email_verified_at IS NOT NULL;

-- name: SetUserEmailPending :exec
UPDATE users SET email = $2, email_verified_at = NULL WHERE id = $1;

-- name: SetUserEmailVerified :exec
-- 인증 코드에 담긴 이메일을 이 시점에 확정한다. 코드 발송 시점에 미리
-- 저장하면 발송 실패·오타 시 기존 인증 이메일을 잃는다.
UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: GetUserLivesForUpdate :one
-- 같은 사용자의 동시 제출을 직렬화하기 위한 잠금 읽기.
-- 목숨 확인 → 시도 기록 → 목숨 소모가 한 트랜잭션 안에서 원자적으로 일어나야
-- 중간에 끼어든 요청이 같은 목숨을 두 번 쓰지 못한다.
SELECT lives, lives_updated_at FROM users WHERE id = $1 FOR UPDATE;
