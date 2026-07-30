# 플랜 생성 흐름 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예언 성취 코스를 주제 단위로 쪼개 플랜을 만들 수 있게 하고, 플랜 생성 흐름의 뒤로가기·단일선택·통독 롤오버를 고친다.

**Architecture:** 저장 계층(drift `MemorizationPlan.topics` 컬럼 + 필터) → 조회 계층(`PlanRepository`/`CourseRepository`) → UI(`CreatePlanScreen`의 단계 상태 기계) → 통독 롤오버 순으로 아래에서 위로 올라간다. 콘텐츠 재시드나 서버 변경은 없다 — `courses.json`의 아이템이 이미 `topic`/`topic_en`을 들고 있어 로컬 필터만으로 주제 단위가 성립한다.

**Tech Stack:** Flutter, Riverpod, drift(SQLite), go_router, `flutter gen-l10n`(ARB)

설계 근거는 [스펙](../specs/2026-07-30-plan-flow-refinement-design.md)에 있다. 스펙과 이 계획이 어긋나면 스펙이 우선이다.

## Global Constraints

- 작업 디렉터리는 `verse-flutter/`다. 이 계획의 모든 상대 경로는 거기서부터다.
- 오프라인 우선 — 이 작업 범위에서 네트워크 호출을 추가하지 않는다. 로컬 drift만 읽고 쓴다.
- drift 테이블/컬럼을 바꾸면 반드시 코드 생성을 다시 돌린다:
  `dart run build_runner build --delete-conflicting-outputs`
- ARB(`lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`)를 바꾸면 반드시 `flutter gen-l10n`을 돌린다.
  **한글·영문 두 ARB에 같은 키를 항상 함께 추가한다** — 한쪽만 넣으면 다른 로케일에서 빈 문자열이 된다.
- `schemaVersion`은 현재 **4**다. 이번 변경으로 **5**가 된다. 기존 마이그레이션
  분기(`from < 2`, `from < 3`, `from < 4`)는 절대 수정하지 않고 `from < 5`만 추가한다.
- 진행도(`progress`, `reading_progress`)는 어떤 경우에도 지우거나 되돌리지 않는다.
  플랜은 일정이고, 외운 절은 사용자의 자산이다.
- `topics` 조인 구분자는 **개행(`\n`)** 이다. `sectionIds`의 콤마와 다르다 — 주제명에
  콤마가 들어갈 수 있기 때문이다.
- 테스트는 `flutter test <path>`로 돌린다. 커밋은 각 태스크 끝에서 한다.
- 기존 파일의 주석 밀도·한글 주석 스타일을 그대로 따른다. 무관한 코드를 정리하지 않는다.

---

### Task 1: `topics` 컬럼과 저장·조회 왕복

플랜이 "권 + 주제"를 저장할 수 있게 만든다. 필터링은 Task 2에서 붙인다.

**Files:**
- Modify: `lib/core/db/app_database.dart:125-141` (`MemorizationPlan`), `:165` (`schemaVersion`), `:170-181` (`onUpgrade`)
- Modify: `lib/core/plan/plan_repository.dart:13-17` (`parseSectionIds` 아래에 `parseTopics` 추가), `:20-60` (`PlanView`), `:67-87` (`createPlan`), `:114-139` (`planView`)
- Test: `test/plan_topics_scope_test.dart` (신규)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `List<String>? parseTopics(String? raw)` — 개행 조인 문자열 → 리스트. null/빈 문자열이면 null.
  - `PlanRepository.createPlan({required int courseId, required String title, required String deadlineDay, List<int>? sectionIds, List<String>? topics, String mode = 'memorize'})`
  - `PlanView.topics` → `List<String>?`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/plan_topics_scope_test.dart` 신규 생성:

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

  test('parseTopics는 개행 문자열을 리스트로, 빈 값은 null로 바꾼다', () {
    expect(parseTopics('한 분의 왕\n최후의 만찬'), ['한 분의 왕', '최후의 만찬']);
    expect(parseTopics('한 분의 왕'), ['한 분의 왕']);
    expect(parseTopics(null), isNull);
    expect(parseTopics(''), isNull);
  });

  test('콤마가 들어간 주제명도 왕복이 온전하다', () {
    // 주제명에 콤마가 있어서 sectionIds의 콤마 조인을 쓸 수 없다.
    const withComma = '그리스도, 우리의 친족, 대속자';
    expect(parseTopics(withComma), [withComma]);
  });

  test('createPlan이 topics를 저장하고 planView가 되읽는다', () async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(9), slug: 'messiah-prophecy', title: '예언', ord: 33, category: 'messiah'));
    final plan = await repo.createPlan(
      courseId: 9,
      title: '예언',
      deadlineDay: todayUtcDay(),
      sectionIds: [91],
      topics: ['한 분의 왕'],
    );
    expect(plan.topics, '한 분의 왕');

    final v = (await repo.planView())!;
    expect(v.topics, ['한 분의 왕']);
  });

  test('topics를 안 주면 null로 저장된다 (섹션 전체)', () async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(9), slug: 'gen', title: '창세기', ord: 1, category: 'ot'));
    final plan = await repo.createPlan(
        courseId: 9, title: '창세기', deadlineDay: todayUtcDay(), sectionIds: [91]);
    expect(plan.topics, isNull);

    final v = (await repo.planView())!;
    expect(v.topics, isNull);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/plan_topics_scope_test.dart`
Expected: 컴파일 실패 — `parseTopics` 미정의, `createPlan`에 `topics` 인자 없음, `topics` getter 없음.

- [ ] **Step 3: 컬럼을 추가한다**

`lib/core/db/app_database.dart` — `MemorizationPlan`의 `mode` 컬럼 **아래**에 추가:

```dart
  /// 플랜이 대상으로 삼는 주제(예언 1건)를 개행으로 조인한 것. null이면 섹션 전체.
  /// 예언 성취 코스는 섹션(= 구약 책)이 최대 447절이라 주제로 좁히지 않으면
  /// 플랜이 성립하지 않는다. 콤마가 아니라 개행으로 조인하는 이유는 주제명 자체에
  /// 콤마가 들어가기 때문이다("그리스도, 우리의 친족, 대속자").
  TextColumn get topics => text().nullable()();
```

같은 파일 `schemaVersion`을 5로 올리고, `onUpgrade`의 `from < 4` 블록 **아래**에 추가
(기존 분기는 손대지 않는다):

```dart
          if (from < 5) {
            await m.addColumn(memorizationPlan, memorizationPlan.topics);
          }
```

- [ ] **Step 4: 코드 생성을 돌린다**

Run: `dart run build_runner build --delete-conflicting-outputs`
Expected: `lib/core/db/app_database.g.dart`가 갱신되고 에러 없이 끝난다. `MemorizationPlanData`에 `topics` 필드가 생긴다.

- [ ] **Step 5: 리포지토리를 고친다**

`lib/core/plan/plan_repository.dart` — `parseSectionIds` 바로 아래에:

```dart
/// 개행 조인된 주제명 문자열을 리스트로. 빈 값/null이면 null(=섹션 전체).
List<String>? parseTopics(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  return raw.split('\n');
}
```

`PlanView`의 생성자와 필드에 `topics`를 더한다 — `sectionIds` 바로 뒤에:

```dart
    this.sectionIds,
    this.topics,
  });
```

```dart
  /// 플랜이 대상으로 삼는 섹션. null이면 코스 전체.
  final List<int>? sectionIds;

  /// 플랜이 대상으로 삼는 주제. null이면 섹션 전체.
  final List<String>? topics;
```

`createPlan`에 파라미터와 컴패니언 필드를 더한다:

```dart
  Future<MemorizationPlanData> createPlan({
    required int courseId,
    required String title,
    required String deadlineDay,
    List<int>? sectionIds,
    List<String>? topics,
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
            topics: Value(
              (topics == null || topics.isEmpty) ? null : topics.join('\n'),
            ),
          ),
        );
```

`planView`에서 파싱해 넘긴다 — `final sectionIds = parseSectionIds(plan.sectionIds);` 아래에
`final topics = parseTopics(plan.topics);`를 더하고, `PlanView(...)` 생성에 `topics: topics,`를 더한다.

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/plan_topics_scope_test.dart`
Expected: 4 tests PASS

- [ ] **Step 7: 기존 테스트가 안 깨진 것을 확인한다**

Run: `flutter test test/memorization_plan_schema_test.dart test/plan_section_scope_test.dart test/plan_view_test.dart test/plan_repository_test.dart test/plan_expiry_test.dart test/plan_reading_mode_test.dart`
Expected: 전부 PASS (기존 플랜은 `topics=null` → 동작 불변)

- [ ] **Step 8: 커밋**

```bash
git add lib/core/db/app_database.dart lib/core/db/app_database.g.dart lib/core/plan/plan_repository.dart test/plan_topics_scope_test.dart
git commit -m "feat: 플랜에 주제(topics) 범위 컬럼 추가 — 저장·조회 왕복"
```

---

### Task 2: 주제 필터를 조회 경로 전체에 배선

`topics`가 실제로 절 수·다음 절 선택을 좁히게 만든다. 이 태스크가 빠지면 주제 플랜이
"주제를 저장하지만 권 전체를 세는" 상태로 남는다.

**Files:**
- Modify: `lib/core/plan/plan_repository.dart:141-189` (`_countItems`, `_countCleared`, `_countRead`), `:114-139` (`planView` 호출부)
- Modify: `lib/core/courses/course_repository.dart:212-247` (`firstUnclearedInCourse`, `_nextUnclearedInCourse`, `listItemsByCourse`)
- Modify: `lib/app/providers.dart:376-383` (`planNextItemProvider`), `:428-440` (`planNextNavArgsProvider`)
- Test: `test/plan_topics_scope_test.dart` (Task 1에서 만든 파일에 추가)

**Interfaces:**
- Consumes: Task 1의 `PlanView.topics`, `createPlan(..., topics:)`
- Produces:
  - `CourseRepository.firstUnclearedInCourse(int courseId, {List<int>? sectionIds, List<String>? topics})`
  - `CourseRepository.listItemsByCourse(int courseId, {List<int>? sectionIds, List<String>? topics})`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/plan_topics_scope_test.dart`의 `main()` 안, 마지막 test 뒤에 추가. 먼저 헬퍼를
