# 데일리루프 P1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 "코스 하나를 마감일까지 완주"하는 암송 플랜을 만들면, 앱이 오늘치 목표를 자동 산출하고, 새 "오늘" 홈에서 오늘 목표·플랜 진행도를 보여주며 "이어서 외우기"로 바로 학습에 진입하고, 완주 시 다음 플랜을 유도한다.

**Architecture:** 오프라인 우선 로컬 drift에 `memorization_plan` 테이블 1개만 추가한다. 오늘/전체 진행도는 기존 `Progress` + `CourseItems` 조인으로 파생 계산한다(별도 진행도 테이블 없음). `PlanRepository`가 순수 로직(목표 산출·완료 판정)을 담고, Riverpod 프로바이더로 새 `TodayScreen`·`CreatePlanScreen`에 연결한다. 스트릭·알림·resume 로직은 기존 것을 재사용한다. 마스코트 시각 요소는 P2이며 이 계획에 없다.

**Tech Stack:** Flutter, Riverpod(StateNotifier/Provider), drift(로컬 SQLite), go_router, flutter gen-l10n, flutter_test.

## Global Constraints

- 작업 디렉토리: `verse-flutter/`. 모든 경로는 이 디렉토리 기준.
- 오프라인 우선: 화면은 로컬 DB만 읽는다. 서버 호출 추가 금지(P1 범위 밖).
- 단일 행 상태 테이블 함정: drift에서 `INTEGER PRIMARY KEY`에 값을 안 주면 rowid가 배정된다. `memorization_plan`은 `autoIncrement()` PK를 쓰므로 해당 없음. (참고: `lives_state`/`streak_state`의 id=0 패턴은 이 테이블에 적용하지 않는다.)
- 날짜 기준: 스트릭과 동일하게 **UTC 자정**으로 "오늘"을 판정한다(`YYYY-MM-DD`). 로컬 시각 사용 금지.
- 딕테이션 모드는 진행도에 반영하지 않는다(기존 채점 계약 유지) — 별도 코드 추가 없이 기존 `submit()`의 `mode != 'dictation'` 분기가 그대로 처리한다.
- 새 사용자 문구는 `lib/l10n/app_ko.arb`(템플릿) + `lib/l10n/app_en.arb`에 추가하고 `flutter gen-l10n`으로 재생성한다. UI 문자열 하드코딩 금지.
- 활성 플랜은 P1에서 최대 1개다.

---

### Task 1: `memorization_plan` 테이블 + 마이그레이션

**Files:**
- Modify: `lib/core/db/app_database.dart` (테이블 클래스 추가, `@DriftDatabase` 목록, `schemaVersion`, `migration`)
- Generated: `lib/core/db/app_database.g.dart` (build_runner 재생성)
- Test: `test/memorization_plan_schema_test.dart`

**Interfaces:**
- Produces: drift 생성 타입 `MemorizationPlanData`(필드: `int id`, `int courseId`, `String title`, `String deadlineDay`, `String status`, `DateTime createdAt`), `MemorizationPlanCompanion`, 접근자 `db.memorizationPlan`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/memorization_plan_schema_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';

void main() {
  test('memorization_plan에 행을 삽입하고 다시 읽을 수 있다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    final id = await db.into(db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: 3,
            title: '시편 걷기',
            deadlineDay: '2026-08-21',
            createdAt: DateTime.utc(2026, 7, 22),
          ),
        );

    final row = await (db.select(db.memorizationPlan)..where((t) => t.id.equals(id))).getSingle();
    expect(row.courseId, 3);
    expect(row.title, '시편 걷기');
    expect(row.deadlineDay, '2026-08-21');
    expect(row.status, 'active'); // 기본값
  });
}
```

- [ ] **Step 2: 테스트 실행 → 컴파일 실패 확인**

Run: `flutter test test/memorization_plan_schema_test.dart`
Expected: FAIL — `db.memorizationPlan` / `MemorizationPlanCompanion` 미정의로 컴파일 에러.

- [ ] **Step 3: 테이블 클래스 추가 (`app_database.dart`)**

`SyncMeta` 클래스 정의 바로 다음(`@DriftDatabase` 위)에 추가:

```dart
/// 데일리루프 암송 플랜. "이 코스를 마감일까지 완주" 한 건 = 한 행.
/// P1은 활성 플랜 1개만 사용한다(status='active'). 상태 테이블(id=0)들과 달리
/// 이력을 남길 수 있게 autoIncrement PK를 쓴다.
class MemorizationPlan extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get courseId => integer()();
  TextColumn get title => text()();
  TextColumn get deadlineDay => text()(); // YYYY-MM-DD (UTC)
  TextColumn get status => text().withDefault(const Constant('active'))(); // active|completed
  DateTimeColumn get createdAt => dateTime()();
}
```

- [ ] **Step 4: `@DriftDatabase` 목록 + schemaVersion + migration 수정**

`@DriftDatabase(tables: [...])`의 목록 끝에 `MemorizationPlan`을 추가:

```dart
@DriftDatabase(
  tables: [Courses, Sections, CourseItems, Progress, Bookmarks, AttemptQueue, LivesState, StreakState, SyncMeta, MemorizationPlan],
)
```

`AppDatabase` 클래스 안에서 `schemaVersion`을 2로 올리고 `migration`을 추가:

```dart
  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(memorizationPlan);
          }
        },
      );
