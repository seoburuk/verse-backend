-- name: GetLastAttempt :one
SELECT
  ci.id          AS course_item_id,
  ci.ord         AS item_ord,
  co.id          AS course_id,
  co.slug,
  co.title       AS course_title,
  co.title_en    AS course_title_en,
  cs.id          AS section_id,
  cs.title       AS section_title,
  cs.title_en    AS section_title_en,
  bv.book,
  bv.chapter,
  bv.verse,
  a.created_at,
  COALESCE(p.cleared, false) AS cleared
FROM attempts a
JOIN course_items ci ON ci.id = a.course_item_id
JOIN courses co ON co.id = ci.course_id AND NOT co.hidden
LEFT JOIN course_sections cs ON cs.id = ci.section_id
JOIN bible_verses bv ON bv.id = ci.verse_id
LEFT JOIN progress p ON p.course_item_id = ci.id AND p.user_id = $1
WHERE a.user_id = $1
ORDER BY a.created_at DESC
LIMIT 1;

-- name: GetNextUnclearedItem :one
SELECT
  ci.id          AS course_item_id,
  ci.ord,
  cs.id          AS section_id,
  cs.title       AS section_title,
  cs.title_en    AS section_title_en,
  bv.book,
  bv.chapter,
  bv.verse
FROM course_items ci
LEFT JOIN progress p ON p.course_item_id = ci.id AND p.user_id = $1
LEFT JOIN course_sections cs ON cs.id = ci.section_id
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.course_id = $2
  AND COALESCE(p.cleared, false) = false
ORDER BY (ci.ord < $3), ci.ord
LIMIT 1;
