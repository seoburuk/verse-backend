-- name: GetCategoryProgress :many
SELECT c.category AS category,
       COUNT(*) FILTER (WHERE p.cleared) AS cleared,
       COUNT(*)                          AS total
FROM course_items ci
JOIN courses c ON c.id = ci.course_id
LEFT JOIN progress p ON p.course_item_id = ci.id AND p.user_id = $1
GROUP BY c.category;

-- name: GetGradeDistribution :one
SELECT COUNT(*) FILTER (WHERE grade = 'green')  AS green,
       COUNT(*) FILTER (WHERE grade = 'yellow') AS yellow,
       COUNT(*) FILTER (WHERE grade = 'red')    AS red
FROM progress
WHERE user_id = $1;

-- name: GetTotalCleared :one
SELECT COUNT(*) AS total FROM progress WHERE user_id = $1 AND cleared;
