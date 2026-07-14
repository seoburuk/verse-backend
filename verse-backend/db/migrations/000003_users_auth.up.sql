-- 기획서 §6.2. 사용자.
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,        -- argon2id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
