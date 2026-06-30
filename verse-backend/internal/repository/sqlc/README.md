# 이 폴더는 sqlc가 자동 생성한다 — 직접 수정 금지

`sqlc generate` 실행 시 `db/queries/*.sql`을 읽어 이곳에 타입 안전한 Go 코드를
생성한다(db.go, models.go, querier.go, *.sql.go).

손으로 고치면 다음 generate에서 전부 덮어쓰여 사라진다.
쿼리를 바꾸려면 `db/queries/`의 SQL을 고치고 다시 generate 할 것.