`tearDown` 아래에 넣는다:

```dart
  /// 코스 9, 섹션 91(= 창세기)에 주제 2개를 심는다.
  /// item id 910~912 = '한 분의 왕'(3절), 913~914 = '최후의 만찬'(2절).
  Future<void> seedTwoTopics() async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(9), slug: 'messiah-prophecy', title: '예언', ord: 33, category: 'messiah'));
    await db.into(db.sections).insert(SectionsCompanion.insert(
        id: const Value(91), courseId: 9, title: '창세기', ord: 1));
    const topics = ['한 분의 왕', '한 분의 왕', '한 분의 왕', '최후의 만찬', '최후의 만찬'];
    for (var i = 0; i < topics.length; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(910 + i),
            courseId: 9,
            sectionId: const Value(91),
            ord: i,
            topic: Value(topics[i]),
            book: 1,
            chapter: 14,
            verse: 18 + i,
            verseText: 'v$i',
          ));
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
```

그리고 테스트:

```dart
  test('주제 범위 플랜은 그 주제의 절만 총 절 수로 센다', () async {
    await seedTwoTopics();
    await repo.createPlan(
      courseId: 9,
      title: '예언',
      deadlineDay: todayUtcDay(),
      sectionIds: [91],
      topics: ['한 분의 왕'],
    );

    final v = (await repo.planView())!;
    expect(v.totalVerses, 3, reason: '섹션 전체 5절이 아니라 주제 3절');
  });

  test('플랜 밖 주제를 외워도 진행도로 세지 않는다', () async {
    await seedTwoTopics();
    await repo.createPlan(
      courseId: 9,
      title: '예언',
      deadlineDay: todayUtcDay(),
      sectionIds: [91],
      topics: ['한 분의 왕'],
    );

    await clearItem(913); // '최후의 만찬' 절
    expect((await repo.planView())!.clearedVerses, 0);

    await clearItem(910); // '한 분의 왕' 절
    expect((await repo.planView())!.clearedVerses, 1);
  });

  test('통독 집계도 주제로 좁혀진다', () async {
    await seedTwoTopics();
    await repo.createPlan(
      courseId: 9,
      title: '예언',
      deadlineDay: todayUtcDay(),
      sectionIds: [91],
      topics: ['최후의 만찬'],
      mode: 'reading',
    );
    await db.into(db.readingProgress).insertOnConflictUpdate(
        ReadingProgressCompanion.insert(courseItemId: 910, typedAt: DateTime.now().toUtc()));

    final v = (await repo.planView(mode: 'reading'))!;
    expect(v.totalVerses, 2);
    expect(v.clearedVerses, 0, reason: '통독한 910은 플랜 주제 밖');
  });
```

`test/course_first_uncleared_test.dart`에 추가(같은 파일의 기존 seed 헬퍼 스타일을 따른다.
파일을 열어 기존 setUp/헬퍼 이름을 확인하고 재사용한다):

```dart
  test('firstUnclearedInCourse는 topics 밖으로 새지 않는다', () async {
    // 섹션 91에 '한 분의 왕' 3절(910~912), '최후의 만찬' 2절(913~914)
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(9), slug: 'messiah-prophecy', title: '예언', ord: 33, category: 'messiah'));
    await db.into(db.sections).insert(SectionsCompanion.insert(
        id: const Value(91), courseId: 9, title: '창세기', ord: 1));
    const topics = ['한 분의 왕', '한 분의 왕', '한 분의 왕', '최후의 만찬', '최후의 만찬'];
    for (var i = 0; i < topics.length; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(910 + i), courseId: 9, sectionId: const Value(91), ord: i,
            topic: Value(topics[i]), book: 1, chapter: 14, verse: 18 + i, verseText: 'v$i',
          ));
    }
    final repo = CourseRepository(db);

    final first = await repo.firstUnclearedInCourse(9,
        sectionIds: [91], topics: ['최후의 만찬']);
    expect(first!.id, 913, reason: '주제 밖의 910이 아니라 주제 안 첫 절');

    final items = await repo.listItemsByCourse(9, sectionIds: [91], topics: ['최후의 만찬']);
    expect(items.map((i) => i.id), [913, 914]);
  });
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/plan_topics_scope_test.dart test/course_first_uncleared_test.dart`
Expected: 새 테스트 FAIL — `totalVerses`가 5(3이 아님), `firstUnclearedInCourse`에 `topics` 인자 없음.

- [ ] **Step 3: PlanRepository에 필터를 넣는다**

`lib/core/plan/plan_repository.dart` — 세 카운트 함수의 시그니처에 `List<String>? topics`를
더하고 필터를 추가한다:

```dart
  Future<int> _countItems(int courseId, List<int>? sectionIds, List<String>? topics) async {
    final q = _db.select(_db.courseItems)..where((t) => t.courseId.equals(courseId));
    if (sectionIds != null) q.where((t) => t.sectionId.isIn(sectionIds));
    if (topics != null) q.where((t) => t.topic.isIn(topics));
    return (await q.get()).length;
  }
```

```dart
  Future<int> _countCleared(int courseId, List<int>? sectionIds, List<String>? topics,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId) & _db.progress.cleared.equals(true);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    if (topics != null) {
      filter = filter & _db.courseItems.topic.isIn(topics);
    }
```

```dart
  Future<int> _countRead(int courseId, List<int>? sectionIds, List<String>? topics,
      {required bool todayOnly}) async {
    var filter = _db.courseItems.courseId.equals(courseId);
    if (sectionIds != null) {
      filter = filter & _db.courseItems.sectionId.isIn(sectionIds);
    }
    if (topics != null) {
      filter = filter & _db.courseItems.topic.isIn(topics);
    }
```

`planView`의 호출부 5곳에 `topics`를 넘긴다:

```dart
    final total = await _countItems(plan.courseId, sectionIds, topics);
    final isReading = mode == 'reading';
    final cleared = isReading
        ? await _countRead(plan.courseId, sectionIds, topics, todayOnly: false)
        : await _countCleared(plan.courseId, sectionIds, topics, todayOnly: false);
    final todayCleared = isReading
        ? await _countRead(plan.courseId, sectionIds, topics, todayOnly: true)
        : await _countCleared(plan.courseId, sectionIds, topics, todayOnly: true);
```

- [ ] **Step 4: CourseRepository에 필터를 넣는다**

`lib/core/courses/course_repository.dart`:

```dart
  Future<CourseItem?> firstUnclearedInCourse(int courseId,
          {List<int>? sectionIds, List<String>? topics}) =>
      _nextUnclearedInCourse(courseId, 0, sectionIds, topics);
```

```dart
  Future<CourseItem?> _nextUnclearedInCourse(
      int courseId, int afterOrd, List<int>? sectionIds, List<String>? topics) async {
    final query = _db.select(_db.courseItems).join([
      leftOuterJoin(_db.progress, _db.progress.courseItemId.equalsExp(_db.courseItems.id)),
    ])
      ..where(_db.courseItems.courseId.equals(courseId));
    if (sectionIds != null) {
      query.where(_db.courseItems.sectionId.isIn(sectionIds));
    }
    if (topics != null) {
      query.where(_db.courseItems.topic.isIn(topics));
    }
```

```dart
  Future<List<CourseItem>> listItemsByCourse(int courseId,
      {List<int>? sectionIds, List<String>? topics}) {
    final q = _db.select(_db.courseItems)..where((t) => t.courseId.equals(courseId));
    if (sectionIds != null) q.where((t) => t.sectionId.isIn(sectionIds));
    if (topics != null) q.where((t) => t.topic.isIn(topics));
    return q.get();
  }
```

`getResumeTarget` 안의 `_nextUnclearedInCourse(lastItem.courseId, lastItem.ord, null)` 호출은
인자가 하나 늘어난다 → `(lastItem.courseId, lastItem.ord, null, null)`.
`firstUnclearedSectionId`의 `firstUnclearedInCourse(courseId)` 호출은 그대로 둔다(둘 다 기본값 null).

- [ ] **Step 5: providers를 배선한다**

`lib/app/providers.dart` — `planNextItemProvider`:

```dart
  return ref
      .watch(courseRepositoryProvider)
      .firstUnclearedInCourse(view.plan.courseId,
          sectionIds: view.sectionIds, topics: view.topics);
```

`planNextNavArgsProvider` — 두 호출 모두에 `topics: view.topics`를 더한다:

