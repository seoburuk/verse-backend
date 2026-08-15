# 스트릭/알림 로컬 자정 경계 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `verse-flutter`의 로컬 스트릭 계산과 알림(리마인더/위험/복귀) 예약 판정에서 "오늘"을 UTC 자정이 아닌 기기 로컬 자정 기준으로 계산하도록 바꾼다.

**Architecture:** "오늘 로컬 날짜 문자열('YYYY-MM-DD')"을 계산하는 공용 함수를 하나 만들고, `StreakRepository`와 `ReminderService`에 중복돼 있던 UTC 기준 계산을 이 함수로 교체한다. 저장된 `lastDay` 문자열 포맷과 값 자체는 그대로 두고, 그 값을 파싱/비교하는 로직에서 `.toUtc()` 변환만 제거한다.

**Tech Stack:** Flutter/Dart, `drift`(로컬 SQLite), `timezone`/`flutter_timezone` 패키지(이미 사용 중), `flutter_test`.

## Global Constraints

- 하루 경계는 로컬 자정(00:00, 기기 타임존)이며, 별도 컷오프 시각 없음.
- 기존 저장 데이터(`lastDay` 문자열)는 마이그레이션하지 않는다 — 계산 로직만 교체.
- 타임존 변경(해외여행)·DST로 인한 하루 스킵/중복은 별도 보정하지 않는다(YAGNI).
- 서버(`verse-backend`)는 이번 작업 범위 밖 — UTC 그대로 유지.
- `verse-flutter/features/today/create_plan_screen.dart`의 `_todayUtc()`(암송 계획 마감일 계산용)는 이번 스트릭/알림 경계 문제와 무관하므로 건드리지 않는다.

---

### Task 1: 공용 로컬 날짜 함수 추가

**Files:**
- Create: `verse-flutter/lib/core/date/local_day.dart`
- Test: `verse-flutter/test/core/date/local_day_test.dart`

**Interfaces:**
- Produces: `String todayLocalString()` — 기기 로컬 타임존 기준 오늘 날짜를 `'YYYY-MM-DD'`로 반환. Task 2, 3에서 이 함수를 import해서 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/core/date/local_day_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/date/local_day.dart';