```

- [ ] **Step 5: 코드 생성**

Run: `dart run build_runner build --delete-conflicting-outputs`
Expected: `app_database.g.dart` 재생성, 에러 없음.

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/memorization_plan_schema_test.dart`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/core/db/app_database.dart lib/core/db/app_database.g.dart test/memorization_plan_schema_test.dart
git commit -m "feat(plan): memorization_plan 테이블 + v2 마이그레이션"
```

---

### Task 2: `PlanRepository` — 플랜 생성·조회·완료 처리

**Files:**
- Create: `lib/core/plan/plan_repository.dart`
- Test: `test/plan_repository_test.dart`

**Interfaces:**
- Consumes: `AppDatabase`, `MemorizationPlanData`, `MemorizationPlanCompanion` (Task 1).
- Produces:
  - `class PlanRepository { PlanRepository(AppDatabase db); }`
  - `Future<MemorizationPlanData> createPlan({required int courseId, required String title, required String deadlineDay})`
  - `Future<MemorizationPlanData?> activePlan()` — status='active' 중 가장 최근 생성분, 없으면 null.
  - `Future<void> markCompleted(int planId)` — 해당 플랜 status='completed'.
  - 최상위 함수 `String todayUtcDay()` — `YYYY-MM-DD`(UTC 오늘).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/plan_repository_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';

void main() {
  late AppDatabase db;
  late PlanRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = PlanRepository(db);
  });
  tearDown(() => db.close());

  test('플랜을 만들면 active 상태로 저장되고 activePlan이 그것을 반환한다', () async {
    final created = await repo.createPlan(courseId: 3, title: '시편 걷기', deadlineDay: '2026-08-21');
    expect(created.status, 'active');

    final active = await repo.activePlan();
    expect(active!.id, created.id);
    expect(active.courseId, 3);
  });

  test('활성 플랜이 없으면 activePlan은 null', () async {
    expect(await repo.activePlan(), isNull);
  });

  test('markCompleted 후에는 activePlan이 null', () async {
    final created = await repo.createPlan(courseId: 3, title: 'x', deadlineDay: '2026-08-21');
    await repo.markCompleted(created.id);
    expect(await repo.activePlan(), isNull);
  });

  test('여러 활성 플랜이 있으면 가장 최근 생성분을 반환한다', () async {
    await repo.createPlan(courseId: 1, title: 'a', deadlineDay: '2026-08-01');
    final second = await repo.createPlan(courseId: 2, title: 'b', deadlineDay: '2026-08-02');
    expect((await repo.activePlan())!.id, second.id);
  });
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/plan_repository_test.dart`
Expected: FAIL — `PlanRepository` 미정의.

- [ ] **Step 3: `PlanRepository` 구현 (생성·조회·완료 부분)**

`lib/core/plan/plan_repository.dart`:

```dart
import 'package:drift/drift.dart';

import '../db/app_database.dart';

/// 스트릭과 동일 기준의 UTC 오늘 문자열(YYYY-MM-DD).
String todayUtcDay() => _utcDay(DateTime.now().toUtc());

String _utcDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// 데일리루프 플랜의 단일 창구. 오프라인 우선 — 로컬 drift만 읽고 쓴다.
class PlanRepository {
  PlanRepository(this._db);
  final AppDatabase _db;

  Future<MemorizationPlanData> createPlan({
    required int courseId,
    required String title,
    required String deadlineDay,
  }) async {
    final id = await _db.into(_db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: courseId,
            title: title,
            deadlineDay: deadlineDay,
            createdAt: DateTime.now().toUtc(),
          ),
        );
    return (_db.select(_db.memorizationPlan)..where((t) => t.id.equals(id))).getSingle();
  }

  Future<MemorizationPlanData?> activePlan() {
    return (_db.select(_db.memorizationPlan)
          ..where((t) => t.status.equals('active'))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
          ..limit(1))
        .getSingleOrNull();
  }

  Future<void> markCompleted(int planId) async {
    await (_db.update(_db.memorizationPlan)..where((t) => t.id.equals(planId)))
        .write(const MemorizationPlanCompanion(status: Value('completed')));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/plan_repository_test.dart`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/core/plan/plan_repository.dart test/plan_repository_test.dart
