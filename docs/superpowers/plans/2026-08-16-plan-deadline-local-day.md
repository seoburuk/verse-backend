# 플랜 마감일/오늘 카운트 로컬 자정 경계 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데일리루프 플랜의 마감일 선택(`create_plan_screen.dart`)과 마감/오늘 목표 계산(`plan_repository.dart`)에서 "오늘"을 UTC 자정이 아닌 기기 로컬 자정 기준으로 계산하도록 바꾼다.

**Architecture:** 이미 존재하는 공용 함수 `todayLocalString()`(`lib/core/date/local_day.dart`, 스트릭/알림 작업에서 만듦)을 재사용한다. 두 가지 다른 패턴을 구분해서 고친다 — (A) 순수 날짜 문자열(`deadlineDay`, 만료 판정)은 UTC 변환 제거, (B) 실제 타임스탬프(`progress.updatedAt`, `reading_progress.typedAt`)는 `.toUtc()`가 아니라 `.toLocal()`로 변환 후 날짜를 뽑아야 한다.

**Tech Stack:** Flutter/Dart, `drift`, `flutter_test`.

## Global Constraints

- 하루 경계는 로컬 자정(00:00, 기기 타임존) — 이전 스트릭/알림 작업과 동일한 기준.
- 저장된 `deadlineDay` 문자열, `progress.updatedAt`, `reading_progress.typedAt` 값은 마이그레이션하지 않는다 — 계산/조회 로직만 교체.
- 서버(`verse-backend`)는 범위 밖 — 플랜은 현재 로컬 전용 기능(서버 대응 개념 없음, 확인됨).
- 순수 날짜 문자열(패턴 A)은 `.toUtc()`를 제거하고 `todayLocalString()`을 쓴다. 실제 타임스탬프(패턴 B)는 `.toUtc()`를 `.toLocal()`로 바꾼다 — 단순 제거가 아니다.

---

### Task 1: `create_plan_screen.dart` 마감일 선택을 로컬 기준으로 교체

**Files:**
- Modify: `verse-flutter/lib/features/today/create_plan_screen.dart:43-66,150-176`
- Test: `verse-flutter/test/create_plan_screen_test.dart:184`

**Interfaces:**
- Consumes: 없음(이 파일 자체가 `DateTime.now()`를 직접 씀 — `todayLocalString()`은 문자열 반환이라 이 파일의 `DateTime` 기반 계산에는 맞지 않음)
- Produces: 이 위젯의 공개 동작(빌드된 화면, `_start()`가 저장하는 `deadlineDay` 문자열 포맷)은 변경 없음 — 내부 날짜 기준만 로컬로 바뀜.

- [ ] **Step 1: 실패 테스트 확인(이미 실패 중인 테스트를 사용)**

`test/create_plan_screen_test.dart`의 "커스텀 마감일은 고른 날짜 그대로 표시된다(타임존 반올림 없이)" 테스트가
이미 존재하며 현재 실패 중이다(UTC 기준 타깃 날짜와 로컬 달력 위젯의 불일치). 먼저 그대로 실행해서 실패를 재확인한다.

Run: `cd verse-flutter && flutter test test/create_plan_screen_test.dart -n "커스텀 마감일"`
Expected: FAIL — `Found 0 widgets with text containing <YYYY-MM-DD>`.

- [ ] **Step 2: 테스트의 UTC 앵커를 로컬로 수정**

`test/create_plan_screen_test.dart:184`:

변경 전:
```dart
    final target = DateTime.now().toUtc().add(const Duration(days: 10));
```

변경 후:
```dart
    final target = DateTime.now().add(const Duration(days: 10));
```

- [ ] **Step 3: 테스트 실행해서 여전히 실패하는지 확인(구현 전이므로 실패해야 정상)**

Run: `cd verse-flutter && flutter test test/create_plan_screen_test.dart -n "커스텀 마감일"`
Expected: FAIL (구현이 아직 UTC 기준이라 위젯이 로컬 타깃 날짜와 다르게 표시됨). 만약 개발 환경 타임존이
UTC와 같으면(예: 서버 CI가 UTC) 이 단계에서 이미 PASS할 수 있다 — 그 경우에도 Step 5에서 다시 확인하면 되므로
문제없이 다음 단계로 진행한다.

