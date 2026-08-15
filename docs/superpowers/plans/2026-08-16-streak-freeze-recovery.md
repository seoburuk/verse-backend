# 스트릭 프리즈 + 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스트릭이 하루(또는 이틀) 공백에도 자동으로 지켜지는 프리즈, 그리고 실제로 끊긴 뒤 48시간 이내 광고로 되살리는 복구를 구현한다.

**Architecture:** `StreakState` 테이블에 프리즈/끊김 관련 컬럼 4개를 추가하고, `StreakRepository.recordActivityToday()`에 프리즈 소모/지급 로직을 통합한다. 표시용 `current()`도 프리즈가 공백을 커버할 상황이면 끊긴 것처럼 보이지 않도록 함께 고친다. 복구는 새 메서드 2개(`canRecover`/`recoverStreak`)로, UI는 기존 오늘 화면의 배지·배너 패턴을 재사용한다.

**Tech Stack:** Flutter/Dart, `drift`(스키마 마이그레이션), Riverpod, `flutter_test`.

## Global Constraints

- 프리즈 최대 보유 2개, `currentLen`이 7의 배수를 새로 넘을 때마다 자동 1개 지급(클램프).
- "gap"(오늘-lastDay 날짜 차이)과 "missedDays"(실제로 건너뛴 날 수)는 다르다 — `missedDays = gap - 1`.
  gap=1이면 missedDays=0(정상 연속), gap=2면 missedDays=1(하루 건너뜀), gap=3이면 missedDays=2.
  프리즈는 missedDays만큼 소모하며, `missedDays <= freezeCount`면 스트릭이 안 끊긴다. 이 구분을 헷갈리면
  오프바이원 버그가 나므로 모든 태스크에서 반드시 `missedDays` 기준으로 계산한다.
- 스트릭이 실제로 끊기면(missedDays > freezeCount) 끊기기 직전 `currentLen`을 `brokenFromLen`에,
  끊긴 게 감지된 로컬 날짜를 `brokenOnDay`에 기록. 복구 기한은 `brokenOnDay`(로컬 자정)로부터 48시간.
- 기존 사용자는 새 컬럼 전부 기본값(0/0/null/null)에서 시작 — 소급 지급/복구 없음.

---

### Task 1: `StreakState` 스키마에 프리즈/끊김 컬럼 추가

**Files:**
- Modify: `verse-flutter/lib/core/db/app_database.dart` (StreakState 테이블, migration, schemaVersion)
- Test: `verse-flutter/test/app_database_migration_test.dart`(신규 파일)

**Interfaces:**
- Produces: `StreakStateData`에 `freezeCount`(int, 기본 0), `freezeGrantedAtLen`(int, 기본 0),
  `brokenFromLen`(int?, nullable), `brokenOnDay`(String?, nullable) 필드가 생김. 이후 태스크가 이 필드를
  읽고 쓴다.

- [ ] **Step 1: 실패하는 마이그레이션 테스트 작성**

`verse-flutter/test/app_database_migration_test.dart` 신규 작성:

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';

void main() {
  test('새 DB는 StreakState에 freeze 관련 컬럼이 기본값으로 채워져 생성된다', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await db.into(db.streakState).insertOnConflictUpdate(
          const StreakStateCompanion(id: Value(0), currentLen: Value(3), longestLen: Value(3)),
        );
    final row =
        await (db.select(db.streakState)..where((t) => t.id.equals(0))).getSingle();

    expect(row.freezeCount, 0);
    expect(row.freezeGrantedAtLen, 0);
    expect(row.brokenFromLen, isNull);
    expect(row.brokenOnDay, isNull);
  });
}
```

(`Value`는 `package:drift/drift.dart`에서 온다 — 파일 상단에 `import 'package:drift/drift.dart';` 추가.)

- [ ] **Step 2: 테스트 실행해서 컴파일 에러 확인**

Run: `cd verse-flutter && flutter test test/app_database_migration_test.dart`
Expected: FAIL — `freezeCount` 등의 게터가 `StreakStateData`에 없어 컴파일 에러.

- [ ] **Step 3: 스키마 수정**

`verse-flutter/lib/core/db/app_database.dart`의 `StreakState` 테이블 정의:

변경 전:
```dart
/// 단일 행(id=0) 스트릭 상태. 로컬 자정 기준 계산.
class StreakState extends Table {
  IntColumn get id => integer().withDefault(const Constant(0))();
  IntColumn get currentLen => integer().withDefault(const Constant(0))();
  IntColumn get longestLen => integer().withDefault(const Constant(0))();
  TextColumn get lastDay => text().nullable()(); // YYYY-MM-DD (로컬 자정 기준)

