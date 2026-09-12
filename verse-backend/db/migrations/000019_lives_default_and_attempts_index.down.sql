DROP INDEX attempts_user_mode_idx;
DROP INDEX attempts_user_created_idx;
ALTER TABLE users ALTER COLUMN lives SET DEFAULT 10;
