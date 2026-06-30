-- 000001_init_schema.up.sql
-- 픽셀 KJV 암송 앱 초기 스키마.
-- 설계 근거는 기획서 §6 참조. 핵심 원칙:
--   1) bible_verses 가 "정답지"(single source of truth).
--   2) 진도는 코스 아이템 단위만 (절 단위 숙련도 모델링 안 함).
--   3) 점수 대신 색 등급(grade)만 저장 (점수 비중 낮춤 결정의 반영).

-- ── 성경 본문: 31,102절의 정답지 ──────────────────────────────
CREATE TABLE bible_verses (
    id      BIGSERIAL PRIMARY KEY,
    book    SMALLINT NOT NULL,   -- 1..66 (창세기=1 ... 요한계시록=66)
    chapter SMALLINT NOT NULL,
    verse   SMALLINT NOT NULL,
    text    TEXT     NOT NULL,
    UNIQUE (book, chapter, verse)
);
-- 장 단위 조회(하드모드: GET /v1/verses/{book}/{ch})를 위한 인덱스.
-- UNIQUE(book,chapter,verse)가 (book,chapter) 접두 인덱스를 이미 제공하므로
-- 별도 인덱스는 불필요 — 복합 UNIQUE의 좌측 접두사가 그대로 인덱스로 쓰인다.

-- ── 긴 절 분할 (§5): 적재 시점에 미리 계산해 저장 ─────────────
CREATE TABLE verse_segments (
    id            BIGSERIAL PRIMARY KEY,
    verse_id      BIGINT NOT NULL REFERENCES bible_verses(id) ON DELETE CASCADE,
    segment_label TEXT   NOT NULL,   -- 'a','b',... (분할 없으면 '')
    text          TEXT   NOT NULL,
    word_count    INT    NOT NULL,
    ord           INT    NOT NULL,
    UNIQUE (verse_id, segment_label)
);

-- ── 단어 사전 (앱에 내장 배포할 빌드 소스. 서버 비용 절감 §7) ──
CREATE TABLE word_glossary (
    id       BIGSERIAL PRIMARY KEY,
    word_key TEXT NOT NULL,   -- 정규화 표제어(소문자, 구두점 제거: §4.1)
    ko_gloss TEXT NOT NULL,   -- 한글 뜻
    note     TEXT,            -- 고어 설명 (thee=you 등)
    -- 이후 확장 컬럼: strongs_no, heb_gk_lemma, en_gloss
    UNIQUE (word_key)
);

-- ── 코스 ──────────────────────────────────────────────────────
CREATE TABLE courses (
    id    BIGSERIAL PRIMARY KEY,
    slug  TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    theme TEXT,
    ord   INT  NOT NULL
);

CREATE TABLE course_items (
    id        BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    verse_id  BIGINT NOT NULL REFERENCES bible_verses(id),
    ord       INT    NOT NULL,
    topic     TEXT,
    UNIQUE (course_id, verse_id)
);

-- ── 사용자 ────────────────────────────────────────────────────
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT UNIQUE,
    display_name  TEXT,
    password_hash TEXT,           -- argon2id (§9)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 진도: 코스 아이템 단위만 (절 단위 숙련도 없음) ─────────────
CREATE TABLE progress (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_item_id BIGINT NOT NULL REFERENCES course_items(id),
    grade          TEXT   NOT NULL DEFAULT 'none',  -- 'green'|'yellow'|'red'|'none'
    cleared        BOOLEAN NOT NULL DEFAULT false,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, course_item_id),
    CONSTRAINT progress_grade_chk CHECK (grade IN ('green','yellow','red','none'))
);

-- ── 시도 기록: 클라 채점 vs 서버 재채점 (§3 무결성 검증) ───────
CREATE TABLE attempts (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_item_id BIGINT NOT NULL REFERENCES course_items(id),
    mode           TEXT   NOT NULL,   -- 'drag'|'type'|'hard'
    client_grade   TEXT   NOT NULL,
    server_grade   TEXT   NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attempts_mode_chk CHECK (mode IN ('drag','type','hard'))
);
CREATE INDEX idx_attempts_user_created ON attempts (user_id, created_at DESC);

-- ── 연속일 ────────────────────────────────────────────────────
CREATE TABLE streaks (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_len INT  NOT NULL DEFAULT 0,
    longest_len INT  NOT NULL DEFAULT 0,
    last_day    DATE
);
