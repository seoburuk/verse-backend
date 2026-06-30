-- 기획서 §6.2. 진도(코스아이템 단위) + 시도 + 연속일.
CREATE TABLE progress (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  course_item_id BIGINT NOT NULL REFERENCES course_items(id),
  grade          TEXT   NOT NULL DEFAULT 'none',  -- green|yellow|red|none
  cleared        BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_item_id)
);

CREATE TABLE attempts (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  course_item_id BIGINT NOT NULL REFERENCES course_items(id),
  mode           TEXT NOT NULL,          -- drag|type|hard
  client_grade   TEXT NOT NULL,          -- 클라 색 등급
  server_grade   TEXT NOT NULL,          -- 서버 재채점 등급
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE streaks (
  user_id     BIGINT PRIMARY KEY REFERENCES users(id),
  current_len INT  NOT NULL DEFAULT 0,
  longest_len INT  NOT NULL DEFAULT 0,
  last_day    DATE
);
