# 플랜 마감일 변경 시트 / 다음 장 이어하기 로컬 자정 경계 전환 (설계)

## 배경

`docs/superpowers/specs/2026-08-16-plan-deadline-local-day-design.md`의 sweep에서 놓친 같은 클래스의
버그 2건을 추가로 발견했다:

1. [`lib/features/today/plan_sheet.dart:52`](../../../verse-flutter/lib/features/today/plan_sheet.dart) `_changeDeadline()` —
   `create_plan_screen.dart`에서 고친 것과 동일한 결함. `DateTime.now().toUtc()`를 `showDatePicker`의
   `firstDate`/`lastDate`/`initialDate` 앵커로 쓰고 있어, 위젯이 실제로 여는 로컬 달력 페이지와
   어긋날 수 있다.
2. [`lib/features/today/today_screen.dart:307-311`](../../../verse-flutter/lib/features/today/today_screen.dart) `_completeCta()` —
   장 플랜 완주 후 "다음 장 이어하기"가 새 마감일을 만들 때, 이미 로컬 날짜 문자열인
   `view.plan.deadlineDay`와 진짜 UTC 인스턴트인 `view.plan.createdAt.toUtc()`를 직접 빼서
   `span`(기존 마감까지의 일수)을 구한 뒤, 그 값을 다시 `DateTime.now().toUtc()`에 더해 새
   마감일을 만든다. 날짜 문자열과 인스턴트를 섞어서 빼는 지점이라 자정 근처에서 하루 오차가 날 수 있다.

## 범위

두 파일 모두 이번 라운드에 포함(사용자 승인).

## 수정 방향

### `plan_sheet.dart`

`create_plan_screen.dart` 수정과 동일한 패턴: `DateTime.now().toUtc()` → `DateTime.now()`.

### `today_screen.dart`

`span` 계산에 쓰이는 `createdAt`(진짜 인스턴트)을 로컬 캘린더 자정으로 정규화한 뒤 `deadlineDay`
(이미 로컬 자정 기준 날짜 문자열)와 뺀다 — `create_plan_screen.dart`의 `_midnightLocal` 패턴과 동일:

```dart
final createdLocal = view.plan.createdAt.toLocal();
final createdMidnight = DateTime(createdLocal.year, createdLocal.month, createdLocal.day);
final span = DateTime.parse(view.plan.deadlineDay).difference(createdMidnight).inDays;
final d = DateTime.now().add(Duration(days: span < 1 ? 7 : span));
```

## 테스트

- `plan_sheet.dart`: `_changeDeadline`을 여는 새 위젯 테스트 추가 — 기본 프리셋과 다른 달로
  마감일이 넘어가지 않는 케이스를 커버(같은 달 안에서 날짜를 골라 정확히 표시되는지).
- `today_screen.dart`: 기존 "장 플랜을 완주하면 다음 장 이어하기 버튼이 뜬다" 테스트에 새로 생성된
  플랜의 `deadlineDay`가 기존 마감(`day`, 오늘+7일)과 동일한 span(7일)을 유지하는지 검증하는
  assertion을 추가.

## 마이그레이션 / 서버

해당 없음 — 이전 스펙과 동일한 성격의 로컬 전용 계산 수정.