- [ ] **Step 4: 구현을 로컬 기준으로 교체**

`verse-flutter/lib/features/today/create_plan_screen.dart:50-51`:

변경 전:
```dart
  static DateTime _todayUtc() => DateTime.now().toUtc();
  static DateTime _midnightUtc(DateTime d) => DateTime.utc(d.year, d.month, d.day);
```

변경 후:
```dart
  static DateTime _todayLocal() => DateTime.now();
  static DateTime _midnightLocal(DateTime d) => DateTime(d.year, d.month, d.day);
```

`create_plan_screen.dart:61`:

변경 전:
```dart
  void _setPresetDays(int days) => _deadline = _todayUtc().add(Duration(days: days - 1));
```

변경 후:
```dart
  void _setPresetDays(int days) => _deadline = _todayLocal().add(Duration(days: days - 1));
```

`create_plan_screen.dart:64-66`:

변경 전:
```dart
  int get _daysUntilDeadline =>
      _midnightUtc(_deadline).difference(_midnightUtc(_todayUtc())).inDays + 1;
```

변경 후:
```dart
  int get _daysUntilDeadline =>
      _midnightLocal(_deadline).difference(_midnightLocal(_todayLocal())).inDays + 1;
```

`create_plan_screen.dart:151`(통독 플랜의 365일 임시 마감):

변경 전:
```dart
        _deadline = _todayUtc().add(const Duration(days: 365));
```

변경 후:
```dart
        _deadline = _todayLocal().add(const Duration(days: 365));
```

`create_plan_screen.dart:165`(`_pickCustomDate` 안):

변경 전:
```dart
    final now = _todayUtc();
```

변경 후:
```dart
    final now = _todayLocal();
```

`create_plan_screen.dart:43`의 주석도 실제 의미에 맞게 갱신:

변경 전:
```dart
  late DateTime _deadline; // UTC date (time-of-day component ignored everywhere it's used)
```

변경 후:
```dart
  late DateTime _deadline; // local calendar date (time-of-day component ignored everywhere it's used)
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/create_plan_screen_test.dart`
Expected: PASS (전체 — "커스텀 마감일" 포함).

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/features/today/create_plan_screen.dart test/create_plan_screen_test.dart
git commit -m "fix: 플랜 마감일 선택을 UTC 자정에서 로컬 자정 기준으로 변경"
```

---

### Task 2: `plan_repository.dart` 만료/오늘 카운트를 로컬 기준으로 교체

**Files:**
- Modify: `verse-flutter/lib/core/plan/plan_repository.dart:1-11,62-63,218-266,268-272`
- Modify: `verse-flutter/lib/core/db/app_database.dart:129`(`deadlineDay` 컬럼 주석)
- Test: `verse-flutter/test/plan_repository_test.dart`

**Interfaces:**
- Consumes: `todayLocalString()` from `package:verse_flutter/core/date/local_day.dart`(Task 1의 스트릭/알림 작업에서 이미 생성됨)
- Produces: `PlanView.expired`(bool getter), `PlanRepository.planView()`(기존 시그니처 유지) — 내부 날짜 판정 기준만 로컬로 바뀜. `todayUtcDay()`는 삭제되고 아무도 이걸 import하지 않는다(사용처는 이 파일 내부뿐임을 Step 1에서 확인).

- [ ] **Step 1: 사용처 확인**

Run: `cd verse-flutter && grep -rn "todayUtcDay" lib test`
Expected: `lib/core/plan/plan_repository.dart` 내부 정의/사용만 나옴 — 다른 파일에서 import해 쓰는 곳이 없어야 한다. 있다면 이 태스크 범위를 넓혀야 하므로 먼저 사람에게 알린다.

- [ ] **Step 2: 실패하는 테스트 작성 — 패턴 A(만료 판정)**

`test/plan_repository_test.dart` 파일 상단 import에 `PlanView`를 쓰기 위한 준비를 하고(같은 파일에서 이미
`plan_repository.dart`를 import하므로 추가 import 불필요), 파일 끝(`}` 이전)에 다음 그룹 추가:

```dart

  group('PlanView.expired — 로컬 자정 기준', () {
    PlanView view({required String deadlineDay, required String mode}) {
      return PlanView(
        plan: MemorizationPlanData(
          id: 1,
          courseId: 1,
          title: 't',
          deadlineDay: deadlineDay,
          status: 'active',
          createdAt: DateTime.now(),
          mode: mode,
        ),
        courseTitle: 't',
        courseTitleEn: 't',
        totalVerses: 10,
        clearedVerses: 0,
        todayCleared: 0,
        remainingDays: 1,
      );
    }

    test('오늘 로컬 날짜가 마감일이면 만료가 아니다', () {
      final today = todayLocalString();
      expect(view(deadlineDay: today, mode: 'memorize').expired, isFalse);
    });

    test('마감일이 어제(로컬)면 만료다', () {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      final yesterdayStr =
          '${yesterday.year.toString().padLeft(4, '0')}-${yesterday.month.toString().padLeft(2, '0')}-${yesterday.day.toString().padLeft(2, '0')}';
      expect(view(deadlineDay: yesterdayStr, mode: 'memorize').expired, isTrue);
    });

    test('통독 모드는 마감이 없어 항상 만료가 아니다', () {
      final longAgo = DateTime.now().subtract(const Duration(days: 400));
      final longAgoStr =
          '${longAgo.year.toString().padLeft(4, '0')}-${longAgo.month.toString().padLeft(2, '0')}-${longAgo.day.toString().padLeft(2, '0')}';
      expect(view(deadlineDay: longAgoStr, mode: 'reading').expired, isFalse);
    });
  });
