# verse-backend

KJV 성경암송 앱의 백엔드. 순수 REST API(JSON)로, 클라이언트 종류(React 웹 /
Flutter 앱)를 모른다. 듀오링고처럼 하나의 API에 여러 클라이언트가 붙는 구조.

## 아키텍처
handler(HTTP) → service(도메인) → repository(sqlc) 의 단방향 3계층.
의존성은 안쪽(domain)으로만 흐른다. 자세한 의사결정은 `docs/adr/` 참고.

## 기술 스택
- 라우팅: chi (net/http 호환)
- DB: PostgreSQL + pgx + sqlc
- 인증: JWT(golang-jwt) + argon2id
- 마이그레이션: golang-migrate

## 시작하기
    make db          # postgres 기동
    make migrate     # 스키마 적용
    make sqlc        # SQL → Go 생성
    make load        # KJV 적재 + 31,102 검증
    make run         # API 실행

## 디렉토리
    cmd/api          진입점(조립만)
    internal/domain  순수 비즈니스 타입
    internal/handler HTTP 계층
    internal/service 도메인 로직(채점·진도·연속일) ★
    internal/repository  DB 접근(sqlc)
    db/migrations    golang-migrate 마이그레이션
    db/queries       sqlc 입력 SQL
    scripts/         Phase 0 데이터 파이프라인
    docs/adr/        의사결정 기록

## ★ 주의: 채점 규칙 미러링
internal/service/grading.go 의 규칙은 verse-web/lib/grading 과 1:1 일치해야 한다.
한쪽 변경 시 반드시 양쪽 동기화. 명세 단일 출처: docs/adr/0002.
