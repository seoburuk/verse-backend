# 타자 성경통독(Reading) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 딕테이션 인터랙션을 플랜 기반 장 단위 트랙으로 확장해, 실패할 수 없는 저강도 성경통독 루프와 픽셀 성경책장 성취 시스템을 추가한다.

**Architecture:** 통독은 새 트랙이지만 새 파이프라인이 아니다. 채점(`grading.dart`)·시도 기록(`attempt_queue`)·동기화(`SyncService`)·플랜 레일(`PlanRepository`)을 그대로 재사용하고, 통독 전용으로 새로 만드는 것은 화면(`lib/features/reading/`)과 진행 인덱스(`reading_progress`)뿐이다. 서버는 `mode='reading'` 값 하나와 목숨 분기 수정, 복원용 GET 하나만 추가한다 — DB 마이그레이션이 없다.

**Tech Stack:** Flutter 3 / Riverpod / drift(SQLite) / go_router / Dio · Go 1.2x / chi / sqlc / pgx v5 / PostgreSQL

## Global Constraints

- **저장소가 두 개다.** `verse-flutter/`는 **독립 git 저장소**(현재 `main`, 최신 `c58960d`). `verse-backend/`와 `docs/`는 **`kjvapp` 저장소**에 속한다. 태스크마다 어느 저장소에서 커밋하는지 명시되어 있다 — 섞지 말 것.
- **암송 `progress` 테이블을 통독이 건드리면 안 된다.** `progress.cleared`는 "외웠다"의 뜻이고 카드 보상·암송 통계의 근거다. 통독 진행은 `reading_progress`에만 쓴다.
- **통독에는 목숨(하트)이 없다.** 클라이언트에 목숨 게이트를 넣지 않고, 서버도 `mode='reading'`에 대해 목숨을 검사하거나 소모하지 않는다.
- **입력 판정은 영숫자만.** 대소문자 무시, 구두점·공백은 커서가 자동 통과. 기준은 기존 `grading.normalize()`(소문자화 + 구두점 제거)와 일치한다.
- **drift 스키마 버전은 3 → 4로 한 번만 올린다.** Task 1에서 올리고 이후 태스크는 건드리지 않는다.
- l10n 문자열 추가 시 `lib/l10n/app_ko.arb`(템플릿)와 `lib/l10n/app_en.arb`를 **둘 다** 수정하고 `flutter gen-l10n`을 돌린다. 생성 파일(`app_localizations*.dart`)은 저장소에 커밋된다.
- 각 태스크는 테스트가 통과한 상태로 끝난다. Flutter는 `flutter test`, Go는 `go test ./...`.

---

# Phase A — 통독 코어 (로컬 전용)

Phase A만 완료해도 통독은 오프라인에서 완전히 동작한다.

---

### Task 1: drift 스키마 v4 — `mode` 컬럼과 `reading_progress` 테이블

**저장소:** `verse-flutter`

**Files:**
- Modify: `lib/core/db/app_database.dart`
- Test: `test/reading_progress_schema_test.dart` (create)
- Test: `test/memorization_plan_schema_test.dart` (modify — mode 기본값 검증 추가)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `ReadingProgress` 테이블 (`courseItemId` PK, `typedAt` DateTime), `MemorizationPlan.mode` 컬럼(TextColumn, 기본값 `'memorize'`), `AppDatabase.readingProgress` 접근자, `ReadingProgressCompanion`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/reading_progress_schema_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';

void main() {
  test('reading_progress에 행을 삽입하고 다시 읽을 수 있다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await db.into(db.readingProgress).insert(
          ReadingProgressCompanion.insert(
            courseItemId: 42,
            typedAt: DateTime.utc(2026, 7, 29),
          ),
        );

    final row = await (db.select(db.readingProgress)
          ..where((t) => t.courseItemId.equals(42)))
        .getSingle();
    expect(row.courseItemId, 42);
    expect(row.typedAt, DateTime.utc(2026, 7, 29));
  });

  test('memorization_plan.mode의 기본값은 memorize다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    final id = await db.into(db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: 3,
            title: '창세기',
            deadlineDay: '2026-08-21',
            createdAt: DateTime.utc(2026, 7, 29),
          ),
        );

    final row = await (db.select(db.memorizationPlan)..where((t) => t.id.equals(id))).getSingle();
    expect(row.mode, 'memorize');
  });

  test('mode에 reading을 저장할 수 있다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    final id = await db.into(db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: 3,
            title: '창세기',
            deadlineDay: '2026-08-21',
            createdAt: DateTime.utc(2026, 7, 29),
            mode: const Value('reading'),
          ),
        );

    final row = await (db.select(db.memorizationPlan)..where((t) => t.id.equals(id))).getSingle();
    expect(row.mode, 'reading');
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/reading_progress_schema_test.dart`
Expected: FAIL — `The getter 'readingProgress' isn't defined for the type 'AppDatabase'`

- [ ] **Step 3: 스키마 변경**

`lib/core/db/app_database.dart`의 `MemorizationPlan` 클래스에 컬럼 추가 (`sectionIds` 선언 바로 아래):

```dart
  /// 플랜의 트랙. memorize = 암송(채점·하트), reading = 통독(따라 치기).
  /// 모드별로 활성 플랜을 1개씩 가질 수 있다.
  TextColumn get mode => text().withDefault(const Constant('memorize'))(); // memorize|reading
```

`MemorizationPlan` 클래스 아래에 새 테이블 추가:

```dart
/// 통독으로 타이핑을 마친 절. 암송 progress와 절대 섞지 않는다 —
/// progress.cleared는 "외웠다"는 뜻이고 카드 보상·암송 통계의 근거다.
/// 서버의 진실 소스는 attempts(mode='reading')이고, 이 테이블은 진행바·책장이
/// 네트워크를 기다리지 않게 하는 오프라인 우선 캐시다.
class ReadingProgress extends Table {
  IntColumn get courseItemId => integer()();
  DateTimeColumn get typedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {courseItemId};
}
```

`@DriftDatabase` 애노테이션의 `tables` 목록 끝에 `ReadingProgress` 추가:

```dart
@DriftDatabase(
  tables: [Courses, Sections, CourseItems, Progress, Bookmarks, AttemptQueue, LivesState, StreakState, SyncMeta, MemorizationPlan, ReadingProgress],
)
```

`schemaVersion`을 3 → 4로:

```dart
  @override
  int get schemaVersion => 4;
```

`migration`의 `onUpgrade`에 분기 추가 (`from < 3` 블록 아래):

```dart
          if (from < 4) {
            await m.addColumn(memorizationPlan, memorizationPlan.mode);
            await m.createTable(readingProgress);
          }
```

- [ ] **Step 4: drift 코드 생성**

Run: `dart run build_runner build`
Expected: `Built with build_runner/aot in Ns; wrote N outputs.` — `lib/core/db/app_database.g.dart`에 `readingProgress`가 생긴다.

확인: `grep -c "readingProgress" lib/core/db/app_database.g.dart` 가 0보다 커야 한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `flutter test test/reading_progress_schema_test.dart test/memorization_plan_schema_test.dart`
Expected: PASS (전부)

- [ ] **Step 6: 전체 테스트로 회귀 확인**

Run: `flutter test`
Expected: All tests passed! (기존 201개 + 신규 3개)

- [ ] **Step 7: 커밋**

```bash
git add lib/core/db/app_database.dart lib/core/db/app_database.g.dart test/reading_progress_schema_test.dart
git commit -m "feat: drift 스키마 v4 — 플랜 mode 컬럼과 reading_progress 테이블"
```

---

### Task 2: `ReadingProgressRepository`

**저장소:** `verse-flutter`

**Files:**
- Create: `lib/core/reading/reading_progress_repository.dart`
- Test: `test/reading_progress_repository_test.dart`

**Interfaces:**
- Consumes: Task 1의 `AppDatabase.readingProgress`, `ReadingProgressCompanion`
- Produces:
  - `class ReadingProgressRepository(AppDatabase db)`
  - `Future<void> markTyped(int courseItemId)` — 이미 있으면 `typedAt` 갱신 안 함
  - `Future<bool> isTyped(int courseItemId)`
  - `Future<int> countForCourse(int courseId, List<int>? sectionIds)`
  - `Future<int> countAll()`
  - `Future<Set<int>> typedItemIdsForCourse(int courseId)`
  - `AppDatabase get db` — 통독 컨트롤러가 attempt_queue에 직접 적재할 때 쓴다
  - `readingProgressRepositoryProvider` (Provider\<ReadingProgressRepository\>) — Task 7·11·13이 참조한다

- [ ] **Step 1: 실패하는 테스트 작성**

`test/reading_progress_repository_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/reading/reading_progress_repository.dart';

/// 코스 1 / 섹션 10·11에 절을 깔아두는 최소 픽스처.
Future<void> _seed(AppDatabase db) async {
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1),
        slug: 'genesis',
        title: '창세기',
        ord: 1,
        category: 'ot',
      ));
  var id = 100;
  for (final sectionId in [10, 11]) {
    for (var i = 0; i < 3; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(id),
            courseId: 1,
            sectionId: Value(sectionId),
            ord: i,
            book: 1,
            chapter: sectionId - 9,
            verse: i + 1,
            verseText: 'verse $id',
          ));
      id++;
    }
  }
}

void main() {
  late AppDatabase db;
  late ReadingProgressRepository repo;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = ReadingProgressRepository(db);
    await _seed(db);
  });
  tearDown(() => db.close());

  test('markTyped로 기록하면 isTyped가 true다', () async {
    expect(await repo.isTyped(100), isFalse);
    await repo.markTyped(100);
    expect(await repo.isTyped(100), isTrue);
  });

  test('이미 통독한 절을 다시 쳐도 typedAt이 갱신되지 않는다', () async {
    await repo.markTyped(100);
    final first = await (db.select(db.readingProgress)
          ..where((t) => t.courseItemId.equals(100)))
        .getSingle();

    await Future<void>.delayed(const Duration(milliseconds: 10));
    await repo.markTyped(100);

    final second = await (db.select(db.readingProgress)
          ..where((t) => t.courseItemId.equals(100)))
        .getSingle();
    expect(second.typedAt, first.typedAt);
  });

  test('countForCourse는 섹션 범위로 좁혀 센다', () async {
    await repo.markTyped(100); // 섹션 10
    await repo.markTyped(101); // 섹션 10
    await repo.markTyped(103); // 섹션 11

    expect(await repo.countForCourse(1, null), 3);
    expect(await repo.countForCourse(1, [10]), 2);
    expect(await repo.countForCourse(1, [11]), 1);
  });

  test('통독 기록은 암송 progress와 독립이다', () async {
    await repo.markTyped(100);

    final progressRows = await db.select(db.progress).get();
    expect(progressRows, isEmpty);
  });

  test('typedItemIdsForCourse는 그 코스의 통독한 절 id 집합을 준다', () async {
    await repo.markTyped(100);
    await repo.markTyped(103);

    expect(await repo.typedItemIdsForCourse(1), {100, 103});
  });

  test('countAll은 전체 통독 절 수다', () async {
    expect(await repo.countAll(), 0);
    await repo.markTyped(100);
    await repo.markTyped(103);
    expect(await repo.countAll(), 2);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/reading_progress_repository_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'package:verse_flutter/core/reading/reading_progress_repository.dart'`

- [ ] **Step 3: 저장소 구현**

`lib/core/reading/reading_progress_repository.dart` 생성:

```dart
import 'package:drift/drift.dart';

import '../db/app_database.dart';

/// 통독 진행의 단일 창구. 오프라인 우선 — 로컬 drift만 읽고 쓴다.
/// 암송 progress와 절대 섞지 않는다(스펙 §1.1).
class ReadingProgressRepository {
  ReadingProgressRepository(this._db);
  final AppDatabase _db;

  /// 절 하나를 통독 완료로 기록한다.
  /// **이미 있으면 아무것도 하지 않는다** — 첫 완료 시각을 보존한다(스펙 §8).
  Future<void> markTyped(int courseItemId) async {
    await _db.into(_db.readingProgress).insert(
          ReadingProgressCompanion.insert(
            courseItemId: courseItemId,
            typedAt: DateTime.now().toUtc(),
          ),
          mode: InsertMode.insertOrIgnore,
        );
  }

  Future<bool> isTyped(int courseItemId) async {
    final row = await (_db.select(_db.readingProgress)
          ..where((t) => t.courseItemId.equals(courseItemId)))
        .getSingleOrNull();
    return row != null;
  }

  /// 코스(옵션: 섹션 범위) 안에서 통독한 절 수. 플랜 진행바·책장이 쓴다.
  Future<int> countForCourse(int courseId, List<int>? sectionIds) async {
    var filter = _db.courseItems.courseId.equals(courseId);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.readingProgress,
          _db.readingProgress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(filter))
        .get();
    return rows.length;
  }

  /// 전체 통독 절 수. 광고의 "첫 장 면제" 판정에 쓴다(스펙 §6).
  Future<int> countAll() async {
    final rows = await _db.select(_db.readingProgress).get();
    return rows.length;
  }

  /// 그 코스에서 통독한 course_item id 집합. 책장의 장별 진행 표시용.
  Future<Set<int>> typedItemIdsForCourse(int courseId) async {
    final rows = await (_db.select(_db.courseItems).join([
      innerJoin(_db.readingProgress,
          _db.readingProgress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
          ..where(_db.courseItems.courseId.equals(courseId)))
        .get();
    return rows.map((r) => r.readTable(_db.courseItems).id).toSet();
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/reading_progress_repository_test.dart`
Expected: PASS (6개)