git commit -m "feat(plan): PlanRepository 생성·조회·완료"
```

---

### Task 3: `PlanView` + `planView()` — 오늘 목표 자동 산출

**Files:**
- Modify: `lib/core/plan/plan_repository.dart` (PlanView 클래스 + planView() + 헬퍼)
- Test: `test/plan_view_test.dart`

**Interfaces:**
- Consumes: `PlanRepository`, `MemorizationPlanData`, 기존 테이블 `CourseItems`/`Progress`.
- Produces:
  - `class PlanView` — 필드 `MemorizationPlanData plan`, `int totalVerses`, `int clearedVerses`, `int todayCleared`, `int remainingDays`; getters `int remainingVerses`, `bool planComplete`, `int todayTarget`, `bool todayDone`.
  - `Future<PlanView?> PlanRepository.planView()` — 활성 플랜 없으면 null.

계산 규칙(스펙 §6):
- `remainingVerses = (totalVerses - clearedVerses).clamp(0, totalVerses)`
- `planComplete = totalVerses > 0 && clearedVerses >= totalVerses`
- `todayTarget = remainingVerses <= 0 ? 0 : (remainingVerses / remainingDays).ceil()`
- `todayDone = planComplete || (todayTarget > 0 && todayCleared >= todayTarget)`
- `remainingDays = max(1, deadline - today + 1)` (오늘 포함, 마감 지나면 1)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/plan_view_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';

void main() {
  late AppDatabase db;
  late PlanRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = PlanRepository(db);
  });
  tearDown(() => db.close());

  // 코스 7에 절 n개를 심는다(course_item id: 700..700+n-1, ord 오름차순).
  Future<void> seedCourse(int courseId, int n) async {
    for (var i = 0; i < n; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(courseId * 100 + i),
            courseId: courseId,
            ord: i,
            book: 19,
            chapter: 1,
            verse: i + 1,
            verseText: 'verse $i',
          ));
    }
  }

  Future<void> clearItem(int itemId, {required DateTime at}) async {
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
          courseItemId: Value(itemId),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: at,
        ));
  }

  test('활성 플랜 없으면 planView는 null', () async {
    expect(await repo.planView(), isNull);
  });

  test('총 절/완료 절/남은 절을 코스 진행도에서 계산한다', () async {
    await seedCourse(7, 10);
    await clearItem(700, at: DateTime.now());
    await clearItem(701, at: DateTime.now());
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: todayUtcDay());

    final v = (await repo.planView())!;
    expect(v.totalVerses, 10);
    expect(v.clearedVerses, 2);
    expect(v.remainingVerses, 8);
  });

  test('오늘 목표 = ceil(남은 절 / 남은 일수)', () async {
    await seedCourse(7, 10); // 완료 0, 남은 10
    // 마감을 오늘+4일(오늘 포함 5일)로 → ceil(10/5)=2
    final deadline = DateTime.now().toUtc().add(const Duration(days: 4));
    final deadlineDay =
        '${deadline.year.toString().padLeft(4, '0')}-${deadline.month.toString().padLeft(2, '0')}-${deadline.day.toString().padLeft(2, '0')}';
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: deadlineDay);

    final v = (await repo.planView())!;
    expect(v.remainingDays, 5);
    expect(v.todayTarget, 2);
    expect(v.todayDone, isFalse);
  });

  test('오늘 cleared가 오늘 목표 이상이면 todayDone', () async {
    await seedCourse(7, 10);
    final deadline = DateTime.now().toUtc().add(const Duration(days: 4)); // 목표 2
    final deadlineDay =
        '${deadline.year.toString().padLeft(4, '0')}-${deadline.month.toString().padLeft(2, '0')}-${deadline.day.toString().padLeft(2, '0')}';
    await clearItem(700, at: DateTime.now()); // 오늘 완료 1
    await clearItem(701, at: DateTime.now()); // 오늘 완료 2
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: deadlineDay);

    final v = (await repo.planView())!;
    expect(v.todayCleared, 2);
    expect(v.todayDone, isTrue);
  });

  test('어제 완료한 절은 오늘 카운트에 들지 않는다', () async {
    await seedCourse(7, 10);
    await clearItem(700, at: DateTime.now().toUtc().subtract(const Duration(days: 1)));
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: todayUtcDay());

    final v = (await repo.planView())!;
    expect(v.clearedVerses, 1); // 전체엔 포함
    expect(v.todayCleared, 0); // 오늘엔 미포함
  });

  test('모든 절 완료면 planComplete, todayTarget 0, todayDone true', () async {
    await seedCourse(7, 3);
    for (var i = 0; i < 3; i++) {
      await clearItem(700 + i, at: DateTime.now());
    }
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: todayUtcDay());

    final v = (await repo.planView())!;
    expect(v.planComplete, isTrue);
    expect(v.todayTarget, 0);
    expect(v.todayDone, isTrue);
  });
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/plan_view_test.dart`
Expected: FAIL — `planView` / `PlanView` 미정의.

- [ ] **Step 3: `PlanView` + `planView()` + 헬퍼 구현**