  @override
  Set<Column> get primaryKey => {id};
}
```

변경 후:
```dart
/// 단일 행(id=0) 스트릭 상태. 로컬 자정 기준 계산.
class StreakState extends Table {
  IntColumn get id => integer().withDefault(const Constant(0))();
  IntColumn get currentLen => integer().withDefault(const Constant(0))();
  IntColumn get longestLen => integer().withDefault(const Constant(0))();
  TextColumn get lastDay => text().nullable()(); // YYYY-MM-DD (로컬 자정 기준)

  /// 보유 프리즈 개수. 최대 2, currentLen이 7의 배수를 새로 넘을 때마다 자동 지급.
  IntColumn get freezeCount => integer().withDefault(const Constant(0))();

  /// 마지막으로 프리즈를 지급한 시점의 currentLen(7의 배수) — 같은 배수에서
  /// 중복 지급되지 않도록 추적한다. 스트릭이 끊기면 0으로 리셋.
  IntColumn get freezeGrantedAtLen => integer().withDefault(const Constant(0))();

  /// 스트릭이 실제로 끊기기 직전의 currentLen. 복구 시 이 값으로 되돌린다.
  /// 끊긴 적이 없거나 이미 복구/만료됐으면 null.
  IntColumn get brokenFromLen => integer().nullable()();

  /// 스트릭이 끊긴 로컬 날짜(YYYY-MM-DD). 48시간 복구 기한 판정용.
  TextColumn get brokenOnDay => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}
```

`schemaVersion` 게터:

변경 전:
```dart
  int get schemaVersion => 5;
```

변경 후:
```dart
  int get schemaVersion => 6;
```

`migration`의 `onUpgrade` 마지막에 추가:

```dart
          if (from < 6) {
            await m.addColumn(streakState, streakState.freezeCount);
            await m.addColumn(streakState, streakState.freezeGrantedAtLen);
            await m.addColumn(streakState, streakState.brokenFromLen);
            await m.addColumn(streakState, streakState.brokenOnDay);
          }
```

- [ ] **Step 4: 코드 생성**

Run: `cd verse-flutter && dart run build_runner build --delete-conflicting-outputs`
Expected: `app_database.g.dart`가 `StreakStateData`/`StreakStateCompanion`에 새 필드를 반영해 재생성됨.

- [ ] **Step 5: `StreakStateData`를 직접 생성하는 기존 테스트 헬퍼 갱신**

`StreakStateData`의 새 필드는 기본값 없는 필수 생성자 인자다(drift Data 클래스는 DB 기본값과 무관하게
모든 컬럼을 필수 인자로 받는다). `StreakStateData(...)`를 직접 호출하는 곳이 프로덕션 코드(Task 2에서
갱신 예정) 외에 테스트 헬퍼 2곳 있다 — 지금 고치지 않으면 이 시점부터 전체 테스트 스위트가 컴파일 실패한다.

`verse-flutter/test/streak_danger_test.dart:5-6`:

변경 전:
```dart
StreakStateData _streak(int len, String? lastDay) =>
    StreakStateData(id: 0, currentLen: len, longestLen: len, lastDay: lastDay);
```

변경 후:
```dart
StreakStateData _streak(int len, String? lastDay, {int freezeCount = 0}) => StreakStateData(
    id: 0, currentLen: len, longestLen: len, lastDay: lastDay,
    freezeCount: freezeCount, freezeGrantedAtLen: 0, brokenFromLen: null, brokenOnDay: null);
```

`verse-flutter/test/mascot_mood_test.dart:10-11`:

변경 전:
```dart
StreakStateData _streak(String? lastDay) =>
    StreakStateData(id: 0, currentLen: 3, longestLen: 5, lastDay: lastDay);
```

변경 후:
```dart
StreakStateData _streak(String? lastDay) => StreakStateData(
    id: 0, currentLen: 3, longestLen: 5, lastDay: lastDay,
    freezeCount: 0, freezeGrantedAtLen: 0, brokenFromLen: null, brokenOnDay: null);