- [ ] **Step 5: 프로바이더 등록**

`lib/app/providers.dart`에 추가 (`planRepositoryProvider` 근처). Task 7·11·13이 이걸 참조하므로 여기서 미리 만든다:

```dart
final readingProgressRepositoryProvider = Provider<ReadingProgressRepository>(
  (ref) => ReadingProgressRepository(ref.watch(appDatabaseProvider)),
);
```

파일 상단에 `import '../core/reading/reading_progress_repository.dart';`를 추가한다.

Run: `flutter analyze lib/app/providers.dart`
Expected: No issues found.

- [ ] **Step 6: 커밋**

```bash
git add lib/core/reading/reading_progress_repository.dart lib/app/providers.dart test/reading_progress_repository_test.dart
git commit -m "feat: 통독 진행 저장소 — 첫 완료 시각 보존, 암송 progress와 독립"
```

---

### Task 3: `PlanRepository` 모드 분기

**저장소:** `verse-flutter`

**Files:**
- Modify: `lib/core/plan/plan_repository.dart`
- Test: `test/plan_reading_mode_test.dart` (create)

**Interfaces:**
- Consumes: Task 1의 `mode` 컬럼, Task 2의 `ReadingProgressRepository`
- Produces:
  - `PlanRepository.createPlan({..., String mode = 'memorize'})`
  - `PlanRepository.activePlan({String mode = 'memorize'})`
  - `PlanRepository.planView({String mode = 'memorize'})`
  - `PlanView.mode` (String getter — `plan.mode` 위임)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/plan_reading_mode_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/core/reading/reading_progress_repository.dart';

Future<void> _seed(AppDatabase db) async {
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  for (var i = 0; i < 4; i++) {
    await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
          id: Value(100 + i),
          courseId: 1,
          sectionId: const Value(10),
          ord: i,
          book: 1,
          chapter: 1,
          verse: i + 1,
          verseText: 'verse ${100 + i}',
        ));
  }
}

void main() {
  late AppDatabase db;
  late PlanRepository plans;
  late ReadingProgressRepository reading;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    plans = PlanRepository(db);
    reading = ReadingProgressRepository(db);
    await _seed(db);
  });
  tearDown(() => db.close());

  Future<void> makePlan(String mode) => plans.createPlan(
        courseId: 1,
        title: '창세기',
        deadlineDay: '2026-12-31',
        sectionIds: [10],
        mode: mode,
      );

  test('모드별로 활성 플랜을 따로 조회한다', () async {
    await makePlan('memorize');
    await makePlan('reading');

    final m = await plans.activePlan(mode: 'memorize');
    final r = await plans.activePlan(mode: 'reading');
    expect(m!.mode, 'memorize');
    expect(r!.mode, 'reading');
    expect(m.id, isNot(r.id));
  });

  test('암송 플랜만 있으면 통독 활성 플랜은 null이다', () async {
    await makePlan('memorize');
    expect(await plans.activePlan(mode: 'reading'), isNull);
  });

  test('통독 planView는 reading_progress로 진행률을 센다', () async {
    await makePlan('reading');
    await reading.markTyped(100);
    await reading.markTyped(101);

    final view = await plans.planView(mode: 'reading');
    expect(view!.totalVerses, 4);
    expect(view.clearedVerses, 2);
  });

  test('암송으로 외운 절은 통독 진행률에 잡히지 않는다', () async {
    await makePlan('reading');
    await db.into(db.progress).insert(ProgressCompanion.insert(
          courseItemId: const Value(100),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: DateTime.now().toUtc(),
        ));

    final view = await plans.planView(mode: 'reading');
    expect(view!.clearedVerses, 0);
  });

  test('통독으로 친 절은 암송 진행률에 잡히지 않는다', () async {
    await makePlan('memorize');
    await reading.markTyped(100);

    final view = await plans.planView(mode: 'memorize');
    expect(view!.clearedVerses, 0);
  });

  test('통독 planView의 오늘 진행은 오늘 친 절만 센다', () async {
    await makePlan('reading');
    await reading.markTyped(100);

    final view = await plans.planView(mode: 'reading');
    expect(view!.todayCleared, 1);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/plan_reading_mode_test.dart`
Expected: FAIL — `No named parameter with the name 'mode'`

- [ ] **Step 3: `PlanRepository` 수정**

`lib/core/plan/plan_repository.dart`에서 다음 네 곳을 바꾼다.

(3-a) `PlanView`에 mode 접근자 추가 — `bool get expired` 위:

```dart
  /// 플랜의 트랙. 'memorize' | 'reading'.
  String get mode => plan.mode;
```

(3-b) `createPlan` 시그니처와 삽입에 mode 추가:

```dart
  Future<MemorizationPlanData> createPlan({
    required int courseId,
    required String title,
    required String deadlineDay,
    List<int>? sectionIds,
    String mode = 'memorize',
  }) async {
    final id = await _db.into(_db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: courseId,
            title: title,
            deadlineDay: deadlineDay,
            createdAt: DateTime.now().toUtc(),
            mode: Value(mode),
            sectionIds: Value(
              (sectionIds == null || sectionIds.isEmpty) ? null : sectionIds.join(','),
            ),
          ),
        );
    return (_db.select(_db.memorizationPlan)..where((t) => t.id.equals(id))).getSingle();
  }
```

(3-c) `activePlan`에 mode 필터:

```dart
  Future<MemorizationPlanData?> activePlan({String mode = 'memorize'}) {
    return (_db.select(_db.memorizationPlan)
          ..where((t) => t.status.equals('active') & t.mode.equals(mode))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt), (t) => OrderingTerm.desc(t.id)])
          ..limit(1))
        .getSingleOrNull();
  }
```

(3-d) `planView`가 모드별 집계 소스를 고르게:

```dart
  Future<PlanView?> planView({String mode = 'memorize'}) async {
    final plan = await activePlan(mode: mode);
    if (plan == null) return null;
    final course =
        await (_db.select(_db.courses)..where((t) => t.id.equals(plan.courseId))).getSingleOrNull();
    final sectionIds = parseSectionIds(plan.sectionIds);
    final total = await _countItems(plan.courseId, sectionIds);
    final isReading = mode == 'reading';
    final cleared = isReading
        ? await _countRead(plan.courseId, sectionIds, todayOnly: false)
        : await _countCleared(plan.courseId, sectionIds, todayOnly: false);
    final todayCleared = isReading
        ? await _countRead(plan.courseId, sectionIds, todayOnly: true)
        : await _countCleared(plan.courseId, sectionIds, todayOnly: true);
    return PlanView(
      plan: plan,
      courseTitle: course?.title ?? plan.title,
      courseTitleEn: course?.titleEn ?? '',
      totalVerses: total,
      clearedVerses: cleared,
      todayCleared: todayCleared,
      remainingDays: _remainingDays(plan.deadlineDay),
      sectionIds: sectionIds,
    );
  }
