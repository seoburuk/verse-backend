# Pixel KJV

한국어 사용자를 위한 KJV 성경 암송 앱. Duolingo 방식으로 절을 보고 → 가리고 → 단어 타일을 탭해서 맞추는 챌린지 루프.

```
verse-backend/   Go REST API (포트 8080)
verse-web/       React 웹 클라이언트 (포트 5173)
files/           KJV 원본 데이터 + DB 파이프라인
```

---

## 빠른 시작

### 1. 백엔드

```bash
cd verse-backend
cp .env.example .env      # 값은 기본값 그대로 사용 가능

make db                   # PostgreSQL 컨테이너 기동 (Docker 필요)
make migrate              # 스키마 적용
make load                 # KJV 31,102절 적재 (최초 1회, 약 10초)
make seed                 # 코스 샘플 데이터 적재 (멱등)
```

서버 실행:
```bash
export $(grep -v '^#' .env | xargs) && go run ./cmd/api
# → http://localhost:8080
```

헬스체크:
```bash
curl http://localhost:8080/healthz
# {"status":"ok","db":"ok",...}
```

### 2. 프론트엔드

```bash
cd verse-web
npm install
npm run dev
# → http://localhost:5173
```

`/v1/*` 요청은 Vite 프록시가 자동으로 `:8080`으로 전달한다.

---

## 아키텍처

```
브라우저 (React)
    │  /v1/*  (Vite 프록시 → :8080)
    ▼
Go API (chi 라우터)
    │
    ├── handler   (HTTP 계층)
    ├── service   (도메인 로직 — 채점·진도·스트릭)
    └── repository (sqlc → PostgreSQL)
```

멀티 클라이언트 구조: 동일한 REST API에 React 웹과 Flutter 앱(예정)이 각각 붙는다.

---

## API 엔드포인트

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/healthz` | — | DB 포함 헬스체크 |
| POST | `/v1/auth/signup` | — | 회원가입 → JWT 발급 |
| POST | `/v1/auth/login` | — | 로그인 → JWT 발급 |
| GET | `/v1/courses` | — | 코스 목록 |
| GET | `/v1/courses/{slug}` | — | 코스 상세 + 절 목록 |
| POST | `/v1/attempts` | JWT | 암송 시도 제출 + 서버 재채점 |

---

## 채점 규칙 (★ 가장 중요한 계약)

`verse-backend/internal/service/grading.go` ↔ `verse-web/src/grading/` 는 **1:1로 동일**해야 한다.

**정규화 (`normalize`)**
1. 소문자화
2. `[^a-z0-9]+` → 공백으로 치환
3. trim → 공백 분리

**등급 (`gradeRecall`)** — LCS(최장공통부분수열) 기반
- LCS 길이 / 정답 토큰 수 ≥ 0.75 → `green`
- ≥ 0.50 → `yellow`
- 미만 → `red`

흐름: 클라이언트가 즉시 채점(즉각 피드백) → 시도 제출 시 서버가 재채점해 진도에 기록(무결성 확보). 자세한 근거: [`verse-backend/docs/adr/0002-client-grade-server-verify.md`](verse-backend/docs/adr/0002-client-grade-server-verify.md)

---

## 사용자 플로우 (MVP)

```
/login
  회원가입 또는 로그인
      ↓
/courses
  코스 목록 ("Foundations" 등)
      ↓
/courses/:slug
  절 목록 + 주제
      ↓
/memorize/:itemId
  [학습] 절 읽기
      ↓
  [암송] 타일 탭으로 절 재구성 + 라이브 색 등급
      ↓
  [제출] POST /v1/attempts → 서버 등급 확정
      ↓
  다시 시도 | 다음 절
```

---

## 개발 환경

| 항목 | 버전 |
|------|------|
| Go | 1.25+ |
| Node | 20+ |
| Docker | 필요 (PostgreSQL 컨테이너) |
| PostgreSQL | 16 (컨테이너) |

환경 변수 (`.env.example` 참고):

```
HTTP_PORT=8080
DATABASE_URL=postgres://pixelkjv:pixelkjv_dev_pw@localhost:5432/pixelkjv?sslmode=disable
JWT_SECRET=change-me-in-production
JWT_ACCESS_TTL=15          # 토큰 유효시간(분)
KJV_DATA_DIR=../files/data/kjv
```

---

## 범위 밖 (후속)

- 타자 입력 모드 (`mode: "type"`)
- 픽셀/8비트 비주얼 테마, Lamb 마스코트
- 진도·스트릭 표시 화면
- JWT 리프레시 토큰
- 검색 / 랜덤 절
- 단어 사전 툴팁 (word_glossary)
- Flutter 앱
