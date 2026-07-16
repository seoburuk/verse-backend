DROP TABLE IF EXISTS auth_codes;
DROP INDEX IF EXISTS users_verified_email_key;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