`plan_repository.dart` 상단(클래스 밖, `import` 아래)에 `dart:math`의 `max`가 필요하므로 import 추가:

```dart
import 'dart:math';
```

`PlanRepository` 클래스 위에 `PlanView` 추가:

```dart
/// 홈 "오늘" 화면이 필요로 하는 플랜 스냅샷. 전부 로컬 진행도에서 파생 계산된다.
class PlanView {
  const PlanView({
    required this.plan,
    required this.totalVerses,
    required this.clearedVerses,
    required this.todayCleared,
    required this.remainingDays,
  });

  final MemorizationPlanData plan;
  final int totalVerses;
  final int clearedVerses;
  final int todayCleared;
  final int remainingDays;

  int get remainingVerses => (totalVerses - clearedVerses).clamp(0, totalVerses);
  bool get planComplete => totalVerses > 0 && clearedVerses >= totalVerses;
  int get todayTarget => remainingVerses <= 0 ? 0 : (remainingVerses / remainingDays).ceil();
  bool get todayDone => planComplete || (todayTarget > 0 && todayCleared >= todayTarget);
}
```

`PlanRepository` 클래스 안(`markCompleted` 아래)에 추가:

```dart
  Future<PlanView?> planView() async {
    final plan = await activePlan();
    if (plan == null) return null;
    final total = await _countItems(plan.courseId);
    final cleared = await _countCleared(plan.courseId, todayOnly: false);
    final todayCleared = await _countCleared(plan.courseId, todayOnly: true);
    return PlanView(
      plan: plan,
      totalVerses: total,
      clearedVerses: cleared,
      todayCleared: todayCleared,
      remainingDays: _remainingDays(plan.deadlineDay),
    );
  }

  Future<int> _countItems(int courseId) async {
    final rows = await (_db.select(_db.courseItems)..where((t) => t.courseId.equals(courseId))).get();
    return rows.length;
  }

  /// cleared된 플랜 코스 절 수. todayOnly면 updatedAt의 UTC 일자가 오늘인 것만.
  Future<int> _countCleared(int courseId, {required bool todayOnly}) async {
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(_db.courseItems.courseId.equals(courseId) & _db.progress.cleared.equals(true)))
        .get();
    if (!todayOnly) return rows.length;
    final today = todayUtcDay();
    var count = 0;
    for (final r in rows) {
      if (_utcDay(r.readTable(_db.progress).updatedAt.toUtc()) == today) count++;
    }
    return count;
  }

  int _remainingDays(String deadlineDay) {
    final today = DateTime.parse(todayUtcDay());
    final deadline = DateTime.parse(deadlineDay);
    return max(1, deadline.difference(today).inDays + 1);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/plan_view_test.dart`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/core/plan/plan_repository.dart test/plan_view_test.dart
git commit -m "feat(plan): PlanView 오늘 목표 자동 산출"
```

---

### Task 4: 다음 미완료 절 노출 + 프로바이더

**Files:**
- Modify: `lib/core/courses/course_repository.dart` (public `firstUnclearedInCourse` 추가)
- Modify: `lib/app/providers.dart` (플랜 관련 프로바이더 3개)
- Test: `test/course_first_uncleared_test.dart`

**Interfaces:**
- Consumes: 기존 private `_nextUnclearedInCourse(int courseId, int afterOrd)`.
- Produces:
  - `Future<CourseItem?> CourseRepository.firstUnclearedInCourse(int courseId)` — ord 오름차순 첫 미완료 절, 전부 완료면 null.
  - `final planRepositoryProvider = Provider<PlanRepository>(...)`
  - `final activePlanViewProvider = FutureProvider.autoDispose<PlanView?>(...)`
  - `final planNextItemProvider = FutureProvider.autoDispose<CourseItem?>(...)`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/course_first_uncleared_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/courses/course_repository.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/network/api_client.dart';

void main() {
  late AppDatabase db;
  late CourseRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = CourseRepository(db, ApiClient(TokenStore()));
  });
  tearDown(() => db.close());

  Future<void> seed(int courseId, int n) async {
    for (var i = 0; i < n; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(courseId * 100 + i),
            courseId: courseId,
            ord: i,
            book: 19,
            chapter: 1,
            verse: i + 1,
            verseText: 'v$i',
          ));
    }
  }

  test('진행도 없으면 ord가 가장 낮은 절을 반환한다', () async {
    await seed(7, 3);
    final item = await repo.firstUnclearedInCourse(7);
    expect(item!.id, 700);
  });

  test('앞 절이 cleared면 다음 미완료 절을 반환한다', () async {
    await seed(7, 3);
    await db.into(db.progress).insert(ProgressCompanion.insert(
          courseItemId: const Value(700),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: DateTime.now(),
        ));
    final item = await repo.firstUnclearedInCourse(7);
    expect(item!.id, 701);
  });

  test('전부 cleared면 null', () async {
    await seed(7, 2);
    for (var i = 0; i < 2; i++) {
      await db.into(db.progress).insert(ProgressCompanion.insert(
            courseItemId: Value(700 + i),
            grade: 'green',
            cleared: const Value(true),
            updatedAt: DateTime.now(),
          ));
    }
    expect(await repo.firstUnclearedInCourse(7), isNull);
  });
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/course_first_uncleared_test.dart`
Expected: FAIL — `firstUnclearedInCourse` 미정의.

