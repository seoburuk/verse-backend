-- 구글 로그인. 구글 계정은 비밀번호 없이 google_sub로 식별한다.
-- password_hash는 NOT NULL을 유지하고 구글 사용자는 빈 문자열('')을 저장한다
-- (verifyPassword가 빈 해시를 항상 거부하므로 비밀번호 로그인이 불가능).
ALTER TABLE users ADD COLUMN email      TEXT;
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);