```

(3-e) `_countCleared` 바로 아래에 통독용 집계 추가:

```dart
  /// 통독한 플랜 범위 절 수. todayOnly면 typedAt의 UTC 일자가 오늘인 것만.
  /// _countCleared의 통독 판(progress 대신 reading_progress를 조인한다).
  Future<int> _countRead(int courseId, List<int>? sectionIds,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/plan_reading_mode_test.dart`
Expected: PASS (6개)

- [ ] **Step 5: 기존 플랜 테스트 회귀 확인**

Run: `flutter test`
Expected: All tests passed! — 기존 플랜 테스트들이 mode 기본값 `'memorize'`로 그대로 통과해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/core/plan/plan_repository.dart test/plan_reading_mode_test.dart
git commit -m "feat: 플랜 저장소 모드 분기 — 모드별 활성 플랜 1개, 집계 소스 분리"
```

---

### Task 4: `typing_cursor` — 입력 판정 순수 로직

**저장소:** `verse-flutter`

**Files:**
- Create: `lib/features/reading/typing_cursor.dart`
- Test: `test/typing_cursor_test.dart`

**Interfaces:**
- Consumes: 없음 (의존성 없는 순수 함수)
- Produces:
  - `class TypingCursor { final String text; final int index; bool get isComplete; String get confirmed; String get current; String get remaining; }`
  - `TypingCursor initialCursor(String text)`
  - `TypingCursor advanceCursor(TypingCursor c, String input)`
  - `TypingCursor backspaceCursor(TypingCursor c)`

**설계 불변식:** `index`는 `text.length`이거나, `text[index]`가 반드시 영숫자다. 확정 구간은 `text.substring(0, index)`. 이 불변식 덕분에 화면은 인덱스 하나만 보고 3구간을 칠할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/typing_cursor_test.dart` 생성:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/reading/typing_cursor.dart';

void main() {
  const verse = 'And God said, Let there be light: and there was light.';

  test('초기 커서는 첫 영숫자를 가리킨다', () {
    final c = initialCursor(verse);
    expect(c.index, 0);
    expect(c.isComplete, isFalse);
    expect(c.confirmed, '');
  });

  test('앞에 구두점이 있으면 건너뛴 자리에서 시작한다', () {
    final c = initialCursor('  "Hello');
    expect(c.index, 3); // 공백 2 + 따옴표 1을 건너뛴다
    expect(c.confirmed, '  "');
  });

  test('정타를 치면 커서가 전진한다', () {
    var c = initialCursor(verse);
    c = advanceCursor(c, 'A');
    expect(c.index, 1);
    expect(c.confirmed, 'A');
  });

  test('대소문자를 무시한다', () {
    var c = initialCursor(verse);
    c = advanceCursor(c, 'a'); // 원문은 대문자 A
    expect(c.index, 1);
  });

  test('오타는 무시되고 커서가 정지한다', () {
    final c = initialCursor(verse);
    final after = advanceCursor(c, 'z');
    expect(after.index, c.index);
    expect(identical(after.text, c.text), isTrue);
  });

  test('단어 끝을 치면 뒤따르는 공백까지 자동 확정된다', () {
    var c = initialCursor(verse);
    for (final ch in 'And'.split('')) {
      c = advanceCursor(c, ch);
    }
    // "And" 3글자 + 공백 1개가 확정된다
    expect(c.confirmed, 'And ');
    expect(c.index, 4);
  });

  test('구두점은 커서가 자동으로 통과한다', () {
    var c = initialCursor(verse);
    for (final ch in 'AndGodsaid'.split('')) {
      c = advanceCursor(c, ch);
    }
    // "And God said," 까지 확정 — 쉼표와 뒤 공백을 치지 않았는데 통과했다
    expect(c.confirmed, 'And God said, ');
  });

  test('구두점을 직접 쳐도 통과되지 않는다 (무시된다)', () {
    var c = initialCursor(verse);
    for (final ch in 'AndGodsaid'.split('')) {
      c = advanceCursor(c, ch);
    }
    final before = c.index;
    c = advanceCursor(c, ','); // 이미 자동 통과된 구두점 — 무시
    expect(c.index, before);
  });

  test('백스페이스는 직전 영숫자까지 되돌린다', () {
    var c = initialCursor(verse);
    for (final ch in 'And'.split('')) {
      c = advanceCursor(c, ch);
    }
    expect(c.index, 4); // "And " 확정
    c = backspaceCursor(c);
    expect(c.index, 2); // 'd'를 다시 쳐야 한다
    expect(c.confirmed, 'An');
  });

  test('시작 지점에서 백스페이스는 아무 일도 하지 않는다', () {
    final c = initialCursor(verse);
    expect(backspaceCursor(c).index, c.index);
  });

  test('마지막 영숫자를 치면 뒤 구두점까지 넘어가며 완료된다', () {
    var c = initialCursor('Go.');
    c = advanceCursor(c, 'G');
    c = advanceCursor(c, 'o');
    expect(c.isComplete, isTrue);
    expect(c.index, 3);
  });

  test('완료 후 추가 입력은 무시된다', () {
    var c = initialCursor('Go.');
    c = advanceCursor(c, 'G');
    c = advanceCursor(c, 'o');
    final after = advanceCursor(c, 'x');
    expect(after.index, c.index);
  });

  test('영숫자가 없는 텍스트는 즉시 완료 상태다', () {
    expect(initialCursor('...').isComplete, isTrue);
  });

  test('숫자도 영숫자로 취급한다', () {
    var c = initialCursor('Psalm 23');
    for (final ch in 'Psalm2'.split('')) {
      c = advanceCursor(c, ch);
    }
    expect(c.confirmed, 'Psalm 2');
  });

  test('confirmed/current/remaining이 원문을 빠짐없이 분할한다', () {
    var c = initialCursor(verse);
    c = advanceCursor(c, 'A');
    expect(c.confirmed + c.current + c.remaining, verse);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/typing_cursor_test.dart`
Expected: FAIL — `Target of URI doesn't exist: '.../typing_cursor.dart'`

- [ ] **Step 3: 구현**

`lib/features/reading/typing_cursor.dart` 생성:

```dart
/// 통독 타이핑의 커서. 절 원문 위의 인덱스 하나로 상태를 전부 표현한다.
///
/// 판정 기준은 영숫자뿐이다 — 대소문자를 무시하고, 구두점·공백은 커서가
/// 자동으로 통과한다(스펙 §4.2). 이 기준은 기존 grading.normalize()
/// (소문자화 + 구두점 제거)와 정확히 일치하므로, 완주한 입력은 채점하면
/// 항상 green이 된다.
///
/// **불변식:** [index]는 [text].length이거나, text[index]가 반드시 영숫자다.
/// 화면은 이 인덱스 하나만 보고 확정/커서/미입력 3구간을 칠한다.
library typing_cursor;

class TypingCursor {
  const TypingCursor({required this.text, required this.index});

  /// 절 원문. 구두점을 포함해 화면에 그대로 표시된다.
  final String text;

  /// 다음에 입력받아야 할 위치. text.length면 절이 완료된 것이다.
  final int index;

  bool get isComplete => index >= text.length;

  /// 이미 친 구간 — 진한 색으로 표시한다.
  String get confirmed => text.substring(0, index);

  /// 지금 쳐야 할 한 글자 — 커서로 강조한다. 완료 상태면 빈 문자열.
  String get current => isComplete ? '' : text.substring(index, index + 1);

  /// 아직 안 친 구간 — 흐리게 표시한다.
  String get remaining => isComplete ? '' : text.substring(index + 1);
}

final RegExp _alnum = RegExp(r'[a-zA-Z0-9]');

bool _isAlnum(String ch) => _alnum.hasMatch(ch);

/// [from]부터 처음 만나는 영숫자의 인덱스. 없으면 text.length.
int _nextAlnum(String text, int from) {
  var i = from;
  while (i < text.length && !_isAlnum(text[i])) {
    i++;
  }
  return i;
}

/// 절 시작 커서. 앞쪽 구두점·공백은 미리 확정해 불변식을 세운다.
TypingCursor initialCursor(String text) =>
    TypingCursor(text: text, index: _nextAlnum(text, 0));

/// 한 글자 입력. 다음 영숫자와 (대소문자 무시하고) 일치하면 전진하고,
/// 전진 후 뒤따르는 구두점·공백까지 한 번에 확정한다.
/// 불일치하면 **아무 일도 일어나지 않는다** — 틀린 글자는 들어갈 수 없다.
TypingCursor advanceCursor(TypingCursor c, String input) {
  if (c.isComplete) return c;
  if (input.isEmpty) return c;

  final target = c.text[c.index];
  if (input.toLowerCase() != target.toLowerCase()) return c;

  return TypingCursor(text: c.text, index: _nextAlnum(c.text, c.index + 1));
}

/// 직전 영숫자까지 되돌린다. 시작 지점이면 아무 일도 하지 않는다.
TypingCursor backspaceCursor(TypingCursor c) {
  var i = c.index - 1;
  while (i >= 0 && !_isAlnum(c.text[i])) {
    i--;
  }
  if (i < 0) return c;
  return TypingCursor(text: c.text, index: i);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/typing_cursor_test.dart`
Expected: PASS (15개)

- [ ] **Step 5: 커밋**

```bash
git add lib/features/reading/typing_cursor.dart test/typing_cursor_test.dart
git commit -m "feat: 통독 타이핑 커서 — 영숫자 판정, 구두점 자동 통과, 오타 차단"
```

---

### Task 5: 플랜 생성 트랙 갈림길

**저장소:** `verse-flutter`

**Files:**
- Modify: `lib/features/today/create_plan_screen.dart`
- Modify: `lib/features/today/plan_scope_picker.dart` (성경 전용 필터 파라미터 추가)
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/create_plan_track_test.dart` (create)

**Interfaces:**
- Consumes: Task 3의 `createPlan(mode:)`
- Produces: `PlanScopePicker({required onPicked, bool bibleOnly = false})` — `bibleOnly`면 소형 코스·워밍업을 숨긴다

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`에 추가:

```json
  "createPlanTrackTitle": "어떻게 할까요?",
  "createPlanTrackMemorize": "암송",
  "createPlanTrackMemorizeDesc": "외우고 채점받기",
  "createPlanTrackReading": "통독",
  "createPlanTrackReadingDesc": "보고 따라 치기",
```

`lib/l10n/app_en.arb`에 추가:

```json
  "createPlanTrackTitle": "What would you like to do?",
  "createPlanTrackMemorize": "Memorize",
  "createPlanTrackMemorizeDesc": "Recall and get graded",
  "createPlanTrackReading": "Reading",
  "createPlanTrackReadingDesc": "Type along with the text",
```

Run: `flutter gen-l10n`
Expected: 에러 없이 완료. `grep -c createPlanTrackTitle lib/l10n/app_localizations.dart` 가 0보다 크다.

- [ ] **Step 2: 실패하는 테스트 작성**

`test/create_plan_track_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/today/create_plan_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'foundations', title: '기초', ord: 1, category: 'foundations'));
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(2), slug: 'genesis', title: '창세기', ord: 2, category: 'ot'));
  return db;
}

Widget _app(AppDatabase db) => ProviderScope(
      overrides: [appDatabaseProvider.overrideWithValue(db)],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: Locale('ko'),
        home: CreatePlanScreen(),
      ),
    );

void main() {
  testWidgets('플랜 생성은 트랙 선택으로 시작한다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    expect(find.text('어떻게 할까요?'), findsOneWidget);
    expect(find.text('암송'), findsOneWidget);
    expect(find.text('통독'), findsOneWidget);
  });

  testWidgets('통독을 고르면 성경 책만 보인다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    await tester.tap(find.text('통독'));
    await tester.pumpAndSettle();

    expect(find.text('기초'), findsNothing); // 소형 코스는 암송 전용
  });

  testWidgets('암송을 고르면 소형 코스도 보인다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    await tester.tap(find.text('암송'));
    await tester.pumpAndSettle();

    expect(find.text('기초'), findsOneWidget);
  });
}
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `flutter test test/create_plan_track_test.dart`
Expected: FAIL — `Expected: exactly one matching candidate / Actual: _TextFinder:<zero widgets with text "어떻게 할까요?">`

- [ ] **Step 4: `PlanScopePicker`에 `bibleOnly` 추가**

`lib/features/today/plan_scope_picker.dart`의 `PlanScopePicker` 클래스를 수정:

```dart
class PlanScopePicker extends ConsumerWidget {
  const PlanScopePicker({super.key, required this.onPicked, this.bibleOnly = false});

  /// 코스 전체로 끝나는 선택(소형 코스)이면 sectionIds가 빈 채로 온다.
  final void Function(PlanScope scope) onPicked;

  /// 통독 트랙이면 true — 성경 책 경로만 노출한다. 소형 코스·워밍업 섹터는
  /// 암송 전용 큐레이션이라 통독 플랜의 대상이 아니다(스펙 §2).
  final bool bibleOnly;
```

`build`의 `data:` 콜백에서 목록을 거르도록 수정 — `final small = ...` 세 줄을 다음으로 교체:

```dart
        final small = bibleOnly
            ? const <Course>[]
            : courses.where((c) => _smallCategories.contains(c.category)).toList();
        final warmup =
            bibleOnly ? const <Course>[] : courses.where((c) => c.category == 'warmup').toList();
        final bible = courses.where((c) => c.category == 'ot' || c.category == 'nt').toList();
```

- [ ] **Step 5: `CreatePlanScreen`에 트랙 단계 추가**

`lib/features/today/create_plan_screen.dart`의 `_CreatePlanScreenState`에 상태 필드와 트랙 화면을 추가한다. `build`가 `_mode`가 null이면 트랙 선택을, 아니면 기존 흐름을 그리도록 감싼다:

```dart
  /// 선택한 트랙. null이면 아직 갈림길 단계다.
  String? _mode;

  Widget _trackStep(BuildContext context, AppLocalizations l) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(l.createPlanTrackTitle, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Text('🧠', style: TextStyle(fontSize: 28)),
            title: Text(l.createPlanTrackMemorize),
            subtitle: Text(l.createPlanTrackMemorizeDesc),
            onTap: () => setState(() => _mode = 'memorize'),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Text('⌨️', style: TextStyle(fontSize: 28)),
            title: Text(l.createPlanTrackReading),
            subtitle: Text(l.createPlanTrackReadingDesc),
            onTap: () => setState(() => _mode = 'reading'),
          ),
        ),
      ],
    );
  }
```

`build` 안에서 본문을 고르는 지점에 분기를 넣는다 (기존 `Scaffold`의 `body:`가 받던 위젯을 `_mode == null ? _trackStep(context, l) : <기존 본문>` 으로 감싼다). 기존 본문에서 `PlanScopePicker`를 만드는 곳에 `bibleOnly: _mode == 'reading'`를 넘기고, 플랜을 실제로 만드는 `createPlan(...)` 호출에 `mode: _mode!`를 추가한다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/create_plan_track_test.dart`
Expected: PASS (3개)

- [ ] **Step 7: 기존 플랜 생성 테스트 회귀 확인**

Run: `flutter test test/create_plan_screen_test.dart test/plan_scope_picker_test.dart`
Expected: PASS — 기존 테스트가 트랙 단계를 거치도록 수정이 필요하면, 각 테스트 시작부에 `await tester.tap(find.text('암송')); await tester.pumpAndSettle();`를 추가한다.

- [ ] **Step 8: 커밋**

```bash
git add lib/features/today/create_plan_screen.dart lib/features/today/plan_scope_picker.dart lib/l10n/ test/create_plan_track_test.dart test/create_plan_screen_test.dart test/plan_scope_picker_test.dart
git commit -m "feat: 플랜 생성 트랙 갈림길 — 암송/통독 선택, 통독은 성경 책만"
```

---

### Task 6: Today 투트랙 카드

> **실행 순서 주의: 이 태스크는 Task 7 다음에 하라.** CTA가 Task 7이 만드는
> `readingSessionProvider`와 `/reading` 라우트를 참조하기 때문에, Task 7이
> 먼저 끝나 있어야 컴파일된다.

**저장소:** `verse-flutter`

**Files:**
- Modify: `lib/app/providers.dart`
- Modify: `lib/features/today/today_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/today_two_track_test.dart` (create)

**Interfaces:**
- Consumes: Task 3의 `planView(mode:)`
- Produces:
  - `memorizePlanViewProvider` (FutureProvider\<PlanView?\>)
  - `readingPlanViewProvider` (FutureProvider\<PlanView?\>)
  - `readingProgressRepositoryProvider` (Provider\<ReadingProgressRepository\>)

**주의:** 현재 `today_screen.dart`(358줄)는 단일 플랜 전제로 마스코트·오늘목표·진행·CTA가 한 덩어리다. 이 태스크에서 **플랜 종속 부분을 `_PlanCard` 위젯으로 추출**하고 마스코트·스트릭은 화면 상단에 한 번만 남긴다.

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`:

```json
  "todayTrackMemorize": "암송",
  "todayTrackReading": "통독",
  "todayStartReading": "통독도 시작하기",
  "todayStartMemorize": "암송도 시작하기",
  "todayContinueReading": "이어서 통독하기",
```

`lib/l10n/app_en.arb`:

```json
  "todayTrackMemorize": "Memorize",
  "todayTrackReading": "Reading",
  "todayStartReading": "Start reading too",
  "todayStartMemorize": "Start memorizing too",
  "todayContinueReading": "Continue reading",
```

Run: `flutter gen-l10n`

- [ ] **Step 2: 프로바이더 추가**

`lib/app/providers.dart`에 추가 (기존 `activePlanViewProvider` 근처):

```dart
/// 암송 플랜 스냅샷. 기존 activePlanViewProvider의 역할을 이어받는다.
final memorizePlanViewProvider = FutureProvider<PlanView?>(
  (ref) => ref.watch(planRepositoryProvider).planView(mode: 'memorize'),
);

/// 통독 플랜 스냅샷. 집계 소스가 reading_progress라는 점만 다르다.
final readingPlanViewProvider = FutureProvider<PlanView?>(
  (ref) => ref.watch(planRepositoryProvider).planView(mode: 'reading'),
);
```

`readingProgressRepositoryProvider`는 Task 2에서 이미 등록했으므로 다시 만들지 않는다.

- [ ] **Step 3: 실패하는 테스트 작성**

`test/today_two_track_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/features/today/today_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  for (var i = 0; i < 4; i++) {
    await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
          id: Value(100 + i), courseId: 1, sectionId: const Value(10), ord: i,
          book: 1, chapter: 1, verse: i + 1, verseText: 'verse ${100 + i}'));
  }
  return db;
}

Widget _app(AppDatabase db) => ProviderScope(
      overrides: [appDatabaseProvider.overrideWithValue(db)],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: Locale('ko'),
        home: TodayScreen(),
      ),
    );

