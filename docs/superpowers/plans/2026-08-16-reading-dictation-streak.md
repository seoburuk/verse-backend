# 통독/받아쓰기 스트릭 인정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통독과 받아쓰기(암송의 dictation 모드) 완료 시점에 `StreakRepository.recordActivityToday()`를 호출해 스트릭이 오르게 한다.

**Architecture:** 기존 `memorize_controller.dart`가 이미 쓰는 `recordActivityToday()` 호출 패턴을 두 곳에 추가한다. `ReadingController`는 `ref` 없이 저장소를 직접 주입받는 구조라 `StreakRepository`를 새 생성자 인자로 추가한다.

**Tech Stack:** Flutter/Dart, Riverpod, `flutter_test`.

## Global Constraints

- `recordActivityToday()`는 같은 로컬 날짜에 여러 번 불러도 안전(멱등) — 매 절 완료마다 호출해도 된다.
- 리마인더(위험 경고/복귀 알림) 즉시 재계산은 이번 스펙 범위 밖 — 스트릭 상태 갱신만 다룬다.

---

### Task 1: `ReadingController`에 스트릭 기록 추가

**Files:**
- Modify: `verse-flutter/lib/features/reading/reading_controller.dart:85-141`
- Modify: `verse-flutter/lib/app/providers.dart:299`
- Test: `verse-flutter/test/reading_controller_test.dart`, `verse-flutter/test/reading_ad_wiring_test.dart`

**Interfaces:**
- Consumes: `StreakRepository`(`package:verse_flutter/core/db/lives_streak_repository.dart`)의 기존 `recordActivityToday()`
- Produces: `ReadingController` 생성자 시그니처 변경 — 두 번째 위치 인자로 `StreakRepository`가 추가됨
  (`ReadingController(_reading, _streak, verses, startIndex, {...})`). 이 시그니처를 쓰는 다른 테스트
  파일이 있으면 함께 갱신해야 한다.

- [ ] **Step 1: 생성자 시그니처 변경 대상 파일 확인**

Run: `cd verse-flutter && grep -rn "ReadingController(" lib test`
Expected: `lib/features/reading/reading_controller.dart`(정의), `lib/app/providers.dart`(생성),
`test/reading_ad_wiring_test.dart`, `test/reading_controller_test.dart`(테스트에서 직접 생성) — 이 네 곳만
나와야 한다. 더 있으면 이 태스크에서 함께 갱신한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`test/reading_controller_test.dart` 상단 import에 다음 추가:

```dart
import 'package:verse_flutter/core/db/lives_streak_repository.dart';
```

기존에 `ReadingController(...)`를 직접 생성하는 헬퍼/셋업 코드를 찾아, 두 번째 인자로
`StreakRepository(db)`를 추가한다(정확한 변수명은 파일을 열어 기존 `db`/`reading` 변수명에 맞춘다).

파일 끝(마지막 테스트 뒤)에 다음 테스트 추가:

```dart
  test('절을 완료하면 스트릭이 오른다', () async {
    final streak = StreakRepository(db);
    expect((await streak.current())?.currentLen ?? 0, 0);

    c.input('G');
    c.input('o');
    c.input('.');
    await Future<void>.delayed(Duration.zero);

    expect((await streak.current())!.currentLen, 1);
  });
```

(테스트 파일 안에서 이미 쓰는 컨트롤러 인스턴스 변수명이 `c`가 아니면 그 이름에 맞춘다. 짧은 절
`'Go.'`(id 1, `test/reading_controller_test.dart:17` 부근에 이미 시드됨)을 기준으로 작성했다 —
실제 파일의 시드 절 텍스트/id를 확인해 맞춘다.)

- [ ] **Step 3: 테스트 실행해서 컴파일 에러/실패 확인**

Run: `cd verse-flutter && flutter test test/reading_controller_test.dart`
Expected: FAIL — `StreakRepository`를 받는 생성자가 아직 없어 컴파일 에러, 또는(생성자를 임시로 맞춰
컴파일만 통과시켰다면) 스트릭이 여전히 0이라 assertion 실패.

- [ ] **Step 4: 구현 교체**

`verse-flutter/lib/features/reading/reading_controller.dart` 상단 import에 추가:

```dart
import '../../core/db/lives_streak_repository.dart';
```

생성자와 필드(현재 85-99행 부근):

