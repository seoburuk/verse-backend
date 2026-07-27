# 플랜 관리·범위 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `verse-flutter`에서 플랜을 포기·변경·연장할 수 있게 하고, 플랜 대상을 코스 전체가 아니라 장(섹션) 단위로 고를 수 있게 한다.

**Architecture:** `memorization_plan` 테이블에 `sectionIds` 컬럼(콤마 조인 문자열, null=코스 전체) 하나만 추가한다. 진행도(progress)는 지금처럼 코스 아이템 기준으로 남으므로 플랜을 포기하거나 바꿔도 외운 절은 보존된다. 플랜의 절 카운트·다음 절 선택만 섹션 범위로 필터링한다. UI는 Today 플랜 카드 탭 → 바텀시트(포기/변경/마감변경), 생성 화면은 드롭다운 대신 단계형 선택으로 교체한다.

**Tech Stack:** Flutter, drift(로컬 SQLite), Riverpod, go_router, flutter_gen-l10n(ARB)

## Global Constraints

- 작업 디렉터리는 `verse-flutter/`. 모든 명령은 그 안에서 실행한다.
- 날짜는 전부 UTC 기준 `YYYY-MM-DD` 문자열. 기존 `todayUtcDay()`를 쓰고 새 날짜 유틸을 만들지 않는다.
- 사용자에게 보이는 모든 문자열은 `lib/l10n/app_ko.arb` + `lib/l10n/app_en.arb` 양쪽에 넣고 `AppLocalizations`로만 참조한다. 하드코딩 금지.
- 플랜 status 값은 `active | completed | abandoned` 세 개뿐이다.
- 진행도(progress) 행은 플랜 변경·포기 시 **절대 삭제하지 않는다.**
- 기존 테스트 140개가 계속 통과해야 한다. 매 태스크 끝에서 `flutter analyze` 에러 0을 유지한다.
- 커밋은 태스크마다 1개. 커밋 메시지는 한국어, `feat:`/`fix:`/`refactor:` 접두사.

## 스펙 대비 의도적 변경 1건

스펙 §2의 플랜 라벨 규칙("창세기 1–3장" / "창세기 1, 3, 5장")은 섹션 제목 문자열에서 "장"을 떼어내 다시 조립해야 해서 로케일에 취약하다. 장 선택 기본값이 1장으로 바뀐 이상 다중 선택은 예외 경로이므로, **단일이면 `창세기 · 1장`, 복수면 `창세기 · 1장 외 2개`** 로 단순화한다(Task 5). 문자열 가공 없이 섹션 제목을 그대로 쓴다.

## File Structure

**신규**
- `lib/core/plan/plan_label.dart` — 플랜 표시 라벨 생성(순수 함수). Today 카드·바텀시트·완료 CTA가 공유.
- `lib/features/today/plan_sheet.dart` — 플랜 관리 바텀시트 + 확인 다이얼로그.
- `lib/features/today/plan_scope_picker.dart` — 생성 화면 1·2단계(무엇을/어느 장) 위젯.
- `test/plan_section_scope_test.dart`, `test/plan_expiry_test.dart`, `test/plan_label_test.dart`, `test/plan_sheet_test.dart`, `test/plan_scope_picker_test.dart`, `test/today_expired_test.dart`

**수정**
- `lib/core/db/app_database.dart` — 스키마 v3(`sectionIds` 컬럼 + 마이그레이션)
- `lib/core/plan/plan_repository.dart` — 섹션 필터 카운트, `abandonPlan`, `updateDeadline`, `expired`
- `lib/core/courses/course_repository.dart` — 섹션 범위 한정 다음-미완료 절, 섹션별 미완료 조회
- `lib/app/providers.dart` — 플랜 네비게이션 providers에 섹션 범위 반영
- `lib/features/today/today_screen.dart` — 카드 탭 → 시트, 만료 카드, 이어하기 CTA
- `lib/features/today/create_plan_screen.dart` — 단계형 선택으로 재작성
- `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`

---

### Task 1: 스키마 v3 — sectionIds 컬럼

**Files:**
- Modify: `lib/core/db/app_database.dart:125-155`
- Test: `test/memorization_plan_schema_test.dart`

**Interfaces:**
- Produces: `MemorizationPlanData.sectionIds` (`String?`), `MemorizationPlanCompanion.sectionIds`, `AppDatabase.schemaVersion == 3`

- [ ] **Step 1: Write the failing test**

`test/memorization_plan_schema_test.dart` 파일 끝, 기존 test 블록 **아래에** 추가:

```dart
  test('sectionIds를 저장하고 읽을 수 있다 (null이면 코스 전체)', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    final scoped = await db.into(db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: 3,
            title: '창세기',
            deadlineDay: '2026-08-21',
            createdAt: DateTime.utc(2026, 7, 22),
            sectionIds: const Value('11,12'),
          ),
        );
    final whole = await db.into(db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: 4,
            title: '기초',
            deadlineDay: '2026-08-21',
            createdAt: DateTime.utc(2026, 7, 22),
          ),
        );

    final a = await (db.select(db.memorizationPlan)..where((t) => t.id.equals(scoped))).getSingle();
    final b = await (db.select(db.memorizationPlan)..where((t) => t.id.equals(whole))).getSingle();
    expect(a.sectionIds, '11,12');
    expect(b.sectionIds, isNull);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/memorization_plan_schema_test.dart -r compact`
Expected: 컴파일 실패 — `The named parameter 'sectionIds' isn't defined`

- [ ] **Step 3: 컬럼 추가**

`lib/core/db/app_database.dart`의 `MemorizationPlan` 테이블을 다음으로 교체:

```dart
class MemorizationPlan extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get courseId => integer()();
  TextColumn get title => text()();
  TextColumn get deadlineDay => text()(); // YYYY-MM-DD (UTC)
  TextColumn get status => text().withDefault(const Constant('active'))(); // active|completed|abandoned
  DateTimeColumn get createdAt => dateTime()();

  /// 플랜이 대상으로 삼는 섹션(장/섹터) id를 콤마로 조인한 것. null이면 코스 전체.
  /// 구약/신약 코스는 권 전체가 수백~천 절이라 장 단위로 좁히지 않으면
  /// 플랜이 성립하지 않는다.
  TextColumn get sectionIds => text().nullable()();
}
```

- [ ] **Step 4: 스키마 버전·마이그레이션 갱신**

같은 파일의 `schemaVersion`과 `migration`을 교체:

```dart
  @override
  int get schemaVersion => 3;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(memorizationPlan);
          }
          if (from < 3) {
            await m.addColumn(memorizationPlan, memorizationPlan.sectionIds);
          }
        },
      );
```

- [ ] **Step 5: 코드 생성**

Run: `dart run build_runner build --delete-conflicting-outputs`
Expected: `Succeeded after ...`, `lib/core/db/app_database.g.dart` 갱신됨

- [ ] **Step 6: Run tests to verify they pass**

