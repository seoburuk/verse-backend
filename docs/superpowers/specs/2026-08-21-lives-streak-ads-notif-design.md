# 목숨 축소·오프라인 배너 제거·알림/스트릭 개선·광고 조기 노출 — 설계

날짜: 2026-08-21

## 배경

네 가지 독립적인 개선을 한 번에 묶어 진행한다. 서로 코드 영역이 겹치지 않으므로 하나의 스펙으로 다루되, 구현 계획은 항목별로 순서를 나눈다.

1. 목숨 시스템: 최대치·리필 주기 축소
2. Today 화면의 동기화 상태 배너 제거
3. 리마인더 알림: 문구 다양화 + 타이밍/빈도 조정
4. 스트릭: 서버 로컬 데이 정합 + 시각 강화
5. 통독 전면광고: 첫 장 스킵 완화(절충안) + 간격 단축

## 1. 목숨: 최대 5개 / 30분당 1개 리필

### 현재
- `verse-flutter/lib/core/db/lives_streak_repository.dart`: `maxLives = 10`, `livesRefillInterval = Duration(minutes: 20)`. 클라이언트가 로컬로 정산.
- `verse-backend/internal/service/lives_service.go`: 서버가 동일 정책을 별도로 구현(동기화 시 서버 값이 최종 소스).

### 변경
- 클라이언트: `maxLives` → `5`, `livesRefillInterval` → `Duration(minutes: 30)`.
- 서버: `lives_service.go`의 동일 상수(최대치·리필 주기)를 동일하게 5 / 30분으로 변경. **클라이언트만 바꾸면 로그인 사용자가 동기화 시 서버값(구 10)으로 되돌아가므로 반드시 함께 변경한다.**
- 기존에 6~10개를 보유한 사용자는 다음 정산(`_settled()` 호출 또는 서버 SettleLives) 시 `clamp(0, 5)`로 자연스럽게 5로 깎인다. 별도 마이그레이션이나 보상 로직 없음 — 확인 완료(사용자 승인).
- 보상형 광고 시청 시 풀충전(`addLife()` → `maxLives`) 로직은 값 변경 외 수정 없음(5로 자동 반영).

### 영향받지 않는 것
- 목숨 소모/거부 로직(`consume`, `ErrNoLives` 분기), 연습 모드(받아쓰기·통독)가 목숨과 무관한 점은 그대로.

## 2. 오프라인/로그인필요 배너 제거

### 현재
- `verse-flutter/lib/features/today/today_screen.dart`의 `_SyncBanner` 위젯이 `SyncOutcome.offline` → "오프라인 상태예요", `SyncOutcome.unauthorized` → "동기화하려면 로그인이 필요해요"를 상단에 표시.

### 변경
- `_SyncBanner` 위젯과 호출부를 today_screen.dart에서 완전히 제거(offline·unauthorized 둘 다, 사용자 확정: "배너 전체 제거").
- `SyncOutcome` enum과 그걸 반환하는 `sync_service.dart`/`session_sync_coordinator.dart` 로직은 그대로 둔다 — 재시도·에러 처리에 계속 쓰이므로 표시만 제거.
- l10n 문자열 `commonOffline`, `syncLoginRequired`는 이 변경으로 미사용이 되면 `.arb` 4개 파일 및 생성된 `app_localizations*.dart`에서 제거(변경이 만든 고아이므로 정리 대상).
  - `syncLoginRequired`는 다른 화면에서도 쓰일 수 있으니 제거 전에 today_screen.dart 외 참조 여부를 재확인한다.

## 3. 알림: 문구 다양화 + 타이밍/빈도 조정

### 현재
- `verse-flutter/lib/core/notifications/reminder_service.dart`: 데일리 리마인더(`scheduleDaily`), 스트릭 위험 알림(`refreshStreakDanger`, 1일 1회), 컴백 알림(`refreshComeback`)이 각각 고정 문구 1개씩 사용.

### 변경
**문구 다양화**
- 데일리 리마인더·스트릭 위험·컴백 각각에 문구 풀(ko/en 각 3~5개)을 만든다.
- 선택 방식: 예약 시점의 로컬 날짜(YYYY-MM-DD)를 시드로 결정적 선택(`날짜.hashCode % 풀길이`) — 같은 날 재예약해도 문구가 안 바뀌고, 날마다 로테이션된다.
- 스트릭 위험 문구는 현재 스트릭 일수를 문구에 보간(예: "N일째 이어온 기록, 오늘 안 하면 끊겨요")해 상황별로 달라지게 한다.