```dart
  final next = await courses.firstUnclearedInCourse(view.plan.courseId,
      sectionIds: view.sectionIds, topics: view.topics);
  if (next == null) return null;
  // 체이닝 목록도 플랜 범위로 한정한다 — 그렇지 않으면 한 절을 마친 뒤
  // "다음"이 플랜 밖의 절로 새어나간다.
  final items = await courses.listItemsByCourse(view.plan.courseId,
      sectionIds: view.sectionIds, topics: view.topics);
```

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/plan_topics_scope_test.dart test/course_first_uncleared_test.dart`
Expected: 전부 PASS

- [ ] **Step 7: 전체 테스트로 회귀를 확인한다**

Run: `flutter test`
Expected: 전부 PASS. 실패하면 대부분 `_countItems`/`_nextUnclearedInCourse` 호출부 인자
개수 문제다 — 컴파일 에러가 지목하는 곳에 `null`을 넣는다.

- [ ] **Step 8: 커밋**

```bash
git add lib/core/plan/plan_repository.dart lib/core/courses/course_repository.dart lib/app/providers.dart test/plan_topics_scope_test.dart test/course_first_uncleared_test.dart
git commit -m "feat: 주제 범위를 절 수 집계와 다음 절 선택에 반영"
```

---

### Task 3: 대상 목록을 6개 항목으로, 바텀시트를 화면 내 단계로

뒤로가기 문제의 근본 원인(중첩 바텀시트)을 없애고 목록 순서를 고정한다. 이 태스크에서는
장 선택 UI를 기존 다중선택 그대로 옮기기만 한다 — 단일선택은 Task 4다.

**Files:**
- Modify: `lib/features/today/plan_scope_picker.dart` (전면 개편)
- Modify: `lib/features/today/create_plan_screen.dart:24-131` (단계 상태 기계)
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/create_plan_steps_test.dart` (신규)

**Interfaces:**
- Consumes: Task 1의 `createPlan(..., topics:)`
- Produces:
  - `enum PlanStep { track, scopeRoot, sections, leaves, deadline }` (`plan_scope_picker.dart`)
  - `class PlanScope { final Course course; final List<int> sectionIds; final List<String> topics; }`
    — 생성자 `const PlanScope({required this.course, this.sectionIds = const [], this.topics = const []})`
  - `enum ScopeKind { small, warmup, messiah, ot, nt }` — 어떤 항목을 탭했는지
  - `class ScopeRootStep extends ConsumerWidget` — `onSmallPicked(Course)`, `onDrillDown(ScopeKind, Course)` 콜백
  - `class SectionListStep extends ConsumerWidget` — `course`, `onSectionPicked(Section)`
  - `class LeafChipStep extends ConsumerStatefulWidget` — 이 태스크에서는
    `LeafChipStep({required Course course, required void Function(PlanScope) onPicked})`.
    Task 4에서 `kind`와 `section`이 추가된다.

- [ ] **Step 1: l10n 키를 추가한다**

`lib/l10n/app_ko.arb`에 (`createPlanBibleEntry` 근처):

```json
  "createPlanOtEntry": "구약",
  "createPlanNtEntry": "신약",
  "createPlanMessiahEntry": "예언 성취",
  "createPlanPickBook": "권 고르기",
  "createPlanPickTopics": "주제 고르기",
  "createPlanTopicHint": "예언 한 건씩 골라요. 구약 예언절과 신약 성취절이 함께 나와요.",
  "createPlanEmptySections": "이 코스에 아직 내용이 없어요",
```

`lib/l10n/app_en.arb`에 같은 키로:

```json
  "createPlanOtEntry": "Old Testament",
  "createPlanNtEntry": "New Testament",
  "createPlanMessiahEntry": "Prophecies fulfilled",
  "createPlanPickBook": "Pick a book",
  "createPlanPickTopics": "Pick a prophecy",
  "createPlanTopicHint": "One prophecy at a time — the Old Testament promise and its New Testament fulfillment together.",
  "createPlanEmptySections": "This course has no content yet",
```

Run: `flutter gen-l10n`
Expected: 에러 없이 끝나고 `lib/l10n/app_localizations.dart`에 `createPlanOtEntry` 등이 생긴다.

- [ ] **Step 2: 실패하는 위젯 테스트를 쓴다**

`test/create_plan_steps_test.dart` 신규 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/features/today/create_plan_screen.dart';
import 'package:verse_flutter/l10n/app_localizations.dart';

void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  /// 6개 항목이 다 보이도록 카테고리별 코스를 하나씩 심는다.
  /// 창세기(코스 8)에는 장 2개(81, 82)를 만든다.
  Future<void> seedAllCategories() async {
    Future<void> course(int id, String slug, String title, String category, int ord) =>
        db.into(db.courses).insert(CoursesCompanion.insert(
            id: Value(id), slug: slug, title: title, ord: ord, category: category));

    await course(1, 'foundations', '기초', 'foundations', 0);
    await course(2, 'lords-prayer', '주기도문', 'lords-prayer', 1);
    await course(3, 'warmup', '워밍업', 'warmup', 2);
    await course(4, 'messiah-prophecy', '예언 성취 코스', 'messiah', 33);
    await course(8, 'gen', '창세기', 'ot', 10);
    await course(9, 'matt', '마태복음', 'nt', 40);

    for (final sectionId in [81, 82]) {
      await db.into(db.sections).insert(SectionsCompanion.insert(
          id: Value(sectionId), courseId: 8, title: '${sectionId - 80}장', ord: sectionId));
      for (var i = 0; i < 3; i++) {
        await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
              id: Value(sectionId * 10 + i), courseId: 8, sectionId: Value(sectionId),
              ord: sectionId * 10 + i, book: 1, chapter: sectionId - 80,
              verse: i + 1, verseText: 'v$i',
            ));
      }
    }
  }

  Future<void> pumpToScopeRoot(WidgetTester tester) async {
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
    await tester.tap(find.text('암송'));
    await tester.pumpAndSettle();
  }

  testWidgets('대상 목록은 기초·주기도문·워밍업·예언성취·구약·신약 순서다', (tester) async {
    await seedAllCategories();
    await pumpToScopeRoot(tester);

    final labels = ['기초', '주기도문', '워밍업 주제 골라서', '예언 성취', '구약', '신약'];
    final ys = labels.map((t) => tester.getCenter(find.text(t)).dy).toList();
    for (var i = 1; i < ys.length; i++) {
      expect(ys[i], greaterThan(ys[i - 1]), reason: '${labels[i]}가 ${labels[i - 1]} 아래에 있어야 한다');
    }
  });

  testWidgets('장 단계에서 뒤로 누르면 권 목록, 다시 뒤로 누르면 대상 목록으로 돌아온다', (tester) async {
    await seedAllCategories();
    await pumpToScopeRoot(tester);

    await tester.tap(find.text('구약'));
    await tester.pumpAndSettle();
    expect(find.text('창세기'), findsOneWidget);

    await tester.tap(find.text('창세기'));
    await tester.pumpAndSettle();
    expect(find.text('1장'), findsOneWidget);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('창세기'), findsOneWidget, reason: '권 목록으로 돌아와야 한다');
    expect(find.text('1장'), findsNothing);

    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.text('구약'), findsOneWidget, reason: '대상 목록으로 돌아와야 한다');
  });

  testWidgets('통독 트랙에는 구약·신약만 보인다', (tester) async {
    await seedAllCategories();
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
    await tester.tap(find.text('통독'));
    await tester.pumpAndSettle();

    expect(find.text('구약'), findsOneWidget);
    expect(find.text('신약'), findsOneWidget);
    expect(find.text('기초'), findsNothing);
    expect(find.text('예언 성취'), findsNothing);
  });
}
```

- [ ] **Step 3: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/create_plan_steps_test.dart`
Expected: FAIL — '구약'/'신약'/'예언 성취' 텍스트가 없다(현재는 '성경 책별로' 하나), 장 단계가
바텀시트라 BackButton이 권 목록으로 돌아가지 않는다.

- [ ] **Step 4: `plan_scope_picker.dart`를 단계별 위젯으로 다시 쓴다**

파일 전체를 아래로 교체한다. `versesPerDay`는 그대로 유지한다(테스트가 쓴다).

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

/// 플랜 생성 화면의 단계. 바텀시트를 쓰지 않는 이유는 뒤로가기다 —
/// 중첩 시트에서는 장 시트의 뒤로가기가 권 목록이 아니라 흐름 전체를 취소했다.
enum PlanStep { track, scopeRoot, sections, leaves, deadline }

/// 대상 목록에서 무엇을 탭했는지. 하위 단계의 성격을 결정한다.
enum ScopeKind { small, warmup, messiah, ot, nt }

/// 사용자가 고른 플랜 대상.
/// sectionIds가 비면 코스 전체, topics가 비면 섹션 전체.
class PlanScope {
  const PlanScope({
    required this.course,
    this.sectionIds = const [],
    this.topics = const [],
  });
  final Course course;
  final List<int> sectionIds;
  final List<String> topics;
}

String _courseTitle(Course c, String locale) =>
    locale == 'en' && c.titleEn.isNotEmpty ? c.titleEn : c.title;

String _sectionTitle(Section s, String locale) =>
    locale == 'en' && s.titleEn.isNotEmpty ? s.titleEn : s.title;

/// 대상 목록 — 기초 · 주기도문 · 워밍업 · 예언 성취 · 구약 · 신약 고정 순서.
/// 순서를 코스의 ord에 기대지 않고 이 위젯이 직접 정한다.
class ScopeRootStep extends ConsumerWidget {
  const ScopeRootStep({
    super.key,
    required this.bibleOnly,
    required this.onSmallPicked,
    required this.onDrillDown,
  });

  /// 통독 트랙이면 true — 구약·신약만 노출한다. 소형 코스·워밍업 섹터·예언 성취는
  /// 암송 전용 큐레이션이라 통독 플랜의 대상이 아니다.
  final bool bibleOnly;

