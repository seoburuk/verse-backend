# 픽셀바이블 (Pixel KJV) 기술문서 & 계획서

> 작성일: 2026-07-02. 현재 코드 상태(migrations 000001~000010, verse-backend / verse-web 기준)를 조사해 작성. 코드가 바뀌면 이 문서도 갱신 필요.

---

## 1. 개요

**픽셀바이블**은 한국어 사용자를 위한 KJV 영어성경 암송 앱이다. 듀오링고식 학습 흐름(보기 → 가리기 → 채우기)을 레트로 픽셀 아트 톤으로 구현한다.

**제품 방향의 핵심 원칙**
- 재미가 최우선이다. 오락 요소(목숨, 스트릭, 귀여운 도트 캐릭터)가 학습 도구성보다 앞선다.
- 암송 방식은 드래그(타일 배치)와 타자(직접 입력) 두 가지를 모두 지원하되 **채점 기준은 하나**로 통일한다.
- 서버는 최종 신뢰 소스다. 클라이언트가 먼저 채점해 즉각 피드백을 주지만, 서버가 동일 로직으로 재검증한 결과만 기록에 반영된다.

---

## 2. 기술 스택과 선정 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| 백엔드 | Go + chi | 표준 `net/http`와 100% 호환되는 얇은 라우터. 프레임워크의 "마법" 없이 미들웨어 체인을 명시적으로 조립할 수 있어 요청 흐름을 추적하기 쉽다. |
| DB 접근 | sqlc (ORM 미사용) | [ADR 0001] SQL을 코드로 숨기는 ORM은 N+1 등 성능 함정을 감춘다. sqlc는 SQL을 그대로 작성하고 타입 안전한 Go 코드를 생성해, 쿼리 성능이 항상 눈에 보이는 상태를 유지한다. 대신 동적 WHERE 절 같은 가변 쿼리는 손으로 분기 처리해야 하는 트레이드오프가 있다. |
| DB | PostgreSQL (운영) / SQLite (일부 로컬·오프라인 캐시 용도 검토) | 관계형 무결성(UNIQUE 제약, FK)이 진도/시도 기록에 중요. |
| 프론트 | Next.js (App Router) | SEO가 목표이므로 React CSR보다 SSR/SSG가 유리. 구버전 Vite+React 클라이언트는 폐기하고 Next.js로 통일했다. |
| 인증 | 자체 JWT + argon2id | 이메일 대신 아이디(username) 방식 채택. 앱이 저장하는 개인정보가 거의 없어(진도 데이터뿐) 소셜로그인/이메일 인증 인프라의 비용 대비 이점이 작다고 판단. |
| 채점 로직 | LCS(최장 공통 부분 수열) 기반 | 정확 일치가 아니라 유사도로 채점해야 오타·어순 실수에도 관대한 피드백이 가능. 서버·클라이언트 양쪽에 동일 알고리즘을 이중 구현한다. |

---

## 3. 아키텍처 결정 (ADR 요약)

- **ADR 0001 — sqlc over ORM**: SQL 가시성과 타입 안정성을 동시에 얻기 위해 ORM 대신 sqlc 채택. 동적 쿼리는 약점이므로 필요 시 수작업.
- **ADR 0002 — 클라이언트 선채점, 서버 재검증**: 화면에 원문 텍스트가 어차피 노출되므로 서버 단독 채점의 보안 이점은 크지 않음. 클라이언트가 즉시 채점해 UX 속도를 확보하고, 서버가 같은 로직으로 재검증한 결과만 진도에 반영해 기록 무결성을 지킨다. **리스크: 두 구현이 어긋나면 신뢰가 깨진다** — `verse-backend/internal/service/grading.go`와 `verse-web/lib/grading/`이 항상 동기화되어야 함.
- **ADR 0003 — 오프라인 양방향 동기화 없음**: 충돌 해결(conflict resolution)은 복잡도가 크므로 범위에서 제외. 절 텍스트는 읽기 전용 캐시만 허용하고, 쓰기(암송 기록)는 재접속 시에만 반영한다.

---

## 4. 현재 구현 완료 (as of 000010 migration)

