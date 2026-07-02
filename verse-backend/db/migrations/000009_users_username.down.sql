ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users DROP CONSTRAINT users_username_key;
ALTER TABLE users DROP COLUMN username;
