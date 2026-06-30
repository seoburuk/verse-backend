DROP INDEX IF EXISTS ci_with_section;
DROP INDEX IF EXISTS ci_no_section;
ALTER TABLE course_items ADD CONSTRAINT course_items_course_id_verse_id_key UNIQUE(course_id, verse_id);
ALTER TABLE course_items DROP COLUMN section_id;
DROP TABLE course_sections;