변경 전:
```dart
class ReadingController extends StateNotifier<ReadingState> {
  ReadingController(
    this._reading,
    List<CourseItem> verses,
    int startIndex, {
    this.isFirstChapter = false,
    DateTime? lastAdAt,
    Sfx? sfx,
  })  : _sfx = sfx,
        _lastAdAt = lastAdAt ?? DateTime.now().toUtc(),
        super(ReadingState(
          verses: verses,
          verseIndex: startIndex,
          cursor: initialCursor(verses[startIndex].verseText),
        ));

  final ReadingProgressRepository _reading;
```

변경 후:
```dart
class ReadingController extends StateNotifier<ReadingState> {
  ReadingController(
    this._reading,
    this._streak,
    List<CourseItem> verses,
    int startIndex, {
    this.isFirstChapter = false,
    DateTime? lastAdAt,
    Sfx? sfx,
  })  : _sfx = sfx,
        _lastAdAt = lastAdAt ?? DateTime.now().toUtc(),
        super(ReadingState(
          verses: verses,
          verseIndex: startIndex,
          cursor: initialCursor(verses[startIndex].verseText),
        ));

  final ReadingProgressRepository _reading;
  final StreakRepository _streak;
```

`_completeVerse`(현재 138-141행 부근):

변경 전:
```dart
  Future<void> _completeVerse(int combo) async {
    final item = state.verse;
    await _reading.markTyped(item.id);
    await _enqueueAttempt(item);
```

변경 후:
```dart
  Future<void> _completeVerse(int combo) async {
    final item = state.verse;
    await _reading.markTyped(item.id);
    await _streak.recordActivityToday();
    await _enqueueAttempt(item);
```

`verse-flutter/lib/app/providers.dart:299` 부근의 `readingControllerProvider`:

변경 전:
```dart
final readingControllerProvider = StateNotifierProvider.family<
    ReadingController, ReadingState, ReadingSession>(
  (ref, session) => ReadingController(
    ref.watch(readingProgressRepositoryProvider),
    session.verses,
    session.startIndex,
    isFirstChapter: session.isFirstChapter,
    sfx: ref.watch(sfxProvider),
  ),
);
```

변경 후:
```dart
final readingControllerProvider = StateNotifierProvider.family<
    ReadingController, ReadingState, ReadingSession>(
  (ref, session) => ReadingController(
    ref.watch(readingProgressRepositoryProvider),
    ref.watch(streakRepositoryProvider),
    session.verses,
    session.startIndex,
    isFirstChapter: session.isFirstChapter,
    sfx: ref.watch(sfxProvider),
  ),
);
```

(`streakRepositoryProvider`가 이미 `providers.dart`에 정의돼 있는지 확인 — `memorize_controller`가 이미
쓰고 있으므로 존재해야 한다. 없다면 이 태스크에서 먼저 찾아 이름을 맞춘다.)

- [ ] **Step 5: Step 1에서 확인한 다른 테스트 파일도 생성자 인자 갱신**

`test/reading_ad_wiring_test.dart`에서 `ReadingController(...)`를 직접 생성하는 부분에도 두 번째 인자로
`StreakRepository(db)`(또는 해당 파일의 `db` 변수명)를 추가한다.

- [ ] **Step 6: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/reading_controller_test.dart test/reading_ad_wiring_test.dart`
Expected: PASS (전체).

- [ ] **Step 7: 커밋**

```bash
cd verse-flutter
git add lib/features/reading/reading_controller.dart lib/app/providers.dart test/reading_controller_test.dart test/reading_ad_wiring_test.dart
git commit -m "fix: 통독 절 완료 시 스트릭을 기록하도록 변경"
```

---

### Task 2: 받아쓰기(dictation) 완료 시 스트릭 기록 추가

**Files:**
- Modify: `verse-flutter/lib/features/memorize/memorize_controller.dart:262-278`
- Test: `verse-flutter/test/memorize_controller_test.dart`

**Interfaces:**
- Consumes: `_ref.read(streakRepositoryProvider)` — `memorize_controller.dart`가 이미 쓰는 provider.
- Produces: 없음(내부 동작만 변경, 공개 시그니처 그대로).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/memorize_controller_test.dart` 파일 끝(마지막 테스트 뒤, 최종 `}` 이전)에 추가:

```dart
  test('받아쓰기로 절을 끝까지 입력하면 스트릭이 오른다', () async {
    await readState();
    final notifier = container.read(memorizeControllerProvider(itemId).notifier);
    notifier.setMode('dictation');
    await notifier.startRecall();

    for (final ch in verseText.split('')) {
      notifier.inputDictation(ch);
    }
    await Future<void>.delayed(Duration.zero);

    final streak = StreakRepository(db);
    expect((await streak.current())!.currentLen, 1);
  });
```

