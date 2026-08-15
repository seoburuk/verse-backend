# 스트릭/알림 하루 경계를 로컬 자정 기준으로 변경 (설계)

## 배경

`verse-flutter`의 로컬 스트릭(`LivesRepository`/`StreakRepository`, `lib/core/db/lives_streak_repository.dart`)과
알림 예약 판정(`reminder_service.dart`)이 "오늘"을 `DateTime.now().toUtc()` 기준 `'YYYY-MM-DD'`로 계산한다.

한국(UTC+9) 사용자에게는 실제로 하루가 로컬 자정이 아니라 **UTC 자정(로컬 오전 9시)**에 바뀐다:

- 밤 11시에 암송하고 다음 날 아침 8시에 또 하면 → 둘 다 UTC로는 같은 날짜 → 스트릭이 늘지 않음
- 아침 8시와 오전 10시에 각각 암송하면 → UTC로는 서로 다른 날짜 → 이틀로 계산됨
- 위험 알림(`streak_danger`)이 로컬 21시에 "오늘 밤 12시에 사라져요"라고 안내하지만, 실제 마감(UTC 자정)은 그로부터 12시간 뒤 — 문구와 실제 마감 시점이 어긋남

서버(`verse-backend/internal/service/streak_service.go`)도 동일하게 UTC 기준이며,
`// MVP에서는 서버 UTC 기준. 한국 사용자 로컬 날짜 판정은 후속 ADR.` 주석으로 알려진 이슈로 남아있다.

## 범위

**포함**: `verse-flutter` 로컬 스트릭 계산 + 로컬 알림(리마인더/위험/복귀) 판정 로직.

**제외**: `verse-backend`의 서버 스트릭(`streak_service.go`, 웹/통계용)은 그대로 UTC 유지. 로컬 앱 스트릭과
서버 통계상의 스트릭 값이 서로 다르게 보일 수 있다는 점을 알려진 제약으로 남겨둔다(후속 과제).

## 결정 사항

1. **하루 경계는 로컬 자정(00:00, 기기 타임존 기준)** — 특수 컷오프(예: 새벽 4시) 없음. 가장 직관적이고
   사용자 기대와 일치하며, `reminder_service.dart`가 이미 `tz` 패키지로 로컬 타임존을 다루고 있어 구현 부담이 적다.
2. **기존 저장 데이터(`lastDay` 문자열)는 마이그레이션하지 않는다.** 저장 형식(`'YYYY-MM-DD'`)은 그대로 두고,
   그 문자열을 계산할 때/비교할 때 쓰는 로직만 UTC 변환을 제거해 로컬 기준으로 교체한다. 전환 시점 직전 하루의
   기록만 최대 하루 오차로 흐트러질 수 있으나(마이그레이션 없이 감수), 별도 백필/버전 마이그레이션은 만들지 않는다.
3. **타임존 변경(해외여행)이나 DST로 인한 하루 스킵/중복은 별도로 보정하지 않는다.** "로컬 자정 기준"을 택한
   이상 근본적으로 따라오는 트레이드오프로 간주하고 YAGNI에 따라 처리하지 않는다. DST 자체는 `tz` 패키지가
   이미 다루므로 추가 코드 불필요.
4. **중복 제거**: "오늘 로컬 날짜 문자열" 계산이 `lives_streak_repository.dart`(`StreakRepository._todayUtc`)와
   `reminder_service.dart`(`todayUtcString()`) 두 곳에 중복돼 있다. 이번 변경과 직접 관련되므로 공용 함수
   하나로 합친다.

## 구현 개요

### 새 공용 파일: `lib/core/date/local_day.dart`

```dart
/// 로컬 타임존 기준 오늘 날짜를 'YYYY-MM-DD'로 반환한다.
/// 스트릭 판정(StreakRepository)과 알림 예약 판정(ReminderService)이
/// 동일한 "오늘" 정의를 공유해야 하므로 이 함수를 함께 쓴다.
String todayLocalString() { ... }
```

`DateTime.now()`(로컬, UTC 변환 없음)를 사용해 `year/month/day`를 조합한다.

### `lives_streak_repository.dart`

- `StreakRepository._todayUtc()` 삭제, `todayLocalString()` 사용으로 교체.
- `_isNextDay(lastDay, today)`: 현재 `DateTime.parse(...).toUtc()`로 비교하던 것을, 저장된 문자열이
  이제 로컬 자정 기준 날짜이므로 `.toUtc()` 변환 없이 순수 날짜(연/월/일) 차이로 비교하도록 변경.
- `current()`의 표시용 리셋 로직도 동일하게 로컬 날짜 비교로 변경.

### `reminder_service.dart`

- `todayUtcString()` 삭제, `todayLocalString()`(공용 함수) 사용.
- `shouldPauseReminders`, `shouldScheduleStreakDanger`, `shouldScheduleComeback`의 날짜 diff 계산에서
  `.toUtc()` 제거, 순수 날짜 차이로 통일.
- `refreshComeback`의 `targetUtcDate = lastDay.add(Duration(days: 2))` 계산도 동일하게 로컬 날짜 기준으로 조정.
- 함수/변수명에 남아있는 `Utc` 표기는 이번에 손대는 범위 내에서 `Local`로 정리(예:
  `todayUtc` 파라미터명 → `todayLocal`). 이름이 실제 의미와 어긋나면 혼란을 유발하므로 함께 정리한다.

### 영향받지 않는 부분

- `lives_streak_repository.dart`의 `LivesRepository`(목숨 리필)는 절대 경과 시간(`Duration`) 기반이라
  날짜 경계 개념이 없음 — 변경 불필요.
- 서버 동기화(`session_sync_coordinator.dart`)는 스트릭을 서버에서 pull하지 않고 로컬에서만 계산 —
  이번 변경과 별개로 그대로 동작.

## 테스트

- `test/streak_danger_test.dart`: 기존 테스트가 넘기던 UTC 문자열 인자를 로컬 날짜 문자열 기준으로 갱신.
- 타임존 경계 케이스 추가: 예컨대 UTC 15:00(=KST 자정 직후)에 기록한 경우 기존 로직이라면 날짜가 아직
  안 바뀐 것처럼 보였겠지만, 새 로직에서는 이미 다음 날로 판정되어야 함을 확인하는 테스트 1~2개.
- `LivesRepository` 관련 테스트는 변경 없음(대상 아님).

## 문서화

스펙에 "서버 스트릭(UTC)과 로컬 앱 스트릭(로컬 자정)이 다를 수 있음"을 알려진 제약으로 명시.
서버 측 정합 작업은 이번 스펙 범위 밖의 후속 과제로 남긴다.

## 구현 완료

`docs/superpowers/plans/2026-08-16-local-day-streak-boundary.md` 계획대로 구현 완료.
`todayLocalString()`(`lib/core/date/local_day.dart`) 공용 함수로 통합, `StreakRepository`와
`ReminderService`의 날짜 판정을 로컬 자정 기준으로 교체. `flutter test` 전체 실행 결과
이번 변경 대상 테스트는 모두 통과. `test/create_plan_screen_test.dart`의 "커스텀 마감일은
고른 날짜 그대로 표시된다" 1건이 실패하지만, 이는 스코프 밖인 `create_plan_screen.dart`의
자체 `_todayUtc()` 로직에서 비롯된 기존 결함으로 이번 변경과 무관 — 별도 이슈로 남긴다.
