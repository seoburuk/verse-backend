-- 코스 콘텐츠 영어화(영어모드). 기존 한글 컬럼은 그대로 두고 영어 컬럼을 추가한다.
-- NULL이면 프론트가 한글 컬럼으로 폴백하므로 점진 번역이 가능하다.
ALTER TABLE courses         ADD COLUMN title_en TEXT;
ALTER TABLE course_sections ADD COLUMN title_en TEXT;
ALTER TABLE course_items    ADD COLUMN topic_en TEXT;