```

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/app_database_migration_test.dart test/streak_danger_test.dart test/mascot_mood_test.dart`
Expected: PASS (전체 — `_streak` 시그니처가 바뀌었을 뿐 기존 호출부는 위치 인자만 쓰므로 그대로 컴파일된다).

- [ ] **Step 7: 커밋**

```bash
cd verse-flutter
git add lib/core/db/app_database.dart lib/core/db/app_database.g.dart test/app_database_migration_test.dart test/streak_danger_test.dart test/mascot_mood_test.dart
git commit -m "feat: StreakState에 프리즈/복구 컬럼 추가(schemaVersion 6)"
```

---

### Task 2: `StreakRepository` 프리즈 소모/지급 + 복구 로직

**Files:**
- Modify: `verse-flutter/lib/core/db/lives_streak_repository.dart`
- Test: `verse-flutter/test/lives_streak_repository_test.dart`

**Interfaces:**
- Consumes: Task 1의 `StreakStateData` 새 필드.
- Produces: `StreakRepository.canRecover()`(`Future<bool>`), `StreakRepository.recoverStreak()`(`Future<void>`) —
  Task 4(UI)가 이 두 메서드를 쓴다. `recordActivityToday()`/`current()`의 반환 타입·시그니처는 그대로,
  내부 로직만 확장.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/lives_streak_repository_test.dart`의 `StreakRepository` 그룹 끝(마지막 테스트 뒤,
그룹 닫는 `});` 이전)에 추가:

```dart
    test('missedDays=1이고 freezeCount>=1이면 프리즈 1개 소모하고 스트릭이 안 끊긴다', () async {
      final twoDaysAgo = DateTime.now().subtract(const Duration(days: 2));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(3),
              longestLen: const Value(3),
              lastDay: Value(_localDay(twoDaysAgo)),
              freezeCount: const Value(1),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 4, reason: '스트릭이 끊기지 않고 이어짐');
      expect(state.freezeCount, 0, reason: '프리즈 1개 소모');
    });

    test('missedDays=2이고 freezeCount=2면 둘 다 소모해서 이틀 공백도 막아준다', () async {
      final threeDaysAgo = DateTime.now().subtract(const Duration(days: 3));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(5),
              longestLen: const Value(5),
              lastDay: Value(_localDay(threeDaysAgo)),
              freezeCount: const Value(2),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 6);
      expect(state.freezeCount, 0);
    });

    test('missedDays가 freezeCount를 넘으면 리셋되고 brokenFromLen/brokenOnDay가 기록된다', () async {
      final threeDaysAgo = DateTime.now().subtract(const Duration(days: 3));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(5),
              longestLen: const Value(5),
              lastDay: Value(_localDay(threeDaysAgo)),
              freezeCount: const Value(1), // missedDays=2 > freezeCount=1
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 1, reason: '리셋');
      expect(state.brokenFromLen, 5, reason: '끊기기 직전 값 보존');
      expect(state.brokenOnDay, _localDay(DateTime.now()));
      expect(state.freezeGrantedAtLen, 0);
    });

    test('currentLen이 7의 배수를 새로 넘으면 프리즈가 1개 지급된다', () async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(6),
              longestLen: const Value(6),
              lastDay: Value(_localDay(yesterday)),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 7);
      expect(state.freezeCount, 1);
      expect(state.freezeGrantedAtLen, 7);
    });

    test('프리즈는 최대 2개로 클램프된다', () async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(13),
              longestLen: const Value(13),
              lastDay: Value(_localDay(yesterday)),
              freezeCount: const Value(2),
              freezeGrantedAtLen: const Value(7),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 14);
      expect(state.freezeCount, 2, reason: '이미 최대치라 추가 지급 없음');
      expect(state.freezeGrantedAtLen, 14);
    });

    test('canRecover: brokenOnDay가 48시간 이내면 true', () async {
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(1),
              longestLen: const Value(5),
              brokenFromLen: const Value(5),
              brokenOnDay: Value(_localDay(DateTime.now())),
            ),
          );
      final streak = StreakRepository(db);
      expect(await streak.canRecover(), isTrue);
    });

    test('canRecover: brokenOnDay가 48시간을 넘겼으면 false', () async {
      final threeDaysAgo = DateTime.now().subtract(const Duration(days: 3));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(1),
              longestLen: const Value(5),
              brokenFromLen: const Value(5),
              brokenOnDay: Value(_localDay(threeDaysAgo)),
            ),
          );
      final streak = StreakRepository(db);
      expect(await streak.canRecover(), isFalse);
    });

    test('canRecover: brokenFromLen이 없으면 false', () async {
      final streak = StreakRepository(db);
      expect(await streak.canRecover(), isFalse);
    });

    test('recoverStreak: currentLen을 brokenFromLen으로 복원하고 브로큰 상태를 지운다', () async {
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(1),
              longestLen: const Value(5),
              brokenFromLen: const Value(5),
              brokenOnDay: Value(_localDay(DateTime.now())),
            ),
          );
      final streak = StreakRepository(db);
      await streak.recoverStreak();

      final row = await streak.current();
      expect(row!.currentLen, 5);
      expect(row.brokenFromLen, isNull);
      expect(row.brokenOnDay, isNull);
      expect(row.lastDay, _localDay(DateTime.now()));
    });
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/lives_streak_repository_test.dart`
Expected: FAIL — `canRecover`/`recoverStreak` 미정의로 컴파일 에러, 나머지는 기존 로직이 프리즈를
전혀 다루지 않아 값 불일치.

- [ ] **Step 3: `recordActivityToday`/`current` 구현 교체 + 신규 메서드 추가**

`verse-flutter/lib/core/db/lives_streak_repository.dart`의 `StreakRepository` 클래스 전체를 다음으로 교체
(`import 'dart:math';` 를 파일 최상단에 추가):

```dart
/// verse-backend/internal/service/streak_service.go 로직을 로컬로 이식.
/// 로컬 자정(기기 타임존) 기준 "오늘" 문자열로 연속일을 판정한다. 서버는
/// 여전히 UTC 기준이라(streak_service.go 주석 참조) 서버 통계와 이 값이
/// 다르게 보일 수 있다 — 알려진 제약, 서버 정합은 별도 과제.
///
/// 프리즈: currentLen이 7의 배수를 새로 넘을 때마다 1개 자동 지급(최대 2개).
/// 활동 공백이 missedDays(=gap-1)만큼 생겨도 보유 프리즈로 그만큼 커버되면
/// 스트릭이 끊기지 않는다. 커버 못 하면 리셋되며 그 직전 값을 48시간 동안
/// [recoverStreak]로 되살릴 수 있다.
class StreakRepository {
  StreakRepository(this._db);
  final AppDatabase _db;
  static const _maxFreeze = 2;
  static const _freezeIntervalDays = 7;

