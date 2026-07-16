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
UPDATE users SET email_verified_at = now() WHERE id = $1;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2 WHERE id = $1;
