CREATE TABLE item_favorites (
  user_id        BIGINT NOT NULL REFERENCES users(id),
  course_item_id BIGINT NOT NULL REFERENCES course_items(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_item_id)
);
