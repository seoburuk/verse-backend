ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = COALESCE(NULLIF(split_part(email, '@', 1), ''), 'user' || id) WHERE username IS NULL;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE users DROP COLUMN email;
