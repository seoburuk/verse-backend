# 플랜 마감일 시트 / 다음 장 이어하기 로컬 자정 경계 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `plan_sheet.dart`의 마감일 변경 날짜 선택기와 `today_screen.dart`의 "다음 장 이어하기" span 계산을 로컬 자정 기준으로 맞춘다.

**Architecture:** 이미 확립된 패턴 재사용 — `showDatePicker` 앵커는 `DateTime.now()`(로컬), 날짜 문자열과 인스턴트를 섞어 빼는 곳은 인스턴트를 로컬 자정으로 정규화한 뒤 뺀다.

**Tech Stack:** Flutter/Dart, `flutter_test`.

## Global Constraints

- 로컬 자정(00:00, 기기 타임존) 기준 — 앞선 두 스펙과 동일.
- `docs/superpowers/specs/2026-08-16-plan-sheet-nextchapter-local-day-design.md`의 코드가 그대로 구현 대상.

---

### Task 1: `plan_sheet.dart` 마감일 변경 피커를 로컬 기준으로

**Files:**
- Modify: `verse-flutter/lib/features/today/plan_sheet.dart:52`
- Test: `verse-flutter/test/plan_sheet_test.dart`

**Interfaces:** 없음 — 내부 계산만 변경.

- [ ] **Step 1: 기존 테스트의 UTC 앵커 정리**

`verse-flutter/test/plan_sheet_test.dart`의 `seedPlan()`:

변경 전:
```dart
    final d = DateTime.now().toUtc().add(const Duration(days: 7));
```

변경 후:
```dart
    final d = DateTime.now().add(const Duration(days: 7));
```

- [ ] **Step 2: 실패하는 위젯 테스트 작성**

같은 파일 끝(마지막 `}` 이전)에 추가:

```dart
  testWidgets('마감 변경 시트는 기본 프리셋(7일 후)이 속한 달을 펼치고, 고른 날짜가 그대로 저장된다',
      (tester) async {
    final view = await seedPlan();
    await pumpSheet(tester, view);

    await tester.tap(find.text('마감 변경'));
    await tester.pumpAndSettle();

    final defaultTarget = DateTime.now().add(const Duration(days: 7));
    final expected =
        '${defaultTarget.year.toString().padLeft(4, '0')}-${defaultTarget.month.toString().padLeft(2, '0')}-${defaultTarget.day.toString().padLeft(2, '0')}';

    await tester.tap(find.text('${defaultTarget.day}').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('확인').last);
    await tester.pumpAndSettle();

    final active = await PlanRepository(db).activePlan();
    expect(active!.deadlineDay, expected);
  });
```

(`l.planSheetChangeDeadline`의 한국어 문자열이 '마감 변경'이 아니면, `verse-flutter/lib/l10n/app_ko.arb`에서
`planSheetChangeDeadline` 키 값을 확인해 그 문자열로 맞춘다.)

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/plan_sheet_test.dart`
Expected: FAIL — `showDatePicker`가 `initialDate: now.add(Duration(days:7))`을 UTC 기준으로 계산해
`firstDate`도 UTC 기준이므로, 개발 환경 타임존에 따라 달력이 다른 날짜 페이지를 열 수 있음(KST 등에서
재현). UTC 환경이면 이 시점에 이미 PASS할 수 있다 — 그 경우 다음 단계로 진행 후 Step 5에서 재확인.

- [ ] **Step 4: 구현 교체**

`verse-flutter/lib/features/today/plan_sheet.dart:52`:

변경 전:
```dart
    final now = DateTime.now().toUtc();
```

변경 후:
```dart
    final now = DateTime.now();
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/plan_sheet_test.dart`
Expected: PASS (전체).

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/features/today/plan_sheet.dart test/plan_sheet_test.dart
git commit -m "fix: 플랜 마감일 변경 시트를 UTC 자정에서 로컬 자정 기준으로 변경"
```