- [ ] **Step 3: `firstUnclearedInCourse` 추가**

`course_repository.dart`의 `_nextUnclearedInCourse` 정의 바로 위에 public 래퍼 추가:

```dart
  /// 코스 내 ord 오름차순 첫 미완료(uncleared) 절. 데일리루프 "이어서 외우기"용.
  /// 전부 완료면 null. afterOrd=0이라 모든 절이 "이후"로 취급되어 ord 오름차순 첫 미완료가 나온다.
  Future<CourseItem?> firstUnclearedInCourse(int courseId) => _nextUnclearedInCourse(courseId, 0);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/course_first_uncleared_test.dart`
Expected: PASS

- [ ] **Step 5: 프로바이더 추가 (`providers.dart`)**

import 추가(파일 상단 import 그룹):

```dart
import '../core/plan/plan_repository.dart';
```

`statsRepositoryProvider` 근처(파일 하단)에 추가:

```dart
final planRepositoryProvider = Provider<PlanRepository>((ref) => PlanRepository(ref.watch(databaseProvider)));

final activePlanViewProvider =
    FutureProvider.autoDispose<PlanView?>((ref) => ref.watch(planRepositoryProvider).planView());

/// 오늘 홈의 "이어서 외우기"가 진입할 다음 미완료 절. 활성 플랜 없으면 null.
final planNextItemProvider = FutureProvider.autoDispose<CourseItem?>((ref) async {
  final view = await ref.watch(activePlanViewProvider.future);
  if (view == null) return null;
  return ref.watch(courseRepositoryProvider).firstUnclearedInCourse(view.plan.courseId);
});
```

- [ ] **Step 6: 컴파일 확인 + 커밋**

Run: `flutter analyze lib/app/providers.dart lib/core/courses/course_repository.dart`
Expected: 새 코드에 에러 없음.

```bash
git add lib/core/courses/course_repository.dart lib/app/providers.dart test/course_first_uncleared_test.dart
git commit -m "feat(plan): 다음 미완료 절 노출 + 플랜 프로바이더"
```

---

### Task 5: l10n 문자열 + 플랜 생성 화면

**Files:**
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart` (`flutter gen-l10n`)
- Create: `lib/features/today/create_plan_screen.dart`
- Modify: `lib/app/router.dart` (`/plan/new` 라우트)
- Test: `test/create_plan_screen_test.dart`

**Interfaces:**
- Consumes: `courseRepositoryProvider`(`listCourses()`), `planRepositoryProvider`(`createPlan`), `activePlanViewProvider`(invalidate), `todayUtcDay`.
- Produces: `class CreatePlanScreen extends ConsumerStatefulWidget`, 라우트 `/plan/new`.
- 새 arb 키(아래 값 그대로): `createPlanTitle`, `createPlanCourseLabel`, `createPlanDeadlineLabel`, `createPlanThisWeek`, `createPlanThisMonth`, `createPlanStart`.

- [ ] **Step 1: arb 키 추가**

`lib/l10n/app_ko.arb`에 추가(마지막 키 뒤, JSON 유효성 위해 콤마 주의):

```json
  "createPlanTitle": "플랜 만들기",
  "createPlanCourseLabel": "코스 선택",
  "createPlanDeadlineLabel": "마감",
  "createPlanThisWeek": "이번 주",
  "createPlanThisMonth": "이번 달",
  "createPlanStart": "시작하기"
```

`lib/l10n/app_en.arb`에 동일 키로 추가:

```json
  "createPlanTitle": "Create plan",
  "createPlanCourseLabel": "Choose a course",
  "createPlanDeadlineLabel": "Deadline",
  "createPlanThisWeek": "This week",
  "createPlanThisMonth": "This month",
  "createPlanStart": "Start"
```

- [ ] **Step 2: l10n 재생성**

Run: `flutter gen-l10n`
Expected: `app_localizations*.dart`에 위 getter들이 생성됨(에러 없음).

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/create_plan_screen_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/features/today/create_plan_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  testWidgets('코스를 고르고 시작하면 활성 플랜이 생성된다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await db.into(db.courses).insert(CoursesCompanion.insert(
          id: const Value(7), slug: 'ps', title: '시편 걷기', ord: 0, category: 'ot'));

    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: Locale('ko'),
        home: CreatePlanScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('시작하기'));
    await tester.pumpAndSettle();

    final active = await PlanRepository(db).activePlan();
    expect(active, isNotNull);
    expect(active!.courseId, 7);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/create_plan_screen_test.dart`