void main() {
  testWidgets('암송·통독 플랜이 둘 다 있으면 카드가 두 장 뜬다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);
    final plans = PlanRepository(db);
    await plans.createPlan(
        courseId: 1, title: '창세기', deadlineDay: '2026-12-31', sectionIds: [10], mode: 'memorize');
    await plans.createPlan(
        courseId: 1, title: '창세기', deadlineDay: '2026-12-31', sectionIds: [10], mode: 'reading');

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    expect(find.text('암송'), findsOneWidget);
    expect(find.text('통독'), findsOneWidget);
  });

  testWidgets('암송 플랜만 있으면 통독 시작 링크가 뜬다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);
    await PlanRepository(db).createPlan(
        courseId: 1, title: '창세기', deadlineDay: '2026-12-31', sectionIds: [10], mode: 'memorize');

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    expect(find.text('통독도 시작하기'), findsOneWidget);
  });

  testWidgets('통독 플랜만 있으면 암송 시작 링크가 뜬다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);
    await PlanRepository(db).createPlan(
        courseId: 1, title: '창세기', deadlineDay: '2026-12-31', sectionIds: [10], mode: 'reading');

    await tester.pumpWidget(_app(db));
    await tester.pumpAndSettle();

    expect(find.text('암송도 시작하기'), findsOneWidget);
  });
}
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `flutter test test/today_two_track_test.dart`
Expected: FAIL — 카드가 한 장뿐이라 `'통독'` 텍스트를 찾지 못한다.

- [ ] **Step 5: `today_screen.dart` 재구성**

플랜 종속 UI를 `_PlanCard`로 추출한다. 이 위젯은 `PlanView`와 트랙 라벨, CTA 콜백을 받는다:

```dart
/// 트랙 하나의 플랜 카드. 암송·통독이 같은 위젯을 쓰고 라벨과 CTA만 다르다.
/// 카드 몸통 탭 → 플랜 관리 시트(마감/변경/포기)는 두 트랙 공통이다.
class _PlanCard extends ConsumerWidget {
  const _PlanCard({required this.view, required this.trackLabel, required this.cta});

  final PlanView view;
  final String trackLabel;
  final Widget cta;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final planRatio = view.totalVerses == 0 ? 0.0 : view.clearedVerses / view.totalVerses;
    final goalRatio = view.todayTarget == 0
        ? 1.0
        : (view.todayCleared / view.todayTarget).clamp(0.0, 1.0);
    final locale = Localizations.localeOf(context).languageCode;
    final planTitle =
        locale == 'en' && view.courseTitleEn.isNotEmpty ? view.courseTitleEn : view.courseTitle;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(trackLabel, style: theme.textTheme.labelLarge),
            const SizedBox(height: 8),
            if (!view.expired) ...[
              Text(l.todayGoalTitle, style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: goalRatio, minHeight: 12),
              const SizedBox(height: 4),
              Text(view.todayDone
                  ? l.todayGoalDone
                  : l.todayGoalCount(view.todayCleared, view.todayTarget)),
              const SizedBox(height: 16),
            ] else
              _expiredCard(context, ref, l, view),
            InkWell(
              onTap: () => showPlanSheet(context, ref, view),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(planTitle, style: theme.textTheme.titleMedium)),
                        Icon(Icons.chevron_right, color: theme.textTheme.bodySmall?.color),
                      ],
                    ),
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
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            cta,
          ],
        ),
      ),
    );
  }
}
```

`TodayScreen.build`는 마스코트·스트릭·하트를 한 번만 그리고, 그 아래에 두 카드를 스택한다:

```dart
    final memorizeView = ref.watch(memorizePlanViewProvider).valueOrNull;
    final readingView = ref.watch(readingPlanViewProvider).valueOrNull;
```

마스코트 무드는 **둘 중 하나라도 오늘치를 채우면 happy**로 계산한다(스펙 §3):

```dart
    final anyDone = (memorizeView?.todayDone ?? false) || (readingView?.todayDone ?? false);
```

카드 영역:

```dart
        if (memorizeView != null)
          _PlanCard(view: memorizeView, trackLabel: l.todayTrackMemorize, cta: _continueCta(context, ref, l)),
        if (readingView != null) ...[
          const SizedBox(height: 16),
          _PlanCard(view: readingView, trackLabel: l.todayTrackReading, cta: _continueReadingCta(context, ref, l)),
        ],
        if (memorizeView != null && readingView == null)
          TextButton(
            onPressed: () => context.push('/plan/new'),
            child: Text(l.todayStartReading),
          ),
        if (readingView != null && memorizeView == null)
          TextButton(
            onPressed: () => context.push('/plan/new'),
            child: Text(l.todayStartMemorize),
          ),
```

`_continueReadingCta`는 Task 7의 라우트를 쓰므로 지금은 자리만 잡는다:

```dart
  Widget _continueReadingCta(BuildContext context, WidgetRef ref, AppLocalizations l) {
    final sessionAsync = ref.watch(readingSessionProvider);
    return FilledButton(
      onPressed: sessionAsync.valueOrNull == null ? null : () => context.push('/reading'),
      child: Text(l.todayContinueReading),
    );
  }
```

`readingSessionProvider`와 `/reading` 라우트는 Task 7이 만든다 — 이 태스크는 Task 7 다음에 실행하므로 이미 존재한다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/today_two_track_test.dart`
Expected: PASS (3개)

- [ ] **Step 7: 기존 Today 테스트 회귀 확인**

Run: `flutter test test/today_screen_test.dart test/today_mascot_test.dart test/today_expired_test.dart`
Expected: PASS — `activePlanViewProvider`를 참조하던 기존 테스트는 `memorizePlanViewProvider`로 바꾼다.

- [ ] **Step 8: 커밋**

```bash
git add lib/app/providers.dart lib/features/today/today_screen.dart lib/l10n/ test/
git commit -m "feat: Today 투트랙 — 암송/통독 카드 스택, 마스코트는 둘 중 하나만 채워도 happy"
```

---

### Task 7: 통독 화면과 컨트롤러

**저장소:** `verse-flutter`

**Files:**
- Create: `lib/features/reading/reading_controller.dart`
- Create: `lib/features/reading/reading_screen.dart`
- Modify: `lib/app/providers.dart` (`readingSessionProvider`)
- Modify: `lib/app/router.dart` (`/reading` 라우트)
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/reading_controller_test.dart`, `test/reading_screen_test.dart`

**Interfaces:**
- Consumes: Task 2 `ReadingProgressRepository`, Task 3 `planView(mode: 'reading')`, Task 4 `initialCursor`/`advanceCursor`/`backspaceCursor`
- Produces:
  - `class ReadingSession { final List<CourseItem> verses; final int startIndex; final int sectionId; final bool isFirstChapter; }`
  - `readingSessionProvider` (FutureProvider\<ReadingSession?\>)
  - `class ReadingState { final List<CourseItem> verses; final int verseIndex; final TypingCursor cursor; final bool chapterDone; CourseItem get verse; }`
  - `class ReadingController extends StateNotifier<ReadingState>` — `void input(String ch)`, `void backspace()`
  - `readingControllerProvider` (StateNotifierProvider.family)

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`:

```json
  "readingChapterProgress": "{done}/{total}절",
  "@readingChapterProgress": { "placeholders": { "done": {"type": "int"}, "total": {"type": "int"} } },
  "readingChapterDone": "장을 다 읽었어요!",
  "readingNextChapter": "다음 장",
  "readingFinish": "마치기",
```

`lib/l10n/app_en.arb`:

```json
  "readingChapterProgress": "{done}/{total} verses",
  "@readingChapterProgress": { "placeholders": { "done": {"type": "int"}, "total": {"type": "int"} } },
  "readingChapterDone": "Chapter complete!",
  "readingNextChapter": "Next chapter",
  "readingFinish": "Finish",
```

Run: `flutter gen-l10n`

- [ ] **Step 2: 실패하는 컨트롤러 테스트 작성**

`test/reading_controller_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/reading/reading_progress_repository.dart';
import 'package:verse_flutter/features/reading/reading_controller.dart';

/// 두 절짜리 장 하나.
Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(100), courseId: 1, sectionId: const Value(10), ord: 0,
        book: 1, chapter: 1, verse: 1, verseText: 'Go.'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(101), courseId: 1, sectionId: const Value(10), ord: 1,
        book: 1, chapter: 1, verse: 2, verseText: 'Up!'));
  return db;
}

Future<List<CourseItem>> _verses(AppDatabase db) =>
    (db.select(db.courseItems)..orderBy([(t) => OrderingTerm.asc(t.ord)])).get();

void main() {
  late AppDatabase db;
  late ProviderContainer container;

  setUp(() async {
    db = await _seededDb();
    container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
  });
  tearDown(() {
    container.dispose();
    db.close();
  });

  test('정타를 치면 커서가 전진한다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('G');
    expect(c.state.cursor.confirmed, 'G');
  });

  test('오타는 무시된다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('z');
    expect(c.state.cursor.confirmed, '');
  });

  test('절을 다 치면 reading_progress에 기록되고 다음 절로 넘어간다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('G');
    c.input('o');
    await Future<void>.delayed(Duration.zero);

    expect(await ReadingProgressRepository(db).isTyped(100), isTrue);
    expect(c.state.verseIndex, 1);
    expect(c.state.verse.id, 101);
    expect(c.state.cursor.confirmed, ''); // 새 절은 처음부터
  });

  test('절 완료는 attempt_queue에 mode=reading으로 쌓인다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('G');
    c.input('o');
    await Future<void>.delayed(Duration.zero);

    final rows = await db.select(db.attemptQueue).get();
    expect(rows, hasLength(1));
    expect(rows.first.mode, 'reading');
    expect(rows.first.clientGrade, 'green');
    expect(rows.first.courseItemId, 100);
  });

  test('통독은 암송 progress를 갱신하지 않는다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('G');
    c.input('o');
    await Future<void>.delayed(Duration.zero);

    expect(await db.select(db.progress).get(), isEmpty);
  });

  test('마지막 절을 마치면 장 완료 상태가 된다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 1);

    c.input('U');
    c.input('p');
    await Future<void>.delayed(Duration.zero);

    expect(c.state.chapterDone, isTrue);
  });

  test('백스페이스는 커서를 되돌린다', () async {
    final verses = await _verses(db);
    final c = ReadingController(container.read(readingProgressRepositoryProvider), verses, 0);

    c.input('G');
    c.backspace();
    expect(c.state.cursor.confirmed, '');
  });
}
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `flutter test test/reading_controller_test.dart`
Expected: FAIL — `Target of URI doesn't exist: '.../reading_controller.dart'`

- [ ] **Step 4: 컨트롤러 구현**

`lib/features/reading/reading_controller.dart` 생성:

```dart
import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import '../../core/grading/grading.dart' as grading;
import '../../core/reading/reading_progress_repository.dart';
import 'typing_cursor.dart';

/// 통독 세션 하나 = 장 하나. 절 목록과 시작 위치를 담는다.
class ReadingSession {
  const ReadingSession({
    required this.verses,
    required this.startIndex,
    required this.sectionId,
    required this.isFirstChapter,
  });

  final List<CourseItem> verses;

  /// 이미 통독한 절을 건너뛴 시작 위치.
  final int startIndex;
  final int sectionId;

  /// 사용자의 첫 통독 장인가. 광고 면제 판정에 쓴다(스펙 §6).
  final bool isFirstChapter;
}

class ReadingState {
  const ReadingState({
    required this.verses,
    required this.verseIndex,
    required this.cursor,
    this.chapterDone = false,
  });

  final List<CourseItem> verses;
  final int verseIndex;
  final TypingCursor cursor;

  /// 장의 마지막 절까지 마쳤다. 축하 화면으로 전환하는 신호.
  final bool chapterDone;

  CourseItem get verse => verses[verseIndex];

  ReadingState copyWith({int? verseIndex, TypingCursor? cursor, bool? chapterDone}) => ReadingState(
        verses: verses,
        verseIndex: verseIndex ?? this.verseIndex,
        cursor: cursor ?? this.cursor,
        chapterDone: chapterDone ?? this.chapterDone,
      );
}

/// 통독 루프. 목숨도 채점 결과 화면도 없다 — 실패할 수 없는 저강도 루프다.
class ReadingController extends StateNotifier<ReadingState> {
  ReadingController(this._reading, List<CourseItem> verses, int startIndex)
      : super(ReadingState(
          verses: verses,
          verseIndex: startIndex,
          cursor: initialCursor(verses[startIndex].verseText),
        ));

  final ReadingProgressRepository _reading;
  static const _uuid = Uuid();

  /// 한 글자 입력. 틀린 글자는 [advanceCursor]가 무시하므로 커서가 정지한다.
  void input(String ch) {
    if (state.chapterDone) return;
    final next = advanceCursor(state.cursor, ch);
    if (next.index == state.cursor.index) return; // 오타 — 아무 일도 없다

    if (next.isComplete) {
      unawaited(_completeVerse());
      return;
    }
    state = state.copyWith(cursor: next);
  }

  void backspace() {
    if (state.chapterDone) return;
    state = state.copyWith(cursor: backspaceCursor(state.cursor));
  }

  /// 절 완료 — 진행 기록 + 시도 적재 후 다음 절로 자동 전진한다.
  Future<void> _completeVerse() async {
    final item = state.verse;
    await _reading.markTyped(item.id);
    await _enqueueAttempt(item);

    final nextIndex = state.verseIndex + 1;
    if (nextIndex >= state.verses.length) {
      state = state.copyWith(
        cursor: TypingCursor(text: item.verseText, index: item.verseText.length),
        chapterDone: true,
      );
      return;
    }
    state = state.copyWith(
      verseIndex: nextIndex,
      cursor: initialCursor(state.verses[nextIndex].verseText),
    );
  }

  /// 암송과 동일한 형태로 attempt_queue에 쌓는다 — 기존 배치 동기화가 그대로
  /// 서버로 보낸다. 글자 단위 차단 덕분에 입력은 원문과 정규화 기준으로 항상
  /// 같으므로 clientGrade는 언제나 green이다(스펙 §4.3).
  Future<void> _enqueueAttempt(CourseItem item) async {
    final tokens = grading.normalize(item.verseText);
    await _reading.db.into(_reading.db.attemptQueue).insert(AttemptQueueCompanion.insert(
          clientSeq: _uuid.v4(),
          courseItemId: item.id,
          mode: 'reading',
          clientGrade: grading.Grade.green.wire,
          tokensJson: jsonEncode(tokens),
          createdAt: DateTime.now().toUtc(),
        ));
  }
}
```