  int _gapDays(String lastDay, String today) =>
      DateTime.parse(today).difference(DateTime.parse(lastDay)).inDays;

  Future<StreakStateData> recordActivityToday() async {
    final row = await (_db.select(_db.streakState)..where((t) => t.id.equals(0))).getSingleOrNull();
    final today = todayLocalString();

    if (row == null || row.lastDay == null) {
      final fresh = StreakStateCompanion.insert(
        id: const Value(0),
        currentLen: const Value(1),
        longestLen: const Value(1),
        lastDay: Value(today),
      );
      await _db.into(_db.streakState).insertOnConflictUpdate(fresh);
      return StreakStateData(
          id: 0, currentLen: 1, longestLen: 1, lastDay: today,
          freezeCount: 0, freezeGrantedAtLen: 0, brokenFromLen: null, brokenOnDay: null);
    }

    if (row.lastDay == today) return row; // 오늘 이미 기록됨

    final gap = _gapDays(row.lastDay!, today);
    final missedDays = gap - 1;

    int newCurrent;
    var newFreezeCount = row.freezeCount;
    var newFreezeGrantedAtLen = row.freezeGrantedAtLen;
    int? newBrokenFromLen = row.brokenFromLen;
    String? newBrokenOnDay = row.brokenOnDay;

    if (missedDays <= row.freezeCount) {
      // 정상 연속(missedDays<=0)이거나 프리즈로 커버되는 공백 — 스트릭 유지.
      newCurrent = row.currentLen + 1;
      if (missedDays > 0) newFreezeCount = row.freezeCount - missedDays;
    } else {
      if (row.currentLen >= 1) {
        newBrokenFromLen = row.currentLen;
        newBrokenOnDay = today;
      }
      newCurrent = 1;
      newFreezeGrantedAtLen = 0;
    }

    if (newCurrent >= newFreezeGrantedAtLen + _freezeIntervalDays) {
      newFreezeCount = min(newFreezeCount + 1, _maxFreeze);
      newFreezeGrantedAtLen = (newCurrent ~/ _freezeIntervalDays) * _freezeIntervalDays;
    }

    final newLongest = newCurrent > row.longestLen ? newCurrent : row.longestLen;

    await (_db.update(_db.streakState)..where((t) => t.id.equals(0))).write(
      StreakStateCompanion(
        currentLen: Value(newCurrent),
        longestLen: Value(newLongest),
        lastDay: Value(today),
        freezeCount: Value(newFreezeCount),
        freezeGrantedAtLen: Value(newFreezeGrantedAtLen),
        brokenFromLen: Value(newBrokenFromLen),
        brokenOnDay: Value(newBrokenOnDay),
      ),
    );
    return StreakStateData(
      id: 0,
      currentLen: newCurrent,
      longestLen: newLongest,
      lastDay: today,
      freezeCount: newFreezeCount,
      freezeGrantedAtLen: newFreezeGrantedAtLen,
      brokenFromLen: newBrokenFromLen,
      brokenOnDay: newBrokenOnDay,
    );
  }