---

### Task 2: `today_screen.dart` 다음 장 이어하기 span 계산을 로컬 기준으로

**Files:**
- Modify: `verse-flutter/lib/features/today/today_screen.dart:307-311`
- Test: `verse-flutter/test/today_screen_test.dart`

**Interfaces:** 없음 — 내부 계산만 변경.

- [ ] **Step 1: 기존 테스트에 span 검증 추가(실패 테스트)**

`verse-flutter/test/today_screen_test.dart`의 "장 플랜을 완주하면 다음 장 이어하기 버튼이 뜬다" 테스트
끝(`expect(active!.sectionIds, '92', ...)` 다음 줄)에 추가:

```dart
    // 기존 플랜과 같은 span(7일)을 유지해야 한다 — 오늘(로컬)+7일.
    final expectedDeadline = DateTime.now().add(const Duration(days: 7));
    final expectedDeadlineStr =
        '${expectedDeadline.year.toString().padLeft(4, '0')}-${expectedDeadline.month.toString().padLeft(2, '0')}-${expectedDeadline.day.toString().padLeft(2, '0')}';
    expect(active.deadlineDay, expectedDeadlineStr);
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/today_screen_test.dart --plain-name "장 플랜을 완주하면"`
Expected: FAIL 또는 PASS(환경 타임존에 따라 다름) — UTC 환경이면 이미 통과할 수 있음, KST 등에서는
`createdAt.toUtc()`와 `deadlineDay`(로컬 문자열)를 섞어 빼는 기존 코드 때문에 `span`이 어긋나 실패.
어느 쪽이든 Step 4 이후 다시 확인한다.

- [ ] **Step 3: 구현 교체**

`verse-flutter/lib/features/today/today_screen.dart:307-311`:

변경 전:
```dart
              final span = DateTime.parse(view.plan.deadlineDay)
                  .difference(view.plan.createdAt.toUtc())
                  .inDays;
              final d = DateTime.now().toUtc().add(Duration(days: span < 1 ? 7 : span));
```

변경 후:
```dart
              final createdLocal = view.plan.createdAt.toLocal();
              final createdMidnight =
                  DateTime(createdLocal.year, createdLocal.month, createdLocal.day);
              final span =
                  DateTime.parse(view.plan.deadlineDay).difference(createdMidnight).inDays;
              final d = DateTime.now().add(Duration(days: span < 1 ? 7 : span));
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/today_screen_test.dart`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/today/today_screen.dart test/today_screen_test.dart
git commit -m "fix: 다음 장 이어하기 마감일 span 계산을 로컬 자정 기준으로 변경"
```

---

### Task 3: 전체 회귀 확인 및 스펙 완료 표시

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-plan-sheet-nextchapter-local-day-design.md`

- [ ] **Step 1: 전체 테스트 + UTC 잔재 확인**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS.

Run: `cd verse-flutter && grep -n "toUtc()" lib/features/today/plan_sheet.dart lib/features/today/today_screen.dart`
Expected: 결과 없음(순수 인스턴트 저장 목적 외에는 없어야 함 — 이 두 파일엔 그런 용도가 없으므로 완전히 없어야 정상).

- [ ] **Step 2: 스펙에 구현 완료 메모 추가 후 커밋**

`docs/superpowers/specs/2026-08-16-plan-sheet-nextchapter-local-day-design.md` 끝에 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-plan-sheet-nextchapter-local-day.md` 계획대로 구현 완료.
`plan_sheet.dart`의 마감일 변경 피커, `today_screen.dart`의 다음 장 이어하기 span 계산을
로컬 자정 기준으로 교체.
```

```bash
git add docs/superpowers/specs/2026-08-16-plan-sheet-nextchapter-local-day-design.md
git commit -m "docs: 플랜 시트/다음 장 로컬 자정 경계 전환 스펙에 구현 완료 표시"
```