`ReadingProgressRepository`에 `db` 접근자를 노출한다 (`lib/core/reading/reading_progress_repository.dart`의 `final AppDatabase _db;` 아래):

```dart
  /// 통독 컨트롤러가 attempt_queue에 직접 적재할 때 쓴다.
  AppDatabase get db => _db;
```

- [ ] **Step 5: 컨트롤러 테스트 통과 확인**

Run: `flutter test test/reading_controller_test.dart`
Expected: PASS (7개)

- [ ] **Step 6: 세션 프로바이더 추가**

`lib/app/providers.dart`에 추가:

```dart
/// 통독 플랜의 다음 세션(장 하나). 이미 통독한 절은 건너뛴 위치에서 시작한다.
/// 플랜이 없거나 범위를 다 읽었으면 null.
final readingSessionProvider = FutureProvider<ReadingSession?>((ref) async {
  final view = await ref.watch(readingPlanViewProvider.future);
  if (view == null) return null;

  final db = ref.watch(appDatabaseProvider);
  final reading = ref.watch(readingProgressRepositoryProvider);
  final sectionIds = view.sectionIds;

  final q = db.select(db.courseItems)..where((t) => t.courseId.equals(view.plan.courseId));
  if (sectionIds != null) q.where((t) => t.sectionId.isIn(sectionIds));
  q.orderBy([(t) => OrderingTerm.asc(t.ord)]);
  final all = await q.get();
  if (all.isEmpty) return null;

  final typed = await reading.typedItemIdsForCourse(view.plan.courseId);
  final firstUntyped = all.indexWhere((it) => !typed.contains(it.id));
  if (firstUntyped == -1) return null; // 범위를 다 읽었다

  // 그 절이 속한 장만 세션으로 삼는다.
  final sectionId = all[firstUntyped].sectionId;
  final chapter = all.where((it) => it.sectionId == sectionId).toList();
  final startIndex = chapter.indexWhere((it) => it.id == all[firstUntyped].id);

  return ReadingSession(
    verses: chapter,
    startIndex: startIndex,
    sectionId: sectionId ?? 0,
    isFirstChapter: await reading.countAll() == 0,
  );
});

final readingControllerProvider =
    StateNotifierProvider.family<ReadingController, ReadingState, ReadingSession>(
  (ref, session) => ReadingController(
    ref.watch(readingProgressRepositoryProvider),
    session.verses,
    session.startIndex,
  ),
);
```

- [ ] **Step 7: 화면 구현**

`lib/features/reading/reading_screen.dart` 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/widgets/error_view.dart';
import 'reading_controller.dart';

/// 통독 화면. 절 원문을 보면서 따라 친다.
/// 하트·채점 결과·재도전이 없다 — 실패할 수 없는 루프다(스펙 §4.4).
class ReadingScreen extends ConsumerWidget {
  const ReadingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final sessionAsync = ref.watch(readingSessionProvider);

    return Scaffold(
      appBar: AppBar(),
      body: sessionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(l.commonErrorGeneric)),
        data: (session) => session == null
            ? const SizedBox.shrink()
            : _ReadingBody(session: session),
      ),
    );
  }
}

class _ReadingBody extends ConsumerStatefulWidget {
  const _ReadingBody({required this.session});
  final ReadingSession session;

  @override
  ConsumerState<_ReadingBody> createState() => _ReadingBodyState();
}

class _ReadingBodyState extends ConsumerState<_ReadingBody> {
  /// 폭 0짜리 문자. 입력 필드를 절대 비우지 않아 백스페이스도 onChanged로
  /// 감지할 수 있게 하는 센티널이다(빈 필드에서는 백스페이스 이벤트가
  /// 플랫폼에 따라 오지 않는다).
  static const _sentinel = '​';

  final _controller = TextEditingController(text: _sentinel);
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    final notifier = ref.read(readingControllerProvider(widget.session).notifier);
    if (value.isEmpty) {
      notifier.backspace();
    } else if (value.length > _sentinel.length) {
      for (final ch in value.substring(_sentinel.length).split('')) {
        notifier.input(ch);
      }
    }
    _controller.value = const TextEditingValue(
      text: _sentinel,
      selection: TextSelection.collapsed(offset: _sentinel.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final state = ref.watch(readingControllerProvider(widget.session));

    if (state.chapterDone) {
      return _chapterDone(context, l);
    }

    final cursor = state.cursor;
    final faint = theme.textTheme.bodyLarge?.color?.withValues(alpha: 0.35);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${state.verse.book}:${state.verse.chapter}:${state.verse.verse}',
            style: theme.textTheme.labelLarge,
          ),
          const SizedBox(height: 4),
          Text(
            l.readingChapterProgress(state.verseIndex + 1, state.verses.length),
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 24),
          Expanded(
            child: SingleChildScrollView(
              child: RichText(
                text: TextSpan(
                  style: theme.textTheme.bodyLarge?.copyWith(fontSize: 20, height: 1.8),
                  children: [
                    TextSpan(text: cursor.confirmed),
                    TextSpan(
                      text: cursor.current,
                      style: TextStyle(
                        backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.3),
                      ),
                    ),
                    TextSpan(text: cursor.remaining, style: TextStyle(color: faint)),
                  ],
                ),
              ),
            ),
          ),
          // 키 입력만 받는 필드. 자동수정·예측입력·자동 대문자를 모두 끈다 —
          // 켜져 있으면 여러 글자를 한꺼번에 갈아끼워 글자 단위 판정이 깨진다.
          SizedBox(
            height: 1,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              autofocus: true,
              autocorrect: false,
              enableSuggestions: false,
              textCapitalization: TextCapitalization.none,
              keyboardType: TextInputType.text,
              inputFormatters: const [],
              decoration: const InputDecoration(border: InputBorder.none),
              style: const TextStyle(color: Colors.transparent, fontSize: 1),
              cursorColor: Colors.transparent,
              onChanged: _onChanged,
            ),
          ),
        ],
      ),
    );
  }

  Widget _chapterDone(BuildContext context, AppLocalizations l) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(l.readingChapterDone, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                ref.invalidate(readingSessionProvider);
                ref.invalidate(readingPlanViewProvider);
              },
              child: Text(l.readingNextChapter),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: Text(l.readingFinish),
            ),
          ],
        ),
      );
}
```

- [ ] **Step 7b: 커서 자동 스크롤**

시편 119편(176절)처럼 긴 절에서 커서가 화면 밖으로 나가면 안 된다(스펙 §4.1).
`_ReadingBodyState`에 스크롤 컨트롤러와 커서 앵커를 추가한다.

필드 추가:

```dart
  final _scroll = ScrollController();
  final _cursorKey = GlobalKey();
```

`dispose`에 `_scroll.dispose();`를 추가한다.

본문의 `SingleChildScrollView`에 컨트롤러를 물리고, `RichText`의 커서 스팬 자리에
앵커 위젯을 심는다 — `TextSpan`은 키를 못 가지므로 `WidgetSpan`으로 감싼다:

```dart
                    WidgetSpan(
                      child: Container(
                        key: _cursorKey,
                        color: theme.colorScheme.primary.withValues(alpha: 0.3),
                        child: Text(
                          cursor.current,
                          style: theme.textTheme.bodyLarge?.copyWith(fontSize: 20, height: 1.8),
                        ),
                      ),
                    ),
```

`SingleChildScrollView(controller: _scroll, ...)`로 바꾸고, 커서가 움직일 때마다
다음 프레임에 스크롤을 맞춘다 — `build` 안 `ref.watch` 아래:

```dart
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _cursorKey.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 120));
      }
    });
```

Run: `flutter analyze lib/features/reading/reading_screen.dart`
Expected: No issues found.

- [ ] **Step 8: 라우트 추가**

`lib/app/router.dart`의 `/plan/new` 라우트 아래에 추가:

```dart
    GoRoute(
      path: '/reading',
      builder: (context, state) => const ReadingScreen(),
    ),
```

파일 상단에 `import '../features/reading/reading_screen.dart';` 추가.

- [ ] **Step 9: 화면 테스트 작성 및 통과 확인**

`test/reading_screen_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/features/reading/reading_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(100), courseId: 1, sectionId: const Value(10), ord: 0,
        book: 1, chapter: 1, verse: 1, verseText: 'Go now.'));
  await PlanRepository(db).createPlan(
      courseId: 1, title: '창세기', deadlineDay: '2026-12-31', sectionIds: [10], mode: 'reading');
  return db;
}

