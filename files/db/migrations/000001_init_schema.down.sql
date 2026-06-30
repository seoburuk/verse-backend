-- 000001_init_schema.down.sql
-- up 의 역순으로 정리. FK 의존성 때문에 자식 테이블부터 DROP.
-- (CASCADE를 안 쓰고 명시적 순서로 지우는 편이 의존성을 드러내 학습에 좋다.)

DROP TABLE IF EXISTS streaks;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS progress;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS course_items;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS word_glossary;
DROP TABLE IF EXISTS verse_segments;
DROP TABLE IF EXISTS bible_verses;