Expected: FAIL — `CreatePlanScreen` 미정의.

- [ ] **Step 5: `CreatePlanScreen` 구현**

`lib/features/today/create_plan_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/db/app_database.dart';
import '../../core/plan/plan_repository.dart';
import '../../l10n/app_localizations.dart';

/// 데일리루프 플랜 생성 — 코스 하나 + 마감(이번 주/이번 달)을 고른다(P1).
class CreatePlanScreen extends ConsumerStatefulWidget {
  const CreatePlanScreen({super.key});

  @override
  ConsumerState<CreatePlanScreen> createState() => _CreatePlanScreenState();
}

class _CreatePlanScreenState extends ConsumerState<CreatePlanScreen> {
  Course? _course;
  int _days = 30; // 이번 달 기본

  String _deadlineDay(int days) {
    final d = DateTime.now().toUtc().add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  Future<void> _start(List<Course> courses) async {
    final course = _course ?? courses.first;
    await ref.read(planRepositoryProvider).createPlan(
          courseId: course.id,
          title: course.title,
          deadlineDay: _deadlineDay(_days),
        );
    ref.invalidate(activePlanViewProvider);
    ref.invalidate(planNextItemProvider);
    if (mounted) context.go('/today');
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final coursesAsync = ref.watch(_coursesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.createPlanTitle)),
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (courses) {
          if (courses.isEmpty) return const SizedBox.shrink();
          final selected = _course ?? courses.first;
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l.createPlanCourseLabel, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                DropdownButton<Course>(
                  isExpanded: true,
                  value: selected,
                  items: [
                    for (final c in courses) DropdownMenuItem(value: c, child: Text(c.title)),
                  ],
                  onChanged: (c) => setState(() => _course = c),
                ),
                const SizedBox(height: 24),
                Text(l.createPlanDeadlineLabel, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                SegmentedButton<int>(
                  segments: [
                    ButtonSegment(value: 7, label: Text(l.createPlanThisWeek)),
                    ButtonSegment(value: 30, label: Text(l.createPlanThisMonth)),
                  ],
                  selected: {_days},
                  onSelectionChanged: (s) => setState(() => _days = s.first),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () => _start(courses),
                  child: Text(l.createPlanStart),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

final _coursesProvider =
    FutureProvider.autoDispose<List<Course>>((ref) => ref.watch(courseRepositoryProvider).listCourses());
```

- [ ] **Step 6: 라우트 추가 (`router.dart`)**

import 추가:

```dart
import '../features/today/create_plan_screen.dart';
```

`/settings` 라우트 아래에 추가:

```dart
    GoRoute(path: '/plan/new', builder: (context, state) => const CreatePlanScreen()),
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `flutter test test/create_plan_screen_test.dart`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add lib/l10n/ lib/features/today/create_plan_screen.dart lib/app/router.dart test/create_plan_screen_test.dart
git commit -m "feat(plan): 플랜 생성 화면 + 라우트 + l10n"
```

---

### Task 6: "오늘" 홈 화면 + 시작 화면 승격 + 완주→다음 플랜

**Files:**
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart`
- Create: `lib/features/today/today_screen.dart`
- Modify: `lib/app/router.dart` (`/today` 라우트 + `initialLocation`)
- Test: `test/today_screen_test.dart`

**Interfaces:**
- Consumes: `activePlanViewProvider`(`PlanView?`), `planNextItemProvider`(`CourseItem?`), `currentStreakProvider`, `planRepositoryProvider`(`markCompleted`).
- Produces: `class TodayScreen extends ConsumerWidget`, 라우트 `/today`, `initialLocation='/today'`.
- 새 arb 키: `todayTitle`, `todayEmptyTitle`, `todayEmptyBody`, `todayCreatePlan`, `todayGoalTitle`, `todayGoalDone`, `todayPlanProgress`, `todayContinue`, `todayPlanComplete`, `todayNextPlan`, `todayGoalCount`(placeholders done,target:int), `todayPlanCount`(placeholders cleared,total:int), `todayDday`(placeholder days:int), `commonExploreCourses`.

- [ ] **Step 1: arb 키 추가**

`lib/l10n/app_ko.arb`에 추가:

```json
  "todayTitle": "오늘",
  "todayEmptyTitle": "아직 플랜이 없어요",
  "todayEmptyBody": "외울 코스와 마감을 정하면 매일 목표가 생겨요.",
  "todayCreatePlan": "플랜 만들기",
  "todayGoalTitle": "오늘 목표",
  "todayGoalDone": "오늘 목표 완료! 🎉",
  "todayPlanProgress": "플랜 진행",
  "todayContinue": "이어서 외우기",
  "todayPlanComplete": "플랜 완성! 🎉",
  "todayNextPlan": "다음 플랜 만들기",
  "commonExploreCourses": "코스 둘러보기",
  "todayGoalCount": "{done}/{target}절",
  "@todayGoalCount": {
    "placeholders": { "done": {"type": "int"}, "target": {"type": "int"} }
  },
  "todayPlanCount": "{cleared}/{total}절",
  "@todayPlanCount": {
    "placeholders": { "cleared": {"type": "int"}, "total": {"type": "int"} }
  },
  "todayDday": "D-{days}",
  "@todayDday": {
    "placeholders": { "days": {"type": "int"} }
  }
