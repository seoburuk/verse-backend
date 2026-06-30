# Pixel KJV — 데이터 계층 (Phase 0)

KJV 성경암송 앱의 백엔드 데이터 기반. 이 디렉토리는 **Postgres 기동 + 스키마
마이그레이션 + KJV 31,102절 적재**까지를 한 줄 명령들로 재현 가능하게 만든다.

## 사전 요구
- Docker / Docker Compose
- GNU Make
- (선택) Python 3.10+ — 적재 CSV 빌드용

## 빠른 시작
```bash
cp .env.example .env          # 필요시 자격증명 수정
make db                       # Postgres 컨테이너 기동 (health 통과까지 대기)
make migrate                  # 스키마 적용 (golang-migrate)
make load-kjv                 # KJV 66권 적재 + 31,102 자동 검증
```
`make load-kjv` 가 끝에 `OK: 31102 verses` 를 출력하면 성공.

전체 초기화(볼륨 삭제 포함):
```bash
make reset
```

## 디렉토리
```
db/migrations/   golang-migrate 마이그레이션 (up/down 쌍)
scripts/         KJV JSON -> CSV 빌드 + 사전 검증
data/kjv/        KJV 66권 원본 JSON (정답지 소스)
docker-compose.yml
Makefile
```

## 의사결정 기록 (ADR 요약)

**KJV 데이터 소스 — aruljohn/Bible-kjv.**
퍼블릭 도메인 1769 KJV, 외경 미포함, `{book,chapters:[{chapter,verses}]}` 구조.
외경이 섞인 KJVA 류는 절 카운트가 표준(31,102)과 어긋나므로 배제했다.
적재 전 `build_verses_csv.py` 가 총 31,102 / 구약 23,145 / 신약 7,957 / 1,189장을
자체 검증하고, 하나라도 어긋나면 CSV 를 쓰지 않고 실패한다(fail fast).

**적재 방식 — CSV + psql \copy (행별 INSERT 아님).**
드라이버 의존성을 없애고, 31,102행을 단일 스트림으로 넣어 빠르며, 중간 CSV 가
디버깅 산출물로 남는다.

**book 은 1..66 정수.** 스키마 `book SMALLINT` 와 일치. 정경 순서가 단일 표준.

**id — BIGSERIAL (기획서 원안).**
대안으로 SQL 표준인 `GENERATED ALWAYS AS IDENTITY` 가 있다(id 직접 삽입을 막아
무결성↑). 기획서가 BIGSERIAL 로 명시해 원안을 유지했으나, 운영 전 전환 검토 여지 있음.

**healthcheck — 필수.**
컨테이너 "실행됨" ≠ "연결 가능". `make db` 는 `pg_isready` health 가 통과할
때까지 블로킹하므로 `make migrate` 가 connection refused 없이 이어진다.
