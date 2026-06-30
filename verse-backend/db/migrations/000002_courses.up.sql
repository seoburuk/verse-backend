-- 기획서 §6.2. 코스 + 코스아이템 + 단어사전(앱 내장 빌드 소스).
CREATE TABLE courses (
  id    BIGSERIAL PRIMARY KEY,
  slug  TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  theme TEXT,
  ord   INT  NOT NULL
);

CREATE TABLE course_items (
  id        BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id),
  verse_id  BIGINT NOT NULL REFERENCES bible_verses(id),
  ord       INT    NOT NULL,
  topic     TEXT,
  UNIQUE(course_id, verse_id)
);

CREATE TABLE word_glossary (
  id       BIGSERIAL PRIMARY KEY,
  word_key TEXT NOT NULL,   -- 정규화 표제어(소문자)
  ko_gloss TEXT NOT NULL,   -- 한글 뜻
  note     TEXT,            -- 고어 설명(thee=you)
  -- 이후 확장: strongs_no, heb_gk_lemma, en_gloss
  UNIQUE(word_key)
);