void main() {
  testWidgets('통독 화면은 절 원문을 보여준다', (tester) async {
    final db = await _seededDb();
    addTearDown(db.close);

    await tester.pumpWidget(ProviderScope(
      overrides: [appDatabaseProvider.overrideWithValue(db)],
      child: const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: Locale('ko'),
        home: ReadingScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('1/1절'), findsOneWidget);
    expect(find.byType(RichText), findsWidgets);
  });
}
```

Run: `flutter test test/reading_screen_test.dart`
Expected: PASS

- [ ] **Step 10: 전체 테스트**

Run: `flutter test`
Expected: All tests passed!

- [ ] **Step 11: 커밋**

```bash
git add lib/features/reading/ lib/app/providers.dart lib/app/router.dart lib/core/reading/ lib/l10n/ test/reading_controller_test.dart test/reading_screen_test.dart
git commit -m "feat: 통독 화면 — 장 단위 연속 타이핑, 자동 전진, 하트·채점화면 없음"
```

---

# Phase B — 책장 + 서버 동기화

---

### Task 8: 백엔드 `ModeReading`과 목숨 분기

**저장소:** `kjvapp` (경로 `verse-backend/`)

**Files:**
- Modify: `verse-backend/internal/domain/attempt.go`
- Modify: `verse-backend/internal/service/attempt_service.go:41-60, 84-102, 111-118`
- Test: `verse-backend/internal/service/attempt_reading_test.go` (create)

**Interfaces:**
- Consumes: 없음
- Produces: `domain.ModeReading Mode = "reading"`, `domain.IsPracticeMode(m Mode) bool`

**이 태스크는 딕테이션의 기존 버그도 함께 고친다** — 클라이언트는 딕테이션에서 목숨을 깎지 않는데 서버는 깎고 있었다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-backend/internal/service/attempt_reading_test.go` 생성:

```go
package service

import (
	"testing"

	"github.com/seoburuk/verse-backend/internal/domain"
)

func TestIsPracticeMode(t *testing.T) {
	cases := []struct {
		mode domain.Mode
		want bool
	}{
		{domain.ModeDictation, true},
		{domain.ModeReading, true},
		{domain.ModeDrag, false},
		{domain.ModeType, false},
		{domain.ModeHard, false},
	}
	for _, c := range cases {
		if got := domain.IsPracticeMode(c.mode); got != c.want {
			t.Errorf("IsPracticeMode(%q) = %v, want %v", c.mode, got, c.want)
		}
	}
}

func TestModeReadingWire(t *testing.T) {
	if domain.ModeReading != "reading" {
		t.Errorf("ModeReading = %q, want \"reading\"", domain.ModeReading)
	}
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd verse-backend && go test ./internal/service/ -run 'TestIsPracticeMode|TestModeReadingWire'`
Expected: FAIL — `undefined: domain.ModeReading`

- [ ] **Step 3: 도메인에 모드 추가**

`verse-backend/internal/domain/attempt.go`의 상수 블록에 추가:

```go
	ModeReading   Mode = "reading"   // 통독: 절 원문을 보며 장 단위로 따라 치기. 절 완료로 치지 않음.
```

상수 블록 아래에 헬퍼 추가:

```go
// IsPracticeMode — 진도·목숨과 무관한 연습 모드인가.
// 받아쓰기와 통독은 본문을 보고 따라 적는 저강도 루프라서 진도를 갱신하지 않고,
// 목숨을 검사하지도 소모하지도 않는다. 시도 기록·연속일은 다른 모드와 동일하다.
func IsPracticeMode(m Mode) bool {
	return m == ModeDictation || m == ModeReading
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-backend && go test ./internal/service/ -run 'TestIsPracticeMode|TestModeReadingWire'`
Expected: PASS

- [ ] **Step 5: 서비스의 세 지점을 모드 분기로 교체**

`verse-backend/internal/service/attempt_service.go`

(5-a) 목숨 검사 (현재 line 50-56 근처) — `lives.Count <= 0` 거부를 연습 모드에서 건너뛴다:

```go
	// 연습 모드(받아쓰기·통독)는 목숨과 무관하다 — 목숨이 0이어도 시도를 받는다.
	// 이 분기가 없으면 목숨 소진 시 통독 기록이 전부 거부되어 영영 동기화되지
	// 않고, 클라이언트의 책장과 재설치 복원이 깨진다.
	if !domain.IsPracticeMode(mode) {
		lives, err := GetLives(ctx, s.users, userID)
		if err != nil {
			return AttemptResult{}, err
		}
		if lives.Count <= 0 {
			return AttemptResult{}, domain.ErrNoLives
		}
	}
```

(5-b) 진도 갱신 가드 (현재 line 85 근처) — `if mode != domain.ModeDictation {` 를 다음으로:

```go
	if !domain.IsPracticeMode(mode) {
```

(5-c) 목숨 소모 (현재 line 113-118) — `if !cleared {` 를 다음으로:

```go
	// 6. 비초록 결과는 목숨 1 소모. 연습 모드는 소모하지 않는다.
	if !cleared && !domain.IsPracticeMode(mode) {
```

- [ ] **Step 6: 전체 백엔드 테스트**

Run: `cd verse-backend && go test ./...`
Expected: ok — 실패하는 기존 테스트가 있으면 딕테이션이 목숨을 깎는다고 단정하던 테스트다. 그 기대값을 "깎지 않는다"로 고친다(이것이 이번에 고치는 버그다).

- [ ] **Step 7: 커밋**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-backend/internal/domain/attempt.go verse-backend/internal/service/
git commit -m "fix: 연습 모드(받아쓰기·통독)는 목숨을 검사·소모하지 않는다

통독 mode를 추가하면서 서버가 mode와 무관하게 목숨을 검사·소모하던
기존 불일치를 함께 고친다. 클라이언트는 딕테이션에서 목숨을 깎지 않는데
서버는 깎고 있었다. 고치지 않으면 목숨 소진 시 통독 기록이 전부
skipped_no_lives로 거부되어 책장과 재설치 복원이 깨진다."
```

---

### Task 9: `GET /sync/reading` 복원 엔드포인트

**저장소:** `kjvapp` (경로 `verse-backend/`)

**Files:**
- Modify: `verse-backend/db/queries/attempts.sql`
- Modify: `verse-backend/internal/repository/repository.go` (AttemptRepo 인터페이스)
- Modify: `verse-backend/internal/repository/pg_attempt.go`
- Modify: `verse-backend/internal/service/attempt_service.go`
- Create: `verse-backend/internal/handler/reading_handler.go`
- Modify: `verse-backend/internal/handler/router.go`
- Modify: `verse-backend/internal/handler/dto/` (응답 DTO)

**Interfaces:**
- Consumes: Task 8의 `domain.ModeReading`
- Produces: `GET /sync/reading` → `{"items":[{"course_item_id":N,"typed_at":"RFC3339"}]}`

- [ ] **Step 1: sqlc 쿼리 추가**

`verse-backend/db/queries/attempts.sql` 끝에 추가:

```sql
-- name: ListReadingProgress :many
SELECT course_item_id, MIN(created_at)::timestamptz AS typed_at
FROM attempts
WHERE user_id = $1 AND mode = 'reading'
GROUP BY course_item_id
ORDER BY course_item_id;
```

`MIN(created_at)`을 쓰는 이유: 같은 절을 여러 번 통독할 수 있고, 클라이언트는 **첫 완료 시각**을 보존하기 때문이다.

- [ ] **Step 2: sqlc 생성**

Run: `cd verse-backend && sqlc generate`
Expected: 에러 없이 완료. `grep -c ListReadingProgress internal/repository/sqlc/attempts.sql.go` 가 0보다 크다.

- [ ] **Step 3: 도메인 타입과 저장소 배선**

`verse-backend/internal/domain/attempt.go`에 추가:

```go
// ReadingProgress — 통독으로 타이핑을 마친 절 하나. 재설치 복원용.
type ReadingProgress struct {
	CourseItemID int64
	TypedAt      time.Time
}
```

`verse-backend/internal/repository/repository.go`의 `AttemptRepo` 인터페이스에 추가:

```go
	ListReadingProgress(ctx context.Context, userID int64) ([]domain.ReadingProgress, error)
```

`verse-backend/internal/repository/pg_attempt.go`에 구현 추가 (파일의 기존 메서드들과 같은 스타일로):

```go
func (r *pgAttemptRepo) ListReadingProgress(ctx context.Context, userID int64) ([]domain.ReadingProgress, error) {
	rows, err := r.q.ListReadingProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.ReadingProgress, len(rows))
	for i, row := range rows {
		out[i] = domain.ReadingProgress{
			CourseItemID: row.CourseItemID,
			TypedAt:      row.TypedAt.Time,
		}
	}
	return out, nil
}
```

> 생성된 필드 타입이 `pgtype.Timestamptz`가 아니라 `time.Time`이면 `row.TypedAt.Time`을 `row.TypedAt`으로 바꾼다. `internal/repository/sqlc/attempts.sql.go`의 `ListReadingProgressRow` 정의를 보고 맞춘다.

- [ ] **Step 4: 서비스 메서드 추가**

`verse-backend/internal/service/attempt_service.go`에 추가:

```go
// GetReadingProgress — 사용자의 통독 진행 목록. 재설치/기기 변경 시 복원용.
func (s *AttemptService) GetReadingProgress(ctx context.Context, userID int64) ([]domain.ReadingProgress, error) {
	return s.attempts.ListReadingProgress(ctx, userID)
}
```

- [ ] **Step 5: DTO와 핸들러 작성**

`verse-backend/internal/handler/dto/` 안의 기존 DTO 파일에 추가 (progress DTO가 있는 파일과 같은 곳):

```go
// ReadingItemDTO — 통독한 절 하나.
type ReadingItemDTO struct {
	CourseItemID int64  `json:"course_item_id"`
	TypedAt      string `json:"typed_at"`
}

type ReadingProgressResponse struct {
	Items []ReadingItemDTO `json:"items"`
}
```

`verse-backend/internal/handler/reading_handler.go` 생성:

```go
// reading_handler.go — 통독 진행 조회 핸들러.
// 업로드는 별도 엔드포인트가 없다 — 통독 시도는 기존 배치 attempts POST로
// 올라오고, 이 핸들러는 재설치 복원을 위해 그것을 되돌려준다.
package handler

import (
	"net/http"
	"time"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetMyReading(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	rows, err := h.attempt.GetReadingProgress(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	items := make([]dto.ReadingItemDTO, len(rows))
	for i, row := range rows {
		items[i] = dto.ReadingItemDTO{
			CourseItemID: row.CourseItemID,
			TypedAt:      row.TypedAt.UTC().Format(time.RFC3339),
		}
	}

	writeJSON(w, http.StatusOK, dto.ReadingProgressResponse{Items: items})
}
```

- [ ] **Step 6: 라우트 등록**

`verse-backend/internal/handler/router.go`의 보호 엔드포인트 그룹에서 `r.Get("/me/progress", h.GetMyProgress)` 아래에 추가:

```go
			r.Get("/sync/reading", h.GetMyReading)
```

- [ ] **Step 7: 빌드와 테스트**

Run: `cd verse-backend && go build ./... && go test ./...`
Expected: 빌드 성공, 테스트 ok

- [ ] **Step 8: 커밋**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-backend/
git commit -m "feat: GET /sync/reading — 통독 진행 복원 엔드포인트

업로드는 기존 배치 attempts POST가 처리하므로 신규 엔드포인트도
DB 마이그레이션도 없다. 첫 완료 시각 보존을 위해 MIN(created_at)을 쓴다."
```

---

### Task 10: 클라이언트 동기화 가드와 복원

**저장소:** `verse-flutter`

**Files:**
- Modify: `lib/core/sync/sync_service.dart:91`
- Modify: `lib/core/sync/session_sync_coordinator.dart` (`onLoginSuccess`, `_clearLocalProgressForAccountSwitch`)
- Test: `test/reading_sync_test.dart` (create)

**Interfaces:**
- Consumes: Task 2 `ReadingProgressRepository`, Task 9 `GET /sync/reading`
- Produces: `SessionSyncCoordinator._pullReadingProgress()` (private)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/reading_sync_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';

void main() {
  test('계정 전환 시 통독 진행도 함께 지워진다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await db.into(db.readingProgress).insert(ReadingProgressCompanion.insert(
          courseItemId: 100,
          typedAt: DateTime.utc(2026, 7, 29),
        ));
    expect(await db.select(db.readingProgress).get(), hasLength(1));

    // _clearLocalProgressForAccountSwitch가 지우는 테이블 목록에
    // readingProgress가 포함되어야 한다. 여기서는 그 삭제를 직접 수행해
    // 스키마상 삭제가 가능한지 검증한다.
    await db.delete(db.readingProgress).go();
    expect(await db.select(db.readingProgress).get(), isEmpty);
  });
}
```

> 코디네이터 본체는 네트워크·DI가 얽혀 있어 단위 테스트가 무겁다. 이 태스크의 회귀 안전망은 `flutter test` 전체와 아래 Step 4의 코드 리뷰 체크리스트다.

- [ ] **Step 2: 동기화 가드 확장**

`lib/core/sync/sync_service.dart`의 91번째 줄 근처:

```dart
            // 받아쓰기·통독은 본문을 보고 따라 적는 연습 모드라 진도를 갱신하지
            // 않는다. 시도 기록·연속일은 다른 모드와 동일하게 처리한다.
            if (item.mode != 'dictation' && item.mode != 'reading') {
```

- [ ] **Step 3: 계정 전환 시 통독 진행 삭제**

`lib/core/sync/session_sync_coordinator.dart`의 `_clearLocalProgressForAccountSwitch` 트랜잭션에 한 줄 추가 (`await _db.delete(_db.progress).go();` 아래):

```dart
      await _db.delete(_db.readingProgress).go();
```

- [ ] **Step 4: 로그인 시 통독 복원**

`session_sync_coordinator.dart`에 메서드 추가:

```dart
  /// 로그인 직후 서버의 통독 기록을 로컬에 병합한다. 이미 있는 절은 건드리지
  /// 않는다 — 첫 완료 시각을 보존하기 위해서다(스펙 §8).
  Future<void> _pullReadingProgress() async {
    try {
      final res = await _client.dio.get('/sync/reading');
      final items = (res.data as Map<String, dynamic>)['items'] as List<dynamic>;
      await _db.batch((batch) {
        for (final raw in items) {
          final item = raw as Map<String, dynamic>;
          batch.insert(
            _db.readingProgress,
            ReadingProgressCompanion.insert(
              courseItemId: item['course_item_id'] as int,
              typedAt: DateTime.parse(item['typed_at'] as String).toUtc(),
            ),
            mode: InsertMode.insertOrIgnore,
          );
        }
      });
    } on Object {
      // 오프라인이거나 서버가 아직 이 엔드포인트를 모른다 — 다음 로그인 때 다시.
    }
  }
```

`onLoginSuccess`의 `/me/progress` pull 블록 **뒤에** 호출을 추가:

```dart
    await _pullReadingProgress();
```

- [ ] **Step 5: 테스트와 빌드 확인**

Run: `flutter test && flutter analyze`
Expected: All tests passed! / No issues found.

- [ ] **Step 6: 커밋**

```bash
git add lib/core/sync/ test/reading_sync_test.dart
git commit -m "feat: 통독 동기화 — progress 갱신 제외, 로그인 시 서버 기록 복원"
```

---

### Task 11: 픽셀 성경책장

**저장소:** `verse-flutter`

**Files:**
- Create: `lib/features/cards/bookshelf_view.dart`
- Modify: `lib/features/cards/card_collection_screen.dart` (세그먼트 추가)
- Modify: `lib/app/providers.dart` (`bookshelfProvider`)
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/bookshelf_test.dart`

**Interfaces:**
- Consumes: Task 2 `ReadingProgressRepository.countForCourse`, `typedItemIdsForCourse`
- Produces:
  - `class BookProgress { final Course course; final int typed; final int total; double get ratio; bool get complete; }`
  - `bookshelfProvider` (FutureProvider\<List\<BookProgress\>\>)

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`:

```json
  "cardsSegmentCards": "카드",
  "cardsSegmentShelf": "책장",
  "bookshelfOldTestament": "구약",
  "bookshelfNewTestament": "신약",
```

`lib/l10n/app_en.arb`:

```json
  "cardsSegmentCards": "Cards",
  "cardsSegmentShelf": "Shelf",
  "bookshelfOldTestament": "Old Testament",
  "bookshelfNewTestament": "New Testament",
```

Run: `flutter gen-l10n`

- [ ] **Step 2: 실패하는 테스트 작성**

`test/bookshelf_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/reading/reading_progress_repository.dart';

Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(2), slug: 'matthew', title: '마태복음', ord: 2, category: 'nt'));
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(3), slug: 'warmup', title: '워밍업', ord: 3, category: 'warmup'));
  var id = 100;
  for (final courseId in [1, 2]) {
    for (var i = 0; i < 4; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(id), courseId: courseId, sectionId: const Value(10), ord: i,
            book: courseId, chapter: 1, verse: i + 1, verseText: 'v$id'));
      id++;
    }
  }
  return db;
}