```

`lib/l10n/app_en.arb`에 동일 키로 추가(ICU 메타는 템플릿(ko)에만 있으면 되지만 값은 필요):

```json
  "todayTitle": "Today",
  "todayEmptyTitle": "No plan yet",
  "todayEmptyBody": "Pick a course and a deadline to get a daily goal.",
  "todayCreatePlan": "Create a plan",
  "todayGoalTitle": "Today's goal",
  "todayGoalDone": "Goal complete for today! 🎉",
  "todayPlanProgress": "Plan progress",
  "todayContinue": "Continue memorizing",
  "todayPlanComplete": "Plan complete! 🎉",
  "todayNextPlan": "Create next plan",
  "commonExploreCourses": "Explore courses",
  "todayGoalCount": "{done}/{target} verses",
  "todayPlanCount": "{cleared}/{total} verses",
  "todayDday": "D-{days}"
```

- [ ] **Step 2: l10n 재생성**

Run: `flutter gen-l10n`
Expected: 에러 없음. `todayGoalCount(int, int)` 등 생성.

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/today_screen_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/today/today_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

Widget _wrap(AppDatabase db) {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (c, s) => const TodayScreen()),
    GoRoute(path: '/plan/new', builder: (c, s) => const Scaffold(body: Text('NEW'))),
  ]);
  return ProviderScope(
    overrides: [databaseProvider.overrideWithValue(db)],
    child: MaterialApp.router(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      routerConfig: router,
    ),
  );
}

void main() {
  testWidgets('플랜 없으면 빈 상태와 만들기 버튼을 보여준다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    expect(find.text('아직 플랜이 없어요'), findsOneWidget);
    expect(find.text('플랜 만들기'), findsOneWidget);
  });

  testWidgets('활성 플랜이 있으면 오늘 목표를 보여준다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    for (var i = 0; i < 10; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(700 + i), courseId: 7, ord: i, book: 19, chapter: 1, verse: i + 1, verseText: 'v$i'));
    }
    final deadline = DateTime.now().toUtc().add(const Duration(days: 4));
    final dd =
        '${deadline.year.toString().padLeft(4, '0')}-${deadline.month.toString().padLeft(2, '0')}-${deadline.day.toString().padLeft(2, '0')}';
    await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
          courseId: 7, title: '시편 걷기', deadlineDay: dd, createdAt: DateTime.now().toUtc()));

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    expect(find.text('오늘 목표'), findsOneWidget);
    expect(find.text('0/2절'), findsOneWidget); // 남은 10 / 5일 → 목표 2
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/today_screen_test.dart`
Expected: FAIL — `TodayScreen` 미정의.

- [ ] **Step 5: `TodayScreen` 구현**

`lib/features/today/today_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/plan/plan_repository.dart';
import '../../l10n/app_localizations.dart';

/// 데일리루프 홈. 앱 시작 화면. 활성 플랜의 오늘 목표·전체 진행도를 보여주고
/// "이어서 외우기"로 다음 미완료 절에 바로 진입한다. 플랜이 없으면 빈 상태.
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final viewAsync = ref.watch(activePlanViewProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.todayTitle),
        actions: [
          TextButton(onPressed: () => context.go('/courses'), child: Text(l.commonExploreCourses)),
        ],
      ),
      body: viewAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (view) => view == null ? _empty(context, l) : _plan(context, ref, l, view),
      ),
    );
  }

  Widget _empty(BuildContext context, AppLocalizations l) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l.todayEmptyTitle, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(l.todayEmptyBody, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: () => context.go('/plan/new'), child: Text(l.todayCreatePlan)),
        ],
      ),
    );
  }

  Widget _plan(BuildContext context, WidgetRef ref, AppLocalizations l, PlanView view) {
    final theme = Theme.of(context);
    final goalRatio = view.todayTarget == 0 ? 1.0 : (view.todayCleared / view.todayTarget).clamp(0.0, 1.0);
    final planRatio = view.totalVerses == 0 ? 0.0 : (view.clearedVerses / view.totalVerses).clamp(0.0, 1.0);

    final streak = ref.watch(currentStreakProvider).valueOrNull;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 상단: 스트릭 불꽃(듀오링고 주인공). 마스코트는 P2.
        Row(
          children: [
            const Text('🔥', style: TextStyle(fontSize: 28)),
            const SizedBox(width: 4),
            Text('${streak?.currentLen ?? 0}', style: theme.textTheme.headlineSmall),
          ],
        ),
        const SizedBox(height: 16),
        Text(view.plan.title, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 24),

        // 오늘 목표
        Text(l.todayGoalTitle, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        LinearProgressIndicator(value: goalRatio, minHeight: 12),
        const SizedBox(height: 4),
        Text(view.todayDone ? l.todayGoalDone : l.todayGoalCount(view.todayCleared, view.todayTarget)),
        const SizedBox(height: 24),

        // 플랜 전체 진행
        Text(l.todayPlanProgress, style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        LinearProgressIndicator(value: planRatio, minHeight: 12),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(l.todayPlanCount(view.clearedVerses, view.totalVerses)),
            Text(l.todayDday(view.remainingDays)),
          ],
        ),
        const SizedBox(height: 32),

        // CTA — 완주면 다음 플랜, 아니면 이어서 외우기
        if (view.planComplete)
          _completeCta(context, ref, l, view)
        else
          _continueCta(context, ref, l),
      ],
    );
  }

  Widget _continueCta(BuildContext context, WidgetRef ref, AppLocalizations l) {
    final nextAsync = ref.watch(planNextItemProvider);
    return FilledButton(
      onPressed: nextAsync.valueOrNull == null
          ? null
          : () => context.go('/memorize/${nextAsync.value!.id}'),
      child: Text(l.todayContinue),
    );
  }

  Widget _completeCta(BuildContext context, WidgetRef ref, AppLocalizations l, PlanView view) {
    return Column(
      children: [
        Text(l.todayPlanComplete, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: () async {
            await ref.read(planRepositoryProvider).markCompleted(view.plan.id);
            ref.invalidate(activePlanViewProvider);
            if (context.mounted) context.go('/plan/new');
          },
          child: Text(l.todayNextPlan),
        ),
      ],
    );
  }
}
```