  /// 하위 단계 없이 코스 전체가 플랜이 되는 소형 코스.
  final void Function(Course course) onSmallPicked;

  /// 권/섹터 목록으로 내려간다.
  final void Function(ScopeKind kind, Course course) onDrillDown;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    final coursesAsync = ref.watch(allCoursesProvider);

    return coursesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(l.commonErrorGeneric)),
      data: (courses) {
        Course? firstOf(String category) {
          for (final c in courses) {
            if (c.category == category) return c;
          }
          return null;
        }

        final foundations = firstOf('foundations');
        final lordsPrayer = firstOf('lords-prayer');
        final warmup = firstOf('warmup');
        final messiah = firstOf('messiah');
        final ot = courses.where((c) => c.category == 'ot').toList();
        final nt = courses.where((c) => c.category == 'nt').toList();

        Widget drill(String title, ScopeKind kind, Course course) => Card(
              child: ListTile(
                title: Text(title),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => onDrillDown(kind, course),
              ),
            );

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(l.createPlanWhatTitle, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            if (!bibleOnly) ...[
              for (final c in [foundations, lordsPrayer])
                if (c != null)
                  Card(
                    child: ListTile(
                      title: Text(_courseTitle(c, locale)),
                      onTap: () => onSmallPicked(c),
                    ),
                  ),
              if (warmup != null)
                Card(
                  child: ListTile(
                    title: Text(l.createPlanWarmupEntry),
                    subtitle: Text(categoryLabel(l, 'warmup')),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => onDrillDown(ScopeKind.warmup, warmup),
                  ),
                ),
              if (messiah != null)
                drill(l.createPlanMessiahEntry, ScopeKind.messiah, messiah),
            ],
            // 구약/신약은 권이 여러 코스다 — 카테고리 대표 코스가 아니라 목록으로 내려간다.
            if (ot.isNotEmpty) drill(l.createPlanOtEntry, ScopeKind.ot, ot.first),
            if (nt.isNotEmpty) drill(l.createPlanNtEntry, ScopeKind.nt, nt.first),
          ],
        );
      },
    );
  }
}

/// 권 목록(구약/신약) 또는 섹션 목록(워밍업 섹터, 예언의 구약 책).
/// [kind]가 ot/nt면 그 카테고리의 코스 목록을, 그 외에는 [course]의 섹션 목록을 그린다.
class SectionListStep extends ConsumerWidget {
  const SectionListStep({
    super.key,
    required this.kind,
    required this.course,
    required this.onCoursePicked,
    required this.onSectionPicked,
  });

  final ScopeKind kind;
  final Course course;

  /// 구약/신약에서 권(코스)을 골랐을 때.
  final void Function(Course course) onCoursePicked;

  /// 워밍업·예언에서 섹션을 골랐을 때.
  final void Function(Section section) onSectionPicked;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;

    if (kind == ScopeKind.ot || kind == ScopeKind.nt) {
      final category = kind == ScopeKind.ot ? 'ot' : 'nt';
      final coursesAsync = ref.watch(allCoursesProvider);
      return coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(l.commonErrorGeneric)),
        data: (courses) {
          final books = courses.where((c) => c.category == category).toList();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(l.createPlanPickBook, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              for (final b in books)
                Card(
                  child: ListTile(
                    title: Text(_courseTitle(b, locale)),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => onCoursePicked(b),
                  ),
                ),
            ],
          );
        },
      );
    }

    final sectionsAsync = ref.watch(courseSectionsProvider(course.id));
    return sectionsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text(l.commonErrorGeneric)),
      data: (sections) {
        if (sections.isEmpty) {
          return Center(child: Text(l.createPlanEmptySections));
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              kind == ScopeKind.messiah ? l.createPlanPickBook : l.createPlanWarmupEntry,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            for (final s in sections)
              Card(
                child: ListTile(
                  title: Text(_sectionTitle(s, locale)),
                  trailing: kind == ScopeKind.messiah ? const Icon(Icons.chevron_right) : null,
                  onTap: () => onSectionPicked(s),
                ),
              ),
          ],
        );
      },
    );
  }
}
```

`LeafChipStep`은 Task 4에서 단일선택으로 만든다. 이 태스크에서는 기존 `_ChapterPicker`의
칩 UI를 `LeafChipStep`이라는 이름의 화면 내 위젯으로 **그대로 옮기기만** 한다 — 다중선택,
확인 버튼, 기본 선택(첫 미완료 장) 유지. 워밍업 섹터는 `leaves` 단계 없이 섹션 탭에서
바로 `onPicked(PlanScope(course: course, sectionIds: [s.id]))`로 끝낸다.

```dart
/// 장 칩(구약/신약) 다중 선택. Task 4에서 단일선택으로 바뀐다.
class LeafChipStep extends ConsumerStatefulWidget {
  const LeafChipStep({super.key, required this.course, required this.onPicked});
  final Course course;
  final void Function(PlanScope scope) onPicked;

  @override
  ConsumerState<LeafChipStep> createState() => _LeafChipStepState();
}

