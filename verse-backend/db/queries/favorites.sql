-- name: AddFavorite :exec
INSERT INTO item_favorites(user_id, course_item_id)
VALUES ($1, $2)
ON CONFLICT (user_id, course_item_id) DO NOTHING;

-- name: RemoveFavorite :exec
DELETE FROM item_favorites
WHERE user_id = $1 AND course_item_id = $2;

-- name: ListFavoriteItems :many
SELECT
  ci.id          AS course_item_id,
  ci.topic,
  co.slug        AS course_slug,
  co.title       AS course_title,
  cs.id          AS section_id,
  cs.title       AS section_title,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text,
  f.created_at
FROM item_favorites f
JOIN course_items ci ON ci.id = f.course_item_id
JOIN courses co ON co.id = ci.course_id
LEFT JOIN course_sections cs ON cs.id = ci.section_id
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE f.user_id = $1
ORDER BY f.created_at DESC;
