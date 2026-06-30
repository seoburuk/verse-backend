ALTER TABLE users
  ALTER COLUMN email         SET NOT NULL,
  ALTER COLUMN display_name  SET NOT NULL,
  ALTER COLUMN password_hash SET NOT NULL;
