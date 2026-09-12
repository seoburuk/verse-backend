-- 계정 삭제 시 자식 테이블을 코드에서 일일이 지우고 있었다(pg_user.go DeleteUser).
-- 테이블이 늘어날 때 목록에서 빠지면 삭제가 FK 위반으로 실패하므로 DB에 맡긴다.
ALTER TABLE progress       DROP CONSTRAINT progress_user_id_fkey,
                           ADD  CONSTRAINT progress_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE attempts       DROP CONSTRAINT attempts_user_id_fkey,
                           ADD  CONSTRAINT attempts_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE streaks        DROP CONSTRAINT streaks_user_id_fkey,
                           ADD  CONSTRAINT streaks_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE item_favorites DROP CONSTRAINT item_favorites_user_id_fkey,
                           ADD  CONSTRAINT item_favorites_user_id_fkey
                           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