```

파일 상단 import에 `import 'package:verse_flutter/core/date/local_day.dart';` 추가.

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/plan_repository_test.dart`
Expected: 컴파일 에러 또는 FAIL — `MemorizationPlanData`에 `mode` named parameter가 이미 있으므로 컴파일은
되고, "오늘 로컬 날짜가 마감일이면 만료가 아니다"가 UTC/로컬 타임존 차이가 있는 환경(KST 등)에서 실패할 수 있다.
만약 실행 환경이 UTC라 이 시점에 이미 PASS하면 Step 5에서 다시 확인하고 넘어간다.

- [ ] **Step 4: 구현 교체 — 패턴 A**

`verse-flutter/lib/core/plan/plan_repository.dart:1-11`:

변경 전:
```dart
import 'dart:math';

import 'package:drift/drift.dart';

import '../db/app_database.dart';

/// 스트릭과 동일 기준의 UTC 오늘 문자열(YYYY-MM-DD).
String todayUtcDay() => _utcDay(DateTime.now().toUtc());

String _utcDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
```

변경 후:
```dart
import 'dart:math';

import 'package:drift/drift.dart';

import '../date/local_day.dart';
import '../db/app_database.dart';

/// 어떤 시각(instant)이 로컬 타임존 기준 어느 날짜에 속하는지 'YYYY-MM-DD'로.
/// progress.updatedAt/reading_progress.typedAt처럼 실제 발생 시각을 다룰 때만
/// 쓴다 — deadlineDay처럼 이미 순수 날짜 문자열인 값에는 쓰지 않는다
/// (그런 값은 todayLocalString()과 직접 비교한다).
String _localDayOf(DateTime instant) {
  final local = instant.toLocal();
  return '${local.year.toString().padLeft(4, '0')}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
}
```

`plan_repository.dart:62-63`(`PlanView.expired`):

변경 전:
```dart
  bool get expired =>
      mode != 'reading' && plan.deadlineDay.compareTo(todayUtcDay()) < 0;
```

변경 후:
```dart
  bool get expired =>
      mode != 'reading' && plan.deadlineDay.compareTo(todayLocalString()) < 0;
```

`plan_repository.dart:268-272`(`_remainingDays`):

변경 전:
```dart
  int _remainingDays(String deadlineDay) {
    final today = DateTime.parse(todayUtcDay());
    final deadline = DateTime.parse(deadlineDay);
    return max(1, deadline.difference(today).inDays + 1);
  }
```

변경 후:
```dart
  int _remainingDays(String deadlineDay) {
    final today = DateTime.parse(todayLocalString());
    final deadline = DateTime.parse(deadlineDay);
    return max(1, deadline.difference(today).inDays + 1);
  }
```