### 4.1 DB 스키마

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `bible_verses` | book, chapter, verse, text | KJV 31,102절, UNIQUE(book,chapter,verse) |
| `verse_segments` | segment_label, text, word_count, ord | 긴 절을 a/b로 분리하는 용도. **테이블만 존재, 적재 스크립트 미구현** |
| `courses` | slug, title, theme, ord, hidden, category(topic\|warmup\|messiah) | 코스(주제별/워밍업/예언) |
| `course_sections` | course_id, title, ord | 코스 내 섹션 구분 |
| `course_items` | course_id, verse_id, ord, topic, section_id | UNIQUE(course_id, verse_id) |
| `users` | username, display_name, password_hash(argon2id), lives, lives_updated_at | 이메일→아이디 전환 완료(migration 009) |
| `progress` | user_id, course_item_id, grade, cleared | UNIQUE(user_id, course_item_id) |
| `attempts` | user_id, course_item_id, mode(drag\|type\|hard), client_grade, server_grade | 원시 시도 로그 |
| `streaks` | user_id, current_len, longest_len, last_day | 연속 학습일 |
| `word_glossary` | word_key, ko_gloss, note | 단어 사전. **테이블만 존재, 시드 스크립트 미구현** |

### 4.2 API 엔드포인트 (`/v1/*`, Next.js rewrites로 프록시)

**공개 (IP당 분당 10회 레이트리밋 적용 구간 포함)**
- `POST /v1/auth/signup`, `POST /v1/auth/login`
- `GET /v1/courses` — 비-hidden 코스 목록
- `GET /v1/courses/{slug}` — 코스 상세 (섹션형/평면형 모두 지원)
- `GET /v1/sections/{id}` — 섹션 상세

**인증 필요 (JWT)**
- `POST /v1/attempts` (분당 30회 제한) — 시도 제출, 목숨 0이면 403
- `GET /v1/me/progress`, `GET /v1/me/lives`, `GET /v1/me/stats`
- `DELETE /v1/me`

**기타**: `GET /healthz` — DB ping 포함 헬스체크

### 4.3 서비스 로직

- **채점(grading.go)**: 소문자화 → 특수문자 제거 → 토큰화 → LCS 길이/정답 토큰 수 비율로 green(≥0.75)/yellow(≥0.50)/red 판정.
- **목숨(lives_service.go)**: 최대 10개, 20분당 1개 자동 회복. 크론 없이 **조회 시점에 경과 시간으로 계산**(SettleLives, 순수 함수).
- **스트릭(streak_service.go)**: 오늘==마지막날 → 유지, +1일 → 증가, 그 외 → 1로 리셋. 현재 UTC 기준(KST 전환은 미정).
- **시도 처리(attempt_service.go)**: 목숨 확인 → 서버 재채점 → attempts insert → progress upsert → streak 갱신. **현재 트랜잭션으로 묶여 있지 않음** (순차 실행).

### 4.4 프론트엔드 (verse-web)

- 라우트: `/courses`, `/courses/[slug]`, `/courses/[slug]/sections/[id]`, `.../memorize/[itemId]`, `.../complete`, `/dashboard`, `/settings`, `/login`
- 암송 UI: `MemorizeView`(단계 전이) + `DragTiles`(드래그 채점 밑줄) + `TypeScaffold`(타자 모드, 첫 글자 힌트 + 단어별 밑줄, 정답 시 초록)
- 다크모드 토글: UI/CSS 변수 존재 (설정 페이지)
- 언어 스토어: 존재하나 **번역 미적용** — 문자열은 아직 한글 고정

---

## 5. 미완성 / TODO (설계는 됐으나 코드 없음, 또는 스텁)

| 항목 | Phase | 상태 | 관련 파일 |
|---|---|---|---|
| 단어 사전(한글 뜻 팝업) | D | 테이블만 존재, 시드 스크립트 비어있음 | `scripts/seed_glossary/`, `word_glossary` |
| 절 자동 분리(1-a/1-b) | D | 테이블만 존재, 스크립트 비어있음 | `scripts/split_segments/`, `verse_segments` |
| 다국어(한/영) | 후순위 | 스토어만 존재, 실제 번역 없음 | `lib/store/languageStore.ts` — next-intl 도입 예정으로 코드 주석에 언급됨 |
| 오프라인 캐시 | D | ADR만 승인, 구현 없음 | — |
| 하드모드(안 보고 챕터 단위 도전) | 후순위 | 미구현 | — |
| 구글 로그인 | 후순위 | 미구현, 설계도 없음 | — |
| 어드민 대시보드(MAU 등) | 후순위 | 미구현 | — |
| 책갈피/즐겨찾기 | B | 미구현 | — |
| 광고 제거/유료 구독 | C·D | 미구현 | — |
| 장별 테마 변경 | 후순위 | 미구현 (courses.theme 컬럼만 존재) | — |
| 음성(TTS) | 후순위 | 미구현, 방향 미정 | — |
| 도트 캐릭터(다윗 춤) 애니메이션 | A | 미구현 | — |
| 워밍업/예언 완료 시 구약·신약 해당 권 진도 동기화 | A | **미구현 — 현재 course_item 단위로만 progress가 쌓여 코스 간 연동 없음** | `progress` 테이블 구조상 크로스 코스 집계 로직 필요 |
| 섹션 완료 후 "뒤로가기 시 워밍업/예언으로 튐" UX 버그 | A | 원인 확인 필요 | 프론트 네비게이션 스택 설계 재검토 |
| 대시보드에서 진행도 0인 코스 숨김 + 진도순 정렬 | A | 미구현 | `/v1/me/stats`, dashboard 페이지 |
| attempt_service 트랜잭션 처리 | A | 미구현(순차 실행 중) | `internal/service/attempt_service.go` |

