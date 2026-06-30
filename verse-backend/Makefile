# 자주 쓰는 명령을 한 곳에. 신규 합류자가 README 없이도 흐름을 파악하게 한다.
.PHONY: db migrate migrate-down migrate-version sqlc run test load seed

# .env가 있으면 자동으로 읽어 모든 타겟에 환경변수로 넘긴다.
# (cp .env.example .env 후 값만 바꾸면 별도 export 없이 make 사용 가능)
ifneq (,$(wildcard .env))
include .env
export
endif

db:        ## postgres 컨테이너 기동
	docker compose up -d db

migrate:   ## golang-migrate 마이그레이션 적용
	go run ./cmd/migrate up

migrate-down: ## golang-migrate 마이그레이션 1단계 롤백
	go run ./cmd/migrate down

migrate-version: ## 현재 마이그레이션 버전 확인
	go run ./cmd/migrate version

sqlc:      ## SQL → 타입 안전 Go 생성
	sqlc generate

run:       ## API 서버 실행
	go run ./cmd/api

test:      ## 전체 테스트
	go test ./...

load:      ## Phase 0 KJV 적재 + 31102 검증
	go run ./scripts/load_kjv

seed:      ## 개발용 코스 시드 데이터 적재 (멱등)
	go run ./scripts/seed_courses