  /// 표시용 조회. 마지막 활동일로부터 생긴 공백이 보유 프리즈로 커버될
  /// 상황이면(다음 활동 시 자동으로 안 끊길 예정이면) 아직 끊긴 것처럼
  /// 보여주지 않는다. 커버 못 할 공백이면 저장값을 건드리지 않고 표시만
  /// 0으로 보정한다(리셋은 [recordActivityToday]에서만 씀).
  Future<StreakStateData?> current() async {
    final row = await (_db.select(_db.streakState)..where((t) => t.id.equals(0))).getSingleOrNull();
    if (row == null || row.lastDay == null) return row;
    final today = todayLocalString();
    if (row.lastDay == today) return row;
    final missedDays = _gapDays(row.lastDay!, today) - 1;
    if (missedDays <= row.freezeCount) return row;
    return row.copyWith(currentLen: 0);
  }

  /// 스트릭이 끊긴 지 48시간 이내인지. brokenOnDay는 로컬 자정 날짜 문자열이라
  /// DateTime.parse하면 그 날의 로컬 자정 인스턴트가 된다.
  Future<bool> canRecover() async {
    final row = await current();
    final brokenOnDay = row?.brokenOnDay;
    if (row?.brokenFromLen == null || brokenOnDay == null) return false;
    final brokenAt = DateTime.parse(brokenOnDay);
    return DateTime.now().difference(brokenAt) <= const Duration(hours: 48);
  }