---

## 6. 로드맵 (지표 기반, [STRATEGY.md](STRATEGY.md) 기준)

포지셔닝: **캐주얼 게임** (교회/홈스쿨 도구 아님). 각 Phase는 다음 지표를 달성해야 다음 단계로 넘어간다.

### Phase A — "게임답게" (지금~) · 목표: D7 리텐션 20%
- 수집 메타: 암송 성공 절 = 픽셀 카드, 장(chapter) 완성 시 일러스트 완성
- 도트 다윗 캐릭터 리액션 (정답 춤 / 오답 시무룩)
- 효과음·타일 애니메이션·콤보 연출 (juice)
- 완료 화면 디자인 개선, 섹션 뒤로가기 네비게이션 버그 수정
- 코스 간 진도 동기화 (워밍업 암송 → 해당 권 진도 반영)

### Phase B — 바이럴 장치 · 목표: 오가닉 유입 발생
- 오늘의 절 (Daily Verse) + 🟩🟨🟥 공유 결과 카드 (Wordle 모델)
- 스트릭 프리즈 + 스트릭 위험 시 푸시 알림 (Flutter 앱)
- 최근 코스 이어가기, 즐겨찾기/책갈피

### Phase C — 수익화 1차 · 목표: 첫 매출
- 보상형 광고: 목숨 회복 훅 (기존 lives 시스템 활용), 스트릭 프리즈 획득
- 배너/전면 광고는 지양 (신앙 앱 반감)

### Phase D — 확장 · 목표: MAU 1만, 구독 전환 2~3%
- 개역한글판(1961) 한국어 암송 모드 (⚠️ 저작권 만료 법적 확인 선행) — KJV는 "영어 도전 모드"로 재포지셔닝
- 구독 도입 (광고 제거 + 목숨 무한 + 단어사전 + 오프라인), 캐릭터 스킨 IAP
- 성경 66권 콘텐츠 확장 (권별 코스, 구약/신약 분리), 절 자동 분리(split_segments), 단어 사전(seed_glossary)
- 주간 리그/친구 대결 (XP 리더보드)

### 후순위 (리텐션·수익에 직결되지 않아 강등)
- 구글 로그인, 어드민 대시보드, 한/영 i18n(영어권 진출), 하드모드, 장별 테마 변경, 음성(TTS)

---

## 7. 보안 메모

- 이메일 대신 아이디 방식: 저장하는 개인정보가 진도 데이터 외 거의 없어 채택. 비밀번호는 argon2id(64MB, time=1, 4 threads)로 해싱.
- JWT 액세스 토큰 TTL 기본 15분 (`JWT_ACCESS_TTL`).
- 로그인/가입 엔드포인트에 IP당 분당 10회 레이트리밋 — 브루트포스 방어.
- 시도 제출은 클라이언트 채점을 신뢰하지 않고 서버가 재채점(ADR 0002) — 클라이언트 조작으로 진도를 조작할 수 없음.
- `DELETE /v1/me` 존재 — 계정 삭제 시 연관 데이터(progress, attempts, streaks) 삭제 정책은 코드 재확인 필요(문서화 시점에 미검증).

---

## 8. 환경 설정

`verse-backend/internal/config`: `HTTP_PORT`(기본 8080), `DATABASE_URL`(필수), `JWT_SECRET`(필수), `APP_ENV`, `JWT_ACCESS_TTL`(기본 15분), `CORS_ORIGIN`(기본 `http://localhost:3000`).