Run: `flutter test test/memorization_plan_schema_test.dart test/plan_repository_test.dart test/plan_view_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 7: Commit**

```bash
git add lib/core/db/app_database.dart lib/core/db/app_database.g.dart test/memorization_plan_schema_test.dart
git commit -m "feat: 플랜에 섹션 범위(sectionIds) 컬럼 추가 (스키마 v3)"
```

---

### Task 2: PlanRepository — 섹션 범위 카운트

**Files:**
- Modify: `lib/core/plan/plan_repository.dart`
- Test: `test/plan_section_scope_test.dart` (create)

**Interfaces:**
- Consumes: Task 1의 `MemorizationPlanData.sectionIds`
- Produces:
  - `List<int>? parseSectionIds(String? raw)` (top-level 함수)
  - `PlanRepository.createPlan({required int courseId, required String title, required String deadlineDay, List<int>? sectionIds})`
  - `PlanView.sectionIds` (`List<int>?`)

- [ ] **Step 1: Write the failing test**

`test/plan_section_scope_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
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

  /// 코스 7에 섹션 2개(id 71, 72)를 만들고 각각 절 5개씩 심는다.
  /// course_item id는 섹션id*10 + i.
  Future<void> seedTwoSections() async {
    for (final sectionId in [71, 72]) {
      await db.into(db.sections).insert(SectionsCompanion.insert(
            id: Value(sectionId), courseId: 7, title: '$sectionId장', ord: sectionId));
      for (var i = 0; i < 5; i++) {
        await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
              id: Value(sectionId * 10 + i),
              courseId: 7,
              sectionId: Value(sectionId),
              ord: sectionId * 10 + i,
              book: 1,
              chapter: sectionId,
              verse: i + 1,
              verseText: 'v$i',
            ));
      }
    }
  }

  Future<void> clearItem(int itemId) async {
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
          courseItemId: Value(itemId),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: DateTime.now().toUtc(),
        ));
  }

  test('parseSectionIds는 콤마 문자열을 리스트로, 빈 값은 null로 바꾼다', () {
    expect(parseSectionIds('11,12'), [11, 12]);
    expect(parseSectionIds(null), isNull);
    expect(parseSectionIds(''), isNull);
  });

  test('섹션 범위 플랜은 그 섹션의 절만 총 절 수로 센다', () async {
    await seedTwoSections();
    await repo.createPlan(
        courseId: 7, title: '창세기', deadlineDay: todayUtcDay(), sectionIds: [71]);

    final v = (await repo.planView())!;
    expect(v.totalVerses, 5); // 10이 아니라 5
    expect(v.sectionIds, [71]);
  });

  test('범위 밖 섹션을 외워도 플랜 완료 절 수에 포함되지 않는다', () async {
    await seedTwoSections();
    await clearItem(720); // 72장의 절 — 범위 밖
    await clearItem(710); // 71장의 절 — 범위 안
    await repo.createPlan(
        courseId: 7, title: '창세기', deadlineDay: todayUtcDay(), sectionIds: [71]);

    final v = (await repo.planView())!;
    expect(v.clearedVerses, 1);
  });

  test('sectionIds가 null이면 코스 전체를 센다 (기존 플랜 호환)', () async {
    await seedTwoSections();
    await repo.createPlan(courseId: 7, title: '창세기', deadlineDay: todayUtcDay());

    final v = (await repo.planView())!;
    expect(v.totalVerses, 10);
    expect(v.sectionIds, isNull);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/plan_section_scope_test.dart -r compact`
Expected: 컴파일 실패 — `parseSectionIds` 미정의, `createPlan`에 `sectionIds` 없음

- [ ] **Step 3: parseSectionIds 추가**

`lib/core/plan/plan_repository.dart`의 `_utcDay` 함수 바로 아래에 추가:

```dart
/// 콤마 조인된 섹션 id 문자열을 리스트로. 빈 값/null이면 null(=코스 전체).
List<int>? parseSectionIds(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  return raw.split(',').map(int.parse).toList();
}
```

- [ ] **Step 4: PlanView에 sectionIds 추가**

`PlanView` 생성자와 필드를 교체(기존 필드는 그대로 두고 하나만 추가):

```dart
class PlanView {
  const PlanView({
    required this.plan,
    required this.courseTitle,
    required this.courseTitleEn,
    required this.totalVerses,
    required this.clearedVerses,
    required this.todayCleared,
    required this.remainingDays,
    this.sectionIds,
  });

  final MemorizationPlanData plan;

  /// 코스의 현재 제목(한글/영문). plan.title은 생성 시점 스냅샷이라 그 뒤
  /// 로케일을 바꿔도 안 바뀐다 — 화면 표시는 항상 이 필드로 매번 다시 고른다.
  final String courseTitle;
  final String courseTitleEn;
  final int totalVerses;
  final int clearedVerses;
  final int todayCleared;
  final int remainingDays;

  /// 플랜이 대상으로 삼는 섹션. null이면 코스 전체.
  final List<int>? sectionIds;

  int get remainingVerses => (totalVerses - clearedVerses).clamp(0, totalVerses);
  bool get planComplete => totalVerses > 0 && clearedVerses >= totalVerses;
  int get todayTarget => remainingVerses <= 0 ? 0 : (remainingVerses / remainingDays).ceil();
  bool get todayDone => planComplete || (todayTarget > 0 && todayCleared >= todayTarget);
}
```

- [ ] **Step 5: createPlan에 sectionIds 받기**

`createPlan`을 교체:

```dart
  Future<MemorizationPlanData> createPlan({
    required int courseId,
    required String title,
    required String deadlineDay,
    List<int>? sectionIds,
  }) async {
    final id = await _db.into(_db.memorizationPlan).insert(
          MemorizationPlanCompanion.insert(
            courseId: courseId,
            title: title,
            deadlineDay: deadlineDay,
            createdAt: DateTime.now().toUtc(),
            sectionIds: Value(
              (sectionIds == null || sectionIds.isEmpty) ? null : sectionIds.join(','),
            ),
          ),
        );
    return (_db.select(_db.memorizationPlan)..where((t) => t.id.equals(id))).getSingle();
  }
```

- [ ] **Step 6: 카운트 쿼리에 섹션 필터 적용**

`planView`와 두 카운트 메서드를 교체:

```dart
  Future<PlanView?> planView() async {
    final plan = await activePlan();
    if (plan == null) return null;
    final course =
        await (_db.select(_db.courses)..where((t) => t.id.equals(plan.courseId))).getSingleOrNull();
    final sectionIds = parseSectionIds(plan.sectionIds);
    final total = await _countItems(plan.courseId, sectionIds);
    final cleared = await _countCleared(plan.courseId, sectionIds, todayOnly: false);
    final todayCleared = await _countCleared(plan.courseId, sectionIds, todayOnly: true);
    return PlanView(
      plan: plan,
      // 코스가 콘텐츠 갱신으로 사라졌으면 저장된 스냅샷으로 폴백한다.
      courseTitle: course?.title ?? plan.title,
      courseTitleEn: course?.titleEn ?? '',
      totalVerses: total,
      clearedVerses: cleared,
      todayCleared: todayCleared,
      remainingDays: _remainingDays(plan.deadlineDay),
      sectionIds: sectionIds,
    );
  }

  Future<int> _countItems(int courseId, List<int>? sectionIds) async {
    final q = _db.select(_db.courseItems)..where((t) => t.courseId.equals(courseId));
    if (sectionIds != null) q.where((t) => t.sectionId.isIn(sectionIds));
    return (await q.get()).length;
  }

  /// cleared된 플랜 범위 절 수. todayOnly면 updatedAt의 UTC 일자가 오늘인 것만.
  Future<int> _countCleared(int courseId, List<int>? sectionIds,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId) & _db.progress.cleared.equals(true);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
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

- [ ] **Step 7: Run tests to verify they pass**

Run: `flutter test test/plan_section_scope_test.dart test/plan_view_test.dart test/plan_repository_test.dart -r compact`
Expected: All tests passed (기존 plan_view 테스트는 sectionIds 없이 호출하므로 그대로 통과)

- [ ] **Step 8: Commit**

```bash
git add lib/core/plan/plan_repository.dart test/plan_section_scope_test.dart
git commit -m "feat: 플랜 절 카운트를 섹션 범위로 한정"
```

---

### Task 3: 플랜 포기·마감 변경·만료 판정

**Files:**
- Modify: `lib/core/plan/plan_repository.dart`
- Test: `test/plan_expiry_test.dart` (create), `test/plan_repository_test.dart`

**Interfaces:**
- Consumes: Task 2의 `PlanView`
- Produces:
  - `PlanRepository.abandonPlan(int planId)` → `Future<void>`
  - `PlanRepository.updateDeadline(int planId, String deadlineDay)` → `Future<void>`
  - `PlanView.expired` (`bool`), `PlanView.todayTarget`은 만료 시 0

- [ ] **Step 1: Write the failing test**

`test/plan_expiry_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
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

  Future<void> seedCourse(int courseId, int n) async {
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

  String dayOffset(int days) {
    final d = DateTime.now().toUtc().add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  test('abandonPlan 후에는 activePlan이 null이고 진행도는 남는다', () async {
    await seedCourse(7, 5);
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
          courseItemId: const Value(700),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: DateTime.now().toUtc(),
        ));
    final plan = await repo.createPlan(courseId: 7, title: 'x', deadlineDay: dayOffset(7));

    await repo.abandonPlan(plan.id);

    expect(await repo.activePlan(), isNull);
    final rows = await db.select(db.progress).get();
    expect(rows.length, 1, reason: '플랜을 포기해도 외운 절은 지우지 않는다');
  });

  test('updateDeadline은 마감일만 바꾸고 플랜은 활성으로 남는다', () async {
    final plan = await repo.createPlan(courseId: 7, title: 'x', deadlineDay: dayOffset(1));
    await repo.updateDeadline(plan.id, dayOffset(30));

    final active = (await repo.activePlan())!;
    expect(active.deadlineDay, dayOffset(30));
    expect(active.status, 'active');
  });

  test('마감이 지나면 expired=true이고 오늘 목표는 0이 된다', () async {
    await seedCourse(7, 20);
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: dayOffset(-3));

    final v = (await repo.planView())!;
    expect(v.expired, isTrue);
    expect(v.todayTarget, 0,
        reason: '만료된 플랜이 남은 절 20개를 오늘 목표로 쏟아내면 안 된다');
    expect(v.todayDone, isFalse);
  });

  test('마감이 오늘이면 아직 만료가 아니다', () async {
    await seedCourse(7, 20);
    await repo.createPlan(courseId: 7, title: 'x', deadlineDay: dayOffset(0));

    final v = (await repo.planView())!;
    expect(v.expired, isFalse);
    expect(v.todayTarget, 20);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/plan_expiry_test.dart -r compact`
Expected: 컴파일 실패 — `abandonPlan`, `updateDeadline`, `expired` 미정의

- [ ] **Step 3: 저장소 메서드 추가**

`lib/core/plan/plan_repository.dart`의 `markCompleted` 바로 아래에 추가:

```dart
  /// 플랜 포기. status만 바꾸고 progress는 건드리지 않는다 —
  /// 플랜은 일정이고, 외운 절은 사용자의 자산이다.
  Future<void> abandonPlan(int planId) async {
    await (_db.update(_db.memorizationPlan)..where((t) => t.id.equals(planId)))
        .write(const MemorizationPlanCompanion(status: Value('abandoned')));
  }

  Future<void> updateDeadline(int planId, String deadlineDay) async {
    await (_db.update(_db.memorizationPlan)..where((t) => t.id.equals(planId)))
        .write(MemorizationPlanCompanion(deadlineDay: Value(deadlineDay)));
  }
```

- [ ] **Step 4: PlanView에 expired 추가**

`PlanView`의 파생 getter 블록을 교체(생성자·필드는 Task 2 상태 그대로):

```dart
  /// 마감일이 어제 이전이면 만료. 'YYYY-MM-DD'는 사전순 비교가 날짜순과 같다.
  bool get expired => plan.deadlineDay.compareTo(todayUtcDay()) < 0;

  int get remainingVerses => (totalVerses - clearedVerses).clamp(0, totalVerses);
  bool get planComplete => totalVerses > 0 && clearedVerses >= totalVerses;

  /// 만료 플랜은 오늘 목표가 없다. 이 가드가 없으면 _remainingDays의 max(1,..)
  /// 때문에 남은 절 전부가 매일 "오늘 목표"로 쏟아진다.
  int get todayTarget =>
      (expired || remainingVerses <= 0) ? 0 : (remainingVerses / remainingDays).ceil();
  bool get todayDone => planComplete || (todayTarget > 0 && todayCleared >= todayTarget);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `flutter test test/plan_expiry_test.dart test/plan_view_test.dart test/mascot_mood_test.dart test/today_celebration_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 6: Commit**

```bash
git add lib/core/plan/plan_repository.dart test/plan_expiry_test.dart
git commit -m "feat: 플랜 포기·마감 변경 + 만료 판정

만료 시 todayTarget=0. 그전엔 remainingDays의 max(1,..) 때문에
마감이 지나면 남은 절 전부가 매일 오늘 목표로 쏟아졌다."
```

---

### Task 4: 다음 절 선택을 섹션 범위로 한정

**Files:**
- Modify: `lib/core/courses/course_repository.dart:212-238`
- Modify: `lib/app/providers.dart:200-204, 242-251`
- Test: `test/course_first_uncleared_test.dart`

**Interfaces:**
- Consumes: Task 2의 `PlanView.sectionIds`
- Produces:
  - `CourseRepository.firstUnclearedInCourse(int courseId, {List<int>? sectionIds})`
  - `CourseRepository.listItemsByCourse(int courseId, {List<int>? sectionIds})`
  - `CourseRepository.firstUnclearedSectionId(int courseId)` → `Future<int?>` (Task 8이 기본 장 선택에 쓴다)

- [ ] **Step 1: Write the failing test**

`test/course_first_uncleared_test.dart` 파일 끝의 `main()` 안, 마지막 test 아래에 추가:

```dart
  test('sectionIds를 주면 그 섹션 안의 미완료 절만 반환한다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    final repo = CourseRepository(db);

    for (final sectionId in [81, 82]) {
      await db.into(db.sections).insert(SectionsCompanion.insert(
            id: Value(sectionId), courseId: 8, title: '$sectionId장', ord: sectionId));
      for (var i = 0; i < 3; i++) {
        await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
              id: Value(sectionId * 10 + i),
              courseId: 8,
              sectionId: Value(sectionId),
              ord: sectionId * 10 + i,
              book: 1,
              chapter: sectionId,
              verse: i + 1,
              verseText: 'v$i',
            ));
      }
    }
    // 82장 첫 절을 이미 외운 상태로 둔다.
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
          courseItemId: const Value(820),
          grade: 'green',
          cleared: const Value(true),
          updatedAt: DateTime.now().toUtc(),
        ));

    final scoped = await repo.firstUnclearedInCourse(8, sectionIds: [82]);
    expect(scoped!.id, 821, reason: '81장으로 새면 안 된다');

    final whole = await repo.firstUnclearedInCourse(8);
    expect(whole!.id, 810);

    final items = await repo.listItemsByCourse(8, sectionIds: [82]);
    expect(items.length, 3);

    expect(await repo.firstUnclearedSectionId(8), 81);
  });
```

파일 상단 import에 `package:drift/drift.dart`의 `Value`와 `SectionsCompanion`이 이미 없으면 추가한다(`import 'package:drift/drift.dart' hide isNull;`).

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/course_first_uncleared_test.dart -r compact`
Expected: 컴파일 실패 — `sectionIds` 명명 인자 없음, `firstUnclearedSectionId` 미정의

- [ ] **Step 3: CourseRepository 확장**

`lib/core/courses/course_repository.dart`의 `firstUnclearedInCourse` / `_nextUnclearedInCourse` / `listItemsByCourse`를 교체:

```dart
  Future<CourseItem?> firstUnclearedInCourse(int courseId, {List<int>? sectionIds}) =>
      _nextUnclearedInCourse(courseId, 0, sectionIds);

  /// 같은 코스에서 다음 미완료(uncleared) 절. 웹 GetNextUnclearedItem의
  /// `ORDER BY (ord < afterOrd), ord`와 동일 — 현재 위치 이후 절을 먼저,
  /// 그 안에서 ord 오름차순. 범위 전체가 완료면 null.
  /// sectionIds를 주면 그 섹션 안으로만 한정한다(플랜 범위 밖으로 새지 않게).
  Future<CourseItem?> _nextUnclearedInCourse(
      int courseId, int afterOrd, List<int>? sectionIds) async {
    final query = _db.select(_db.courseItems).join([
      leftOuterJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
      ..where(_db.courseItems.courseId.equals(courseId));
    if (sectionIds != null) {
      query.where(_db.courseItems.sectionId.isIn(sectionIds));
    }
    final rows = await query.get();
    final uncleared = rows
        .where((r) => (r.readTableOrNull(_db.progress)?.cleared ?? false) == false)
        .map((r) => r.readTable(_db.courseItems))
        .toList();
    if (uncleared.isEmpty) return null;
    uncleared.sort((a, b) {
      final aAfter = a.ord < afterOrd ? 1 : 0;
      final bAfter = b.ord < afterOrd ? 1 : 0;
      if (aAfter != bAfter) return aAfter - bAfter;
      return a.ord.compareTo(b.ord);
    });
    return uncleared.first;
  }

  Future<List<CourseItem>> listItemsByCourse(int courseId, {List<int>? sectionIds}) {
    final q = _db.select(_db.courseItems)..where((t) => t.courseId.equals(courseId));
    if (sectionIds != null) q.where((t) => t.sectionId.isIn(sectionIds));
    return q.get();
  }

  /// 코스에서 아직 다 외우지 않은 첫 섹션(장)의 id. 전부 완료면 null.
  /// 플랜 생성 화면이 "이어서 할 장"을 기본 선택하는 데 쓴다.
  Future<int?> firstUnclearedSectionId(int courseId) async {
    final next = await firstUnclearedInCourse(courseId);
    return next?.sectionId;
  }
```

**주의:** `_nextUnclearedInCourse`를 호출하는 다른 지점(같은 파일의 코스 이어하기 경로)이 있으면 인자 3개 형태(`_nextUnclearedInCourse(courseId, afterOrd, null)`)로 맞춘다.

- [ ] **Step 4: 호출부 컴파일 확인**

Run: `flutter analyze lib/core/courses/course_repository.dart`
Expected: 에러 0 (인자 개수 불일치가 나오면 위 주의사항대로 `null` 추가)

- [ ] **Step 5: providers를 플랜 범위에 맞춘다**

`lib/app/providers.dart`의 `planNextItemProvider`를 교체:

```dart
/// 오늘 홈의 "이어서 외우기"가 진입할 다음 미완료 절. 활성 플랜 없으면 null.
final planNextItemProvider = FutureProvider.autoDispose<CourseItem?>((ref) async {
  final view = await ref.watch(activePlanViewProvider.future);
  if (view == null) return null;
  return ref
      .watch(courseRepositoryProvider)
      .firstUnclearedInCourse(view.plan.courseId, sectionIds: view.sectionIds);
});
```

`planNextNavArgsProvider`를 교체:

```dart
final planNextNavArgsProvider = FutureProvider.autoDispose<MemorizeNavArgs?>((ref) async {
  final view = await ref.watch(activePlanViewProvider.future);
  if (view == null) return null;
  final courses = ref.watch(courseRepositoryProvider);
  final next =
      await courses.firstUnclearedInCourse(view.plan.courseId, sectionIds: view.sectionIds);
  if (next == null) return null;
  // 체이닝 목록도 플랜 범위로 한정한다 — 그렇지 않으면 한 절을 마친 뒤
  // "다음"이 플랜 밖의 절로 새어나간다.
  final items = await courses.listItemsByCourse(view.plan.courseId, sectionIds: view.sectionIds);
  final idx = items.indexWhere((i) => i.id == next.id);
  if (idx == -1) return null;
  return MemorizeNavArgs(items: items, index: idx, courseId: view.plan.courseId, sectionId: next.sectionId);
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `flutter test test/course_first_uncleared_test.dart test/course_resume_test.dart test/today_screen_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 7: Commit**

```bash
git add lib/core/courses/course_repository.dart lib/app/providers.dart test/course_first_uncleared_test.dart
git commit -m "feat: 플랜의 다음 절·체이닝 목록을 섹션 범위로 한정"
```

---

### Task 5: 플랜 라벨 (공유 순수 함수)

**Files:**
- Create: `lib/core/plan/plan_label.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/plan_label_test.dart` (create)

**Interfaces:**
- Produces: `String planLabel({required String courseTitle, required List<String> sectionTitles, required AppLocalizations l})`
- 규칙: 섹션 0개 → `courseTitle` / 1개 → `창세기 · 1장` / N개 → `창세기 · 1장 외 2개`

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`에서 `"createPlanStart": "시작하기",` 줄 **아래에** 추가:

```json
  "planLabelOne": "{course} · {section}",
  "@planLabelOne": {
    "placeholders": { "course": {"type": "String"}, "section": {"type": "String"} }
  },
  "planLabelMany": "{course} · {section} 외 {rest}개",
  "@planLabelMany": {
    "placeholders": { "course": {"type": "String"}, "section": {"type": "String"}, "rest": {"type": "int"} }
  },
```

`lib/l10n/app_en.arb`에서 `"createPlanStart": "Start",` 줄 **아래에** 추가:

```json
  "planLabelOne": "{course} · {section}",
  "planLabelMany": "{course} · {section} +{rest}",
```

- [ ] **Step 2: Write the failing test**

`test/plan_label_test.dart` 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/plan/plan_label.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  /// AppLocalizations 인스턴스를 얻으려면 위젯 트리가 필요하다.
  Future<AppLocalizations> loadKo(WidgetTester tester) async {
    late AppLocalizations l;
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('ko'),
      home: Builder(builder: (c) {
        l = AppLocalizations.of(c)!;
        return const SizedBox.shrink();
      }),
    ));
    await tester.pumpAndSettle();
    return l;
  }

  testWidgets('섹션이 없으면 코스 제목만', (tester) async {
    final l = await loadKo(tester);
    expect(planLabel(courseTitle: '기초', sectionTitles: const [], l: l), '기초');
  });

  testWidgets('섹션 1개면 코스 · 섹션', (tester) async {
    final l = await loadKo(tester);
    expect(planLabel(courseTitle: '창세기', sectionTitles: const ['1장'], l: l), '창세기 · 1장');
  });

  testWidgets('섹션 여러 개면 첫 섹션 외 N개', (tester) async {
    final l = await loadKo(tester);
    expect(
      planLabel(courseTitle: '창세기', sectionTitles: const ['1장', '2장', '3장'], l: l),
      '창세기 · 1장 외 2개',
    );
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `flutter gen-l10n && flutter test test/plan_label_test.dart -r compact`
Expected: 컴파일 실패 — `plan_label.dart` 없음

- [ ] **Step 4: 구현**

`lib/core/plan/plan_label.dart` 생성:

```dart
import '../../l10n/app_localizations.dart';

/// 플랜의 사람이 읽는 이름. Today 카드·바텀시트·완료 CTA가 공유한다.
///
/// 섹션 제목을 가공하지 않고 그대로 쓴다("1장"에서 "장"을 떼어 "1–3장"으로
/// 재조립하는 방식은 로케일이 바뀌면 깨진다). 장 선택 기본값이 1장이라
/// 다중 선택은 예외 경로이므로 "외 N개"로 충분하다.
String planLabel({
  required String courseTitle,
  required List<String> sectionTitles,
  required AppLocalizations l,
}) {
  if (sectionTitles.isEmpty) return courseTitle;
  if (sectionTitles.length == 1) {
    return l.planLabelOne(courseTitle, sectionTitles.first);
  }
  return l.planLabelMany(courseTitle, sectionTitles.first, sectionTitles.length - 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `flutter test test/plan_label_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 6: Commit**

```bash
git add lib/core/plan/plan_label.dart lib/l10n/ test/plan_label_test.dart
git commit -m "feat: 플랜 표시 라벨 공용 함수"
```

---

### Task 6: Today 플랜 카드 탭 → 관리 바텀시트

**Files:**
- Create: `lib/features/today/plan_sheet.dart`
- Modify: `lib/features/today/today_screen.dart:158-171`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/plan_sheet_test.dart` (create)

**Interfaces:**
- Consumes: Task 3의 `abandonPlan`/`updateDeadline`, Task 5의 `planLabel`
- Produces: `Future<void> showPlanSheet(BuildContext context, WidgetRef ref, PlanView view)`

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`의 `"planLabelMany"` 블록 아래에 추가:

```json
  "planSheetTitle": "플랜 관리",
  "planSheetChangeDeadline": "마감 변경",
  "planSheetChangePlan": "플랜 변경",
  "planSheetAbandon": "플랜 포기하기",
  "planSheetAbandonConfirmTitle": "플랜을 포기할까요?",
  "planSheetAbandonConfirmBody": "플랜만 사라지고, 외운 절은 그대로 남아요.",
  "planSheetChangeConfirmTitle": "플랜을 바꿀까요?",
  "planSheetChangeConfirmBody": "지금 플랜을 끝내고 새 플랜을 만들어요. 외운 절은 그대로 남아요.",
  "commonCancel": "취소",
  "commonConfirm": "확인",
```

`lib/l10n/app_en.arb`의 `"planLabelMany"` 아래에 추가:

```json
  "planSheetTitle": "Manage plan",
  "planSheetChangeDeadline": "Change deadline",
  "planSheetChangePlan": "Change plan",
  "planSheetAbandon": "Give up on this plan",
  "planSheetAbandonConfirmTitle": "Give up on this plan?",
  "planSheetAbandonConfirmBody": "Only the plan goes away — the verses you memorized stay.",
  "planSheetChangeConfirmTitle": "Change your plan?",
  "planSheetChangeConfirmBody": "This ends the current plan and starts a new one. Memorized verses stay.",
  "commonCancel": "Cancel",
  "commonConfirm": "OK",
```

**주의:** `commonCancel`/`commonConfirm`이 이미 ARB에 있으면 중복 추가하지 말고 기존 것을 쓴다. 확인: `grep -n '"commonCancel"' lib/l10n/app_ko.arb`

- [ ] **Step 2: Write the failing test**

`test/plan_sheet_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/features/today/plan_sheet.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<PlanView> seedPlan() async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(7), slug: 'gen', title: '창세기', ord: 0, category: 'ot'));
    await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
          id: const Value(700), courseId: 7, ord: 0,
          book: 1, chapter: 1, verse: 1, verseText: 'v',
        ));
    final d = DateTime.now().toUtc().add(const Duration(days: 7));
    final day =
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    await PlanRepository(db).createPlan(courseId: 7, title: '창세기', deadlineDay: day);
    return (await PlanRepository(db).planView())!;
  }

  Future<void> pumpSheet(WidgetTester tester, PlanView view) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        home: Consumer(builder: (c, ref, _) {
          return Scaffold(
            body: ElevatedButton(
              onPressed: () => showPlanSheet(c, ref, view),
              child: const Text('OPEN'),
            ),
          );
        }),
      ),
    ));
    await tester.tap(find.text('OPEN'));
    await tester.pumpAndSettle();
  }

  testWidgets('시트에 마감 변경·플랜 변경·플랜 포기 3개가 있다', (tester) async {
    await pumpSheet(tester, await seedPlan());
    expect(find.text('마감 변경'), findsOneWidget);
    expect(find.text('플랜 변경'), findsOneWidget);
    expect(find.text('플랜 포기하기'), findsOneWidget);
  });

  testWidgets('포기는 확인을 거치고, 확인하면 플랜이 비활성화된다', (tester) async {
    await pumpSheet(tester, await seedPlan());

    await tester.tap(find.text('플랜 포기하기'));
    await tester.pumpAndSettle();
    expect(find.text('플랜만 사라지고, 외운 절은 그대로 남아요.'), findsOneWidget);

    await tester.tap(find.text('확인'));
    await tester.pumpAndSettle();

    expect(await PlanRepository(db).activePlan(), isNull);
  });

  testWidgets('포기 확인에서 취소하면 플랜이 남는다', (tester) async {
    await pumpSheet(tester, await seedPlan());

    await tester.tap(find.text('플랜 포기하기'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('취소'));
    await tester.pumpAndSettle();

    expect(await PlanRepository(db).activePlan(), isNotNull);
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `flutter gen-l10n && flutter test test/plan_sheet_test.dart -r compact`
Expected: 컴파일 실패 — `plan_sheet.dart` 없음

- [ ] **Step 4: 시트 구현**

`lib/features/today/plan_sheet.dart` 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/plan/plan_label.dart';
import '../../core/plan/plan_repository.dart';
import '../../l10n/app_localizations.dart';

/// 플랜 관리 바텀시트 — Today 플랜 카드를 탭하면 열린다.
/// 마감 변경 / 플랜 변경 / 플랜 포기 세 가지만 한다.
Future<void> showPlanSheet(BuildContext context, WidgetRef ref, PlanView view) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (sheetContext) => _PlanSheet(view: view),
  );
}

class _PlanSheet extends ConsumerWidget {
  const _PlanSheet({required this.view});
  final PlanView view;

  Future<bool> _confirm(BuildContext context, String title, String body) async {
    final l = AppLocalizations.of(context)!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(l.commonConfirm)),
        ],
      ),
    );
    return ok ?? false;
  }

  void _refresh(WidgetRef ref) {
    ref.invalidate(activePlanViewProvider);
    ref.invalidate(planNextItemProvider);
    ref.invalidate(planNextNavArgsProvider);
  }

  Future<void> _changeDeadline(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now().toUtc();
    final picked = await showDatePicker(
      context: context,
      // 오늘로 잡으면 만들자마자 만료되는 플랜이 나온다 — 최소는 내일.
      firstDate: now.add(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now.add(const Duration(days: 7)),
    );
    if (picked == null) return;
    final day =
        '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    await ref.read(planRepositoryProvider).updateDeadline(view.plan.id, day);
    _refresh(ref);
    if (context.mounted) Navigator.pop(context);
  }

  Future<void> _changePlan(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context)!;
    if (!await _confirm(context, l.planSheetChangeConfirmTitle, l.planSheetChangeConfirmBody)) {
      return;
    }
    await ref.read(planRepositoryProvider).abandonPlan(view.plan.id);
    _refresh(ref);
    if (!context.mounted) return;
    Navigator.pop(context);
    context.push('/plan/new');
  }

  Future<void> _abandon(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context)!;
    if (!await _confirm(context, l.planSheetAbandonConfirmTitle, l.planSheetAbandonConfirmBody)) {
      return;
    }
    await ref.read(planRepositoryProvider).abandonPlan(view.plan.id);
    _refresh(ref);
    if (context.mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final courseTitle =
        locale == 'en' && view.courseTitleEn.isNotEmpty ? view.courseTitleEn : view.courseTitle;
    final sectionTitlesAsync = ref.watch(planSectionTitlesProvider);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 16),
          Text(
            planLabel(
              courseTitle: courseTitle,
              sectionTitles: sectionTitlesAsync.valueOrNull ?? const [],
              l: l,
            ),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text('${l.todayPlanCount(view.clearedVerses, view.totalVerses)} · '
              '${l.todayDday(view.remainingDays)}'),
          const SizedBox(height: 8),
          ListTile(
            leading: const Icon(Icons.event),
            title: Text(l.planSheetChangeDeadline),
            onTap: () => _changeDeadline(context, ref),
          ),
          ListTile(
            leading: const Icon(Icons.swap_horiz),
            title: Text(l.planSheetChangePlan),
            onTap: () => _changePlan(context, ref),
          ),
          ListTile(
            leading: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error),
            title: Text(
              l.planSheetAbandon,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            onTap: () => _abandon(context, ref),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
```

- [ ] **Step 5: 섹션 제목 provider 추가**

`lib/app/providers.dart`의 `planNextNavArgsProvider` 아래에 추가:

```dart
/// 활성 플랜이 대상으로 삼은 섹션들의 제목. 플랜 라벨 표시용.
/// 코스 전체 플랜(sectionIds == null)이면 빈 리스트.
final planSectionTitlesProvider = FutureProvider.autoDispose<List<String>>((ref) async {
  final view = await ref.watch(activePlanViewProvider.future);
  final ids = view?.sectionIds;
  if (view == null || ids == null) return const [];
  final sections = await ref.watch(courseRepositoryProvider).listSections(view.plan.courseId);
  return sections.where((s) => ids.contains(s.id)).map((s) => s.title).toList();
});
```

- [ ] **Step 6: Today 카드를 탭 가능하게**

`lib/features/today/today_screen.dart` 상단 import에 추가:

```dart
import 'plan_sheet.dart';
```

`_plan` 메서드의 "플랜 전체 진행" 블록(현재 `Text(planTitle, ...)` 부터 `Row(...)` 닫는 곳까지)을 다음으로 교체:

```dart
        // 플랜 전체 진행 — 탭하면 플랜 관리 시트(변경/포기/마감)
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
                const SizedBox(height: 4),
                Text(l.todayPlanProgress, style: theme.textTheme.bodySmall),
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `flutter test test/plan_sheet_test.dart test/today_screen_test.dart test/today_mascot_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 8: 정적 분석**

Run: `flutter analyze`
Expected: 에러 0

- [ ] **Step 9: Commit**

```bash
git add lib/features/today/plan_sheet.dart lib/features/today/today_screen.dart lib/app/providers.dart lib/l10n/ test/plan_sheet_test.dart
git commit -m "feat: Today 플랜 카드 탭 → 플랜 관리 바텀시트

포기·변경 모두 확인 다이얼로그를 거치고, 외운 절은 보존한다고 명시한다."
```

---

### Task 7: 마감 만료 카드

**Files:**
- Modify: `lib/features/today/today_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/today_expired_test.dart` (create)

**Interfaces:**
- Consumes: Task 3의 `PlanView.expired`, Task 6의 `showPlanSheet`

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`의 `"planSheetChangeConfirmBody"` 아래에 추가:

```json
  "todayExpiredTitle": "마감이 지났어요",
  "todayExpiredBody": "외운 절은 그대로 있어요. 마감을 늘리거나 새 플랜을 만들어요.",
  "todayExtendDeadline": "마감 연장",
  "todayPlanBrokenTitle": "플랜을 다시 만들어 주세요",
  "todayPlanBrokenBody": "콘텐츠가 바뀌어 이 플랜의 구절을 찾을 수 없어요.",
```

`lib/l10n/app_en.arb`에 추가:

```json
  "todayExpiredTitle": "The deadline has passed",
  "todayExpiredBody": "Your memorized verses are safe. Extend the deadline or start a new plan.",
  "todayExtendDeadline": "Extend deadline",
  "todayPlanBrokenTitle": "Please create a new plan",
  "todayPlanBrokenBody": "Content changed and this plan's verses can no longer be found.",
```

- [ ] **Step 2: Write the failing test**

`test/today_expired_test.dart` 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/features/today/today_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  String dayOffset(int days) {
    final d = DateTime.now().toUtc().add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  Future<void> seed({required int deadlineOffset}) async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(7), slug: 'gen', title: '창세기', ord: 0, category: 'ot'));
    for (var i = 0; i < 5; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(700 + i), courseId: 7, ord: i,
            book: 1, chapter: 1, verse: i + 1, verseText: 'v$i',
          ));
    }
    await PlanRepository(db)
        .createPlan(courseId: 7, title: '창세기', deadlineDay: dayOffset(deadlineOffset));
  }

  Future<void> pumpToday(WidgetTester tester) async {
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (c, s) => const TodayScreen()),
      GoRoute(path: '/plan/new', builder: (c, s) => const Scaffold(body: Text('NEW PLAN'))),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp.router(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        routerConfig: router,
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('마감이 지나면 만료 카드가 뜨고 이어서 외우기는 사라진다', (tester) async {
    await seed(deadlineOffset: -2);
    await pumpToday(tester);

    expect(find.text('마감이 지났어요'), findsOneWidget);
    expect(find.text('마감 연장'), findsOneWidget);
    expect(find.text('이어서 외우기'), findsNothing);
  });

  testWidgets('마감 전이면 만료 카드는 없고 이어서 외우기가 뜬다', (tester) async {
    await seed(deadlineOffset: 7);
    await pumpToday(tester);

    expect(find.text('마감이 지났어요'), findsNothing);
    expect(find.text('이어서 외우기'), findsOneWidget);
  });

  testWidgets('플랜 범위의 절이 하나도 없으면 만료가 아니라 재생성 안내가 뜬다', (tester) async {
    // 콘텐츠 갱신으로 섹션이 사라진 상황: 존재하지 않는 섹션을 가리키는 플랜.
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(7), slug: 'gen', title: '창세기', ord: 0, category: 'ot'));
    await PlanRepository(db).createPlan(
        courseId: 7, title: '창세기', deadlineDay: dayOffset(7), sectionIds: [999]);
    await pumpToday(tester);

    expect(find.text('플랜을 다시 만들어 주세요'), findsOneWidget);
    expect(find.text('마감이 지났어요'), findsNothing);
    expect(find.text('이어서 외우기'), findsNothing);
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `flutter gen-l10n && flutter test test/today_expired_test.dart -r compact`
Expected: FAIL — `'마감이 지났어요'` 를 찾지 못함

- [ ] **Step 4: 깨진 플랜 폴백 분기**

`today_screen.dart`의 `build` 메서드에서 `data:` 콜백을 교체한다. 범위 절이 0개인 플랜은 진행도도 만료도 의미가 없으므로 다른 분기보다 먼저 걸러낸다:

```dart
                  data: (view) => switch (view) {
                    null => _empty(context, ref, l),
                    // 콘텐츠 갱신으로 플랜이 가리키던 섹션이 사라진 경우.
                    // 진행률도 마감도 의미가 없으니 재생성만 안내한다.
                    final v when v.totalVerses == 0 => _broken(context, ref, l, v),
                    final v => _plan(context, ref, l, v),
                  },
```

`_empty` 메서드 아래에 추가:

```dart
  /// 플랜이 가리키던 절을 하나도 찾을 수 없을 때. 포기 버튼 대신 곧바로
  /// 새 플랜으로 보낸다(사용자가 고칠 수 있는 상태가 아니다).
  Widget _broken(BuildContext context, WidgetRef ref, AppLocalizations l, PlanView view) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l.todayPlanBrokenTitle, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(l.todayPlanBrokenBody, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              await ref.read(planRepositoryProvider).abandonPlan(view.plan.id);
              ref.invalidate(activePlanViewProvider);
              if (context.mounted) context.push('/plan/new');
            },
            child: Text(l.todayCreatePlan),
          ),
        ],
      ),
    );
  }
```

- [ ] **Step 5: 만료 분기 구현**

`today_screen.dart`의 `_plan` 메서드에서, "오늘 목표" 블록(현재 `Text(l.todayGoalTitle, ...)` 부터 `Text(view.todayDone ? ... )` 까지)을 다음으로 교체:

```dart
        // 오늘 목표 — 만료된 플랜엔 오늘 목표가 없다
        if (!view.expired) ...[
          Text(l.todayGoalTitle, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: goalRatio, minHeight: 12),
          const SizedBox(height: 4),
          Text(view.todayDone ? l.todayGoalDone : l.todayGoalCount(view.todayCleared, view.todayTarget)),
        ] else
          _expiredCard(context, ref, l, view),
        const SizedBox(height: 24),
```

같은 메서드 하단의 CTA 분기를 교체:

```dart
        // CTA — 만료면 만료 카드가 대신하고, 완주면 다음 플랜, 아니면 이어서 외우기
        if (view.expired)
          const SizedBox.shrink()
        else if (view.planComplete)
          _completeCta(context, ref, l, view)
        else
          _continueCta(context, ref, l),
```

`_completeCta` 메서드 아래에 새 메서드 추가:

```dart
  /// 마감이 지난 플랜. 오늘 목표 자리를 대신 차지하고 연장/새 플랜만 제안한다.
  Widget _expiredCard(BuildContext context, WidgetRef ref, AppLocalizations l, PlanView view) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l.todayExpiredTitle, style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(l.todayExpiredBody, style: theme.textTheme.bodySmall),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: FilledButton(
                onPressed: () => showPlanSheet(context, ref, view),
                child: Text(l.todayExtendDeadline),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: () async {
                  await ref.read(planRepositoryProvider).abandonPlan(view.plan.id);
                  ref.invalidate(activePlanViewProvider);
                  if (context.mounted) context.push('/plan/new');
                },
                child: Text(l.todayNextPlan),
              ),
            ),
          ],
        ),
      ],
    );
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `flutter test test/today_expired_test.dart test/today_screen_test.dart test/today_celebration_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 7: Commit**

```bash
git add lib/features/today/today_screen.dart lib/l10n/ test/today_expired_test.dart
git commit -m "feat: 마감 만료 플랜에 연장/새 플랜 카드 표시

