# 오늘 목표 상한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PlanView.todayTarget`이 뒤처질수록 눈덩이처럼 불어나지 않도록, 플랜 생성 시점 원래 페이스의 1.5배로 상한을 둔다.

**Architecture:** 새 스키마 없이 기존 `createdAt`/`deadlineDay`로 원래 페이스를 역산해 `PlanView`에 계산 게터 하나(`_originalPace`)를 추가하고, `todayTarget`이 그 1.5배를 넘지 않도록 클램프한다.

**Tech Stack:** Flutter/Dart, `flutter_test`.

## Global Constraints

- 상한 = `ceil(원래 페이스 × 1.5)`, 원래 페이스 = `ceil(totalVerses / totalDays)`, `totalDays = max(1, deadline일 - createdAt의 로컬 날짜 + 1)`.
- 마감 자동 연장 없음 — 상한에 걸려도 `deadlineDay`는 그대로 둔다.
- 통독(`mode == 'reading'`)은 대상 범위가 장 하나뿐이라 영향 없음 — 변경 없음.

---

### Task 1: `PlanView.todayTarget`에 상한 적용

**Files:**
- Modify: `verse-flutter/lib/core/plan/plan_repository.dart` (`PlanView` 클래스)
- Test: `verse-flutter/test/plan_view_test.dart`

**Interfaces:**
- Produces: `PlanView.todayTarget`의 공개 시그니처는 그대로(`int` getter) — 값만 상한이 생김.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/plan_view_test.dart`의 "모든 절 완료면 planComplete..." 테스트 뒤(마지막 `});` 이전)에
추가:

```dart
  test('뒤처져서 naive 계산값이 원래 페이스의 1.5배를 넘으면 상한에 걸린다', () async {
    await seedCourse(7, 10); // 완료 0, 남은 10
    // 10일짜리 플랜(원래 페이스 = ceil(10/10) = 1/일)으로 만들었는데,
    // 오늘이 이미 마감일이라 remainingDays=1 → naive = ceil(10/1) = 10.
    // 상한 = ceil(1 * 1.5) = 2 → todayTarget은 10이 아니라 2여야 한다.
    final createdAt = DateTime.now().subtract(const Duration(days: 9));
    await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
          courseId: 7,
          title: 'x',
          deadlineDay: todayLocalString(),
          createdAt: createdAt,
        ));

    final v = (await repo.planView())!;
    expect(v.remainingDays, 1);
    expect(v.todayTarget, 2, reason: 'naive=10을 원래 페이스(1)의 1.5배=2로 클램프');
  });

  test('정상 진행 중(안 밀림)이면 상한에 안 걸리고 naive 값 그대로다', () async {
    await seedCourse(7, 10); // 완료 0, 남은 10
    // 생성 시점과 지금이 같아 원래 페이스와 naive 페이스가 동일 — 클램프 없음.
    final deadlineDay = dayOf(DateTime.now().add(const Duration(days: 4))); // 5일, naive=2
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: deadlineDay);

    final v = (await repo.planView())!;
    expect(v.todayTarget, 2);
  });

  test('상한 계산도 최소 1을 보장한다', () async {
    await seedCourse(7, 1); // 총 1절
    final createdAt = DateTime.now().subtract(const Duration(days: 29));
    await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
          courseId: 7,
          title: 'x',
          deadlineDay: todayLocalString(), // 30일짜리 플랜, 원래 페이스 = ceil(1/30) = 1
          createdAt: createdAt,
        ));

    final v = (await repo.planView())!;
    expect(v.todayTarget, 1);
  });
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/plan_view_test.dart`
Expected: FAIL — "뒤처져서 naive 계산값이..." 테스트에서 `todayTarget`이 2가 아니라 10.

- [ ] **Step 3: 구현 교체**

`verse-flutter/lib/core/plan/plan_repository.dart`의 `PlanView` 클래스에서 `todayTarget` 게터 바로 위에
`_originalPace` 게터를 추가하고 `todayTarget`을 교체한다.

변경 전:
```dart
  /// 만료 플랜은 오늘 목표가 없다. 이 가드가 없으면 _remainingDays의 max(1,..)
  /// 때문에 남은 절 전부가 매일 "오늘 목표"로 쏟아진다.
  /// 통독은 범위가 장 하나라 남은 절이 곧 오늘 목표다.
  int get todayTarget {
    if (mode == 'reading') return remainingVerses;
    return (expired || remainingVerses <= 0) ? 0 : (remainingVerses / remainingDays).ceil();
  }
```

변경 후:
```dart
  /// 플랜 생성 시점의 원래 하루 페이스 — createdAt(인스턴트)을 로컬 자정으로
  /// 정규화한 날짜와 deadlineDay(로컬 날짜 문자열) 사이 총 기간으로 역산한다.
  /// _remainingDays와 동일한 "오늘 포함 +1" 관례를 따른다.
  int get _originalPace {
    final created = plan.createdAt.toLocal();
    final createdDay = DateTime(created.year, created.month, created.day);
    final deadline = DateTime.parse(plan.deadlineDay);
    final totalDays = max(1, deadline.difference(createdDay).inDays + 1);
    return (totalVerses / totalDays).ceil();
  }

  /// 만료 플랜은 오늘 목표가 없다. 이 가드가 없으면 _remainingDays의 max(1,..)
  /// 때문에 남은 절 전부가 매일 "오늘 목표"로 쏟아진다.
  /// 통독은 범위가 장 하나라 남은 절이 곧 오늘 목표다.
  ///
  /// 뒤처져서 naive 계산값(남은 절/남은 일수)이 원래 페이스의 1.5배를 넘으면
  /// 그 1.5배로 클램프한다 — 밀릴수록 목표가 눈덩이처럼 불어나는 걸 막는다.
  /// 마감을 자동으로 늘리진 않는다 — 일일 목표는 페이스 가이드일 뿐 "그날까지
  /// 완주 보장"이 아니다(의도된 트레이드오프).
  int get todayTarget {
    if (mode == 'reading') return remainingVerses;
    if (expired || remainingVerses <= 0) return 0;
    final naive = (remainingVerses / remainingDays).ceil();
    final cap = max(1, (_originalPace * 1.5).ceil());
    return min(naive, cap);
  }
```

(`dart:math`는 파일 상단에 이미 import돼 있다 — `_remainingDays`가 이미 `max()`를 쓰므로 중복 추가하지
않는다. `min()`도 같은 `dart:math`에서 온다.)

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/plan_view_test.dart`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/core/plan/plan_repository.dart test/plan_view_test.dart
git commit -m "feat: 오늘 목표를 원래 페이스의 1.5배로 상한 설정"
```

---

### Task 2: 전체 회귀 확인 및 스펙 완료 표시

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-today-target-cap-design.md`

- [ ] **Step 1: 전체 테스트 + analyze**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS.

Run: `cd verse-flutter && flutter analyze`
Expected: 이번 변경과 관련된 새 이슈 없음.

- [ ] **Step 2: 스펙에 구현 완료 메모 추가 후 커밋**

`docs/superpowers/specs/2026-08-16-today-target-cap-design.md` 끝에 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-today-target-cap.md` 계획대로 구현 완료. `PlanView.todayTarget`이
`_originalPace`(생성 시점 페이스)의 1.5배로 클램프되도록 수정.
```

```bash
git add docs/superpowers/specs/2026-08-16-today-target-cap-design.md
git commit -m "docs: 오늘 목표 상한 스펙에 구현 완료 표시"
```
