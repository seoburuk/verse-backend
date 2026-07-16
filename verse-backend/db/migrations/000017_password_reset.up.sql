-- 비밀번호 찾기/변경 + 복구 이메일 인증.
-- 자체가입 계정은 이메일이 없다. 설정에서 이메일을 등록하고 인증해야
-- 비밀번호 재설정에 그 이메일을 쓸 수 있다(email_verified_at로 판별).
-- 인증된 이메일만 유니크 — 미인증 상태(구글 등)는 중복 가능해야 하므로
-- 부분 유니크 인덱스로 둔다.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX users_verified_email_key
  ON users (lower(email))
  WHERE email_verified_at IS NOT NULL;

-- 이메일 인증/비밀번호 재설정에 쓰는 1회용 6자리 코드.
-- 코드 원문은 저장하지 않고 sha256 해시만 저장한다(유출되어도 재사용 불가).
CREATE TABLE auth_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT   NOT NULL, -- 'verify_email' | 'reset_password'
  code_hash  TEXT   NOT NULL,
  email      TEXT   NOT NULL,
  attempts   INT    NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_codes_user_purpose_idx ON auth_codes (user_id, purpose);