범위 절이 0개인 깨진 플랜(콘텐츠 갱신으로 섹션 소실)은 만료보다
먼저 걸러 재생성을 안내한다."
```

---

### Task 8: 플랜 생성 화면 재작성 — 범위 선택 + 하루 절수 미리보기

**Files:**
- Create: `lib/features/today/plan_scope_picker.dart`
- Rewrite: `lib/features/today/create_plan_screen.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/plan_scope_picker_test.dart` (create), `test/create_plan_screen_test.dart`

**Interfaces:**
- Consumes: Task 2의 `createPlan(sectionIds:)`, Task 4의 `firstUnclearedSectionId`
- Produces:
  - `class PlanScope { final Course course; final List<int> sectionIds; }`
  - `int versesPerDay(int totalVerses, int days)` — `ceil`, days<1이면 totalVerses

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`의 `"todayExtendDeadline"` 아래에 추가:

```json
  "createPlanWhatTitle": "무엇을 외울까요?",
  "createPlanWarmupEntry": "워밍업 주제 골라서",
  "createPlanBibleEntry": "성경 책별로",
  "createPlanPickChapters": "장 고르기",
  "createPlanChapterHint": "한 장부터 시작해요. 더 하고 싶으면 탭해서 추가하세요.",
  "createPlanPerDay": "총 {total}절 · 하루 약 {perDay}절",
  "@createPlanPerDay": {
    "placeholders": { "total": {"type": "int"}, "perDay": {"type": "int"} }
  },
  "createPlanTooMuch": "하루 {perDay}절은 좀 많아요 — 마감을 늘려보세요",
  "@createPlanTooMuch": {
    "placeholders": { "perDay": {"type": "int"} }
  },
  "createPlanCustomDate": "직접 선택",
  "createPlanVerseCount": "{count}절",
  "@createPlanVerseCount": {
    "placeholders": { "count": {"type": "int"} }
  },
```