- [ ] **Step 5: 패턴 A 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/plan_repository_test.dart`
Expected: `todayUtcDay` 참조가 남아있어 아직 컴파일 에러(Step 6에서 `_countCleared`/`_countRead`를 마저 고쳐야 함).
이 단계에서는 컴파일 에러 메시지에 `todayUtcDay` 미정의만 나오는지 확인하고 다음 단계로 진행한다.

- [ ] **Step 6: 실패하는 테스트 작성 — 패턴 B(오늘 카운트, 타임스탬프)**

`test/plan_repository_test.dart` 파일 끝(위에서 추가한 그룹 뒤)에 다음 그룹 추가. `courses`/`courseItems`/`progress`
테이블에 직접 fixture를 넣고 `planView()`를 통해 `todayCleared`를 검증한다:

```dart

  group('오늘 완료 카운트 — 로컬 자정 기준(타임스탬프)', () {
    setUp(() async {
      await db.into(db.courses).insert(CoursesCompanion.insert(
            id: const Value(1), slug: 'gen', title: '창세기', ord: 1, category: 'ot',
          ));
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: const Value(1), courseId: 1, ord: 1, book: 1, chapter: 1, verse: 1,
            verseText: 'v1',
          ));
    });

    test('로컬 자정 직후에 완료했으면 오늘 카운트에 포함된다', () async {
      // updatedAt을 "로컬 오늘 자정 + 1분"으로 세팅. UTC와 로컬 타임존이 다른
      // 환경(KST 등)에서, 예전 UTC 기준 로직이었다면 이 시각이 아직 "어제"로
      // 잘못 카운트됐을 수 있다.
      final localMidnight = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
      await db.into(db.progress).insert(ProgressCompanion.insert(
            courseItemId: 1,
            grade: 'green',
            cleared: const Value(true),
            updatedAt: localMidnight.add(const Duration(minutes: 1)),
          ));

      await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
            courseId: 1,
            title: '창세기',
            deadlineDay: todayLocalString(),
            createdAt: DateTime.now(),
          ));

      final view = await repo.planView();
      expect(view!.todayCleared, 1);
    });

    test('로컬 어제 자정 직전에 완료했으면 오늘 카운트에서 제외된다', () async {
      final localMidnight = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
      await db.into(db.progress).insert(ProgressCompanion.insert(
            courseItemId: 1,
            grade: 'green',
            cleared: const Value(true),
            updatedAt: localMidnight.subtract(const Duration(minutes: 1)),
          ));

      await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
            courseId: 1,
            title: '창세기',
            deadlineDay: todayLocalString(),
            createdAt: DateTime.now(),
          ));

      final view = await repo.planView();
      expect(view!.todayCleared, 0);
    });
  });
```

- [ ] **Step 7: 구현 교체 — 패턴 B**

`plan_repository.dart`의 `_countCleared`(주석 포함):

변경 전:
```dart
  /// cleared된 플랜 범위 절 수. todayOnly면 updatedAt의 UTC 일자가 오늘인 것만.
  Future<int> _countCleared(int courseId, List<int>? sectionIds, List<String>? topics,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId) & _db.progress.cleared.equals(true);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    if (topics != null) {
      filter = filter & _db.courseItems.topic.isIn(topics);
    }
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(filter))
        .get();
    if (!todayOnly) return rows.length;
    final today = todayUtcDay();
    var count = 0;
    for (final r in rows) {
      if (_utcDay(r.readTable(_db.progress).updatedAt.toUtc()) == today) count++;
    }
    return count;
  }
```

변경 후:
```dart
  /// cleared된 플랜 범위 절 수. todayOnly면 updatedAt의 로컬 일자가 오늘인 것만.
  Future<int> _countCleared(int courseId, List<int>? sectionIds, List<String>? topics,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId) & _db.progress.cleared.equals(true);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    if (topics != null) {
      filter = filter & _db.courseItems.topic.isIn(topics);
    }
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(filter))
        .get();
    if (!todayOnly) return rows.length;
    final today = todayLocalString();
    var count = 0;
    for (final r in rows) {
      if (_localDayOf(r.readTable(_db.progress).updatedAt) == today) count++;
    }
    return count;
  }