  /// 보상형 광고 시청 완료 후 호출 — 끊기기 직전 currentLen으로 복원한다.
  Future<void> recoverStreak() async {
    final row = await (_db.select(_db.streakState)..where((t) => t.id.equals(0))).getSingleOrNull();
    if (row?.brokenFromLen == null) return;
    await (_db.update(_db.streakState)..where((t) => t.id.equals(0))).write(
      StreakStateCompanion(
        currentLen: Value(row!.brokenFromLen!),
        lastDay: Value(todayLocalString()),
        brokenFromLen: const Value(null),
        brokenOnDay: const Value(null),
      ),
    );
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/lives_streak_repository_test.dart`
Expected: PASS (전체 — 기존 테스트 포함, `StreakStateData` 생성자 호출부가 있다면 새 필드가 기본값
없이 필수 인자인지 확인해 필요 시 해당 테스트도 갱신).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/core/db/lives_streak_repository.dart test/lives_streak_repository_test.dart
git commit -m "feat: 스트릭 프리즈 소모/지급 및 복구 로직 구현"
```

---

### Task 3: 복귀 알림이 프리즈로 커버되는 공백엔 뜨지 않도록

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart`
- Test: `verse-flutter/test/streak_danger_test.dart`

**Interfaces:**
- Consumes: `StreakStateData.freezeCount`(Task 1)
- Produces: `shouldScheduleComeback`의 공개 시그니처는 그대로(`StreakStateData?`, `String`) — `streak`
  인자에 이미 `freezeCount`가 포함되므로 파라미터 추가 없이 내부에서 바로 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/streak_danger_test.dart`의 `shouldScheduleComeback` 그룹 안, 마지막 테스트
(`'gap=3 이상이면 false ...'`) 뒤에 추가:

```dart
    test('missedDays가 1 이상이고 freezeCount로 커버되면 프리즈가 알아서 지켜주므로 false', () {
      // lastDay가 이틀 전(gap=2, missedDays=1)이고 freezeCount=1이라 정확히 커버된다.
      final covered = _streak(3, '2026-07-14', freezeCount: 1);
      expect(shouldScheduleComeback(covered, today), isFalse);
    });

    test('missedDays=0(gap=1)은 freezeCount와 무관하게 기존 로직을 따른다', () {
      // missedDays=0은 "아직 아무것도 안 놓친" 정상 상태라 프리즈 유무와 무관하게
      // 기존 gap 기준 판단이 그대로 적용돼야 한다(즉 freezeCount>0이라고 무조건
      // 억제되면 안 된다 — 이게 이 함수의 핵심 회귀 포인트).
      final freezeButNotMissed = _streak(3, '2026-07-15', freezeCount: 2);
      expect(shouldScheduleComeback(freezeButNotMissed, today), isTrue);
    });
```

(`today`는 이 그룹 상단에 이미 정의된 `const today = '2026-07-16';`를 그대로 쓴다. `_streak`은 Task 1에서
`freezeCount` named 파라미터가 추가된 버전을 쓴다.)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart --plain-name "프리즈가 알아서"`
Expected: FAIL — 현재 로직은 freezeCount를 안 봐서 true를 반환.

- [ ] **Step 3: 구현 교체**

`verse-flutter/lib/core/notifications/reminder_service.dart`의 `shouldScheduleComeback`:

변경 전:
```dart
bool shouldScheduleComeback(StreakStateData? streak, String todayLocal) {
  final lastDay = streak?.lastDay;
  if (lastDay == null) return false;
  final last = DateTime.parse(lastDay);
  final today = DateTime.parse(todayLocal);
  final gap = today.difference(last).inDays;
  return gap >= 1 && gap <= 2;
}
```

변경 후:
```dart
bool shouldScheduleComeback(StreakStateData? streak, String todayLocal) {
  final lastDay = streak?.lastDay;
  if (lastDay == null) return false;
  final last = DateTime.parse(lastDay);
  final today = DateTime.parse(todayLocal);
  final gap = today.difference(last).inDays;
  final missedDays = gap - 1;
  // missedDays<=0은 "아직 아무것도 안 놓친" 상태라 프리즈와 무관하게 기존 로직을
  // 따른다 — missedDays<=0은 freezeCount(항상 0 이상)와 비교하면 사실 여부와
  // 상관없이 항상 참이 되므로, 실제로 뭔가 놓쳤을 때(missedDays>0)만 프리즈로
  // 커버되는지 확인한다.
  if (missedDays > 0 && missedDays <= (streak?.freezeCount ?? 0)) return false;
  return gap >= 1 && gap <= 2;
}
```

주석(바로 위)도 갱신:

변경 전:
```dart
/// 복귀 유도 알림 예약 판단(순수 함수, 단위 테스트용): 스트릭이 끊긴 뒤
/// 침묵 구간(위험 알림 이후~중단 안내 이전)을 메운다. 목표 발화 시각은
/// lastDay+2일이므로, 그 시각이 아직 오지 않았거나(gap<=2) 당일이면
/// 예약을 유지하고, 이미 지났으면(gap>=3) 뒤늦게 스팸성으로 쏘지 않는다.
```

변경 후:
```dart
/// 복귀 유도 알림 예약 판단(순수 함수, 단위 테스트용): 스트릭이 끊긴 뒤
/// 침묵 구간(위험 알림 이후~중단 안내 이전)을 메운다. 목표 발화 시각은
/// lastDay+2일이므로, 그 시각이 아직 오지 않았거나(gap<=2) 당일이면
/// 예약을 유지하고, 이미 지났으면(gap>=3) 뒤늦게 스팸성으로 쏘지 않는다.
/// 프리즈가 이 공백을 이미 커버하는 상황(missedDays<=freezeCount)이면
/// 어차피 안 끊기므로 예약하지 않는다.
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/core/notifications/reminder_service.dart test/streak_danger_test.dart
git commit -m "fix: 프리즈가 공백을 커버하면 복귀 알림을 예약하지 않도록 변경"
```

---

### Task 4: 오늘 화면에 프리즈 배지 + 복구 배너

**Files:**
- Modify: `verse-flutter/lib/features/today/today_screen.dart`
- Modify: `verse-flutter/lib/l10n/app_ko.arb`, `verse-flutter/lib/l10n/app_en.arb`
- Test: `verse-flutter/test/today_screen_test.dart`

**Interfaces:**
- Consumes: `StreakRepository.canRecover()`/`recoverStreak()`(Task 2), `AdService.showRewarded()`(기존,
  `lib/core/ads/ad_service.dart`), `currentStreakProvider`(기존, `StreakStateData.freezeCount`).

- [ ] **Step 1: l10n 문자열 추가**

`verse-flutter/lib/l10n/app_ko.arb`의 `"memorizeWatchAdForLife"` 줄 다음에 추가:

```json
  "todayStreakBroken": "스트릭이 끊겼어요",
  "todayStreakRecoverCta": "광고 보고 이어하기",
```

`verse-flutter/lib/l10n/app_en.arb`의 대응 위치에 추가:

```json
  "todayStreakBroken": "Your streak broke",
  "todayStreakRecoverCta": "Watch ad to continue",
```

Run: `cd verse-flutter && flutter gen-l10n`
Expected: `lib/l10n/app_localizations*.dart`가 새 게터를 포함해 재생성됨.

- [ ] **Step 2: 실패하는 위젯 테스트 작성 — 프리즈 배지**

`verse-flutter/test/today_screen_test.dart`에 다음 테스트 추가(기존 "활성 플랜이 있으면 오늘 목표를
보여준다" 테스트의 시드 패턴을 참고해 `db.into(db.streakState)`로 `freezeCount`를 채워 시드):

```dart
  testWidgets('프리즈를 보유하면 스트릭 옆에 개수가 표시된다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await db.into(db.streakState).insertOnConflictUpdate(
          StreakStateCompanion.insert(
            id: const Value(0),
            currentLen: const Value(3),
            longestLen: const Value(3),
            lastDay: Value(todayLocalString()),
            freezeCount: const Value(2),
          ),
        );

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

    expect(find.textContaining('❄️'), findsOneWidget);
    expect(find.textContaining('2'), findsWidgets);
  });
