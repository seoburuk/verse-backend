-- name: CreateUser :one
INSERT INTO users (username, display_name, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: UpdateDisplayName :one
UPDATE users SET display_name = $2 WHERE id = $1
RETURNING *;

-- name: GetUserLives :one
SELECT lives, lives_updated_at FROM users WHERE id = $1;

-- name: UpdateUserLives :exec
UPDATE users SET lives = $2, lives_updated_at = $3 WHERE id = $1;