void main() {
  test('로컬 오늘 날짜를 YYYY-MM-DD 형식으로 반환한다', () {
    final now = DateTime.now();
    final expected =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    expect(todayLocalString(), expected);
  });

  test('UTC 변환 없이 로컬 달력 날짜를 그대로 쓴다', () {
    // DateTime.now()의 연/월/일과 정확히 일치해야 한다 — .toUtc()를 거치면
    // UTC와 로컬 타임존이 다른 경우(예: KST) 날짜가 하루 어긋날 수 있다.
    final now = DateTime.now();
    final parts = todayLocalString().split('-');
    expect(int.parse(parts[0]), now.year);
    expect(int.parse(parts[1]), now.month);
    expect(int.parse(parts[2]), now.day);
  });
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/core/date/local_day_test.dart`
Expected: FAIL — `local_day.dart`를 찾을 수 없다는 에러(`Error: Not found: 'package:verse_flutter/core/date/local_day.dart'` 계열).

- [ ] **Step 3: 최소 구현 작성**

`verse-flutter/lib/core/date/local_day.dart`:

```dart
/// 기기 로컬 타임존 기준 오늘 날짜를 'YYYY-MM-DD'로 반환한다.
/// 스트릭 판정(StreakRepository)과 알림 예약 판정(ReminderService)이
/// 동일한 "오늘"의 정의를 공유해야 하므로 두 곳 모두 이 함수를 쓴다.
/// UTC로 변환하지 않는다 — 저장되는 lastDay 문자열도 이 값을 그대로 쓰므로,
/// 여기서 UTC로 바꾸면 다른 곳에서 로컬로 비교할 때 하루가 어긋난다.
String todayLocalString() {
  final now = DateTime.now();
  return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/core/date/local_day_test.dart`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/core/date/local_day.dart test/core/date/local_day_test.dart
git commit -m "feat: 로컬 자정 기준 오늘 날짜 계산 공용 함수 추가"
```

---

### Task 2: `StreakRepository`를 로컬 날짜 기준으로 교체

**Files:**
- Modify: `verse-flutter/lib/core/db/lives_streak_repository.dart:69-128` (`StreakRepository` 클래스 전체)
- Test: `verse-flutter/test/lives_streak_repository_test.dart`

**Interfaces:**
- Consumes: `todayLocalString()` from Task 1 (`package:verse_flutter/core/date/local_day.dart`)
- Produces: `StreakRepository`의 공개 API(`recordActivityToday()`, `current()`)는 시그니처 변경 없음 — 내부 날짜 판정 기준만 로컬로 바뀜.

- [ ] **Step 1: 기존 테스트를 로컬 날짜 기준으로 갱신(실패 상태로 만듦)**

`verse-flutter/test/lives_streak_repository_test.dart` 상단의 `_utcDay` 헬퍼를 `_localDay`로 바꾸고, `DateTime.now().toUtc()`를 쓰던 모든 곳을 `DateTime.now()`(로컬)로 바꾼다. 파일 전체를 아래 내용으로 교체:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/db/lives_streak_repository.dart';

String _localDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

void main() {
  late AppDatabase db;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
  });

  tearDown(() => db.close());

  group('LivesRepository', () {
    test('첫 조회 시 id=0으로 maxLives 채워 생성된다', () async {
      final lives = LivesRepository(db);
      expect(await lives.current(), maxLives);

      final row = await (db.select(db.livesState)..where((t) => t.id.equals(0))).getSingle();
      expect(row.id, 0);
      expect(row.count, maxLives);
    });

    test('consume()는 1을 소모하고 0 밑으로 내려가지 않는다', () async {
      final lives = LivesRepository(db);
      await lives.current(); // seed

      for (var i = 0; i < maxLives; i++) {
        await lives.consume();
      }
      expect(await lives.current(), 0);

      // 추가 소모해도 음수로 내려가지 않음
      final after = await lives.consume();
      expect(after, 0);
    });

    test('경과 시간만큼 리필되고 남은 시간은 이월된다', () async {
      final lives = LivesRepository(db);
      final now = DateTime.now();
      // 리필 주기 2.5회분이 지난 것처럼 updatedAt을 과거로 세팅.
      final past = now.subtract(livesRefillInterval * 2.5);
      await db.into(db.livesState).insertOnConflictUpdate(
            LivesStateCompanion.insert(id: const Value(0), count: const Value(5), updatedAt: past),
          );

      final count = await lives.current();
      expect(count, 7); // 5 + 2회 리필 (0.5회분은 아직 미달)

      final row = await (db.select(db.livesState)..where((t) => t.id.equals(0))).getSingle();
      // 이월된 updatedAt은 "now - 0.5주기" 근방이어야 한다(정확한 리필 시점 보존).
      final expectedCarry = livesRefillInterval * 0.5;
      final diff = row.updatedAt.difference(now.subtract(expectedCarry)).abs();
      expect(diff.inSeconds < 2, isTrue);
    });

    test('이미 가득 찬 경우 리필 계산을 건너뛴다', () async {
      final lives = LivesRepository(db);
      final longAgo = DateTime.now().subtract(const Duration(days: 1));
      await db.into(db.livesState).insertOnConflictUpdate(
            LivesStateCompanion.insert(id: const Value(0), count: const Value(maxLives), updatedAt: longAgo),
          );
      expect(await lives.current(), maxLives);
    });
  });

  group('StreakRepository', () {
    test('최초 기록 시 currentLen=longestLen=1', () async {
      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 1);
      expect(state.longestLen, 1);
      expect(state.lastDay, _localDay(DateTime.now()));
    });

    test('같은 날 두 번 기록해도 증가하지 않는다', () async {
      final streak = StreakRepository(db);
      await streak.recordActivityToday();
      final second = await streak.recordActivityToday();
      expect(second.currentLen, 1);
    });

    test('연속된 다음 날 기록하면 currentLen이 증가한다', () async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(3),
              longestLen: const Value(5),
              lastDay: Value(_localDay(yesterday)),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 4);
      expect(state.longestLen, 5); // 기존 최장 기록 유지
    });

    test('현재 연속 기록이 최장 기록을 넘으면 longestLen도 갱신된다', () async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(5),
              longestLen: const Value(5),
              lastDay: Value(_localDay(yesterday)),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 6);
      expect(state.longestLen, 6);
    });

    test('하루 이상 건너뛰면 currentLen이 1로 리셋된다(자정 롤오버)', () async {
      final longAgo = DateTime.now().subtract(const Duration(days: 3));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(10),
              longestLen: const Value(10),
              lastDay: Value(_localDay(longAgo)),
            ),
          );

      final streak = StreakRepository(db);
      final state = await streak.recordActivityToday();
      expect(state.currentLen, 1);
      expect(state.longestLen, 10); // 최장 기록은 리셋되지 않는다
    });

    test('공백이 발생하면 다음 활동 전에도 current()가 0을 보여준다(저장값은 안 건드림)', () async {
      final longAgo = DateTime.now().subtract(const Duration(days: 3));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(10),
              longestLen: const Value(10),
              lastDay: Value(_localDay(longAgo)),
            ),
          );

      final streak = StreakRepository(db);
      final displayed = await streak.current();
      expect(displayed!.currentLen, 0);
      expect(displayed.longestLen, 10);

      // 저장된 값 자체는 아직 리셋되지 않았다 — recordActivityToday에서만 씀.
      final row = await (db.select(db.streakState)..where((t) => t.id.equals(0))).getSingle();
      expect(row.currentLen, 10);
    });

    test('어제 활동했으면 아직 오늘 기록 전이라도 current()는 끊기지 않은 값을 보여준다', () async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(4),
              longestLen: const Value(5),
              lastDay: Value(_localDay(yesterday)),
            ),
          );

      final streak = StreakRepository(db);
      final displayed = await streak.current();
      expect(displayed!.currentLen, 4);
    });

    test('KST(UTC+9) 오전 8시 활동 후 UTC 기준으론 아직 어제인 시각에도 로컬로는 오늘로 판정된다', () {
      // UTC 기준 오전 8시 KST = 전날 UTC 23시대 — 예전 UTC 로직이었다면
      // lastDay가 "어제"로 저장되어 다음날 오전 8시에 또 기록해도
      // currentLen이 늘지 않는 버그가 있었다. 로컬 날짜만 비교하면
      // 이 시나리오는 발생하지 않는다는 걸 함수 계약으로 문서화한다.
      final localNoon = DateTime(2026, 7, 16, 8, 0);
      expect(_localDay(localNoon), '2026-07-16');
    });
  });
}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/lives_streak_repository_test.dart`
Expected: FAIL — `'최초 기록 시 currentLen=longestLen=1'` 등에서 `state.lastDay`가 `_localDay(DateTime.now())`가 아니라 UTC 날짜라 값이 다를 수 있음(타임존이 UTC와 다른 CI/로컬 환경에서만 실패로 드러남). 만약 개발 환경이 UTC와 동일한 타임존이면 이 단계에서는 아직 통과할 수 있다 — 그 경우 다음 단계로 넘어가되, Step 4에서 최종 확인한다.

- [ ] **Step 3: `StreakRepository` 구현을 로컬 날짜 기준으로 교체**

`verse-flutter/lib/core/db/lives_streak_repository.dart:69-128`을 다음으로 교체(파일 상단 import에 `local_day.dart` 추가):

```dart
import 'package:drift/drift.dart';

