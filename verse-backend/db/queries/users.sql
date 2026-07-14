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