```

`plan_repository.dart`의 `_countRead`(주석 포함):

변경 전:
```dart
  /// 통독한 플랜 범위 절 수. todayOnly면 typedAt의 UTC 일자가 오늘인 것만.
  /// _countCleared의 통독 판(progress 대신 reading_progress를 조인한다).
  Future<int> _countRead(int courseId, List<int>? sectionIds, List<String>? topics,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    if (topics != null) {
      filter = filter & _db.courseItems.topic.isIn(topics);
    }
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.readingProgress,
          _db.readingProgress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(filter))
        .get();
    if (!todayOnly) return rows.length;
    final today = todayUtcDay();
    var count = 0;
    for (final r in rows) {
      if (_utcDay(r.readTable(_db.readingProgress).typedAt.toUtc()) == today) count++;
    }
    return count;
  }
```

변경 후:
```dart
  /// 통독한 플랜 범위 절 수. todayOnly면 typedAt의 로컬 일자가 오늘인 것만.
  /// _countCleared의 통독 판(progress 대신 reading_progress를 조인한다).
  Future<int> _countRead(int courseId, List<int>? sectionIds, List<String>? topics,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    if (topics != null) {
      filter = filter & _db.courseItems.topic.isIn(topics);
    }
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.readingProgress,
          _db.readingProgress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(filter))
        .get();
    if (!todayOnly) return rows.length;
    final today = todayLocalString();
    var count = 0;
    for (final r in rows) {
      if (_localDayOf(r.readTable(_db.readingProgress).typedAt) == today) count++;
    }
    return count;
  }
```

`verse-flutter/lib/core/db/app_database.dart:129`(`MemorizationPlan.deadlineDay` 컬럼 주석):

변경 전:
```dart
  TextColumn get deadlineDay => text()(); // YYYY-MM-DD (UTC)
```

변경 후:
```dart
  TextColumn get deadlineDay => text()(); // YYYY-MM-DD (로컬 자정 기준)
```

- [ ] **Step 8: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/plan_repository_test.dart`
Expected: PASS (기존 4개 + 이번에 추가한 5개 = 9개 전체).

- [ ] **Step 9: 커밋**

```bash
cd verse-flutter
git add lib/core/plan/plan_repository.dart lib/core/db/app_database.dart test/plan_repository_test.dart
git commit -m "fix: 플랜 만료/오늘 카운트를 UTC 자정에서 로컬 자정 기준으로 변경"
```

---

### Task 3: 전체 회귀 확인 및 스펙 문서 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-plan-deadline-local-day-design.md` (구현 완료 표시)

**Interfaces:**
- Consumes: Task 1~2에서 완성된 코드 전체
- Produces: 없음(검증 및 문서 마무리 태스크)

- [ ] **Step 1: 전체 Flutter 테스트 스위트 실행**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS, 실패 0건.

- [ ] **Step 2: UTC 잔재 검색으로 누락 확인**

Run: `cd verse-flutter && grep -rn "todayUtcDay\|_todayUtc\b\|_midnightUtc\b\|_utcDay\b" lib`
Expected: 결과 없음.

- [ ] **Step 3: `flutter analyze` 확인**

Run: `cd verse-flutter && flutter analyze`
Expected: 이번 변경과 관련된 새 이슈 없음(기존에 있던 무관한 info/warning은 그대로 있어도 됨).

- [ ] **Step 4: 스펙 문서에 구현 완료 메모 추가**

`docs/superpowers/specs/2026-08-16-plan-deadline-local-day-design.md` 맨 끝에 다음 섹션 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-plan-deadline-local-day.md` 계획대로 구현 완료.
`create_plan_screen.dart`의 마감일 선택과 `plan_repository.dart`의 만료 판정(`todayUtcDay()`→
`todayLocalString()`)·오늘 카운트(`_utcDay(x.toUtc())`→`_localDayOf(x)`, 즉 `.toLocal()` 기반)를
로컬 자정 기준으로 교체. `test/create_plan_screen_test.dart`의 기존 실패 테스트도 함께 통과로 전환됨.
```

- [ ] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-08-16-plan-deadline-local-day-design.md
git commit -m "docs: 플랜 마감일 로컬 자정 경계 전환 스펙에 구현 완료 표시"
```