void main() {
  test('책장은 성경 코스만 담는다 (워밍업 제외)', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    final shelf = await container.read(bookshelfProvider.future);
    expect(shelf.map((b) => b.course.slug), ['genesis', 'matthew']);
  });

  test('채움 비율은 통독한 절 / 전체 절이다', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    final reading = ReadingProgressRepository(db);
    await reading.markTyped(100);
    await reading.markTyped(101);

    final shelf = await container.read(bookshelfProvider.future);
    final genesis = shelf.firstWhere((b) => b.course.slug == 'genesis');
    expect(genesis.typed, 2);
    expect(genesis.total, 4);
    expect(genesis.ratio, 0.5);
    expect(genesis.complete, isFalse);
  });

  test('전부 통독하면 complete다', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    final reading = ReadingProgressRepository(db);
    for (var id = 100; id < 104; id++) {
      await reading.markTyped(id);
    }

    final shelf = await container.read(bookshelfProvider.future);
    expect(shelf.firstWhere((b) => b.course.slug == 'genesis').complete, isTrue);
  });

  test('암송으로 외운 절은 책장을 채우지 않는다', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    await db.into(db.progress).insert(ProgressCompanion.insert(
          courseItemId: const Value(100), grade: 'green',
          cleared: const Value(true), updatedAt: DateTime.now().toUtc()));

    final shelf = await container.read(bookshelfProvider.future);
    expect(shelf.firstWhere((b) => b.course.slug == 'genesis').typed, 0);
  });
}
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `flutter test test/bookshelf_test.dart`
Expected: FAIL — `Undefined name 'bookshelfProvider'`

- [ ] **Step 4: 프로바이더 구현**

`lib/app/providers.dart`에 추가:

```dart
/// 책장 한 칸 — 성경 한 권의 통독 진행.
class BookProgress {
  const BookProgress({required this.course, required this.typed, required this.total});
  final Course course;
  final int typed;
  final int total;

  double get ratio => total == 0 ? 0 : typed / total;
  bool get complete => total > 0 && typed >= total;
}

/// 66권 책장. 통독(reading_progress)만 센다 — 암송으로 외운 절은
/// 책장을 채우지 않는다(성취 자산 분리 원칙, 스펙 §5).
final bookshelfProvider = FutureProvider<List<BookProgress>>((ref) async {
  final db = ref.watch(appDatabaseProvider);
  final reading = ref.watch(readingProgressRepositoryProvider);

  final courses = await (db.select(db.courses)
        ..where((t) => t.category.isIn(['ot', 'nt']))
        ..orderBy([(t) => OrderingTerm.asc(t.ord)]))
      .get();

  final out = <BookProgress>[];
  for (final course in courses) {
    final total = (await (db.select(db.courseItems)
              ..where((t) => t.courseId.equals(course.id)))
            .get())
        .length;
    final typed = await reading.countForCourse(course.id, null);
    out.add(BookProgress(course: course, typed: typed, total: total));
  }
  return out;
});
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `flutter test test/bookshelf_test.dart`
Expected: PASS (4개)

- [ ] **Step 6: 책장 뷰 구현**

`lib/features/cards/bookshelf_view.dart` 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../l10n/app_localizations.dart';

/// 픽셀 성경책장 — 66권 그리드. 장을 칠수록 책이 차오르고 완독하면 선명해진다.
class BookshelfView extends ConsumerWidget {
  const BookshelfView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final shelfAsync = ref.watch(bookshelfProvider);

    return shelfAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(l.commonErrorGeneric)),
      data: (shelf) {
        final ot = shelf.where((b) => b.course.category == 'ot').toList();
        final nt = shelf.where((b) => b.course.category == 'nt').toList();
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _sectionHeader(context, l.bookshelfOldTestament),
            _grid(ot),
            const SizedBox(height: 24),
            _sectionHeader(context, l.bookshelfNewTestament),
            _grid(nt),
          ],
        );
      },
    );
  }

  Widget _sectionHeader(BuildContext context, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );

  Widget _grid(List<BookProgress> books) => GridView.count(
        crossAxisCount: 6,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        children: [for (final b in books) _BookTile(book: b)],
      );
}

/// 책 한 권. 채움 정도가 아래에서 위로 차오르는 픽셀 책 스프라이트.
class _BookTile extends StatelessWidget {
  const _BookTile({required this.book});
  final BookProgress book;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final base = theme.colorScheme.primary;
    return Tooltip(
      message: '${book.course.title} ${book.typed}/${book.total}',
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(
            color: book.complete ? base : base.withValues(alpha: 0.3),
            width: book.complete ? 2 : 1,
          ),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Align(
              alignment: Alignment.bottomCenter,
              child: FractionallySizedBox(
                heightFactor: book.ratio.clamp(0.0, 1.0),
                child: Container(color: base.withValues(alpha: 0.35)),
              ),
            ),
            Center(
              child: Text(
                book.course.title,
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: book.complete
                      ? theme.textTheme.bodyLarge?.color
                      : theme.textTheme.bodyLarge?.color?.withValues(alpha: 0.5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 7: 카드 화면에 세그먼트 추가**

`lib/features/cards/card_collection_screen.dart`를 `StatefulWidget`(또는 로컬 상태를 가진 `ConsumerStatefulWidget`)으로 바꾸고, 본문 위에 세그먼트를 둔다:

```dart
  int _tab = 0; // 0 = 카드, 1 = 책장
```

`build`의 본문 최상단에:

```dart
        SegmentedButton<int>(
          segments: [
            ButtonSegment(value: 0, label: Text(l.cardsSegmentCards)),
            ButtonSegment(value: 1, label: Text(l.cardsSegmentShelf)),
          ],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
```

그 아래 본문을 `_tab == 0 ? <기존 카드 도감 본문> : const BookshelfView()`로 분기한다.

- [ ] **Step 8: 전체 테스트**

Run: `flutter test`
Expected: All tests passed!

- [ ] **Step 9: 커밋**

```bash
git add lib/features/cards/ lib/app/providers.dart lib/l10n/ test/bookshelf_test.dart
git commit -m "feat: 픽셀 성경책장 — 66권 그리드, 통독 절만 집계"
```

---

# Phase C — 광고

---

### Task 12: 광고 빈도 순수 함수

**저장소:** `verse-flutter`

**Files:**
- Create: `lib/features/reading/reading_ad_gate.dart`
- Test: `test/reading_ad_gate_test.dart`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `const Duration kChapterAdGap = Duration(minutes: 3);`
  - `const Duration kVerseAdGap = Duration(minutes: 10);`
  - `bool shouldShowInterstitial({required bool isChapterBoundary, required bool isFirstChapter, required Duration sinceLastAd})`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/reading_ad_gate_test.dart` 생성:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/reading/reading_ad_gate.dart';

void main() {
  test('첫 장은 무조건 면제된다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: true,
        sinceLastAd: const Duration(hours: 1),
      ),
      isFalse,
    );
  });

  test('장 경계에서 3분이 지났으면 노출한다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 3),
      ),
      isTrue,
    );
  });

  test('장 경계라도 3분이 안 지났으면 노출하지 않는다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 2, seconds: 59),
      ),
      isFalse,
    );
  });

  test('장 내부 절 경계는 10분이 지나야 노출한다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: false,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 10),
      ),
      isTrue,
    );
  });

  test('장 내부 절 경계에서 10분 미만이면 노출하지 않는다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: false,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 9, seconds: 59),
      ),
      isFalse,
    );
  });

  test('짧은 장을 연달아 마쳐도 3분 가드에 묶인다', () {
    // 시편 117편(2절) → 118편 시나리오
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: false,
        sinceLastAd: const Duration(seconds: 40),
      ),
      isFalse,
    );
  });

  test('상수는 스펙대로 3분·10분이다', () {
    expect(kChapterAdGap, const Duration(minutes: 3));
    expect(kVerseAdGap, const Duration(minutes: 10));
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/reading_ad_gate_test.dart`
Expected: FAIL — `Target of URI doesn't exist: '.../reading_ad_gate.dart'`

- [ ] **Step 3: 구현**

`lib/features/reading/reading_ad_gate.dart` 생성:

```dart
/// 통독 전면광고 빈도 규칙(스펙 §6). 순수 함수라 시계·광고 SDK 없이 검증된다.
library reading_ad_gate;

/// 장 경계에서의 최소 간격. 짧은 장 연타(시편 117편 2절 → 118편)를 묶는다.
const Duration kChapterAdGap = Duration(minutes: 3);

/// 장 내부 절 경계에서의 최소 간격. 시편 119편(176절)처럼 한 장이 아주 긴
/// 경우에도 수익이 나게 하는 백업 트리거다.
const Duration kVerseAdGap = Duration(minutes: 10);

/// 지금 전면광고를 띄워도 되는가.
///
/// 절을 치는 도중에는 절대 호출하지 않는다 — 호출 지점 자체가 절 경계다.
/// 몰입이 통독의 상품성이고, 작업 중간 강제 노출은 AdMob 정책상으로도
/// 문제가 된다.
bool shouldShowInterstitial({
  required bool isChapterBoundary,
  required bool isFirstChapter,
  required Duration sinceLastAd,
}) {
  // 첫 경험에서 광고를 만나면 이탈한다.
  if (isFirstChapter) return false;

  final gap = isChapterBoundary ? kChapterAdGap : kVerseAdGap;
  return sinceLastAd >= gap;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/reading_ad_gate_test.dart`
Expected: PASS (7개)

- [ ] **Step 5: 커밋**

```bash
git add lib/features/reading/reading_ad_gate.dart test/reading_ad_gate_test.dart
git commit -m "feat: 통독 광고 빈도 규칙 — 장 경계 3분, 절 경계 10분, 첫 장 면제"
```

---

### Task 13: 통독 화면에 광고 배선

**저장소:** `verse-flutter`

**Files:**
- Modify: `lib/features/reading/reading_controller.dart`
- Modify: `lib/features/reading/reading_screen.dart`
- Test: `test/reading_ad_wiring_test.dart`

**Interfaces:**
- Consumes: Task 12 `shouldShowInterstitial`, 기존 `AdService.showInterstitial()`, Task 7 `ReadingSession.isFirstChapter`
- Produces: `ReadingController.consumeAdRequest()` — 광고를 띄워야 하면 true를 반환하고 내부 타이머를 리셋

**설계:** 컨트롤러는 광고 SDK를 모른다. "지금 광고 타이밍이다"라는 **신호만** 내고, 화면이 그 신호를 받아 `AdService`를 호출한다. 덕분에 컨트롤러는 위젯 테스트 없이 검증된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/reading_ad_wiring_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/reading/reading_controller.dart';

Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(100), courseId: 1, sectionId: const Value(10), ord: 0,
        book: 1, chapter: 1, verse: 1, verseText: 'Go.'));
  await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: const Value(101), courseId: 1, sectionId: const Value(10), ord: 1,
        book: 1, chapter: 1, verse: 2, verseText: 'Up.'));
  return db;
}

