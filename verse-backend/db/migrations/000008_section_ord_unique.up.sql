-- 섹션 내 절 중복 허용 (메시야 예언: 한 절에 여러 예언이 걸림).
-- (section_id, verse_id) 대신 (section_id, ord)로 멱등성 보장.
DROP INDEX ci_with_section;
CREATE UNIQUE INDEX ci_with_section ON course_items(section_id, ord) WHERE section_id IS NOT NULL;
