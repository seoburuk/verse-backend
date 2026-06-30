CREATE TABLE course_sections (
  id        BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id),
  title     TEXT   NOT NULL,
  ord       INT    NOT NULL,
  UNIQUE(course_id, ord)
);

ALTER TABLE course_items ADD COLUMN section_id BIGINT REFERENCES course_sections(id);

-- 기존 UNIQUE(course_id, verse_id) → 섹션 유무에 따른 부분 인덱스로 교체
ALTER TABLE course_items DROP CONSTRAINT course_items_course_id_verse_id_key;
CREATE UNIQUE INDEX ci_no_section ON course_items(course_id, verse_id) WHERE section_id IS NULL;
CREATE UNIQUE INDEX ci_with_section ON course_items(section_id, verse_id) WHERE section_id IS NOT NULL;