```

(`todayLocalString`은 `package:verse_flutter/core/date/local_day.dart`에서 import — 파일 상단에 이미
다른 import가 있으면 그 옆에 추가.)

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/today_screen_test.dart --plain-name "프리즈를 보유하면"`
Expected: FAIL — `❄️` 텍스트가 화면에 없음.

- [ ] **Step 4: 프리즈 배지 구현**

`verse-flutter/lib/features/today/today_screen.dart:200-210`(스트릭 숫자를 보여주는 `Row`):

변경 전:
```dart
        InkWell(
          onTap: () => context.push('/dashboard'),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🔥', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 4),
              Text('${streak?.currentLen ?? 0}', style: theme.textTheme.titleMedium),
              const SizedBox(width: 16),
              const LivesBadge(),
            ],
          ),
        ),
```

변경 후:
```dart
        InkWell(
          onTap: () => context.push('/dashboard'),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🔥', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 4),
              Text('${streak?.currentLen ?? 0}', style: theme.textTheme.titleMedium),
              if ((streak?.freezeCount ?? 0) > 0) ...[
                const SizedBox(width: 8),
                Text('❄️×${streak!.freezeCount}', style: theme.textTheme.bodyMedium),
              ],
              const SizedBox(width: 16),
              const LivesBadge(),
            ],
          ),
        ),
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/today_screen_test.dart --plain-name "프리즈를 보유하면"`
Expected: PASS.

- [ ] **Step 6: 실패하는 위젯 테스트 작성 — 복구 배너**

같은 파일에 추가:

