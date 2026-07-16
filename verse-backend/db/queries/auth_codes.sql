-- name: CreateAuthCode :one
INSERT INTO auth_codes (user_id, purpose, code_hash, email, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetLatestAuthCode :one
SELECT * FROM auth_codes
WHERE user_id = $1 AND purpose = $2 AND expires_at > now()
ORDER BY created_at DESC
LIMIT 1;

-- name: IncrementAuthCodeAttempts :exec
UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1;

-- name: DeleteAuthCodes :exec
DELETE FROM auth_codes WHERE user_id = $1 AND purpose = $2;

-- name: CountRecentAuthCodes :one
SELECT count(*) FROM auth_codes
WHERE user_id = $1 AND purpose = $2 AND created_at > now() - interval '1 hour';