class _LeafChipStepState extends ConsumerState<LeafChipStep> {
  List<Section> _sections = const [];
  Set<int> _completed = const {};
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
    final completed = await repo.completedSectionIds(widget.course.id);
    if (!mounted) return;
    setState(() {
      _sections = sections;
      _completed = completed;
      _loading = false;
      final defaultId = firstUncleared ?? (sections.isEmpty ? null : sections.first.id);
      if (defaultId != null) _selected.add(defaultId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_sections.isEmpty) {
      return Center(child: Text(l.createPlanEmptySections));
    }
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.createPlanPickChapters, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(l.createPlanChapterHint, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          Expanded(
            child: SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final s in _sections)
                    FilterChip(
                      avatar: _completed.contains(s.id)
                          ? const Icon(Icons.check_circle, size: 16)
                          : null,
                      label: Text(_sectionTitle(s, locale)),
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
                : () => widget.onPicked(PlanScope(
                    course: widget.course, sectionIds: _selected.toList()..sort())),
            child: Text(l.commonConfirm),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 5: `courseSectionsProvider`를 추가한다**

`lib/app/providers.dart` — `allCoursesProvider` 아래에:

```dart
/// 코스의 섹션 목록 — 플랜 생성 화면의 권/섹터 단계가 쓴다.
final courseSectionsProvider =
    FutureProvider.autoDispose.family<List<Section>, int>(
        (ref, courseId) => ref.watch(courseRepositoryProvider).listSections(courseId));
```

- [ ] **Step 6: `CreatePlanScreen`을 단계 상태 기계로 바꾼다**

`lib/features/today/create_plan_screen.dart` — `_CreatePlanScreenState`의 상태와 build를 교체.
`_deadlineStep`, `_trackStep`, `_start`, `_pickCustomDate`, `_formatDay`, `_setPresetDays`,
`_daysUntilDeadline`, `_todayUtc`, `_midnightUtc`는 그대로 둔다.

상태 필드:

```dart
  PlanStep _step = PlanStep.track;
  String? _mode;
  ScopeKind? _kind;

  /// `sections` 단계가 목록을 뽑을 기준 코스. 구약/신약은 카테고리 대표 코스이고,
  /// 워밍업·예언은 그 코스 자체다.
  Course? _listCourse;

  /// `leaves` 단계의 대상 권(구약/신약에서 고른 코스).
  Course? _leafCourse;

  /// `leaves` 단계가 예언일 때 주제를 뽑을 섹션.
  Section? _leafSection;

  PlanScope? _scope;
  late DateTime _deadline;
  int _totalVerses = 0;
```

뒤로가기 한 단계:

```dart
  /// 단계를 한 칸 되돌린다. AppBar 뒤로가기와 시스템 백이 같은 경로를 쓴다.
  void _back() {
    setState(() {
      switch (_step) {
        case PlanStep.track:
          break; // 라우터가 pop한다
        case PlanStep.scopeRoot:
          _mode = null;
          _step = PlanStep.track;
        case PlanStep.sections:
          _kind = null;
          _listCourse = null;
          _step = PlanStep.scopeRoot;
        case PlanStep.leaves:
          _leafCourse = null;
          _leafSection = null;
          _step = PlanStep.sections;
        case PlanStep.deadline:
          _scope = null;
          _totalVerses = 0;
          // 소형 코스는 하위 단계가 없어 대상 목록으로 바로 돌아간다.
          _step = _kind == ScopeKind.small ? PlanStep.scopeRoot : PlanStep.leaves;
      }
    });
  }
```

선택 핸들러:

```dart
  void _onSmallPicked(Course course) {
    _kind = ScopeKind.small;
    _onPicked(PlanScope(course: course));
  }

  void _onDrillDown(ScopeKind kind, Course course) {
    setState(() {
      _kind = kind;
      _listCourse = course;
      _step = PlanStep.sections;
    });
  }

  /// 구약/신약에서 권을 고르면 장 단계로.
  void _onBookPicked(Course course) {
    setState(() {
      _leafCourse = course;
      _step = PlanStep.leaves;
    });
  }

  /// 워밍업 섹터는 여기서 끝, 예언의 구약 책은 주제 단계로.
  void _onSectionPicked(Section section) {
    if (_kind == ScopeKind.messiah) {
      setState(() {
        _leafSection = section;
        _step = PlanStep.leaves;
      });
      return;
    }
    _onPicked(PlanScope(course: _listCourse!, sectionIds: [section.id]));
  }
```

`_onPicked`는 절 수를 세고 마감 단계로 넘어간다(통독 분기는 Task 5에서 넣는다):

```dart
  Future<void> _onPicked(PlanScope scope) async {
    final items = await ref.read(courseRepositoryProvider).listItemsByCourse(
          scope.course.id,
          sectionIds: scope.sectionIds.isEmpty ? null : scope.sectionIds,
          topics: scope.topics.isEmpty ? null : scope.topics,
        );
    if (!mounted) return;
    setState(() {
      _scope = scope;
      _totalVerses = items.length;
      _step = PlanStep.deadline;
    });
  }
```

`_start`에 `topics`를 넘긴다:

```dart
    await ref.read(planRepositoryProvider).createPlan(
          courseId: scope.course.id,
          title: title,
          deadlineDay: _formatDay(_deadline),
          sectionIds: scope.sectionIds.isEmpty ? null : scope.sectionIds,
          topics: scope.topics.isEmpty ? null : scope.topics,
          mode: _mode!,
        );
```

build:

```dart
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;

    return PopScope(
      // track 단계에서만 라우터가 화면을 닫는다. 그 외에는 단계를 한 칸 되돌린다.
      canPop: _step == PlanStep.track,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.createPlanTitle),
          leading: _step == PlanStep.track ? null : BackButton(onPressed: _back),
        ),
        body: switch (_step) {
          PlanStep.track => _trackStep(context, l),
          PlanStep.scopeRoot => ScopeRootStep(
              bibleOnly: _mode == 'reading',
              onSmallPicked: _onSmallPicked,
              onDrillDown: _onDrillDown,
            ),
          PlanStep.sections => SectionListStep(
              kind: _kind!,
              course: _listCourse!,
              onCoursePicked: _onBookPicked,
              onSectionPicked: _onSectionPicked,
            ),
          PlanStep.leaves => LeafChipStep(
              course: _leafCourse!,
              onPicked: _onPicked,
            ),
          PlanStep.deadline => _deadlineStep(context, l, locale),
        },
      ),
    );
  }
```

`_trackStep`의 `onTap`을 단계 전환으로 바꾼다:

```dart
            onTap: () => setState(() {
              _mode = 'memorize';
              _step = PlanStep.scopeRoot;
            }),
```

```dart
            onTap: () => setState(() {
              _mode = 'reading';
              _step = PlanStep.scopeRoot;
            }),
```

import에 `plan_scope_picker.dart`(이미 있음)와 `../../core/db/app_database.dart`를 더한다
(`Course`, `Section` 타입 때문).

- [ ] **Step 7: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/create_plan_steps_test.dart`
Expected: 3 tests PASS

- [ ] **Step 8: 기존 화면 테스트를 확인하고 고친다**

Run: `flutter test test/create_plan_screen_test.dart test/create_plan_track_test.dart test/plan_scope_picker_test.dart test/plan_replace_flow_test.dart`
Expected: '성경 책별로'를 탭하던 기존 테스트가 FAIL한다. 그 탭을 `'구약'` → 권 → 장 경로로
바꿔 고친다. 위 Step 2의 두 번째 테스트가 그 경로의 참조 구현이다. **테스트의 기대값을
느슨하게 바꾸지 말고 탭 경로만 새 흐름에 맞춘다.**

- [ ] **Step 9: 커밋**

```bash
git add lib/features/today/plan_scope_picker.dart lib/features/today/create_plan_screen.dart lib/app/providers.dart lib/l10n/ test/create_plan_steps_test.dart test/create_plan_screen_test.dart test/create_plan_track_test.dart test/plan_scope_picker_test.dart test/plan_replace_flow_test.dart
git commit -m "feat: 플랜 대상 선택을 화면 내 단계로 — 뒤로가기 복구, 구약/신약 분리"
```

---

### Task 4: 장·주제 단일선택과 예언 주제 단계

`LeafChipStep`을 단일선택으로 바꾸고 예언 주제 칩을 지원한다.

**Files:**
- Modify: `lib/features/today/plan_scope_picker.dart` (`LeafChipStep`)
- Modify: `lib/core/courses/course_repository.dart` (`listTopicsBySection` 추가, `completedSectionIds` 아래)
- Modify: `lib/features/today/create_plan_screen.dart` (`LeafChipStep`에 `kind`/`section` 전달)
- Test: `test/plan_leaf_chip_test.dart` (신규)

**Interfaces:**
- Consumes: Task 3의 `LeafChipStep`, `PlanScope`, `ScopeKind`
- Produces:
  - `class TopicSummary { final String topic; final String topicEn; final int verseCount; final bool completed; }`
    (`course_repository.dart`, `const TopicSummary({required this.topic, required this.topicEn, required this.verseCount, required this.completed})`)
  - `CourseRepository.listTopicsBySection(int sectionId)` → `Future<List<TopicSummary>>`
    — 섹션 안 `ord` 오름차순 첫 등장 순서로 중복 없이. `completed`는 그 주제의 모든 절이 cleared일 때 true.
  - `LeafChipStep({required ScopeKind kind, required Course course, Section? section, required void Function(PlanScope) onPicked})`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/plan_leaf_chip_test.dart` 신규 생성:

```dart
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/courses/course_repository.dart';
import 'package:verse_flutter/core/db/app_database.dart';

void main() {
  late AppDatabase db;
  late CourseRepository repo;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = CourseRepository(db);
  });
  tearDown(() => db.close());

  /// 섹션 91에 '한 분의 왕' 2절(910, 911) → '최후의 만찬' 1절(912) → '한 분의 왕' 1절(913).
  /// 같은 주제가 떨어져 두 번 나오는 배치를 일부러 만든다(중복 제거 검증).
  Future<void> seed() async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(9), slug: 'messiah-prophecy', title: '예언', ord: 33, category: 'messiah'));
    await db.into(db.sections).insert(SectionsCompanion.insert(
        id: const Value(91), courseId: 9, title: '창세기', ord: 1));
    const rows = [
      ('한 분의 왕', 'One King'),
      ('한 분의 왕', 'One King'),
      ('최후의 만찬', 'The Last Supper'),
      ('한 분의 왕', 'One King'),
    ];
    for (var i = 0; i < rows.length; i++) {
      await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
            id: Value(910 + i), courseId: 9, sectionId: const Value(91), ord: i,
            topic: Value(rows[i].$1), topicEn: Value(rows[i].$2),
            book: 1, chapter: 14, verse: 18 + i, verseText: 'v$i',
          ));
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

  test('주제 목록은 중복 없이 첫 등장 순서로, 절 수를 합쳐서 나온다', () async {
    await seed();
    final topics = await repo.listTopicsBySection(91);

    expect(topics.map((t) => t.topic), ['한 분의 왕', '최후의 만찬']);
    expect(topics.first.verseCount, 3, reason: '떨어져 있는 910, 911, 913을 합친다');
    expect(topics.first.topicEn, 'One King');
    expect(topics[1].verseCount, 1);
  });

  test('주제의 모든 절을 외우면 completed가 true다', () async {
    await seed();
    expect((await repo.listTopicsBySection(91)).first.completed, isFalse);

    await clearItem(910);
    expect((await repo.listTopicsBySection(91)).first.completed, isFalse,
        reason: '3절 중 1절만 외웠다');

    await clearItem(911);
    await clearItem(913);
    expect((await repo.listTopicsBySection(91)).first.completed, isTrue);
  });
}
```

`test/create_plan_steps_test.dart`에 단일선택 위젯 테스트를 추가한다(`seedAllCategories`와
`pumpToScopeRoot`를 재사용):

```dart
  testWidgets('장 칩은 하나만 골라지고 탭하면 바로 마감 단계로 간다', (tester) async {
    await seedAllCategories();
    await pumpToScopeRoot(tester);

    await tester.tap(find.text('구약'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('창세기'));
    await tester.pumpAndSettle();

    // 확인 버튼 없이 칩 탭이 곧 확정이다.
    expect(find.text('확인'), findsNothing);
    await tester.tap(find.text('2장'));
    await tester.pumpAndSettle();

    // 마감 단계 — 2장은 3절이다.
    expect(find.text('총 3절 · 하루 약 1절'), findsOneWidget);
  });
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/plan_leaf_chip_test.dart test/create_plan_steps_test.dart`
Expected: FAIL — `listTopicsBySection` 미정의, 장 단계에 '확인' 버튼이 아직 있다.

- [ ] **Step 3: `listTopicsBySection`을 구현한다**

`lib/core/courses/course_repository.dart` — `completedSectionIds` 아래에. 클래스 밖(파일 끝)에
`TopicSummary`를 둔다:

```dart
  /// 섹션 안의 주제 목록. 예언 성취 코스의 주제 칩이 쓴다.
  /// 같은 주제가 섹션 안에서 떨어져 여러 번 나올 수 있으므로 첫 등장 순서를
  /// 유지하면서 절 수를 합친다.
  Future<List<TopicSummary>> listTopicsBySection(int sectionId) async {
    final items = await (_db.select(_db.courseItems)
          ..where((t) => t.sectionId.equals(sectionId))
          ..orderBy([(t) => OrderingTerm.asc(t.ord)]))
        .get();
    if (items.isEmpty) return const [];

    final clearedRows = await (_db.select(_db.progress)
          ..where((t) =>
              t.courseItemId.isIn(items.map((i) => i.id).toList()) & t.cleared.equals(true)))
        .get();
    final clearedIds = clearedRows.map((p) => p.courseItemId).toSet();

    final order = <String>[];
    final total = <String, int>{};
    final cleared = <String, int>{};
    final en = <String, String>{};
    for (final it in items) {
      if (!total.containsKey(it.topic)) {
        order.add(it.topic);
        en[it.topic] = it.topicEn;
      }
      total[it.topic] = (total[it.topic] ?? 0) + 1;
      if (clearedIds.contains(it.id)) {
        cleared[it.topic] = (cleared[it.topic] ?? 0) + 1;
      }
    }
    return [
      for (final t in order)
        TopicSummary(
          topic: t,
          topicEn: en[t] ?? '',
          verseCount: total[t]!,
          completed: (cleared[t] ?? 0) == total[t],
        ),
    ];
  }
```

파일 끝에:

```dart
/// 주제 칩 하나의 표시 재료. verseCount는 그 주제에 속한 절 수,
/// completed는 그 절을 전부 외웠는지.
class TopicSummary {
  const TopicSummary({
    required this.topic,
    required this.topicEn,
    required this.verseCount,
    required this.completed,
  });
  final String topic;
  final String topicEn;
  final int verseCount;
  final bool completed;
}
```

- [ ] **Step 4: `LeafChipStep`을 단일선택 + 주제 지원으로 바꾼다**

`lib/features/today/plan_scope_picker.dart`의 `LeafChipStep`과 `_LeafChipStepState`를 교체:

```dart
/// 마지막 선택 단계 — 장 칩(구약/신약) 또는 주제 칩(예언 성취).
/// **한 번에 하나만** 고른다. 칩 탭이 곧 확정이라 확인 버튼이 없다
/// (되돌리려면 뒤로가기). 이미 마친 항목도 계속 노출한다 — 복습을 막지 않는다.
class LeafChipStep extends ConsumerStatefulWidget {
  const LeafChipStep({
    super.key,
    required this.kind,
    required this.course,
    this.section,
    required this.onPicked,
  });

  final ScopeKind kind;
  final Course course;

  /// 예언 성취일 때 주제를 뽑을 섹션(구약 책). 그 외에는 null.
  final Section? section;

  final void Function(PlanScope scope) onPicked;

  @override
  ConsumerState<LeafChipStep> createState() => _LeafChipStepState();
}

class _LeafChipStepState extends ConsumerState<LeafChipStep> {
  List<Section> _sections = const [];
  List<TopicSummary> _topics = const [];
  Set<int> _completedSections = const {};
  bool _loading = true;

  bool get _isTopicMode => widget.kind == ScopeKind.messiah;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(courseRepositoryProvider);
    if (_isTopicMode) {
      final topics = await repo.listTopicsBySection(widget.section!.id);
      if (!mounted) return;
      setState(() {
        _topics = topics;
        _loading = false;
      });
      return;
    }
    final sections = await repo.listSections(widget.course.id);
    final completed = await repo.completedSectionIds(widget.course.id);
    if (!mounted) return;
    setState(() {
      _sections = sections;
      _completedSections = completed;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final empty = _isTopicMode ? _topics.isEmpty : _sections.isEmpty;
    if (empty) {
      return Center(child: Text(l.createPlanEmptySections));
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _isTopicMode ? l.createPlanPickTopics : l.createPlanPickChapters,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            _isTopicMode ? l.createPlanTopicHint : l.createPlanChapterHint,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Expanded(
            child: SingleChildScrollView(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _isTopicMode ? _topicChips(locale) : _sectionChips(locale),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _sectionChips(String locale) => [
        for (final s in _sections)
          ChoiceChip(
            avatar: _completedSections.contains(s.id)
                ? const Icon(Icons.check_circle, size: 16)
                : null,
            label: Text(_sectionTitle(s, locale)),
            selected: false,
            onSelected: (_) => widget.onPicked(
              PlanScope(course: widget.course, sectionIds: [s.id]),
            ),
          ),
      ];

  List<Widget> _topicChips(String locale) => [
        for (final t in _topics)
          ChoiceChip(
            avatar: t.completed ? const Icon(Icons.check_circle, size: 16) : null,
            label: Text(locale == 'en' && t.topicEn.isNotEmpty ? t.topicEn : t.topic),
            selected: false,
            onSelected: (_) => widget.onPicked(PlanScope(
              course: widget.course,
              sectionIds: [widget.section!.id],
              topics: [t.topic],
            )),
          ),
      ];
}
```

import에 `../../core/courses/course_repository.dart`를 더한다(`TopicSummary` 때문).

- [ ] **Step 5: 화면에서 `kind`/`section`을 넘긴다**

`lib/features/today/create_plan_screen.dart`의 build:

```dart
          PlanStep.leaves => LeafChipStep(
              kind: _kind!,
              course: _leafCourse ?? _listCourse!,
              section: _leafSection,
              onPicked: _onPicked,
            ),
```

`_leafCourse`가 null인 경우는 예언(권을 코스로 고르지 않고 섹션으로 내려감)이라
`_listCourse`로 폴백한다.

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/plan_leaf_chip_test.dart test/create_plan_steps_test.dart`
Expected: 전부 PASS

- [ ] **Step 7: 전체 테스트로 회귀를 확인한다**

Run: `flutter test`
Expected: 전부 PASS. 다중선택('확인' 탭)에 의존하던 기존 테스트가 FAIL하면 칩 탭이
곧 확정인 새 흐름으로 탭 경로만 고친다.

- [ ] **Step 8: 커밋**

```bash
git add lib/features/today/plan_scope_picker.dart lib/features/today/create_plan_screen.dart lib/core/courses/course_repository.dart test/
git commit -m "feat: 장·주제 칩 단일선택 + 예언 주제 고르기 단계"
```

---

### Task 5: 통독은 마감 단계를 건너뛴다

**Files:**
- Modify: `lib/features/today/create_plan_screen.dart` (`_onPicked`의 통독 분기)
- Modify: `lib/core/plan/plan_repository.dart` (`PlanView.expired`, `todayTarget`)
- Modify: `lib/features/today/plan_sheet.dart:113-120` (통독은 D-day·마감 변경 숨김)
- Test: `test/plan_reading_rollover_test.dart` (신규 — Task 6에서 이어 쓴다)

**Interfaces:**
- Consumes: Task 3의 `PlanStep`, `_onPicked`
- Produces: 통독 `PlanView`의 `expired == false`, `todayTarget == remainingVerses`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/plan_reading_rollover_test.dart` 신규 생성:

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

  /// 코스 8(창세기)에 장 3개(81, 82, 83), 장마다 절 2개.
  /// item id = 섹션id*10 + i.
  Future<void> seedThreeChapters() async {
    await db.into(db.courses).insert(CoursesCompanion.insert(
        id: const Value(8), slug: 'gen', title: '창세기', ord: 1, category: 'ot'));
    for (final sectionId in [81, 82, 83]) {
      await db.into(db.sections).insert(SectionsCompanion.insert(
          id: Value(sectionId), courseId: 8, title: '${sectionId - 80}장', ord: sectionId));
      for (var i = 0; i < 2; i++) {
        await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
              id: Value(sectionId * 10 + i), courseId: 8, sectionId: Value(sectionId),
              ord: sectionId * 10 + i, book: 1, chapter: sectionId - 80,
              verse: i + 1, verseText: 'v$i',
            ));
      }
    }
  }

  Future<void> markTyped(int itemId) async {
    await db.into(db.readingProgress).insertOnConflictUpdate(
        ReadingProgressCompanion.insert(courseItemId: itemId, typedAt: DateTime.now().toUtc()));
  }

  test('통독 플랜은 마감이 지나도 만료되지 않고 남은 절이 곧 오늘 목표다', () async {
    await seedThreeChapters();
    await repo.createPlan(
      courseId: 8,
      title: '창세기',
      deadlineDay: '2020-01-01', // 한참 지난 날짜
      sectionIds: [81],
      mode: 'reading',
    );

    final v = (await repo.planView(mode: 'reading'))!;
    expect(v.expired, isFalse, reason: '통독은 마감을 보지 않는다');
    expect(v.totalVerses, 2);
    expect(v.todayTarget, 2, reason: '현재 장의 남은 절 전부가 오늘치');

    await markTyped(810);
    final v2 = (await repo.planView(mode: 'reading'))!;
    expect(v2.todayTarget, 1);
  });

  test('암송 플랜은 마감이 지나면 여전히 만료된다', () async {
    await seedThreeChapters();
    await repo.createPlan(
        courseId: 8, title: '창세기', deadlineDay: '2020-01-01', sectionIds: [81]);
    expect((await repo.planView())!.expired, isTrue);
  });
}
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/plan_reading_rollover_test.dart`
Expected: 첫 테스트 FAIL — `expired`가 true, `todayTarget`이 0.

- [ ] **Step 3: `PlanView`를 고친다**

`lib/core/plan/plan_repository.dart`:

```dart
  /// 마감일이 어제 이전이면 만료. 'YYYY-MM-DD'는 사전순 비교가 날짜순과 같다.
  /// 통독은 마감이 없다 — 한 장을 끝내면 다음 장으로 전진하는 롤오버 방식이라
  /// 만료라는 상태 자체가 없다.
  bool get expired =>
      mode != 'reading' && plan.deadlineDay.compareTo(todayUtcDay()) < 0;
```

```dart
  /// 만료 플랜은 오늘 목표가 없다. 이 가드가 없으면 _remainingDays의 max(1,..)
  /// 때문에 남은 절 전부가 매일 "오늘 목표"로 쏟아진다.
  /// 통독은 범위가 장 하나라 남은 절이 곧 오늘 목표다.
  int get todayTarget {
    if (mode == 'reading') return remainingVerses;
    return (expired || remainingVerses <= 0) ? 0 : (remainingVerses / remainingDays).ceil();
  }
```

- [ ] **Step 4: 통독 생성이 마감 단계를 건너뛰게 한다**

`lib/features/today/create_plan_screen.dart`의 `_onPicked` 끝을 바꾼다:

```dart
    if (!mounted) return;
    // 통독은 마감이 없다 — 대상을 고르면 곧바로 플랜을 만든다.
    if (_mode == 'reading') {
      setState(() {
        _scope = scope;
        _totalVerses = items.length;
        // 마감 컬럼이 NOT NULL이라 값은 넣지만 통독 경로에서는 읽지 않는다.
        _deadline = _todayUtc().add(const Duration(days: 365));
      });
      await _start(Localizations.localeOf(context).languageCode);
      return;
    }
    setState(() {
      _scope = scope;
      _totalVerses = items.length;
      _step = PlanStep.deadline;
    });
```

- [ ] **Step 5: 플랜 시트에서 통독의 마감 UI를 숨긴다**

`lib/features/today/plan_sheet.dart` — 헤더의 D-day와 '마감 변경' 행을 분기한다:

```dart
          Text(view.mode == 'reading'
              ? l.todayPlanCount(view.clearedVerses, view.totalVerses)
              : '${l.todayPlanCount(view.clearedVerses, view.totalVerses)} · '
                  '${l.todayDday(view.remainingDays)}'),
          const SizedBox(height: 8),
          // 통독은 마감이 없다(장 단위 롤오버) — 마감 변경 행 자체를 없앤다.
          if (view.mode != 'reading')
            ListTile(
              leading: const Icon(Icons.event),
              title: Text(l.planSheetChangeDeadline),
              onTap: () => _changeDeadline(context, ref),
            ),
```

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/plan_reading_rollover_test.dart test/plan_sheet_test.dart test/today_two_track_test.dart test/plan_expiry_test.dart test/today_expired_test.dart`
Expected: 전부 PASS. 통독 플랜의 만료를 기대하던 기존 테스트가 있으면 암송 플랜으로
바꾸거나 새 규칙(통독은 만료 없음)에 맞게 기대값을 고친다.

- [ ] **Step 7: 커밋**

```bash
git add lib/core/plan/plan_repository.dart lib/features/today/create_plan_screen.dart lib/features/today/plan_sheet.dart test/
git commit -m "feat: 통독 플랜에서 마감 제거 — 남은 절이 곧 오늘 목표"
```

---

### Task 6: 통독 롤오버 — 한 장을 끝내면 다음 장으로

**Files:**
- Modify: `lib/core/plan/plan_repository.dart` (`advanceReadingSection` 추가)
- Modify: `lib/features/reading/reading_screen.dart:168-186` (`_chapterDone`의 '다음 장')
- Modify: `lib/features/today/today_screen.dart:252-264` (통독 CTA), `:355-363` (D-day 대신 스트릭)
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/plan_reading_rollover_test.dart` (Task 5에서 만든 파일에 추가)

**Interfaces:**
- Consumes: Task 5의 통독 `PlanView`
- Produces: `PlanRepository.advanceReadingSection(int planId)` → `Future<bool>`
  (전진했으면 true. 현재 장이 안 끝났으면 아무것도 하지 않고 false. 권을 다 끝냈으면
  `status='completed'`로 바꾸고 false.)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/plan_reading_rollover_test.dart`에 추가:

```dart
  test('현재 장을 다 읽으면 다음 안 읽은 장으로 전진한다', () async {
    await seedThreeChapters();
    final plan = await repo.createPlan(
      courseId: 8, title: '창세기', deadlineDay: '2027-01-01',
      sectionIds: [81], mode: 'reading',
    );

    await markTyped(810);
    expect(await repo.advanceReadingSection(plan.id), isFalse,
        reason: '1장이 아직 안 끝났으면 전진하지 않는다(멱등)');
    expect((await repo.activePlan(mode: 'reading'))!.sectionIds, '81');

    await markTyped(811);
    expect(await repo.advanceReadingSection(plan.id), isTrue);

    final after = (await repo.activePlan(mode: 'reading'))!;
    expect(after.sectionIds, '82');
    expect(after.status, 'active');
  });

  test('이미 읽은 장은 건너뛰고 전진한다', () async {
    await seedThreeChapters();
    final plan = await repo.createPlan(
      courseId: 8, title: '창세기', deadlineDay: '2027-01-01',
      sectionIds: [81], mode: 'reading',
    );
    // 2장을 미리 다 읽어둔 상태
    await markTyped(820);
    await markTyped(821);
    await markTyped(810);
    await markTyped(811);

    expect(await repo.advanceReadingSection(plan.id), isTrue);
    expect((await repo.activePlan(mode: 'reading'))!.sectionIds, '83');
  });

  test('권의 마지막 장까지 끝나면 완료된다', () async {
    await seedThreeChapters();
    final plan = await repo.createPlan(
      courseId: 8, title: '창세기', deadlineDay: '2027-01-01',
      sectionIds: [83], mode: 'reading',
    );
    for (final id in [810, 811, 820, 821, 830, 831]) {
      await markTyped(id);
    }

    expect(await repo.advanceReadingSection(plan.id), isFalse);
    expect(await repo.activePlan(mode: 'reading'), isNull, reason: 'active가 아니다');

    final row = await (db.select(db.memorizationPlan)
          ..where((t) => t.id.equals(plan.id)))
        .getSingle();
    expect(row.status, 'completed');
  });

  test('암송 플랜에는 전진이 적용되지 않는다', () async {
    await seedThreeChapters();
    final plan = await repo.createPlan(
        courseId: 8, title: '창세기', deadlineDay: '2027-01-01', sectionIds: [81]);
    expect(await repo.advanceReadingSection(plan.id), isFalse);
    expect((await repo.activePlan())!.sectionIds, '81');
  });
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/plan_reading_rollover_test.dart`
Expected: 컴파일 실패 — `advanceReadingSection` 미정의.

- [ ] **Step 3: `advanceReadingSection`을 구현한다**

`lib/core/plan/plan_repository.dart` — `updateDeadline` 아래에:

```dart
  /// 통독 플랜을 현재 장 다음의 안 읽은 장으로 전진시킨다. 통독은 마감이 없고
  /// 하루 1장이 목표라, 플랜을 끝내는 게 아니라 같은 권 안에서 굴러간다.
  ///
  /// 멱등하다 — 현재 장이 아직 안 끝났으면 아무것도 하지 않고 false를 반환한다.
  /// 권의 모든 장을 끝냈으면 status='completed'로 바꾸고 false를 반환한다.
  /// 전진했을 때만 true.
  Future<bool> advanceReadingSection(int planId) async {
    final plan = await (_db.select(_db.memorizationPlan)..where((t) => t.id.equals(planId)))
        .getSingleOrNull();
    if (plan == null || plan.mode != 'reading' || plan.status != 'active') return false;

    final items = await (_db.select(_db.courseItems)
          ..where((t) => t.courseId.equals(plan.courseId))
          ..orderBy([(t) => OrderingTerm.asc(t.ord)]))
        .get();
    if (items.isEmpty) return false;

    final typedRows = await (_db.select(_db.readingProgress)
          ..where((t) => t.courseItemId.isIn(items.map((i) => i.id).toList())))
        .get();
    final typed = typedRows.map((r) => r.courseItemId).toSet();

    // 현재 장이 안 끝났으면 전진하지 않는다.
    final current = parseSectionIds(plan.sectionIds);
    if (current != null) {
      final unfinished = items.any(
          (i) => current.contains(i.sectionId) && !typed.contains(i.id));
      if (unfinished) return false;
    }

    // 권에서 아직 안 읽은 첫 절이 속한 장으로 옮긴다.
    final nextItem = items.where((i) => !typed.contains(i.id) && i.sectionId != null).firstOrNull;
    if (nextItem == null) {
      await markCompleted(planId);
      return false;
    }
    await (_db.update(_db.memorizationPlan)..where((t) => t.id.equals(planId)))
        .write(MemorizationPlanCompanion(
            sectionIds: Value(nextItem.sectionId!.toString())));
    return true;
  }
```

`firstOrNull`은 `package:collection`이 필요하다. 파일 맨 위 import에
`import 'package:collection/collection.dart';`를 더한다. `pubspec.yaml`에 `collection`이
없으면 `firstOrNull` 대신:

```dart
    CourseItem? nextItem;
    for (final i in items) {
      if (!typed.contains(i.id) && i.sectionId != null) {
        nextItem = i;
        break;
      }
    }
```

Run: `grep -n "collection:" pubspec.yaml` 로 먼저 확인한다.

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/plan_reading_rollover_test.dart`
Expected: 6 tests PASS

- [ ] **Step 5: 통독 화면의 '다음 장'이 전진을 호출하게 한다**

`lib/features/reading/reading_screen.dart`의 `_chapterDone` — '다음 장' 버튼:

```dart
            FilledButton(
              onPressed: () async {
                // 장을 끝냈으니 플랜을 다음 장으로 굴린다. 멱등이라 두 번 눌려도 안전하다.
                final view = await ref.read(readingPlanViewProvider.future);
                if (view != null) {
                  await ref.read(planRepositoryProvider).advanceReadingSection(view.plan.id);
                }
                ref.invalidate(readingSessionProvider);
                ref.invalidate(readingPlanViewProvider);
                ref.invalidate(planSectionTitlesProvider('reading'));
              },
              child: Text(l.readingNextChapter),
            ),
```

- [ ] **Step 6: l10n 키를 추가한다**

`lib/l10n/app_ko.arb`:

```json
  "todayStreakDays": "{days}일 연속",
  "@todayStreakDays": {
    "placeholders": { "days": { "type": "int" } }
  },
```

`lib/l10n/app_en.arb`:

```json
  "todayStreakDays": "{days}-day streak",
  "@todayStreakDays": {
    "placeholders": { "days": { "type": "int" } }
  },
```

Run: `flutter gen-l10n`
Expected: 에러 없이 끝나고 `todayStreakDays`가 생긴다.

- [ ] **Step 7: Today 통독 카드에서 D-day 대신 스트릭을 보여준다**

`lib/features/today/today_screen.dart` — `_PlanCard`가 D-day를 그리는 곳을 찾아
(`l.todayDday(view.remainingDays)`) 통독이면 스트릭으로 바꾼다:

```dart
            if (view.mode == 'reading')
              Text(l.todayStreakDays(
                  ref.watch(currentStreakProvider).valueOrNull?.currentLen ?? 0))
            else
              Text(l.todayDday(view.remainingDays)),
```

통독 CTA는 장을 다 읽었으면 전진시킨다 — `_readingCta`:

```dart
  /// 통독 카드의 CTA. 통독은 만료가 없다(마감 없는 롤오버) — 장을 다 읽었으면
  /// 다음 장으로 굴리고, 아니면 이어서 통독한다.
  Widget _readingCta(BuildContext context, WidgetRef ref, AppLocalizations l, PlanView view) {
    if (view.planComplete) {
      return FilledButton(
        onPressed: () async {
          await ref.read(planRepositoryProvider).advanceReadingSection(view.plan.id);
          ref.invalidate(readingPlanViewProvider);
          ref.invalidate(readingSessionProvider);
          ref.invalidate(planSectionTitlesProvider('reading'));
        },
        child: Text(l.readingNextChapter),
      );
    }
    return _continueReadingCta(context, ref, l);
  }
```

- [ ] **Step 8: 테스트가 통과하는 것을 확인한다**

Run: `flutter test`
Expected: 전부 PASS. `today_two_track_test.dart`나 `reading_screen_test.dart`가
D-day 문구를 기대하고 있으면 통독 카드 기대값을 스트릭 문구로 고친다.

- [ ] **Step 9: 정적 분석**

Run: `flutter analyze`
Expected: No issues found. 경고가 나오면 이번 변경으로 안 쓰이게 된 import·필드를 지운다
(내 변경이 만든 것만 — 기존 경고는 건드리지 않는다).

- [ ] **Step 10: 커밋**

```bash
git add lib/core/plan/plan_repository.dart lib/features/reading/reading_screen.dart lib/features/today/today_screen.dart lib/l10n/ test/
git commit -m "feat: 통독 장 롤오버 — 한 장을 끝내면 다음 장으로 전진"
```

---

### Task 7: 플랜 라벨에 주제 반영

주제 플랜의 이름이 지금은 "예언 · 창세기"로만 나온다. 어떤 예언인지 보여준다.

**Files:**
- Modify: `lib/core/plan/plan_label.dart`
- Modify: `lib/features/today/plan_sheet.dart:94-111`, `lib/features/today/today_screen.dart` (`_PlanCard`의 제목)
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Test: `test/plan_label_test.dart` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1의 `PlanView.topics`
- Produces: `planLabel({required String courseTitle, required List<String> sectionTitles, List<String> topicTitles = const [], required AppLocalizations l})`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/plan_label_test.dart`에 추가(기존 파일의 `l`을 얻는 방식을 그대로 쓴다 — 파일을 열어
확인한다):

```dart
  test('주제가 있으면 라벨 끝에 주제가 붙는다', () {
    expect(
      planLabel(
        courseTitle: '예언 성취',
        sectionTitles: ['창세기'],
        topicTitles: ['한 분의 왕'],
        l: l,
      ),
      '예언 성취 · 창세기 · 한 분의 왕',
    );
  });

  test('주제가 없으면 기존 라벨 그대로다', () {
    expect(
      planLabel(courseTitle: '창세기', sectionTitles: ['1장'], l: l),
      planLabel(courseTitle: '창세기', sectionTitles: ['1장'], topicTitles: const [], l: l),
    );
  });
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `flutter test test/plan_label_test.dart`
Expected: 컴파일 실패 — `planLabel`에 `topicTitles` 인자 없음.

- [ ] **Step 3: l10n 키를 추가한다**

`lib/l10n/app_ko.arb`:

```json
  "planLabelTopic": "{scope} · {topic}",
  "@planLabelTopic": {
    "placeholders": { "scope": { "type": "String" }, "topic": { "type": "String" } }
  },
```

`lib/l10n/app_en.arb`: 같은 키, 같은 값(`"{scope} · {topic}"`).

Run: `flutter gen-l10n`

- [ ] **Step 4: `planLabel`을 고친다**

`lib/core/plan/plan_label.dart`:

```dart
String planLabel({
  required String courseTitle,
  required List<String> sectionTitles,
  List<String> topicTitles = const [],
  required AppLocalizations l,
}) {
  final scope = _scopeLabel(courseTitle, sectionTitles, l);
  if (topicTitles.isEmpty) return scope;
  // 주제는 단일선택이라 첫 항목만 붙인다.
  return l.planLabelTopic(scope, topicTitles.first);
}

String _scopeLabel(String courseTitle, List<String> sectionTitles, AppLocalizations l) {
  if (sectionTitles.isEmpty) return courseTitle;
  if (sectionTitles.length == 1) {
    return l.planLabelOne(courseTitle, sectionTitles.first);
  }
  return l.planLabelMany(courseTitle, sectionTitles.first, sectionTitles.length - 1);
}
```

- [ ] **Step 5: 호출부에서 주제를 넘긴다**

`lib/features/today/plan_sheet.dart` — 로케일에 맞는 주제명이 필요하다. `PlanView.topics`는
한글 원문이므로 영문 로케일에서는 `course_items.topic_en`으로 바꿔야 한다. 프로바이더를
추가한다 — `lib/app/providers.dart`의 `planSectionTitlesProvider` 아래:

```dart
/// 활성 플랜이 대상으로 삼은 주제의 (한글, 영문) 쌍. 플랜 라벨이 로케일에 맞는
/// 이름을 고르는 데 쓴다 — plan.topics는 한글 원문 스냅샷이다.
final planTopicTitlesProvider = FutureProvider.autoDispose
    .family<List<(String, String)>, String>((ref, mode) async {
  final view = await ref.watch(mode == 'reading'
      ? readingPlanViewProvider.future
      : memorizePlanViewProvider.future);
  final topics = view?.topics;
  if (view == null || topics == null) return const [];
  final items = await ref
      .watch(courseRepositoryProvider)
      .listItemsByCourse(view.plan.courseId, topics: topics);
  final en = <String, String>{};
  for (final i in items) {
    en.putIfAbsent(i.topic, () => i.topicEn);
  }
  // plan.topics의 순서를 유지한다.
  return [for (final t in topics) (t, en[t] ?? '')];
});
```

`plan_sheet.dart`의 build에서:

```dart
    final topicPairs = ref.watch(planTopicTitlesProvider(view.mode)).valueOrNull ?? const [];
    final topicTitles = topicPairs
        .map((p) => locale == 'en' && p.$2.isNotEmpty ? p.$2 : p.$1)
        .toList();
```

```dart
            planLabel(
              courseTitle: courseTitle,
              sectionTitles: sectionTitles,
              topicTitles: topicTitles,
              l: l,
            ),
```

`today_screen.dart`의 `_PlanCard`가 `planLabel`을 쓰고 있으면 같은 방식으로 주제를 넘긴다.
`planTitle`만 쓰고 `planLabel`을 안 쓰면 이 파일은 건드리지 않는다 — 먼저 확인한다:
`grep -n "planLabel" lib/features/today/today_screen.dart`

- [ ] **Step 6: 테스트가 통과하는 것을 확인한다**

Run: `flutter test test/plan_label_test.dart test/plan_sheet_test.dart`
Expected: 전부 PASS

- [ ] **Step 7: 전체 검증**

Run: `flutter test && flutter analyze`
Expected: 전부 PASS, No issues found.

- [ ] **Step 8: 커밋**

```bash
git add lib/core/plan/plan_label.dart lib/features/today/plan_sheet.dart lib/features/today/today_screen.dart lib/app/providers.dart lib/l10n/ test/
git commit -m "feat: 플랜 라벨에 예언 주제 표시"
```

---

## 수동 확인 (마지막 태스크 뒤)

시뮬레이터에서 한 번 손으로 훑는다. 자동 테스트가 못 잡는 건 흐름의 어색함이다.

- [ ] 플랜 만들기 → 암송 → 목록 순서가 기초·주기도문·워밍업·예언 성취·구약·신약인지.
- [ ] 예언 성취 → 이사야 → 주제 칩이 뜨고, 하나 탭 → 마감 단계의 "총 N절"이 한 자리 수인지
      (1,199절이나 447절이 아닌지).
- [ ] 그 플랜으로 Today에서 "이어서 외우기" → 절이 주제 안에서만 이어지는지.
- [ ] 구약 → 창세기 → 장 단계에서 뒤로 두 번 → 대상 목록으로 돌아오는지. Android 시스템
      백도 같은지.
- [ ] 통독 → 창세기 → 1장 → 마감 단계 없이 바로 Today로 가는지, 카드에 D-day가 없고
      연속 일수가 보이는지.
- [ ] 통독으로 1장을 끝내고 '다음 장' → 플랜이 2장으로 바뀌는지.
