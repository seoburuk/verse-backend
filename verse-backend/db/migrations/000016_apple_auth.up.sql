-- 애플 로그인. 구글과 동일하게 비밀번호 없이 apple_sub로 식별한다.
-- (000015 참고: password_hash는 빈 문자열 저장 → 비밀번호 로그인 불가)
ALTER TABLE users ADD COLUMN apple_sub TEXT;
ALTER TABLE users ADD CONSTRAINT users_apple_sub_key UNIQUE (apple_sub);