`lib/l10n/app_en.arb`에 추가:

```json
  "createPlanWhatTitle": "What do you want to memorize?",
  "createPlanWarmupEntry": "Pick a warm-up topic",
  "createPlanBibleEntry": "Browse by book",
  "createPlanPickChapters": "Pick chapters",
  "createPlanChapterHint": "Start with one chapter. Tap to add more if you want.",
  "createPlanPerDay": "{total} verses · about {perDay} a day",
  "createPlanTooMuch": "{perDay} verses a day is a lot — try a later deadline",
  "createPlanCustomDate": "Pick a date",
  "createPlanVerseCount": "{count} verses",
```

- [ ] **Step 2: Write the failing test (순수 로직)**

`test/plan_scope_picker_test.dart` 생성:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/today/plan_scope_picker.dart';

void main() {
  test('versesPerDay는 올림한다', () {
    expect(versesPerDay(10, 7), 2);
    expect(versesPerDay(31, 30), 2);
    expect(versesPerDay(5, 5), 1);
    expect(versesPerDay(0, 7), 0);
  });

  test('남은 일수가 0 이하면 전부 오늘치로 본다', () {
    expect(versesPerDay(12, 0), 12);
    expect(versesPerDay(12, -3), 12);
  });
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `flutter test test/plan_scope_picker_test.dart -r compact`
Expected: 컴파일 실패 — `plan_scope_picker.dart` 없음

- [ ] **Step 4: 범위 선택 위젯 + 순수 로직 구현**

`lib/features/today/plan_scope_picker.dart` 생성:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/app_database.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/categories.dart';

/// 하루에 외워야 하는 절 수. 마감 미리보기에 쓴다.
/// 남은 일수가 0 이하(오늘 마감)면 남은 절 전부가 오늘치다.
int versesPerDay(int totalVerses, int days) {
  if (totalVerses <= 0) return 0;
  if (days <= 0) return totalVerses;
  return (totalVerses / days).ceil();
}

/// 사용자가 고른 플랜 대상. sectionIds가 비면 코스 전체.
class PlanScope {
  const PlanScope({required this.course, this.sectionIds = const []});
  final Course course;
  final List<int> sectionIds;
}

/// 1단계 — 무엇을 외울까. 카테고리 중간 단계 없이 소형 코스는 바로 나열하고,
/// 워밍업(섹터 30개)과 성경 책(권 66개)만 하위 목록으로 넘긴다.
class PlanScopePicker extends ConsumerWidget {
  const PlanScopePicker({super.key, required this.onPicked});

  /// 코스 전체로 끝나는 선택(소형 코스)이면 sectionIds가 빈 채로 온다.
  final void Function(PlanScope scope) onPicked;

  static const _smallCategories = ['foundations', 'lords-prayer', 'messiah'];

  String _title(Course c, String locale) =>
      locale == 'en' && c.titleEn.isNotEmpty ? c.titleEn : c.title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final coursesAsync = ref.watch(allCoursesProvider);

    return coursesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(l.commonErrorGeneric)),
      data: (courses) {
        final small = courses.where((c) => _smallCategories.contains(c.category)).toList();
        final warmup = courses.where((c) => c.category == 'warmup').toList();
        final bible = courses.where((c) => c.category == 'ot' || c.category == 'nt').toList();

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(l.createPlanWhatTitle, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            for (final c in small)
              Card(
                child: ListTile(
                  title: Text(_title(c, locale)),
                  onTap: () => onPicked(PlanScope(course: c)),
                ),
              ),
            for (final c in warmup)
              Card(
                child: ListTile(
                  title: Text(l.createPlanWarmupEntry),
                  subtitle: Text(categoryLabel(l, 'warmup')),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openSections(context, ref, c, locale),
                ),
              ),
            if (bible.isNotEmpty)
              Card(
                child: ListTile(
                  title: Text(l.createPlanBibleEntry),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openBooks(context, ref, bible, locale),
                ),
              ),
          ],
        );
      },
    );
  }

  /// 워밍업 섹터 — 한 개만 고른다(라디오 성격).
  Future<void> _openSections(
      BuildContext context, WidgetRef ref, Course course, String locale) async {
    final sections = await ref.read(courseRepositoryProvider).listSections(course.id);
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final s in sections)
              ListTile(
                title: Text(locale == 'en' && s.titleEn.isNotEmpty ? s.titleEn : s.title),
                onTap: () {
                  Navigator.pop(c);
                  onPicked(PlanScope(course: course, sectionIds: [s.id]));
                },
              ),
          ],
        ),
      ),
    );
  }

  /// 성경 책 — 권을 고르면 장 칩 선택으로 넘어간다.
  Future<void> _openBooks(
      BuildContext context, WidgetRef ref, List<Course> bible, String locale) async {
    final picked = await showModalBottomSheet<Course>(
      context: context,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final b in bible)
              ListTile(
                title: Text(_title(b, locale)),
                onTap: () => Navigator.pop(c, b),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !context.mounted) return;
    final chapters = await showModalBottomSheet<List<int>>(
      context: context,
      isScrollControlled: true,
      builder: (c) => _ChapterPicker(course: picked),
    );
    if (chapters == null || chapters.isEmpty) return;
    onPicked(PlanScope(course: picked, sectionIds: chapters));
  }
}

