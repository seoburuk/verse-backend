-- name: GetCategoryProgress :many
-- 숨김(hidden) 코스는 코스 목록 화면에 아예 노출되지 않으므로 집계에서도 제외한다.
-- (예: 30개 개별 주제 코스는 워밍업으로 대체되어 숨겨졌지만 course_items는 남아있음)
SELECT c.category AS category,
       COUNT(*) FILTER (WHERE p.cleared) AS cleared,
       COUNT(*)                          AS total
FROM course_items ci
JOIN courses c ON c.id = ci.course_id
LEFT JOIN progress p ON p.course_item_id = ci.id AND p.user_id = $1
WHERE NOT c.hidden
GROUP BY c.category;

-- name: GetGradeDistribution :one
SELECT COUNT(*) FILTER (WHERE grade = 'green')  AS green,
       COUNT(*) FILTER (WHERE grade = 'yellow') AS yellow,
       COUNT(*) FILTER (WHERE grade = 'red')    AS red
FROM progress
WHERE user_id = $1;

-- name: GetTotalCleared :one
SELECT COUNT(*) AS total FROM progress WHERE user_id = $1 AND cleared;
