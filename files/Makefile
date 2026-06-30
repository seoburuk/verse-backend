# Makefile
# 한 줄 명령으로 전체 데이터 환경을 재현하는 게 목표.
#   make db        : Postgres 컨테이너 기동 (health 통과까지 대기)
#   make migrate   : golang-migrate 로 스키마 적용
#   make load-kjv  : KJV 66권 JSON -> bible_verses 적재 + 31,102 검증
#   make verify    : 적재 카운트 재검증
#   make reset     : 볼륨까지 삭제 후 처음부터 (주의: 데이터 소멸)

include .env
export

MIGRATE_IMAGE = migrate/migrate:v4.17.1
MIGRATIONS_DIR = $(CURDIR)/db/migrations

.PHONY: db wait migrate migrate-down load-kjv verify reset psql

## DB 컨테이너 기동 + health 통과까지 블로킹
db:
	docker compose up -d
	@$(MAKE) wait

## health 통과 대기: "실행됨"이 아니라 "연결 가능"이 될 때까지.
wait:
	@echo "waiting for postgres to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' pixelkjv-db 2>/dev/null)" = "healthy" ]; do \
		sleep 1; printf '.'; \
	done; echo " ready"

## 마이그레이션 적용. migrate CLI 를 도커로 실행해 로컬 설치 의존성을 없앤다.
## host.docker.internal 로 컨테이너에서 호스트의 5432 에 접속.
migrate:
	docker run --rm -v $(MIGRATIONS_DIR):/migrations --network host $(MIGRATE_IMAGE) \
		-path=/migrations \
		-database "$(DATABASE_URL)" up

migrate-down:
	docker run --rm -v $(MIGRATIONS_DIR):/migrations --network host $(MIGRATE_IMAGE) \
		-path=/migrations \
		-database "$(DATABASE_URL)" down 1

## KJV 적재 (psycopg 없이 psql \copy 로 — 의존성 최소화)
load-kjv:
	python3 scripts/build_verses_csv.py
	docker compose exec -T db psql -U $(DB_USER) -d $(DB_NAME) -c \
		"TRUNCATE bible_verses RESTART IDENTITY CASCADE;"
	docker compose exec -T db psql -U $(DB_USER) -d $(DB_NAME) -c \
		"\copy bible_verses(book,chapter,verse,text) FROM '/dev/stdin' WITH (FORMAT csv, HEADER true)" \
		< data/verses.csv
	@$(MAKE) verify

## 적재 후 카운트 검증 (기대: 31102)
verify:
	@echo "verifying verse count..."
	@docker compose exec -T db psql -U $(DB_USER) -d $(DB_NAME) -tAc \
		"SELECT count(*) FROM bible_verses;" | \
		awk '{ if ($$1==31102) print "OK: "$$1" verses"; else { print "MISMATCH: "$$1; exit 1 } }'

psql:
	docker compose exec db psql -U $(DB_USER) -d $(DB_NAME)

## 완전 초기화 (볼륨 삭제 -> 데이터 소멸). 명시적으로만.
reset:
	docker compose down -v
	@$(MAKE) db
	@$(MAKE) migrate
