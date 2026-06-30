-- sqlc 쿼리 정의. 형식: -- name: 쿼리이름 :반환종류

-- name: GetChapter :many
SELECT * FROM bible_verses WHERE book = $1 AND chapter = $2 ORDER BY verse;

-- name: GetVerse :one
SELECT * FROM bible_verses WHERE book = $1 AND chapter = $2 AND verse = $3;

-- name: ListSegmentsByVerse :many
SELECT * FROM verse_segments WHERE verse_id = $1 ORDER BY ord;