/// 2단계 — 장 칩 다중 선택. 기본 선택은 아직 안 깬 첫 장 하나뿐이다
/// (창세기 1장만 31절이라 여러 장을 기본값으로 밀어넣으면 첫 플랜부터 과하다).
class _ChapterPicker extends ConsumerStatefulWidget {
  const _ChapterPicker({required this.course});
  final Course course;

  @override
  ConsumerState<_ChapterPicker> createState() => _ChapterPickerState();
}

class _ChapterPickerState extends ConsumerState<_ChapterPicker> {
  List<Section> _sections = const [];
  final Set<int> _selected = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(courseRepositoryProvider);
    final sections = await repo.listSections(widget.course.id);
    final firstUncleared = await repo.firstUnclearedSectionId(widget.course.id);
    if (!mounted) return;
    setState(() {
      _sections = sections;
      _loading = false;
      final defaultId = firstUncleared ?? (sections.isEmpty ? null : sections.first.id);
      if (defaultId != null) _selected.add(defaultId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    if (_loading) {
      return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
    }
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.createPlanPickChapters, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(l.createPlanChapterHint, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: SingleChildScrollView(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in _sections)
                      FilterChip(
                        label: Text(s.title),
                        selected: _selected.contains(s.id),
                        onSelected: (on) => setState(() {
                          if (on) {
                            _selected.add(s.id);
                          } else {
                            _selected.remove(s.id);
                          }
                        }),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _selected.isEmpty
                  ? null
                  : () => Navigator.pop(context, _selected.toList()..sort()),
              child: Text(l.commonConfirm),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: allCoursesProvider 확인/추가**

Run: `grep -n "allCoursesProvider" lib/app/providers.dart`

없으면 `providers.dart`의 `planSectionTitlesProvider` 아래에 추가:

```dart
/// 전체 코스 목록 — 플랜 생성 화면의 범위 선택이 쓴다.
final allCoursesProvider =
    FutureProvider.autoDispose<List<Course>>((ref) => ref.watch(courseRepositoryProvider).listCourses());
```

- [ ] **Step 6: Run test to verify it passes**

Run: `flutter gen-l10n && flutter test test/plan_scope_picker_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 7: 생성 화면 재작성**

`lib/features/today/create_plan_screen.dart` 전체를 교체:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../l10n/app_localizations.dart';
import 'plan_scope_picker.dart';

/// 데일리루프 플랜 생성 — 1단계에서 대상(코스+장)을 고르고, 2단계에서 마감을
/// 정한다. 마감 화면은 항상 "하루 약 N절"을 보여줘서 무리한 플랜을 사용자가
/// 스스로 거르게 한다.
class CreatePlanScreen extends ConsumerStatefulWidget {
  const CreatePlanScreen({super.key});

  @override
  ConsumerState<CreatePlanScreen> createState() => _CreatePlanScreenState();
}

class _CreatePlanScreenState extends ConsumerState<CreatePlanScreen> {
  PlanScope? _scope;
  int _days = 30;
  int _totalVerses = 0;

  String _deadlineDay(int days) {
    final d = DateTime.now().toUtc().add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  Future<void> _onPicked(PlanScope scope) async {
    final items = await ref.read(courseRepositoryProvider).listItemsByCourse(
          scope.course.id,
          sectionIds: scope.sectionIds.isEmpty ? null : scope.sectionIds,
        );
    if (!mounted) return;
    setState(() {
      _scope = scope;
      _totalVerses = items.length;
    });
  }

  Future<void> _pickCustomDate() async {
    final now = DateTime.now().toUtc();
    final picked = await showDatePicker(
      context: context,
      // 오늘로 잡으면 만들자마자 만료되는 플랜이 나온다 — 최소는 내일.
      firstDate: now.add(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now.add(Duration(days: _days)),
    );
    if (picked == null) return;
    setState(() => _days = picked.toUtc().difference(now).inDays + 1);
  }

  Future<void> _start(String locale) async {
    final scope = _scope!;
    final title = locale == 'en' && scope.course.titleEn.isNotEmpty
        ? scope.course.titleEn
        : scope.course.title;
    await ref.read(planRepositoryProvider).createPlan(
          courseId: scope.course.id,
          title: title,
          deadlineDay: _deadlineDay(_days),
          sectionIds: scope.sectionIds.isEmpty ? null : scope.sectionIds,
        );
    ref.invalidate(activePlanViewProvider);
    ref.invalidate(planNextItemProvider);
    ref.invalidate(planNextNavArgsProvider);
    ref.invalidate(planSectionTitlesProvider);
    if (mounted) context.go('/today');
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      appBar: AppBar(
        title: Text(l.createPlanTitle),
        leading: _scope == null
            ? null
            : BackButton(onPressed: () => setState(() => _scope = null)),
      ),
      body: _scope == null
          ? PlanScopePicker(onPicked: _onPicked)
          : _deadlineStep(context, l, locale),
    );
  }

  Widget _deadlineStep(BuildContext context, AppLocalizations l, String locale) {
    final perDay = versesPerDay(_totalVerses, _days);
    final tooMuch = perDay > 10;
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.createPlanDeadlineLabel, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: [
              ButtonSegment(value: 7, label: Text(l.createPlanThisWeek)),
              ButtonSegment(value: 30, label: Text(l.createPlanThisMonth)),
            ],
            selected: {_days == 7 || _days == 30 ? _days : 30},
            onSelectionChanged: (s) => setState(() => _days = s.first),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickCustomDate,
            icon: const Icon(Icons.event),
            label: Text('${l.createPlanCustomDate} · ${_deadlineDay(_days)}'),
          ),
          const SizedBox(height: 24),
          Text(
            l.createPlanPerDay(_totalVerses, perDay),
            style: theme.textTheme.titleSmall,
          ),
          if (tooMuch) ...[
            const SizedBox(height: 4),
            Text(
              l.createPlanTooMuch(perDay),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
            ),
          ],
          const Spacer(),
          FilledButton(
            onPressed: _totalVerses == 0 ? null : () => _start(locale),
            child: Text(l.createPlanStart),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 8: 기존 생성 화면 테스트를 새 플로우에 맞춘다**

`test/create_plan_screen_test.dart` 전체를 교체:

```dart
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/features/today/create_plan_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<void> seedSmallCourse() async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(7), slug: 'foundations', title: '기초', ord: 0, category: 'foundations'));
    for (var i = 0; i < 5; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(700 + i), courseId: 7, ord: i,
            book: 43, chapter: 3, verse: 16 + i, verseText: 'v$i',
          ));
    }
  }

