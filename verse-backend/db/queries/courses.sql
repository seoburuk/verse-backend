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
  ci.topic_en,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text
FROM course_items ci
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.course_id = $1
ORDER BY ci.ord;

-- name: GetSectionByID :one
SELECT id, course_id, title, title_en, ord FROM course_sections WHERE id = $1;

-- name: ListSectionsByCourse :many
SELECT id, course_id, title, title_en, ord FROM course_sections WHERE course_id = $1 ORDER BY ord;

-- name: ListItemsBySection :many
-- 섹션 상세: 섹션 내 절 목록 + 텍스트
SELECT
  ci.id AS course_item_id,
  ci.ord,
  ci.topic,
  ci.topic_en,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text
FROM course_items ci
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.section_id = $1
ORDER BY ci.ord;

-- name: GetCourseItemVerse :one
-- 시도 제출 시 정답 텍스트 확보(채점 분모): course_item_id → 절 텍스트
SELECT
  ci.id AS course_item_id,
  bv.book,
  bv.chapter,
  bv.verse,
  bv.text
FROM course_items ci
JOIN bible_verses bv ON bv.id = ci.verse_id
WHERE ci.id = $1;

-- name: ListSiblingCourseItemIDs :many
-- 같은 절(verse_id)을 공유하는 모든 course_item_id(자기 자신 포함).
-- 진도 제출 시 이 목록 전체에 progress를 fan-out해 코스/섹터 간 진도를 일치시킨다.
SELECT ci2.id
FROM course_items ci
JOIN course_items ci2 ON ci2.verse_id = ci.verse_id
WHERE ci.id = $1;
