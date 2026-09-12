-- 목숨 최대치가 10 → 5로 줄었는데(service.MaxLives) DB 기본값과 기존 행이
-- 10에 머물러 있었다. 서버는 읽는 시점에 clamp하지만 저장값 자체를 정리한다.
ALTER TABLE users ALTER COLUMN lives SET DEFAULT 5;
UPDATE users SET lives = 5 WHERE lives > 5;

-- 이어가기(사용자별 최근 시도 1건)와 통독 조회가 attempts 전체를 훑고 있었다.
CREATE INDEX attempts_user_created_idx ON attempts (user_id, created_at DESC);
CREATE INDEX attempts_user_mode_idx    ON attempts (user_id, mode);
