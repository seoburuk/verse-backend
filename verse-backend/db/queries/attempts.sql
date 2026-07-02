-- name: InsertAttempt :one
INSERT INTO attempts (user_id, course_item_id, mode, client_grade, server_grade)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpsertProgress :exec
INSERT INTO progress (user_id, course_item_id, grade, cleared, updated_at)
VALUES ($1, $2, $3, $4, now())
ON CONFLICT (user_id, course_item_id)
DO UPDATE SET grade = EXCLUDED.grade, cleared = EXCLUDED.cleared, updated_at = now();

-- name: GetStreak :one
SELECT * FROM streaks WHERE user_id = $1;

-- name: UpsertStreak :exec
INSERT INTO streaks (user_id, current_len, longest_len, last_day)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id)
DO UPDATE SET current_len = EXCLUDED.current_len, longest_len = EXCLUDED.longest_len, last_day = EXCLUDED.last_day;

-- name: ListUserProgress :many
SELECT p.course_item_id, p.grade, p.cleared, bv.book, bv.chapter, bv.verse
FROM progress p
JOIN course_items ci ON ci.id = p.course_item_id
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE p.user_id = $1;

-- name: ListCourseProgress :many
SELECT ci.course_id AS course_id,
       COUNT(*) FILTER (WHERE p.cleared) AS cleared,
       COUNT(*)                          AS total
FROM course_items ci
LEFT JOIN progress p
  ON p.course_item_id = ci.id AND p.user_id = $1
GROUP BY ci.course_id;