- [ ] **Step 6: 라우트 추가 + 시작 화면 승격 (`router.dart`)**

import 추가:

```dart
import '../features/today/today_screen.dart';
```

`initialLocation`을 바꾸고 `/today` 라우트 추가:

```dart
  initialLocation: '/today',
```

`/courses` 라우트 위에 추가:

```dart
    GoRoute(path: '/today', builder: (context, state) => const TodayScreen()),
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `flutter test test/today_screen_test.dart`
Expected: PASS

- [ ] **Step 8: 전체 테스트 + 정적 분석**

Run: `flutter test`
Expected: 전체 PASS(기존 테스트 포함).

Run: `flutter analyze`
Expected: 새 코드에 에러 없음.

- [ ] **Step 9: 수동 검증(실기기/에뮬레이터)**

Run: `flutter run`
확인 절차:
1. 앱을 켜면 **"오늘" 홈**이 뜨고, 플랜이 없으면 "아직 플랜이 없어요" + "플랜 만들기".
2. "플랜 만들기" → 코스 선택 + 이번 주/이번 달 → "시작하기".
3. 홈으로 돌아오면 **오늘 목표(예: 0/2절)**와 **플랜 진행(0/N절, D-nn)** 표시.
4. "이어서 외우기" → 코스의 첫 미완료 절 암송 화면 진입.
5. 오늘 목표 절 수만큼 green으로 완료 후 홈 복귀 → 오늘 목표 바가 차고 "오늘 목표 완료! 🎉".

- [ ] **Step 10: 커밋**

```bash
git add lib/l10n/ lib/features/today/today_screen.dart lib/app/router.dart test/today_screen_test.dart
git commit -m "feat(plan): 오늘 홈 화면 + 시작 화면 승격 + 완주→다음 플랜"
```

---

## 완료 기준 (P1)

- [ ] 활성 플랜 없을 때 "오늘" 홈이 빈 상태 + 플랜 만들기를 보여준다.
- [ ] 플랜 생성(코스+마감) 후 오늘 목표가 `ceil(남은 절 / 남은 일수)`로 산출된다.
- [ ] 오늘 목표·플랜 진행도가 기존 `Progress`에서 파생되어 표시된다.
- [ ] "이어서 외우기"가 코스의 첫 미완료 절로 진입한다.
- [ ] 오늘 목표 달성 시 오늘치 완료 상태가 반영된다(기존 스트릭 기록 재사용).
- [ ] 플랜 완주 시 다음 플랜 만들기로 유도된다.
- [ ] `flutter test` 전체 통과, `flutter analyze` 무경고(신규 코드).

## 이 계획에 포함되지 않은 것 (향후 단계)

- 마스코트 상태·애니메이션, 스트릭 위험 알림 문구 교체(→ **P2**, 스펙 §8).
- 완료 축하 연출(컨페티) 강화(→ P2).
- 섹션/특정 장/N절 타깃, 프리셋 챌린지, 데일리 퀘스트, 서버 동기화(→ **P3**, 스펙 §9).
- 하단 내비게이션 정리(→ P2). P1은 앱바 액션/버튼으로 코스·암송에 연결.