import '../date/local_day.dart';
import 'app_database.dart';
```

그리고 `StreakRepository` 클래스 전체:

```dart
/// verse-backend/internal/service/streak_service.go 로직을 로컬로 이식.
/// 로컬 자정(기기 타임존) 기준 "오늘" 문자열로 연속일을 판정한다. 서버는
/// 여전히 UTC 기준이라(streak_service.go 주석 참조) 서버 통계와 이 값이
/// 다르게 보일 수 있다 — 알려진 제약, 서버 정합은 별도 과제.
class StreakRepository {
  StreakRepository(this._db);
  final AppDatabase _db;

  bool _isNextDay(String lastDay, String today) {
    final last = DateTime.parse(lastDay);
    final now = DateTime.parse(today);
    return now.difference(last).inDays == 1;
  }

  Future<StreakStateData> recordActivityToday() async {
    final row = await (_db.select(_db.streakState)..where((t) => t.id.equals(0))).getSingleOrNull();
    final today = todayLocalString();

    if (row == null || row.lastDay == null) {
      // LivesState와 동일한 이유로 id를 명시적으로 0으로 고정한다.
      final fresh = StreakStateCompanion.insert(
        id: const Value(0),
        currentLen: const Value(1),
        longestLen: const Value(1),
        lastDay: Value(today),
      );
      await _db.into(_db.streakState).insertOnConflictUpdate(fresh);
      return StreakStateData(id: 0, currentLen: 1, longestLen: 1, lastDay: today);
    }

    if (row.lastDay == today) return row; // 오늘 이미 기록됨

    final isNext = _isNextDay(row.lastDay!, today);
    final newCurrent = isNext ? row.currentLen + 1 : 1;
    final newLongest = newCurrent > row.longestLen ? newCurrent : row.longestLen;

    await (_db.update(_db.streakState)..where((t) => t.id.equals(0))).write(
      StreakStateCompanion(currentLen: Value(newCurrent), longestLen: Value(newLongest), lastDay: Value(today)),
    );
    return StreakStateData(id: 0, currentLen: newCurrent, longestLen: newLongest, lastDay: today);
  }