**타이밍/빈도**
- 신규: 목숨이 0에서 5로 풀충전되는 시점(0개 소모 후 2.5시간 뒤, 새 리필 주기 30분×5 기준)에 1회성 로컬 알림 "목숨이 다 찼어요" 예약. 목숨 소모 시점(`consume()` 호출부)에서 트리거해 예약.
- 스트릭 위험 알림에 더해, 자정 2시간 전(로컬 타임존) 재알림 1회 추가 — 기존 1회 예약(리마인더 시각 기준)만으로 놓치는 늦은 사용자를 커버.
- 하루 알림 총량 상한(리마인더 1 + 스트릭위험 최대 2 + 컴백/목숨충전 이벤트성)을 넘지 않도록, 스트릭 위험 알림이 이미 오늘 발송됐으면 자정-2h 알림은 스킵.

## 4. 스트릭: 서버 로컬데이 정합 + 시각 강화

### 서버 정합 (우선)
- 현재 `streak_service.go`는 `time.Now().UTC()`로 "오늘"을 판정 — 한국 사용자가 오전 9시 이전 학습하면 서버 기준 전날로 잡혀 클라이언트 로컬 스트릭과 어긋난다.
- 클라이언트는 이미 `todayLocalString()`(기기 로컬 자정 기준)을 갖고 있다.
- 변경: `SubmitAttemptRequest`/`BatchAttemptItem` DTO에 `local_day string` 필드 추가(`YYYY-MM-DD`, 클라이언트가 채워 보냄). 핸들러 → `AttemptService.SubmitAttempt` → `UpdateStreak`까지 관통시켜, 서버가 `time.Now().UTC()` 대신 이 값을 "오늘"로 사용.
- 하위호환: `local_day`가 비어있거나 형식이 잘못된 경우(구버전 클라이언트) 기존처럼 UTC 기준으로 폴백.
- 클라이언트(Flutter) 쪽 sync 업로드 코드에서 시도 전송 시 `todayLocalString()` 값을 실어 보내도록 수정.
- 서버의 프리즈(freeze) 개념은 현재 없음(클라 전용 로컬 기능) — 이번 변경 범위에서 서버에 프리즈를 추가하지는 않는다. 순수하게 "오늘" 판정 기준만 정합시킨다.

### 시각 강화
- 대시보드(`progress/dashboard_screen.dart`)의 스트릭 표시를 7일 마일스톤 진행률(예: 현재 스트릭 % 7로 다음 프리즈까지 도트 게이지)과 단계별 불꽃 아이콘 강조로 확장.
- 프리즈 보유 개수(0~2)를 아이콘으로 옆에 표시.

## 5. 통독 전면광고: 첫 장 스킵 절충안 + 간격 단축

### 현재
- `verse-flutter/lib/features/reading/reading_ad_gate.dart`: `isFirstChapter`면 무조건 광고 스킵. 장 경계 3분, 절 경계 10분 간격.

### 변경 (절충안, 사용자 확정)
- "첫 장 스킵"을 **앱 설치 후 최초 통독 세션 1회**로 한정한다. 이후 세션에서는 첫 장부터 일반 간격 규칙 적용.
- 판정을 위해 로컬 플래그(SharedPreferences/DB, 예: `hasCompletedFirstReadingSession bool`)를 두고, 통독 세션 종료(또는 첫 장 이탈) 시 true로 기록.
- `shouldShowInterstitial`의 `isFirstChapter` 파라미터는 그대로 두되, 호출부에서 넘기는 값을 "앱 전체 최초 세션의 첫 장인가"로 바꾼다(순수 함수 시그니처는 유지, 호출 조건만 변경).
- 간격 단축: `kChapterAdGap` 3분 → 2분, `kVerseAdGap` 10분 → 7분.

## 테스트

- `reading_ad_gate.dart`는 순수 함수 유닛 테스트 존재 — 새 간격 상수·최초세션 판정 케이스 추가.
- `lives_streak_repository.dart`, `streak_service.go`(Go) 각각 기존 단위 테스트가 있음 — 상수 변경·로컬데이 파라미터 반영한 케이스로 갱신.
- `_settled()`의 clamp 동작(6~10 보유 사용자가 5로 깎이는 것)은 기존 clamp 로직이 그대로 커버하므로 신규 테스트로 회귀 확인만.

## 범위 밖

- 서버 쪽 프리즈(freeze) 도입.
- 알림 권한 요청 흐름/온보딩 UI 변경.
- 앱오픈 광고 신규 도입.
</content>