  Future<void> pumpScreen(WidgetTester tester) async {
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (c, s) => const CreatePlanScreen()),
      GoRoute(path: '/today', builder: (c, s) => const Scaffold(body: Text('TODAY'))),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp.router(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        routerConfig: router,
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('소형 코스를 고르면 마감 단계로 가고, 시작하면 코스 전체 플랜이 생긴다', (tester) async {
    await seedSmallCourse();
    await pumpScreen(tester);

    await tester.tap(find.text('기초'));
    await tester.pumpAndSettle();

    // 마감 단계에 하루 절수 미리보기가 보인다 (5절 / 30일 → 1절)
    expect(find.text('총 5절 · 하루 약 1절'), findsOneWidget);

    await tester.tap(find.text('시작하기'));
    await tester.pumpAndSettle();

    final active = await PlanRepository(db).activePlan();
    expect(active, isNotNull);
    expect(active!.courseId, 7);
    expect(active.sectionIds, isNull, reason: '소형 코스는 코스 전체 플랜');
  });

  testWidgets('장을 고르면 그 섹션만 담긴 플랜이 생성된다', (tester) async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(8), slug: 'gen', title: '창세기', ord: 1, category: 'ot'));
    for (final sectionId in [81, 82]) {
      await db.into(db.sections).insert(SectionsCompanion.insert(
            id: Value(sectionId), courseId: 8, title: '${sectionId - 80}장', ord: sectionId));
      for (var i = 0; i < 4; i++) {
        await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
              id: Value(sectionId * 10 + i), courseId: 8, sectionId: Value(sectionId),
              ord: sectionId * 10 + i, book: 1, chapter: sectionId - 80,
              verse: i + 1, verseText: 'v$i',
            ));
      }
    }
    await pumpScreen(tester);

    await tester.tap(find.text('성경 책별로'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('창세기').last);
    await tester.pumpAndSettle();

    // 기본 선택은 안 깬 첫 장 하나 — 그대로 확인
    await tester.tap(find.text('확인'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('시작하기'));
    await tester.pumpAndSettle();

    final active = await PlanRepository(db).activePlan();
    expect(active!.sectionIds, '81', reason: '기본은 1장 하나만');
  });
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `flutter test test/create_plan_screen_test.dart test/plan_scope_picker_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 10: 정적 분석**

Run: `flutter analyze`
Expected: 에러 0

- [ ] **Step 11: Commit**

```bash
git add lib/features/today/plan_scope_picker.dart lib/features/today/create_plan_screen.dart lib/app/providers.dart lib/l10n/ test/create_plan_screen_test.dart test/plan_scope_picker_test.dart
git commit -m "feat: 플랜 생성을 단계형 범위 선택으로 교체

