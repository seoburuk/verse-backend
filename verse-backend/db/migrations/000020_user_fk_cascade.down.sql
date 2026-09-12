ALTER TABLE progress       DROP CONSTRAINT progress_user_id_fkey,
                           ADD  CONSTRAINT progress_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE attempts       DROP CONSTRAINT attempts_user_id_fkey,
                           ADD  CONSTRAINT attempts_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE streaks        DROP CONSTRAINT streaks_user_id_fkey,
                           ADD  CONSTRAINT streaks_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE item_favorites DROP CONSTRAINT item_favorites_user_id_fkey,
                           ADD  CONSTRAINT item_favorites_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id);
