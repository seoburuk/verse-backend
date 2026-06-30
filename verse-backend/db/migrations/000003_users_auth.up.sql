-- 기획서 §6.2. 사용자.
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE,
  display_name  TEXT,
  password_hash TEXT,        -- argon2id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
