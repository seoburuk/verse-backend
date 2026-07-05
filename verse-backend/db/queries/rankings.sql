-- name: GetRankingRaw :many
-- 유저별 원시 집계(streak, 외운 절 수, 받아쓰기 성공 수). 점수·순위 계산은 서비스에서.
-- 활동이 있는 유저(외운 절 또는 받아쓰기 성공이 하나라도 있는)만 반환한다.
WITH cleared AS (
  SELECT user_id, COUNT(*) AS verses
  FROM progress
  WHERE cleared
  GROUP BY user_id
),
dict AS (
  SELECT user_id, COUNT(*) AS pts
  FROM attempts
  WHERE mode = 'dictation' AND server_grade = 'green'
  GROUP BY user_id
)
SELECT u.id AS user_id, COALESCE(u.display_name, u.username) AS username,
       COALESCE(s.current_len, 0)::int AS streak,
       COALESCE(cl.verses, 0)::int     AS cleared_verses,
       COALESCE(d.pts, 0)::int          AS dictation_pts
FROM users u
LEFT JOIN streaks s   ON s.user_id  = u.id
LEFT JOIN cleared cl  ON cl.user_id = u.id
LEFT JOIN dict    d   ON d.user_id  = u.id
WHERE COALESCE(cl.verses, 0) > 0 OR COALESCE(d.pts, 0) > 0;
