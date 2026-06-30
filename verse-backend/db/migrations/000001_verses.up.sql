-- 기획서 §6.2 + §5. 본문(정답지) + 세그먼트.
CREATE TABLE bible_verses (
  id      BIGSERIAL PRIMARY KEY,
  book    SMALLINT NOT NULL,
  chapter SMALLINT NOT NULL,
  verse   SMALLINT NOT NULL,
  text    TEXT     NOT NULL,
  UNIQUE(book, chapter, verse)
);

CREATE TABLE verse_segments (
  id            BIGSERIAL PRIMARY KEY,
  verse_id      BIGINT NOT NULL REFERENCES bible_verses(id),
  segment_label TEXT   NOT NULL,   -- 'a','b',... 분할 없으면 ''
  text          TEXT   NOT NULL,
  word_count    INT    NOT NULL,
  ord           INT    NOT NULL,
  UNIQUE(verse_id, segment_label)
);