  /// 표시용 조회. 마지막 활동일이 오늘도 어제도 아니면(공백 발생) 아직
  /// [recordActivityToday]가 리셋을 저장하지 않았더라도 화면에는 끊긴
  /// 상태(0일)로 보여준다. 저장값 자체는 다음 활동 때 리셋되므로 여기선
  /// 쓰기 없이 표시값만 보정한다.
  Future<StreakStateData?> current() async {
    final row = await (_db.select(_db.streakState)..where((t) => t.id.equals(0))).getSingleOrNull();
    if (row == null || row.lastDay == null) return row;
    final today = todayLocalString();
    if (row.lastDay == today || _isNextDay(row.lastDay!, today)) return row;
    return row.copyWith(currentLen: 0);
  }
}
```

(`LivesRepository` 클래스는 절대 경과 시간 기반이라 변경 없음 — 파일의 나머지 부분은 그대로 둔다.)

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/lives_streak_repository_test.dart`
Expected: PASS (전체)

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/core/db/lives_streak_repository.dart test/lives_streak_repository_test.dart
git commit -m "fix: 스트릭 판정을 UTC 자정에서 로컬 자정 기준으로 변경"
```

---

### Task 3: `ReminderService`와 호출부를 로컬 날짜 기준으로 교체

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart:1-20` (import, `todayUtcString` 삭제), `:23-56`(`shouldPauseReminders`/`shouldScheduleStreakDanger`/`shouldScheduleComeback`), `:305-347`(`refreshComeback`)
- Modify: `verse-flutter/lib/app/providers.dart:210`
- Test: `verse-flutter/test/streak_danger_test.dart`

**Interfaces:**
- Consumes: `todayLocalString()` from Task 1
- Produces: `shouldPauseReminders(StreakStateData?, String)`, `shouldScheduleStreakDanger(StreakStateData?, String)`, `shouldScheduleComeback(StreakStateData?, String)` — 시그니처(파라미터 타입·개수·순서) 동일 유지, 두 번째 인자 의미만 "UTC 오늘 문자열"에서 "로컬 오늘 문자열"로 바뀜. 호출부는 `todayLocalString()`을 넘기면 된다.

- [ ] **Step 1: 테스트를 로컬 날짜 의미로 갱신(먼저 실행해서 통과 여부 확인)**

`verse-flutter/test/streak_danger_test.dart`의 기존 테스트는 날짜 문자열이 UTC든 로컬이든 순수하게 문자열 diff 로직만 검증하므로 값 자체는 바뀌지 않는다. 다만 함수가 실제로 `.toUtc()` 없이 로컬로 비교한다는 걸 확인하는 회귀 테스트를 추가한다. 파일 끝(`milestoneBody` 그룹 다음, 최종 `}` 이전)에 다음 그룹을 추가:

```dart
  group('타임존 경계 회귀', () {
    test('KST 기준 날짜 문자열끼리는 UTC 변환 없이 하루 차이로 정확히 판정된다', () {
      // 예전 로직(.toUtc() 사용)이라면 '2026-07-15' 같은 로컬 날짜 문자열을
      // DateTime.parse 후 .toUtc()로 바꾸면서 시간대만큼 시각이 밀려
      // 자정 근처 날짜에서 diff가 이상해질 수 있었다. 지금은 순수 날짜
      // 문자열 diff만 쓰므로 항상 정확히 1일 차이로 나와야 한다.
      expect(shouldScheduleStreakDanger(_streak(3, '2026-07-15'), '2026-07-16'), isTrue);
      expect(shouldScheduleComeback(_streak(3, '2026-07-15'), '2026-07-16'), isTrue);
      expect(shouldPauseReminders(_streak(0, '2026-07-09'), '2026-07-16'), isTrue);
    });
  });
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: 이 시점엔 아직 구현이 안 바뀌었으므로 기존 로직 그대로 PASS할 수 있다(순수 문자열 diff라 UTC/로컬 차이가 이 테스트만으로는 안 드러남) — 정상이다. Step 4에서 실제 구현 교체 후 반드시 다시 실행해 계속 PASS하는지 확인한다.

- [ ] **Step 3: `reminder_service.dart` 구현 교체**

파일 상단 import 블록(`reminder_service.dart:1-9`)을 다음으로 교체:

```dart
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

import '../date/local_day.dart';
import '../db/app_database.dart';
import '../db/lives_streak_repository.dart';
import 'reminder_repository.dart';
```

`todayUtcString()` 함수 정의(`reminder_service.dart:15-20`)를 삭제한다(더 이상 필요 없음 — `local_day.dart`의 `todayLocalString()`으로 대체).

`shouldPauseReminders`, `shouldScheduleStreakDanger`, `shouldScheduleComeback`(`reminder_service.dart:23-56`)을 다음으로 교체:

```dart
/// 자동 중단 판단(순수 함수): 활동 기록이 있고 마지막 활동일로부터 7일
/// 이상 공백이면 true. 기록이 아예 없으면(신규 사용자) 기준이 없으므로 false.
/// todayLocal은 [todayLocalString]로 계산한 로컬 자정 기준 오늘 날짜.
bool shouldPauseReminders(StreakStateData? streak, String todayLocal) {
  final lastDay = streak?.lastDay;
  if (lastDay == null) return false;
  final last = DateTime.parse(lastDay);
  final today = DateTime.parse(todayLocal);
  return today.difference(last).inDays >= 7;
}

/// 위험 알림 예약 판단(순수 함수, 단위 테스트용): 어제까지 이어진 살아있는
/// 스트릭이 있고 오늘 아직 활동하지 않았을 때만 true. 오늘 이미 했거나,
/// 스트릭이 이미 끊겼거나(이틀 이상 공백), 기록이 없으면 지킬 것이 없다.
bool shouldScheduleStreakDanger(StreakStateData? streak, String todayLocal) {
  final lastDay = streak?.lastDay;
  if (lastDay == null || streak!.currentLen <= 0) return false;
  if (lastDay == todayLocal) return false;
  final last = DateTime.parse(lastDay);
  final today = DateTime.parse(todayLocal);
  return today.difference(last).inDays == 1;
}

/// 복귀 유도 알림 예약 판단(순수 함수, 단위 테스트용): 스트릭이 끊긴 뒤
/// 침묵 구간(위험 알림 이후~중단 안내 이전)을 메운다. 목표 발화 시각은
/// lastDay+2일이므로, 그 시각이 아직 오지 않았거나(gap<=2) 당일이면
/// 예약을 유지하고, 이미 지났으면(gap>=3) 뒤늦게 스팸성으로 쏘지 않는다.
bool shouldScheduleComeback(StreakStateData? streak, String todayLocal) {
  final lastDay = streak?.lastDay;
  if (lastDay == null) return false;
  final last = DateTime.parse(lastDay);
  final today = DateTime.parse(todayLocal);
  final gap = today.difference(last).inDays;
  return gap >= 1 && gap <= 2;
}
```

`refreshStreakDanger` 안의 `final todayUtc = todayUtcString();`(`reminder_service.dart:258` 부근)를 `final todayLocal = todayLocalString();`로 바꾸고, 같은 메서드 안에서 `todayUtc`를 참조하는 나머지 부분도 `todayLocal`로 이름을 맞춘다(`shouldScheduleStreakDanger(streak, todayUtc)` → `shouldScheduleStreakDanger(streak, todayLocal)`, `streak?.lastDay == todayUtc` → `streak?.lastDay == todayLocal`).

`refreshComeback` 메서드(`reminder_service.dart:305` 부근)를 다음으로 교체:

```dart
  Future<void> refreshComeback({required ReminderSettings settings, required String locale}) async {
    await _ensureInitialized();
    if (!settings.enabled) {
      await _plugin.cancel(_comebackNotificationId);
      return;
    }

    final streak = await _streakRepository.current();
    final todayLocal = todayLocalString();

    if (!shouldScheduleComeback(streak, todayLocal)) {
      await _plugin.cancel(_comebackNotificationId);
      return;
    }

    final lastDay = DateTime.parse(streak!.lastDay!);
    final targetDate = lastDay.add(const Duration(days: 2));
    final localTarget = tz.TZDateTime(
      tz.local,
      targetDate.year,
      targetDate.month,
      targetDate.day,
      settings.hour,
      settings.minute,
    );
    final now = tz.TZDateTime.now(tz.local);
    final when = localTarget.isBefore(now) ? now.add(const Duration(minutes: 1)) : localTarget;

    final gap = DateTime.parse(todayLocal).difference(lastDay).inDays;
    final body = _comebackBody(gap, locale);

    await _zonedSchedule(
      _comebackNotificationId,
      locale == 'en' ? 'Come back anytime' : '언제든 다시 시작해요',
      body,
      when,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _comebackChannelId,
          '복귀 유도 알림',
          channelDescription: '스트릭이 끊긴 뒤 부담 없이 복귀를 권합니다',
          importance: Importance.defaultImportance,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: notificationPayloadComeback,
    );
  }
