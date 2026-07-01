DROP INDEX ci_with_section;
CREATE UNIQUE INDEX ci_with_section ON course_items(section_id, verse_id) WHERE section_id IS NOT NULL;
