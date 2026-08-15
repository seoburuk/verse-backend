# 데일리루프 플랜 마감일/오늘 카운트 로컬 자정 경계 전환 (설계)

## 배경

[2026-08-16-local-day-streak-boundary-design.md](2026-08-16-local-day-streak-boundary-design.md)에서 스트릭/알림의
"오늘" 판정을 UTC 자정에서 로컬 자정 기준으로 바꿨다. 같은 클래스의 버그가 데일리루프 플랜 쪽에도 있다:

- `lib/features/today/create_plan_screen.dart`: 마감일 선택(`_todayUtc()`, `_midnightUtc()`) — `showDatePicker`는
  기기 로컬 달력을 기준으로 동작하는데, `firstDate`/`initialDate` 앵커가 UTC 날짜라 KST 등에서 하루 어긋난다.
  실제로 `test/create_plan_screen_test.dart`의 "커스텀 마감일은 고른 날짜 그대로 표시된다" 테스트가 이 불일치로 실패 중.
- `lib/core/plan/plan_repository.dart`: `todayUtcDay()`를 플랜 만료 판정(`expired`), 남은 일수(`_remainingDays`,
  `todayTarget` 계산에 관여), "오늘 목표 달성" 카운트(`_countCleared`/`_countRead`의 `todayOnly` 분기)에 쓴다.

## 범위

`create_plan_screen.dart` + `plan_repository.dart`. 둘이 `deadlineDay`('YYYY-MM-DD') 문자열 계약을 공유하므로 함께 고친다.

## 두 가지 패턴 구분

이번 버그는 성격이 다른 두 종류의 코드가 섞여 있어서, 고치는 방식도 다르게 가져간다.

### 패턴 A — 순수 날짜 문자열 (스트릭/알림과 동일 유형)

`_deadline`(선택된 마감 날짜), `deadlineDay`(저장값), `plan_repository.dart`의 `expired`/`_remainingDays`가 다룬다.
이 값들은 "특정 시각"이 아니라 "사용자가 고른/비교하는 달력 날짜" 그 자체다. 기존 스트릭 수정과 동일하게:
`todayUtcDay()` → `todayLocalString()`(기존 공용 함수 `lib/core/date/local_day.dart` 재사용), 날짜 문자열
파싱 후 `.toUtc()` 호출 제거.

### 패턴 B — 실제 타임스탬프 (새로운 유형, 처리 방식이 다름)

`plan_repository.dart`의 `_countCleared`/`_countRead`가 "오늘 몇 절 했는지" 셀 때 쓰는
`progress.updatedAt`/`reading_progress.typedAt`은 실제 발생 시각(instant)이다. 이 값은 `.toUtc()`를 단순
제거하면 안 되고 **`.toLocal()`로 바꿔야** 한다 — "이 시각이 사용자의 로컬 기준 어느 날짜에 속하는가"를 물어야
하기 때문이다.

- `reading_progress.typedAt`은 쓰기 시점에 `.toUtc()`로 정확히 저장돼 있다(`reading_progress_repository.dart:20`).
  읽을 때 `.toLocal()`로 변환 후 날짜를 뽑아야 한다.
- `progress.updatedAt`은 쓰기 시점에 `DateTime.now()`(로컬, `.toUtc()` 없이)로 이미 저장되고 있다
  (`memorize_controller.dart:432`). 읽을 때 `.toUtc()`를 호출하는 현재 코드는 로컬 인스턴트를 다시 UTC로
  왕복 변환하는 불필요한 단계였다 — `.toLocal()`이 사실상 원래 값에 대한 no-op이 되어 그대로 맞게 동작한다.
  이번 수정으로 두 컬럼 모두 "인스턴트를 저장 → 조회 시 `.toLocal()`로 날짜 추출"이라는 동일한 규칙으로 통일된다.

## 파일별 변경

### `lib/features/today/create_plan_screen.dart`

- `_todayUtc()` 삭제, `todayLocalString()`을 파싱한 `DateTime.parse(todayLocalString())` 또는 `DateTime.now()`
  (로컬)로 대체. `showDatePicker`의 `firstDate`/`lastDate`/`initialDate`가 전부 로컬 기준이 되어야 하므로
  `DateTime.now()`를 직접 쓴다(패턴 A지만 이 파일은 문자열이 아니라 `DateTime` 객체를 다루므로 `todayLocalString()`
  대신 로컬 `DateTime.now()`를 그대로 쓰는 게 자연스럽다).
- `_midnightUtc(DateTime d) => DateTime.utc(d.year, d.month, d.day)`를 `_midnightLocal(DateTime d) =>
  DateTime(d.year, d.month, d.day)`로 교체(로컬 `DateTime` 생성자 사용).
- `_daysUntilDeadline`, `_setPresetDays`, `_pickCustomDate`, `_onPicked`(통독 365일 마감)의 `_todayUtc()` 호출부를
  전부 로컬 버전으로 교체.
- `_formatDay`는 이미 순수 y/m/d 포맷팅이라 변경 불필요.

### `lib/core/plan/plan_repository.dart`

- `todayUtcDay()`/`_utcDay()` 삭제, `import '../date/local_day.dart';` 추가 후 `todayLocalString()` 사용.
- `PlanView.expired`, `_remainingDays()`: `todayUtcDay()` → `todayLocalString()`으로 교체(패턴 A).
- `_countCleared`(`updatedAt`)와 `_countRead`(`typedAt`)의 날짜 비교 로직을 다음으로 교체(패턴 B):

  ```dart
  String _localDayOf(DateTime instant) {
    final local = instant.toLocal();
    return '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }
  ```

  기존 `_utcDay(r.readTable(...).updatedAt.toUtc()) == today`를 `_localDayOf(r.readTable(...).updatedAt) == today`로,
  `today`는 `todayLocalString()`으로 교체. `typedAt`도 동일.

## 기존 데이터 마이그레이션

스트릭 스펙과 동일한 결정을 따른다 — `deadlineDay` 저장값(문자열)과 `updatedAt`/`typedAt`(인스턴트) 모두 마이그레이션
없이 계산 로직만 교체한다. 전환 시점 직전 하루의 만료 판정/오늘 카운트만 최대 하루 오차 감수.

## 테스트

- `test/create_plan_screen_test.dart`: 기존에 실패하던 "커스텀 마감일은 고른 날짜 그대로 표시된다" 테스트가
  이번 수정으로 통과하는지 확인. `DateTime.now().toUtc()`로 타깃 날짜를 계산하는 테스트 코드 자체도
  `DateTime.now()`(로컬)로 맞춰 수정 — 그렇지 않으면 테스트가 여전히 UTC 앵커로 남아 KST 자정 근처에서 flaky.
- `plan_repository.dart`에 대한 기존 단위 테스트가 있으면(`test/plan_repository_test.dart` 등) UTC 앵커를 쓰는
  부분을 로컬로 맞춰 갱신. `_countCleared`/`_countRead`의 `todayOnly` 카운트가 저장 시각과 무관하게 로컬 자정
  경계로 정확히 판정되는지 확인하는 회귀 테스트 1~2개 추가(예: `updatedAt`을 로컬 자정 직전/직후로 세팅해
  전날/오늘로 갈리는지).

## 문서화

이번 스펙도 서버(`verse-backend`) 쪽 플랜/진행도 관련 로직은 범위 밖으로 남긴다(현재 플랜은 로컬 전용 기능이라
서버에 대응 개념이 없는 것으로 확인됨 — 서버 동기화가 생기면 별도 검토 필요).