`StreakRepository`를 쓰려면 파일 상단 import를 다음으로 바꾼다:

변경 전:
```dart
import 'package:verse_flutter/core/db/lives_streak_repository.dart' show maxLives;
```

변경 후:
```dart
import 'package:verse_flutter/core/db/lives_streak_repository.dart';
```

(`show maxLives`를 제거해 `StreakRepository`도 함께 노출시킨다 — 기존 `maxLives` 사용처는 그대로 동작.)

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/memorize_controller_test.dart --plain-name "받아쓰기로 절을"`
Expected: FAIL — `currentLen`이 0.

- [ ] **Step 3: 구현 교체**

`verse-flutter/lib/features/memorize/memorize_controller.dart:262-278`:

변경 전:
```dart
  /// dictation 완료 — 통독과 같은 형태로 attempt_queue에만 쌓는다(항상 green).
  /// progress/하트/스트릭은 건드리지 않는다(§dictation은 진도를 갱신하지 않음).
  Future<void> _completeDictation() async {
    final current = state.value;
    if (current == null) return;
    final db = _ref.read(databaseProvider);
    final tokens = grading.normalize(current.item.verseText);
    await db.into(db.attemptQueue).insert(AttemptQueueCompanion.insert(
          clientSeq: _uuid.v4(),
          courseItemId: current.item.id,
          mode: 'dictation',
          clientGrade: grading.Grade.green.wire,
          tokensJson: jsonEncode(tokens),
          createdAt: DateTime.now(),
        ));
    state = AsyncValue.data(current.copyWith(dictationDoneTick: current.dictationDoneTick + 1));
    unawaited(_ref.read(syncServiceProvider).syncPendingAttempts());
  }
```

변경 후:
```dart
  /// dictation 완료 — 통독과 같은 형태로 attempt_queue에만 쌓는다(항상 green).
  /// progress/하트는 건드리지 않지만(§dictation은 진도를 갱신하지 않음), 스트릭은
  /// 통독과 동일하게 "오늘 했다"는 활동으로 인정한다.
  Future<void> _completeDictation() async {
    final current = state.value;
    if (current == null) return;
    final db = _ref.read(databaseProvider);
    final tokens = grading.normalize(current.item.verseText);
    await db.into(db.attemptQueue).insert(AttemptQueueCompanion.insert(
          clientSeq: _uuid.v4(),
          courseItemId: current.item.id,
          mode: 'dictation',
          clientGrade: grading.Grade.green.wire,
          tokensJson: jsonEncode(tokens),
          createdAt: DateTime.now(),
        ));
    await _ref.read(streakRepositoryProvider).recordActivityToday();
    state = AsyncValue.data(current.copyWith(dictationDoneTick: current.dictationDoneTick + 1));
    unawaited(_ref.read(syncServiceProvider).syncPendingAttempts());
  }
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/memorize_controller_test.dart`
Expected: PASS (전체 — 기존 "dictation 모드는 진도/스트릭/하트를 건드리지 않는다" 테스트는 `submit()`
경로만 검증하므로 영향 없이 그대로 통과해야 한다).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/features/memorize/memorize_controller.dart test/memorize_controller_test.dart
git commit -m "fix: 받아쓰기 완료 시 스트릭을 기록하도록 변경"
```

---

### Task 3: 전체 회귀 확인 및 스펙 완료 표시

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-reading-dictation-streak-design.md`

- [ ] **Step 1: 전체 테스트 실행**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS.

- [ ] **Step 2: `flutter analyze` 확인**

Run: `cd verse-flutter && flutter analyze`
Expected: 이번 변경과 관련된 새 이슈 없음.

- [ ] **Step 3: 스펙에 구현 완료 메모 추가 후 커밋**

`docs/superpowers/specs/2026-08-16-reading-dictation-streak-design.md` 끝에 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-reading-dictation-streak.md` 계획대로 구현 완료.
`ReadingController`에 `StreakRepository`를 주입해 절 완료 시 `recordActivityToday()` 호출,
`memorize_controller.dart`의 `_completeDictation()`에도 동일 호출 추가.
```

```bash
git add docs/superpowers/specs/2026-08-16-reading-dictation-streak-design.md
git commit -m "docs: 통독/받아쓰기 스트릭 인정 스펙에 구현 완료 표시"
```
