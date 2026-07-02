-- name: ListCourses :many
SELECT * FROM courses WHERE NOT hidden ORDER BY ord;

-- name: GetCourseBySlug :one
SELECT * FROM courses WHERE slug = $1;

-- name: ListCourseItems :many
SELECT * FROM course_items WHERE course_id = $1 ORDER BY ord;

-- name: ListCourseItemsWithVerse :many
-- 코스 상세 화면: 코스아이템 목록 + 각 절 텍스트를 한 번에 조회
SELECT
  ci.id        AS course_item_id,
  ci.ord,
  ci.topic,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text
FROM course_items ci
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.course_id = $1
ORDER BY ci.ord;

-- name: GetSectionByID :one
SELECT id, course_id, title, ord FROM course_sections WHERE id = $1;

-- name: ListSectionsByCourse :many
SELECT id, course_id, title, ord FROM course_sections WHERE course_id = $1 ORDER BY ord;

-- name: ListItemsBySection :many
-- 섹션 상세: 섹션 내 절 목록 + 텍스트
SELECT
  ci.id AS course_item_id,
  ci.ord,
  ci.topic,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text
FROM course_items ci
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.section_id = $1
ORDER BY ci.ord;

-- name: ListCourseItemsByVerse :many
-- 같은 절(verse_id)을 담고 있는 모든 코스아이템 id. 워밍업/예언 코스에서 암송해도
-- 구약/신약 등 같은 절을 담은 다른 코스의 진도가 함께 갱신되도록 하기 위함.
SELECT id FROM course_items WHERE verse_id = $1;

-- name: GetCourseItemVerse :one
-- 시도 제출 시 정답 텍스트 확보(채점 분모): course_item_id → 절 텍스트 + verse_id(형제 코스아이템 조회용)
SELECT
  ci.id AS course_item_id,
  ci.verse_id,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text
FROM course_items ci
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.id = $1;
