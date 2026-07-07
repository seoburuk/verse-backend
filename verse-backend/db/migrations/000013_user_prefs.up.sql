-- 테마/언어 서버 동기화, 닉네임 변경 레이트리밋을 위한 users 컬럼 추가.
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light';
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'ko';
ALTER TABLE users ADD COLUMN display_name_updated_at TIMESTAMPTZ;
