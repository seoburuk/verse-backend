-- name: CreateUser :one
INSERT INTO users (username, display_name, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;