```dart
  testWidgets('스트릭이 끊긴 지 48시간 이내면 복구 배너가 뜬다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await db.into(db.streakState).insertOnConflictUpdate(
          StreakStateCompanion.insert(
            id: const Value(0),
            currentLen: const Value(1),
            longestLen: const Value(5),
            brokenFromLen: const Value(5),
            brokenOnDay: Value(todayLocalString()),
          ),
        );

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

    expect(find.text('스트릭이 끊겼어요'), findsOneWidget);
    expect(find.text('광고 보고 이어하기'), findsOneWidget);
  });
```

- [ ] **Step 7: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/today_screen_test.dart --plain-name "복구 배너"`
Expected: FAIL — 배너 텍스트가 없음.

- [ ] **Step 8: 복구 배너 구현**

`today_screen.dart`에서 `currentStreakProvider`를 읽는 지점(스트릭 배지를 그리는 메서드) 근처에
`FutureProvider`로 `canRecover()`를 노출할 provider를 하나 추가한다. `verse-flutter/lib/app/providers.dart`의
`currentStreakProvider` 정의 바로 다음(245행 부근)에 추가:

```dart
final canRecoverStreakProvider = FutureProvider.autoDispose<bool>(
    (ref) => ref.watch(streakRepositoryProvider).canRecover());
```

`today_screen.dart`에서 스트릭 배지를 감싸는 `Column`(또는 그 바로 위) 앞에 배너를 추가한다. 정확한
위치는 197행 부근 `const SizedBox(height: 8),`(스트릭 배지 Row 앞) 바로 위 — 배너가 있으면 배지 위에
뜨도록 `Consumer` 위젯으로 감싼다:

```dart
        Consumer(builder: (context, ref, _) {
          final canRecover = ref.watch(canRecoverStreakProvider).valueOrNull ?? false;
          if (!canRecover) return const SizedBox.shrink();
          final l = AppLocalizations.of(context)!;
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              children: [
                Text(l.todayStreakBroken, style: theme.textTheme.bodyMedium),
                TextButton(
                  onPressed: () => ref.read(adServiceProvider).showRewarded(
                        onReward: () async {
                          await ref.read(streakRepositoryProvider).recoverStreak();
                          ref.invalidate(currentStreakProvider);
                          ref.invalidate(canRecoverStreakProvider);
                        },
                        onUnavailable: () {},
                      ),
                  child: Text(l.todayStreakRecoverCta),
                ),
              ],
            ),
          );
        }),
```

(정확한 삽입 지점과 기존 `theme`/`l` 변수명은 `today_screen.dart`를 열어 스트릭 배지를 그리는 메서드의
시그니처에 맞춘다 — 이미 `theme`가 지역 변수로 있으면 재선언하지 않는다.)

- [ ] **Step 9: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/today_screen_test.dart`
Expected: PASS (전체).

- [ ] **Step 10: 커밋**

```bash
cd verse-flutter
git add lib/features/today/today_screen.dart lib/app/providers.dart lib/l10n/app_ko.arb lib/l10n/app_en.arb lib/l10n/app_localizations*.dart test/today_screen_test.dart
git commit -m "feat: 오늘 화면에 프리즈 배지와 스트릭 복구 배너 추가"
```

---

### Task 5: 전체 회귀 확인 및 스펙 완료 표시

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-streak-freeze-recovery-design.md`

- [ ] **Step 1: 전체 테스트 + analyze**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS.

Run: `cd verse-flutter && flutter analyze`
Expected: 이번 변경과 관련된 새 이슈 없음.

- [ ] **Step 2: 스펙에 구현 완료 메모 추가 후 커밋**

`docs/superpowers/specs/2026-08-16-streak-freeze-recovery-design.md` 끝에 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-streak-freeze-recovery.md` 계획대로 구현 완료. schemaVersion 5→6,
`StreakRepository`에 프리즈 소모/지급(`missedDays` 기준)과 `canRecover`/`recoverStreak` 추가,
`shouldScheduleComeback`이 프리즈로 커버되는 공백엔 예약하지 않도록 수정, 오늘 화면에 프리즈 배지와
복구 배너 추가.
```

```bash
git add docs/superpowers/specs/2026-08-16-streak-freeze-recovery-design.md
git commit -m "docs: 스트릭 프리즈+복구 스펙에 구현 완료 표시"
```