```

- [ ] **Step 4: 호출부 갱신 — `providers.dart`**

`verse-flutter/lib/app/providers.dart:210`:

변경 전:
```dart
        !reminder.paused && shouldPauseReminders(streak, todayUtcString());
```

변경 후:
```dart
        !reminder.paused && shouldPauseReminders(streak, todayLocalString());
```

파일 상단 import에 `import '../core/date/local_day.dart';`가 없으면 추가한다(기존에 `todayUtcString`이 `reminder_service.dart`를 통해 export되어 별도 import 없이 쓰였는지 확인 — `providers.dart`가 이미 `reminder_service.dart`를 import하고 있다면, `todayUtcString`을 삭제했으므로 `local_day.dart` import를 새로 추가해야 한다).

- [ ] **Step 5: 전체 관련 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart test/lives_streak_repository_test.dart test/core/date/local_day_test.dart`
Expected: PASS (전체)

Run: `cd verse-flutter && flutter analyze`
Expected: `todayUtcString` 미사용/미정의 관련 에러 없음(모든 참조가 `todayLocalString`로 교체됐는지 확인).

- [ ] **Step 6: 커밋**

```bash
cd verse-flutter
git add lib/core/notifications/reminder_service.dart lib/app/providers.dart test/streak_danger_test.dart
git commit -m "fix: 알림 예약 판정을 UTC 자정에서 로컬 자정 기준으로 변경"
```

---

### Task 4: 전체 회귀 확인 및 스펙 문서 갱신

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-local-day-streak-boundary-design.md` (구현 완료 표시)

**Interfaces:**
- Consumes: Task 1~3에서 완성된 코드 전체
- Produces: 없음(검증 및 문서 마무리 태스크)

- [ ] **Step 1: 전체 Flutter 테스트 스위트 실행**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS, 실패 0건 (기존 173개 기준 + 이번에 추가한 테스트 포함).

- [ ] **Step 2: `todayUtcString`/UTC 잔재 검색으로 누락 확인**

Run: `cd verse-flutter && grep -rn "todayUtcString\|_todayUtc\b" lib`
Expected: 결과 없음(모두 `todayLocalString`로 교체됨). 단, `features/today/create_plan_screen.dart`의 `_todayUtc()`는 이번 스코프 밖(암송 계획 마감일 계산용)이므로 남아있는 게 정상 — 이 파일만 결과에 남아있어야 한다.

- [ ] **Step 3: 스펙 문서에 구현 완료 메모 추가**

`docs/superpowers/specs/2026-08-16-local-day-streak-boundary-design.md` 맨 끝에 다음 섹션 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-local-day-streak-boundary.md` 계획대로 구현 완료.
`todayLocalString()`(`lib/core/date/local_day.dart`) 공용 함수로 통합, `StreakRepository`와
`ReminderService`의 날짜 판정을 로컬 자정 기준으로 교체.
```

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-08-16-local-day-streak-boundary-design.md
git commit -m "docs: 로컬 자정 경계 전환 스펙에 구현 완료 표시"
```