드롭다운 70개 대신 소형 코스/워밍업 섹터/성경 장 선택.
장 기본값은 1장, 마감 단계에 하루 절수 미리보기."
```

---

### Task 9: 완료 후 다음 장 이어하기

**Files:**
- Modify: `lib/features/today/today_screen.dart` (`_completeCta`)
- Modify: `lib/app/providers.dart`
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/today_screen_test.dart`

**Interfaces:**
- Consumes: Task 4의 `firstUnclearedSectionId`, Task 2의 `createPlan(sectionIds:)`
- Produces: `nextChapterSuggestionProvider` → `FutureProvider<Section?>`

- [ ] **Step 1: l10n 문자열 추가**

`lib/l10n/app_ko.arb`에 추가:

```json
  "todayContinueNextChapter": "이어서: {section}",
  "@todayContinueNextChapter": {
    "placeholders": { "section": {"type": "String"} }
  },
```

`lib/l10n/app_en.arb`에 추가:

```json
  "todayContinueNextChapter": "Next up: {section}",
```

- [ ] **Step 2: Write the failing test**

`test/today_screen_test.dart`의 `main()` 안 마지막에 추가(기존 헬퍼가 있으면 재사용하고, 없으면 아래 그대로 사용):

```dart
  testWidgets('장 플랜을 완주하면 다음 장 이어하기 버튼이 뜬다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(9), slug: 'gen', title: '창세기', ord: 0, category: 'ot'));
    for (final sectionId in [91, 92]) {
      await db.into(db.sections).insert(SectionsCompanion.insert(
            id: Value(sectionId), courseId: 9, title: '${sectionId - 90}장', ord: sectionId));
      for (var i = 0; i < 2; i++) {
        await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
              id: Value(sectionId * 10 + i), courseId: 9, sectionId: Value(sectionId),
              ord: sectionId * 10 + i, book: 1, chapter: sectionId - 90,
              verse: i + 1, verseText: 'v$i',
            ));
      }
    }
    // 91장(1장)만 전부 외운 상태
    for (final id in [910, 911]) {
      await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
            courseItemId: Value(id), grade: 'green',
            cleared: const Value(true), updatedAt: DateTime.now().toUtc(),
          ));
    }
    final d = DateTime.now().toUtc().add(const Duration(days: 7));
    final day =
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    await PlanRepository(db)
        .createPlan(courseId: 9, title: '창세기', deadlineDay: day, sectionIds: [91]);

    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (c, s) => const TodayScreen()),
      GoRoute(path: '/plan/new', builder: (c, s) => const Scaffold(body: Text('NEW PLAN'))),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: [databaseProvider.overrideWithValue(db)],
      child: MaterialApp.router(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('ko'),
        routerConfig: router,
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('이어서: 2장'), findsOneWidget);

    await tester.tap(find.text('이어서: 2장'));
    await tester.pumpAndSettle();

    final active = await PlanRepository(db).activePlan();
    expect(active!.sectionIds, '92', reason: '다음 장 하나만 대상으로 새 플랜');
  });
```