void main() {
  late AppDatabase db;
  late ProviderContainer container;

  setUp(() async {
    db = await _seededDb();
    container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
  });
  tearDown(() {
    container.dispose();
    db.close();
  });

  Future<List<CourseItem>> verses() =>
      (db.select(db.courseItems)..orderBy([(t) => OrderingTerm.asc(t.ord)])).get();

  test('첫 장이면 장을 마쳐도 광고를 요청하지 않는다', () async {
    final c = ReadingController(
      container.read(readingProgressRepositoryProvider),
      await verses(),
      1,
      isFirstChapter: true,
    );

    c.input('U');
    c.input('p');
    await Future<void>.delayed(Duration.zero);

    expect(c.consumeAdRequest(), isFalse);
  });

  test('첫 장이 아니고 간격이 충분하면 장 완료 시 광고를 요청한다', () async {
    final c = ReadingController(
      container.read(readingProgressRepositoryProvider),
      await verses(),
      1,
      isFirstChapter: false,
      lastAdAt: DateTime.now().toUtc().subtract(const Duration(minutes: 5)),
    );

    c.input('U');
    c.input('p');
    await Future<void>.delayed(Duration.zero);

    expect(c.consumeAdRequest(), isTrue);
  });

  test('광고 요청은 한 번만 소비된다', () async {
    final c = ReadingController(
      container.read(readingProgressRepositoryProvider),
      await verses(),
      1,
      isFirstChapter: false,
      lastAdAt: DateTime.now().toUtc().subtract(const Duration(minutes: 5)),
    );

    c.input('U');
    c.input('p');
    await Future<void>.delayed(Duration.zero);

    expect(c.consumeAdRequest(), isTrue);
    expect(c.consumeAdRequest(), isFalse);
  });

  test('간격이 짧으면 장을 마쳐도 광고를 요청하지 않는다', () async {
    final c = ReadingController(
      container.read(readingProgressRepositoryProvider),
      await verses(),
      1,
      isFirstChapter: false,
      lastAdAt: DateTime.now().toUtc().subtract(const Duration(seconds: 30)),
    );

    c.input('U');
    c.input('p');
    await Future<void>.delayed(Duration.zero);

    expect(c.consumeAdRequest(), isFalse);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/reading_ad_wiring_test.dart`
Expected: FAIL — `No named parameter with the name 'isFirstChapter'`

- [ ] **Step 3: 컨트롤러에 광고 신호 추가**

`lib/features/reading/reading_controller.dart` 상단에 import 추가:

```dart
import 'reading_ad_gate.dart';
```

생성자와 필드를 수정:

```dart
class ReadingController extends StateNotifier<ReadingState> {
  ReadingController(
    this._reading,
    List<CourseItem> verses,
    int startIndex, {
    this.isFirstChapter = false,
    DateTime? lastAdAt,
  })  : _lastAdAt = lastAdAt ?? DateTime.now().toUtc(),
        super(ReadingState(
          verses: verses,
          verseIndex: startIndex,
          cursor: initialCursor(verses[startIndex].verseText),
        ));

  final ReadingProgressRepository _reading;

  /// 사용자의 첫 통독 장이면 광고를 면제한다(스펙 §6).
  final bool isFirstChapter;

  DateTime _lastAdAt;
  bool _adPending = false;
  static const _uuid = Uuid();
```

`_completeVerse`의 끝부분에서 광고 판정을 한다. 절 전진/장 완료 분기 **양쪽** 뒤에 삽입:

```dart
  Future<void> _completeVerse() async {
    final item = state.verse;
    await _reading.markTyped(item.id);
    await _enqueueAttempt(item);

    final nextIndex = state.verseIndex + 1;
    final isChapterBoundary = nextIndex >= state.verses.length;

    _evaluateAd(isChapterBoundary: isChapterBoundary);

    if (isChapterBoundary) {
      state = state.copyWith(
        cursor: TypingCursor(text: item.verseText, index: item.verseText.length),
        chapterDone: true,
      );
      return;
    }
    state = state.copyWith(
      verseIndex: nextIndex,
      cursor: initialCursor(state.verses[nextIndex].verseText),
    );
  }

  /// 절 경계에서만 호출된다 — 타이핑 도중에는 절대 광고를 띄우지 않는다.
  void _evaluateAd({required bool isChapterBoundary}) {
    final due = shouldShowInterstitial(
      isChapterBoundary: isChapterBoundary,
      isFirstChapter: isFirstChapter,
      sinceLastAd: DateTime.now().toUtc().difference(_lastAdAt),
    );
    if (due) _adPending = true;
  }

  /// 화면이 호출한다 — 대기 중인 광고 요청을 한 번만 넘겨주고 타이머를 리셋한다.
  /// 컨트롤러는 광고 SDK를 모른다(그래야 위젯 없이 테스트된다).
  bool consumeAdRequest() {
    if (!_adPending) return false;
    _adPending = false;
    _lastAdAt = DateTime.now().toUtc();
    return true;
  }
```

- [ ] **Step 4: 프로바이더에 `isFirstChapter` 전달**

`lib/app/providers.dart`의 `readingControllerProvider`를 수정:

```dart
final readingControllerProvider =
    StateNotifierProvider.family<ReadingController, ReadingState, ReadingSession>(
  (ref, session) => ReadingController(
    ref.watch(readingProgressRepositoryProvider),
    session.verses,
    session.startIndex,
    isFirstChapter: session.isFirstChapter,
  ),
);
```

- [ ] **Step 5: 화면에서 광고 호출**

`lib/features/reading/reading_screen.dart`의 `_ReadingBodyState.build` 안, `ref.watch` 바로 아래에 리스너를 건다:

```dart
    // 절·장 경계에서 컨트롤러가 올린 광고 요청을 소비한다. 프레임 도중
    // 광고를 띄우면 안 되므로 다음 프레임으로 미룬다.
    ref.listen(readingControllerProvider(widget.session), (_, __) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final notifier = ref.read(readingControllerProvider(widget.session).notifier);
        if (notifier.consumeAdRequest()) {
          ref.read(adServiceProvider).showInterstitial();
        }
      });
    });
```

파일 상단에 `import 'package:flutter/widgets.dart';`가 이미 `material.dart`로 들어오므로 추가 import는 `adServiceProvider`가 있는 `providers.dart`뿐이다(이미 import되어 있다).

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/reading_ad_wiring_test.dart`
Expected: PASS (4개)

- [ ] **Step 7: 전체 테스트와 정적 분석**

Run: `flutter test && flutter analyze`
Expected: All tests passed! / No issues found.

- [ ] **Step 8: 커밋**

```bash
git add lib/features/reading/ lib/app/providers.dart test/reading_ad_wiring_test.dart
git commit -m "feat: 통독 전면광고 배선 — 컨트롤러는 신호만, 화면이 SDK 호출"
```

---

### Task 14: 책 상세 — 장별 진행

**저장소:** `verse-flutter`

**Files:**
- Create: `lib/features/cards/book_detail_sheet.dart`
- Modify: `lib/features/cards/bookshelf_view.dart` (`_BookTile`에 onTap)
- Modify: `lib/app/providers.dart` (`bookChaptersProvider`)
- Test: `test/book_detail_test.dart`

**Interfaces:**
- Consumes: Task 2 `ReadingProgressRepository.typedItemIdsForCourse`, Task 11 `BookProgress`
- Produces:
  - `class ChapterProgress { final Section section; final int typed; final int total; bool get complete; }`
  - `bookChaptersProvider` (FutureProvider.family\<List\<ChapterProgress\>, int courseId\>)
  - `Future<void> showBookDetail(BuildContext, WidgetRef, BookProgress)`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/book_detail_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/reading/reading_progress_repository.dart';

/// 창세기 = 2개 장(섹션 10·11), 각 장 2절.
Future<AppDatabase> _seededDb() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(1), slug: 'genesis', title: '창세기', ord: 1, category: 'ot'));
  await db.into(db.sections).insert(SectionsCompanion.insert(
        id: const Value(10), courseId: 1, title: '1장', ord: 0));
  await db.into(db.sections).insert(SectionsCompanion.insert(
        id: const Value(11), courseId: 1, title: '2장', ord: 1));
  var id = 100;
  for (final sectionId in [10, 11]) {
    for (var i = 0; i < 2; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(id), courseId: 1, sectionId: Value(sectionId), ord: id,
            book: 1, chapter: sectionId - 9, verse: i + 1, verseText: 'v$id'));
      id++;
    }
  }
  return db;
}

void main() {
  test('장별 진행을 섹션 순서대로 준다', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    final chapters = await container.read(bookChaptersProvider(1).future);
    expect(chapters.map((c) => c.section.title), ['1장', '2장']);
    expect(chapters.every((c) => c.total == 2), isTrue);
    expect(chapters.every((c) => c.typed == 0), isTrue);
  });

  test('한 장을 다 통독하면 그 장만 complete다', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    final reading = ReadingProgressRepository(db);
    await reading.markTyped(100);
    await reading.markTyped(101);

    final chapters = await container.read(bookChaptersProvider(1).future);
    expect(chapters[0].complete, isTrue);
    expect(chapters[1].complete, isFalse);
  });

  test('부분 통독은 typed에 반영되지만 complete는 아니다', () async {
    final db = await _seededDb();
    addTearDown(db.close);
    final container = ProviderContainer(overrides: [appDatabaseProvider.overrideWithValue(db)]);
    addTearDown(container.dispose);

    await ReadingProgressRepository(db).markTyped(102);

    final chapters = await container.read(bookChaptersProvider(1).future);
    expect(chapters[1].typed, 1);
    expect(chapters[1].complete, isFalse);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `flutter test test/book_detail_test.dart`
Expected: FAIL — `Undefined name 'bookChaptersProvider'`

- [ ] **Step 3: 프로바이더 구현**

`lib/app/providers.dart`에 추가:

```dart
/// 책 상세의 장 한 칸.
class ChapterProgress {
  const ChapterProgress({required this.section, required this.typed, required this.total});
  final Section section;
  final int typed;
  final int total;

  bool get complete => total > 0 && typed >= total;
}

/// 한 권의 장별 통독 진행. 책장에서 책을 탭하면 연다(스펙 §5).
final bookChaptersProvider =
    FutureProvider.family<List<ChapterProgress>, int>((ref, courseId) async {
  final db = ref.watch(appDatabaseProvider);
  final reading = ref.watch(readingProgressRepositoryProvider);

  final sections = await (db.select(db.sections)
        ..where((t) => t.courseId.equals(courseId))
        ..orderBy([(t) => OrderingTerm.asc(t.ord)]))
      .get();
  final items = await (db.select(db.courseItems)
        ..where((t) => t.courseId.equals(courseId)))
      .get();
  final typed = await reading.typedItemIdsForCourse(courseId);

  return [
    for (final section in sections)
      () {
        final inSection = items.where((it) => it.sectionId == section.id).toList();
        return ChapterProgress(
          section: section,
          typed: inSection.where((it) => typed.contains(it.id)).length,
          total: inSection.length,
        );
      }(),
  ];
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/book_detail_test.dart`
Expected: PASS (3개)

- [ ] **Step 5: 상세 시트 구현**

`lib/features/cards/book_detail_sheet.dart` 생성. 장 칩 그리드는 플랜 생성의 장 칩과
같은 시각 언어를 쓴다(스펙 §5):

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../l10n/app_localizations.dart';

/// 책장에서 책을 탭하면 여는 장별 진행 시트.
Future<void> showBookDetail(BuildContext context, WidgetRef ref, BookProgress book) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (context) => _BookDetailSheet(book: book),
  );
}

class _BookDetailSheet extends ConsumerWidget {
  const _BookDetailSheet({required this.book});
  final BookProgress book;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final chaptersAsync = ref.watch(bookChaptersProvider(book.course.id));

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(book.course.title, style: theme.textTheme.titleLarge),
            const SizedBox(height: 4),
            Text('${book.typed}/${book.total}', style: theme.textTheme.bodySmall),
            const SizedBox(height: 16),
            chaptersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text(l.commonErrorGeneric),
              data: (chapters) => Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final c in chapters)
                    Chip(
                      label: Text(c.section.title),
                      avatar: c.complete ? const Icon(Icons.check, size: 16) : null,
                      backgroundColor: c.complete
                          ? theme.colorScheme.primary.withValues(alpha: 0.25)
                          : c.typed > 0
                              ? theme.colorScheme.primary.withValues(alpha: 0.1)
                              : null,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 6: 책 타일에 탭 배선**

`lib/features/cards/bookshelf_view.dart`의 `_BookTile`을 `ConsumerWidget`으로 바꾸고
`Tooltip`을 `InkWell`로 감싼다:

```dart
    return InkWell(
      onTap: () => showBookDetail(context, ref, book),
      child: Tooltip(
        message: '${book.course.title} ${book.typed}/${book.total}',
        child: /* 기존 Container 그대로 */,
      ),
    );
```

파일 상단에 `import 'book_detail_sheet.dart';`를 추가한다.

- [ ] **Step 7: 전체 테스트**

Run: `flutter test && flutter analyze`
Expected: All tests passed! / No issues found.

- [ ] **Step 8: 커밋**

```bash
git add lib/features/cards/ lib/app/providers.dart test/book_detail_test.dart
git commit -m "feat: 책장 책 상세 — 장별 통독 진행 칩 그리드"
```

---

## 완료 확인

모든 태스크가 끝나면:

- [ ] `cd verse-flutter && flutter test` — 전부 통과
- [ ] `cd verse-flutter && flutter analyze` — 이슈 없음
- [ ] `cd verse-backend && go test ./...` — 전부 통과
- [ ] `cd verse-backend && go build ./...` — 빌드 성공
- [ ] 실기기/시뮬레이터에서 수동 확인:
  - 플랜 생성 → 통독 선택 → 성경 책만 보이는지
  - Today에 카드 두 장이 뜨는지
  - 통독 화면에서 오타가 입력되지 않는지, 구두점이 자동 통과되는지
  - 장을 마치면 축하 화면이 뜨고 다음 장으로 이어지는지
  - 카드 탭 → 책장 세그먼트에서 채움이 보이는지

## 남은 선행 과제 (이 계획의 범위 밖)

- **UMP 동의폼** — EEA 사용자 대상 광고 동의 수집. 통독이 광고 노출을 크게 늘리므로 **출시 전 필수**다. 별도 계획으로 진행한다.
- 릴리스 노트에 "받아쓰기에서 틀려도 하트가 줄지 않습니다" 를 넣는다 — Task 8이 기존 사용자에게 체감되는 변화다.