파일 상단 import에 `package:verse_flutter/core/plan/plan_repository.dart`가 없으면 추가한다.

- [ ] **Step 3: Run test to verify it fails**

Run: `flutter gen-l10n && flutter test test/today_screen_test.dart -r compact`
Expected: FAIL — `'이어서: 2장'` 을 찾지 못함

- [ ] **Step 4: provider 추가**

`lib/app/providers.dart`의 `allCoursesProvider` 아래에 추가:

```dart
/// 완주한 장 플랜 다음에 이어서 할 장. 조건을 모두 만족할 때만 non-null:
/// 활성 플랜이 섹션 범위 플랜이고, 같은 코스에 아직 안 깬 섹션이 남아 있을 때.
/// 스펙대로 **다음 한 장만** 제안한다.
final nextChapterSuggestionProvider = FutureProvider.autoDispose<Section?>((ref) async {
  final view = await ref.watch(activePlanViewProvider.future);
  if (view == null || view.sectionIds == null) return null;
  final courses = ref.watch(courseRepositoryProvider);
  final nextSectionId = await courses.firstUnclearedSectionId(view.plan.courseId);
  if (nextSectionId == null) return null;
  final sections = await courses.listSections(view.plan.courseId);
  for (final s in sections) {
    if (s.id == nextSectionId) return s;
  }
  return null;
});
```

- [ ] **Step 5: 완료 CTA 확장**

`today_screen.dart`의 `_completeCta`를 교체:

```dart
  Widget _completeCta(BuildContext context, WidgetRef ref, AppLocalizations l, PlanView view) {
    final next = ref.watch(nextChapterSuggestionProvider).valueOrNull;
    return Column(
      children: [
        Text(l.todayPlanComplete, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        // 장 플랜을 끝냈고 그 권에 남은 장이 있으면 원탭으로 이어간다.
        // 마감 길이는 방금 끝낸 플랜과 같게 유지한다.
        if (next != null) ...[
          FilledButton(
            onPressed: () async {
              final repo = ref.read(planRepositoryProvider);
              final span = DateTime.parse(view.plan.deadlineDay)
                  .difference(view.plan.createdAt.toUtc())
                  .inDays;
              final d = DateTime.now().toUtc().add(Duration(days: span < 1 ? 7 : span));
              final day =
                  '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
              await repo.markCompleted(view.plan.id);
              await repo.createPlan(
                courseId: view.plan.courseId,
                title: view.plan.title,
                deadlineDay: day,
                sectionIds: [next.id],
              );
              ref.invalidate(activePlanViewProvider);
              ref.invalidate(planNextItemProvider);
              ref.invalidate(planNextNavArgsProvider);
              ref.invalidate(planSectionTitlesProvider);
            },
            child: Text(l.todayContinueNextChapter(next.title)),
          ),
          const SizedBox(height: 8),
        ],
        OutlinedButton(
          onPressed: () async {
            await ref.read(planRepositoryProvider).markCompleted(view.plan.id);
            ref.invalidate(activePlanViewProvider);
            if (context.mounted) context.push('/plan/new');
          },
          child: Text(l.todayNextPlan),
        ),
      ],
    );
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `flutter test test/today_screen_test.dart -r compact`
Expected: All tests passed

- [ ] **Step 7: Commit**

```bash
git add lib/features/today/today_screen.dart lib/app/providers.dart lib/l10n/ test/today_screen_test.dart
git commit -m "feat: 장 플랜 완주 후 다음 장 원탭 이어하기"
```

---

### Task 10: 전체 회귀 검증 + 문서

**Files:**
- Create: `docs/status-2026-07-27-plan-management.md`

- [ ] **Step 1: 전체 테스트**

Run: `flutter test -r compact`
Expected: All tests passed (기존 140 + 신규 약 20)

실패가 있으면 원인을 고친 뒤 다음 단계로. 특히 확인할 것:
- `test/today_celebration_test.dart` — `todayDone`이 만료 가드로 바뀐 영향
- `test/mascot_mood_test.dart` — `PlanView` 생성자에 `sectionIds` 추가된 영향(선택 인자라 기존 호출은 그대로 컴파일되어야 한다)

- [ ] **Step 2: 정적 분석**

Run: `flutter analyze`
Expected: 에러 0 (기존 info 3건 + warning 1건은 그대로 허용)

- [ ] **Step 3: 실기기/시뮬레이터 확인**

시뮬레이터에서 앱을 띄우고 다음 5가지를 직접 확인한다:
1. Today 플랜 카드 탭 → 시트 3개 항목
2. 플랜 포기 → 빈 상태로 전환, 대시보드의 외운 절 수는 그대로
3. 생성 화면에서 "성경 책별로" → 창세기 → 1장 기본 선택 → 하루 절수 표시
4. 마감을 "이번 주"로 바꿨을 때 하루 절수가 즉시 늘어나는지
5. 마감 지난 플랜(직접 DB 수정 또는 기기 날짜 변경)에서 만료 카드

- [ ] **Step 4: 상태 문서 작성**

`docs/status-2026-07-27-plan-management.md`에 다음을 기록한다:
- 구현 항목 표(태스크 1~9 대응 파일)
- 스키마 v3 마이그레이션 사실과 기존 플랜이 `sectionIds=null`로 코스 전체로 해석된다는 점
- 스펙 대비 의도적 변경 1건(플랜 라벨 "외 N개" 단순화)과 그 이유
- 범위 제외 항목: 권장 마감 자동 제안(C), 복수 활성 플랜, 플랜 서버 동기화
- Step 3 실기기 확인 결과(수행했으면 결과, 못 했으면 "미수행"이라고 명시)

- [ ] **Step 5: Commit**

```bash
git add docs/status-2026-07-27-plan-management.md
git commit -m "docs: 플랜 관리·범위 선택 구현 기록"
```
