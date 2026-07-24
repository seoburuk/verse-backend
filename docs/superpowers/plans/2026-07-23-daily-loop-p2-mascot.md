# 데일리루프 P2 — 마스코트 결속 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 구현 상태: 완료 (2026-07-23)

4개 태스크 전부 구현·테스트 통과(`flutter test` 전체 그린, `flutter analyze` 신규 코드 무경고).
`verse-flutter` 커밋: `dacdbf1` 무드 파생 함수 → `c53cef4` 오늘 홈 반영 → `e0e5ce9` 축하 연출 →
`c6c789a` 배고픔 알림 문구까지.

**Goal:** 마스코트(Shaun) 무드를 오늘치 달성 여부에서 파생해 오늘 홈에 살아있게 띄우고, 목표 달성 시 하루 1회 축하 연출을 재생하며, 저녁 스트릭 위험 알림 문구를 "Shaun이 배고파해요"로 교체한다.

**Architecture:** 새 테이블 없이 기존 `StreakState.lastDay` + `PlanView.todayDone`에서 무드를 계산하는 순수 함수(`lib/shared/mascot_mood.dart`)를 만들고, `TodayScreen`이 이를 그려 마스코트와 오늘 목표를 한 블록으로 묶는다. 축하 1회 가드는 기존 `SyncMeta`(via `AppSettingsRepository`)에 마지막 축하일을 저장해 처리한다. 알림은 스케줄링 로직을 건드리지 않고 문구 생성 함수만 교체한다.

**Tech Stack:** Flutter, Riverpod, drift(SyncMeta 재사용), flutter gen-l10n, flutter_test.

## Global Constraints

- 작업 디렉토리: `verse-flutter/`. 모든 경로는 이 기준.
- **새 drift 테이블을 만들지 않는다.** 무드·축하 가드 모두 기존 데이터에서 파생/저장한다.
- **신규 마스코트 아트를 만들지 않는다.** 기존 `MascotMood`의 idle/happy/sad 3종만 쓴다.
- 날짜 기준은 **UTC 자정**(`todayUtcDay()` in `lib/core/plan/plan_repository.dart`). 로컬 시각 금지.
- 알림 **스케줄링 조건은 변경 금지** — `shouldScheduleStreakDanger`/`refreshStreakDanger`의 발사 조건은 그대로 두고 문구만 바꾼다. 매일 리마인더(1001)·일시정지 안내(1003)도 변경하지 않는다.
- 새 문자열은 `lib/l10n/app_ko.arb`(템플릿) + `lib/l10n/app_en.arb`에 추가하고 `flutter gen-l10n` 재생성. 하드코딩 금지.
- 톤: "굶어 죽음"이 아니라 "시무룩/배고픔"까지만.
- **마스코트 이름은 `Shaun`**(양 스프라이트). ko/en 동일한 고유명사로 표기하고, 문구에서 "마스코트" 대신 이름을 부른다. 알림 문구는 `BuildContext` 없이 예약되므로 l10n 대신 `mascotName` 상수를 쓴다.

## File Structure

- Create: `lib/shared/mascot_mood.dart` — 무드 파생 순수 함수.
- Create: `lib/features/today/celebration_overlay.dart` — 축하 연출 위젯.
- Modify: `lib/features/today/today_screen.dart` — 마스코트+목표 블록, 축하 트리거(ConsumerStatefulWidget으로 승격).
- Modify: `lib/core/settings/app_settings_repository.dart` — 마지막 축하일 키 추가.
- Modify: `lib/core/notifications/reminder_service.dart` — 위험 알림 문구 교체 + 문구 함수 공개.
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`.

---

### Task 1: 마스코트 무드 파생 순수 함수

**Files:**
- Create: `lib/shared/mascot_mood.dart`
- Test: `test/mascot_mood_test.dart`

**Interfaces:**
- Consumes: `PlanView`(`lib/core/plan/plan_repository.dart`), `StreakStateData`(`lib/core/db/app_database.dart`), `MascotMood`(`lib/shared/widgets/mascot_sprite.dart`).
- Produces: `MascotMood mascotMoodFor({required PlanView? view, required StreakStateData? streak, required String todayUtc})`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/mascot_mood_test.dart`:

```dart
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/shared/mascot_mood.dart';
import 'package:verse_flutter/shared/widgets/mascot_sprite.dart';

const _today = '2026-07-23';

StreakStateData _streak(String? lastDay) =>
    StreakStateData(id: 0, currentLen: 3, longestLen: 5, lastDay: lastDay);

/// todayDone/기타 값을 직접 지정한 PlanView를 만든다.
/// todayTarget = ceil(remaining/remainingDays), todayDone = todayCleared >= todayTarget.
PlanView _view({required int total, required int cleared, required int todayCleared}) {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  addTearDown(db.close);
  return PlanView(
    plan: MemorizationPlanData(
      id: 1,
      courseId: 7,
      title: 'x',
      deadlineDay: '2026-08-23',
      status: 'active',
      createdAt: DateTime.utc(2026, 7, 23),
    ),
    totalVerses: total,
    clearedVerses: cleared,
    todayCleared: todayCleared,
    remainingDays: 5,
  );
}

void main() {
  test('활성 플랜이 없으면 idle', () {
    expect(mascotMoodFor(view: null, streak: _streak('2026-07-01'), todayUtc: _today), MascotMood.idle);
  });

  test('오늘치 완료면 happy', () {
    // 남은 10, 5일 → 목표 2. 오늘 2절 완료 → todayDone
    final v = _view(total: 10, cleared: 2, todayCleared: 2);
    expect(v.todayDone, isTrue);
    expect(mascotMoodFor(view: v, streak: _streak(_today), todayUtc: _today), MascotMood.happy);
  });

  test('플랜을 다 외웠으면(planComplete) happy', () {
    final v = _view(total: 3, cleared: 3, todayCleared: 0);
    expect(v.planComplete, isTrue);
    expect(mascotMoodFor(view: v, streak: _streak(_today), todayUtc: _today), MascotMood.happy);
  });

  test('오늘 활동했으나 목표 미달이면 idle', () {
    // 남은 10, 5일 → 목표 2. 오늘 1절만 → 미달
    final v = _view(total: 10, cleared: 1, todayCleared: 1);
    expect(v.todayDone, isFalse);
    expect(mascotMoodFor(view: v, streak: _streak(_today), todayUtc: _today), MascotMood.idle);
  });

  test('활동 기록이 없는 신규 사용자는 idle', () {
    final v = _view(total: 10, cleared: 0, todayCleared: 0);
    expect(mascotMoodFor(view: v, streak: null, todayUtc: _today), MascotMood.idle);
    expect(mascotMoodFor(view: v, streak: _streak(null), todayUtc: _today), MascotMood.idle);
  });

  test('어제까지 했고 오늘 아직이면 sad(배고픔)', () {
    final v = _view(total: 10, cleared: 0, todayCleared: 0);
    expect(mascotMoodFor(view: v, streak: _streak('2026-07-22'), todayUtc: _today), MascotMood.sad);
  });

  test('며칠 공백이어도 sad', () {
    final v = _view(total: 10, cleared: 0, todayCleared: 0);
    expect(mascotMoodFor(view: v, streak: _streak('2026-07-01'), todayUtc: _today), MascotMood.sad);
  });
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/mascot_mood_test.dart`
Expected: FAIL — `mascotMoodFor` 미정의.

- [ ] **Step 3: 순수 함수 구현**

`lib/shared/mascot_mood.dart`:

```dart
import '../core/db/app_database.dart';
import '../core/plan/plan_repository.dart';
import 'widgets/mascot_sprite.dart';

/// 오늘치 달성 여부와 마지막 활동일에서 마스코트 무드를 파생한다(새 저장소 없음).
///
/// - 오늘치 완료      → happy
/// - 오늘 활동은 했으나 목표 미달 → idle(진행 중)
/// - 오늘 아직 안 함 + 과거 기록 있음 → sad(배고픔)  ← 듀오링고식 매일 넛지
/// - 신규(기록 없음) 또는 활성 플랜 없음 → idle
///
/// 날짜는 스트릭과 동일하게 UTC 자정 기준 'YYYY-MM-DD'를 쓴다.
MascotMood mascotMoodFor({
  required PlanView? view,
  required StreakStateData? streak,
  required String todayUtc,
}) {
  if (view == null) return MascotMood.idle;
  if (view.todayDone) return MascotMood.happy;

  final lastDay = streak?.lastDay;
  if (lastDay == null) return MascotMood.idle; // 신규 사용자 — 기준이 없다
  if (lastDay == todayUtc) return MascotMood.idle; // 오늘 시작함, 배고픔은 과하다
  return MascotMood.sad;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/mascot_mood_test.dart`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/shared/mascot_mood.dart test/mascot_mood_test.dart
git commit -m "feat(mascot): 오늘치 달성 기반 무드 파생 순수 함수"
```

---

### Task 2: 오늘 홈에 마스코트 + 무드 문구 + 목표 블록

**Files:**
- Modify: `lib/l10n/app_ko.arb`, `lib/l10n/app_en.arb`
- Generated: `lib/l10n/app_localizations*.dart`
- Modify: `lib/features/today/today_screen.dart`
- Test: `test/today_mascot_test.dart`

**Interfaces:**
- Consumes: `mascotMoodFor`(Task 1), `MascotSprite`, `activePlanViewProvider`, `currentStreakProvider`, `todayUtcDay()`.
- Produces: l10n getters `todayMoodSad`, `todayMoodIdle`, `todayMoodHappy`. `TodayScreen`이 마스코트+무드문구+스트릭/목숨+오늘목표를 한 블록으로 렌더.

- [ ] **Step 1: arb 키 추가**

`lib/l10n/app_ko.arb`에 추가:

```json
  "todayMoodSad": "Shaun이 배고파해요... 오늘 한 절 어때요?",
  "todayMoodIdle": "좀만 더 하면 돼요!",
  "todayMoodHappy": "오늘도 해냈어요! Shaun도 신났어요",
  "mascotName": "Shaun"
```

`lib/l10n/app_en.arb`에 추가:

```json
  "todayMoodSad": "Shaun is hungry... how about one verse today?",
  "todayMoodIdle": "Almost there — keep going!",
  "todayMoodHappy": "You did it today! Shaun is thrilled",
  "mascotName": "Shaun"
```

- [ ] **Step 2: l10n 재생성**

Run: `flutter gen-l10n`
Expected: 에러 없음.

- [ ] **Step 3: 실패하는 위젯 테스트 작성**

`test/today_mascot_test.dart`:

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
import 'package:verse_flutter/shared/widgets/mascot_sprite.dart';

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

String _utcDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// 코스 7에 절 10개 + 마감 오늘+4일(→ 오늘 목표 2)인 활성 플랜을 심는다.
Future<void> _seedPlan(AppDatabase db) async {
  for (var i = 0; i < 10; i++) {
    await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: Value(700 + i), courseId: 7, ord: i, book: 19, chapter: 1, verse: i + 1, verseText: 'v$i'));
  }
  final deadline = DateTime.now().toUtc().add(const Duration(days: 4));
  await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
      courseId: 7, title: '시편 걷기', deadlineDay: _utcDay(deadline), createdAt: DateTime.now().toUtc()));
}

void main() {
  testWidgets('어제까지 했고 오늘 아직이면 배고픈 마스코트와 문구가 뜬다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await _seedPlan(db);
    final yesterday = DateTime.now().toUtc().subtract(const Duration(days: 1));
    await db.into(db.streakState).insertOnConflictUpdate(StreakStateCompanion.insert(
        id: const Value(0), currentLen: const Value(3), longestLen: const Value(3),
        lastDay: Value(_utcDay(yesterday))));

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    expect(find.byType(MascotSprite), findsOneWidget);
    expect(find.text('Shaun이 배고파해요... 오늘 한 절 어때요?'), findsOneWidget);
  });

  testWidgets('오늘 목표를 채우면 기뻐하는 문구가 뜬다', (tester) async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);
    await _seedPlan(db);
    // 오늘 2절 완료 → 목표(2) 달성
    for (var i = 0; i < 2; i++) {
      await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
          courseItemId: Value(700 + i), grade: 'green', cleared: const Value(true), updatedAt: DateTime.now()));
    }

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    expect(find.text('오늘도 해냈어요! Shaun도 신났어요'), findsOneWidget);
  });
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `flutter test test/today_mascot_test.dart`
Expected: FAIL — 마스코트/문구 미렌더.

- [ ] **Step 5: `TodayScreen._plan`의 상단 블록 교체**

`lib/features/today/today_screen.dart` import에 추가:

```dart
import '../../shared/mascot_mood.dart';
import '../../shared/widgets/lives_badge.dart';
import '../../shared/widgets/mascot_sprite.dart';
```

`_plan` 메서드에서 기존 상단 Row(🔥)와 플랜 제목 부분을, 마스코트+문구+스트릭/목숨 블록으로 교체한다.
아래 기존 코드를

```dart
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
```

다음으로 바꾼다:

```dart
        // 상단: 마스코트가 주인공. 무드는 오늘치 달성 여부에서 파생되고,
        // 바로 아래 "오늘 목표"와 한 덩어리로 묶어 인과가 보이게 한다.
        Center(child: MascotSprite(mood: mood, size: 96)),
        const SizedBox(height: 8),
        Center(
          child: Text(
            switch (mood) {
              MascotMood.sad => l.todayMoodSad,
              MascotMood.idle => l.todayMoodIdle,
              MascotMood.happy => l.todayMoodHappy,
            },
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🔥', style: TextStyle(fontSize: 20)),
            const SizedBox(width: 4),
            Text('${streak?.currentLen ?? 0}', style: theme.textTheme.titleMedium),
            const SizedBox(width: 16),
            const LivesBadge(),
          ],
        ),
        const SizedBox(height: 24),
```

그리고 `_plan` 메서드 상단(`final planRatio = ...` 다음 줄)에 무드 계산을 추가한다:

```dart
    final mood = mascotMoodFor(view: view, streak: streak, todayUtc: todayUtcDay());
```

플랜 제목은 "플랜 전체 진행" 섹션으로 옮긴다. 기존

```dart
        // 플랜 전체 진행
        Text(l.todayPlanProgress, style: theme.textTheme.titleMedium),
```

을 다음으로 바꾼다:

```dart
        // 플랜 전체 진행
        Text(view.plan.title, style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(l.todayPlanProgress, style: theme.textTheme.bodySmall),
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/today_mascot_test.dart`
Expected: PASS

- [ ] **Step 7: 기존 테스트 회귀 확인**

Run: `flutter test test/today_screen_test.dart`
Expected: PASS (기존 "오늘 목표"·"0/2절" 단언이 그대로 통과해야 한다. 실패하면 해당 텍스트가 여전히 렌더되는지 확인하고 위 교체 범위를 재점검한다.)

- [ ] **Step 8: 커밋**

```bash
git add lib/l10n/ lib/features/today/today_screen.dart test/today_mascot_test.dart
git commit -m "feat(mascot): 오늘 홈에 마스코트+무드 문구+목표 블록"
```

---

### Task 3: 하루 1회 축하 연출

**Files:**
- Modify: `lib/core/settings/app_settings_repository.dart`
- Create: `lib/features/today/celebration_overlay.dart`
- Modify: `lib/features/today/today_screen.dart` (ConsumerStatefulWidget 승격 + 트리거)
- Test: `test/today_celebration_test.dart`

**Interfaces:**
- Consumes: `AppSettingsRepository.read/write`, `appSettingsRepositoryProvider`, `todayUtcDay()`, `PlanView.todayDone`.
- Produces:
  - `AppSettingsRepository.lastCelebratedDayKey` (`'last_celebrated_day'`)
  - `class CelebrationOverlay extends StatelessWidget` (필드 `String message`)
  - `TodayScreen`이 `ConsumerStatefulWidget`으로 바뀐다(외부 사용법 동일: `const TodayScreen()`).

- [ ] **Step 1: 마지막 축하일 키 추가**

`lib/core/settings/app_settings_repository.dart`의 기존 키 상수 아래에 추가:

```dart
  static const lastCelebratedDayKey = 'last_celebrated_day'; // 'YYYY-MM-DD'(UTC), 축하 1회 가드
```

- [ ] **Step 2: 실패하는 위젯 테스트 작성**

`test/today_celebration_test.dart`:

```dart
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:verse_flutter/app/providers.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/plan/plan_repository.dart';
import 'package:verse_flutter/core/settings/app_settings_repository.dart';
import 'package:verse_flutter/features/today/celebration_overlay.dart';
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

String _utcDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// 오늘 목표(2절)를 이미 달성한 상태의 DB를 만든다.
Future<AppDatabase> _seedDoneToday() async {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  for (var i = 0; i < 10; i++) {
    await db.into(db.courseItems).insert(CourseItemsCompanion.insert(
        id: Value(700 + i), courseId: 7, ord: i, book: 19, chapter: 1, verse: i + 1, verseText: 'v$i'));
  }
  final deadline = DateTime.now().toUtc().add(const Duration(days: 4));
  await db.into(db.memorizationPlan).insert(MemorizationPlanCompanion.insert(
      courseId: 7, title: '시편 걷기', deadlineDay: _utcDay(deadline), createdAt: DateTime.now().toUtc()));
  for (var i = 0; i < 2; i++) {
    await db.into(db.progress).insertOnConflictUpdate(ProgressCompanion.insert(
        courseItemId: Value(700 + i), grade: 'green', cleared: const Value(true), updatedAt: DateTime.now()));
  }
  return db;
}

void main() {
  testWidgets('오늘 목표를 달성한 채 홈에 들어오면 축하 연출이 뜬다', (tester) async {
    final db = await _seedDoneToday();
    addTearDown(db.close);

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    expect(find.byType(CelebrationOverlay), findsOneWidget);
  });

  testWidgets('오늘 이미 축하했으면 다시 뜨지 않는다', (tester) async {
    final db = await _seedDoneToday();
    addTearDown(db.close);
    // 오늘 날짜로 축하 기록을 미리 심어둔다.
    await AppSettingsRepository(db).write(AppSettingsRepository.lastCelebratedDayKey, todayUtcDay());

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    expect(find.byType(CelebrationOverlay), findsNothing);
  });

  testWidgets('축하가 뜨면 마지막 축하일이 오늘로 저장된다', (tester) async {
    final db = await _seedDoneToday();
    addTearDown(db.close);

    await tester.pumpWidget(_wrap(db));
    await tester.pumpAndSettle();

    final saved = await AppSettingsRepository(db).read(AppSettingsRepository.lastCelebratedDayKey);
    expect(saved, todayUtcDay());
  });
}
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `flutter test test/today_celebration_test.dart`
Expected: FAIL — `CelebrationOverlay` 미정의.

- [ ] **Step 4: 축하 오버레이 위젯 구현**

`lib/features/today/celebration_overlay.dart`:

```dart
import 'package:flutter/material.dart';

/// 오늘치 완료 축하. 홈 위에 잠깐 떠서 스스로 사라진다(게임 재화 없음 — 연출만).
class CelebrationOverlay extends StatelessWidget {
  const CelebrationOverlay({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        color: Colors.black.withValues(alpha: 0.35),
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🎉  ✨  🎉', style: TextStyle(fontSize: 40)),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: `TodayScreen`을 ConsumerStatefulWidget으로 승격하고 축하를 트리거**

`lib/features/today/today_screen.dart` import에 추가:

```dart
import '../../core/settings/app_settings_repository.dart';
import 'celebration_overlay.dart';
```

클래스 선언과 `build` 시그니처를 아래로 바꾼다(내부 `_empty`/`_plan`/`_continueCta`/`_completeCta` 본문은 그대로 두되, `ref`는 State의 것을 쓴다):

```dart
class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  bool _celebrating = false;
  bool _checked = false;

  /// 오늘치를 달성한 채 홈에 들어왔고 오늘 아직 축하하지 않았다면 1회 재생한다.
  /// 가드는 SyncMeta에 저장한 마지막 축하일(UTC)로 판정한다 — 새 테이블 불필요.
  Future<void> _maybeCelebrate(PlanView? view) async {
    if (_checked || view == null || !view.todayDone) return;
    _checked = true;
    final settings = ref.read(appSettingsRepositoryProvider);
    final today = todayUtcDay();
    if (await settings.read(AppSettingsRepository.lastCelebratedDayKey) == today) return;
    await settings.write(AppSettingsRepository.lastCelebratedDayKey, today);
    if (!mounted) return;
    setState(() => _celebrating = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _celebrating = false);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final viewAsync = ref.watch(activePlanViewProvider);

    // 데이터가 준비되면 첫 프레임 뒤에 축하 여부를 판정한다(빌드 중 부작용 금지).
    final view = viewAsync.valueOrNull;
    if (view != null && !_checked) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeCelebrate(view));
    }

    return Scaffold(
      appBar: AppBar(title: Text(l.todayTitle)),
      body: Stack(
        children: [
          viewAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
            data: (view) => view == null ? _empty(context, l) : _plan(context, ref, l, view),
          ),
          if (_celebrating) Positioned.fill(child: CelebrationOverlay(message: l.todayGoalDone)),
        ],
      ),
    );
  }
```

(파일 끝의 닫는 중괄호가 State 클래스를 닫도록 맞춘다. `_empty`/`_plan`/`_continueCta`/`_completeCta`는 State의 메서드로 그대로 유지된다.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `flutter test test/today_celebration_test.dart`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/core/settings/app_settings_repository.dart lib/features/today/celebration_overlay.dart lib/features/today/today_screen.dart test/today_celebration_test.dart
git commit -m "feat(mascot): 오늘치 완료 축하 연출 + 하루 1회 가드"
```

---

### Task 4: 배고픔 알림 문구 교체

**Files:**
- Modify: `lib/core/notifications/reminder_service.dart`
- Test: `test/streak_danger_test.dart` (문구 테스트 추가)

**Interfaces:**
- Produces: 최상위 함수 `String dangerTitle(String locale)`, `String dangerBody(int currentStreak, int dayIndex, String locale)` — 단위 테스트 가능하도록 클래스 밖으로 노출.
- **변경 없음**: `shouldScheduleStreakDanger`, `shouldPauseReminders`, `refreshStreakDanger`의 발사 조건, 알림 ID/채널.

- [ ] **Step 1: 실패하는 테스트 추가**

`test/streak_danger_test.dart`의 `void main() {` 안, 기존 group들 아래에 추가:

```dart
  group('배고픔 알림 문구', () {
    test('제목은 Shaun의 배고픔을 말한다', () {
      expect(dangerTitle('ko'), contains('Shaun'));
      expect(dangerTitle('ko'), contains('배고파'));
      expect(dangerTitle('en'), contains('Shaun'));
      expect(dangerTitle('en'), contains('hungry'));
    });

    test('본문은 스트릭 일수를 함께 알려 손실을 분명히 한다', () {
      for (var i = 0; i < 3; i++) {
        expect(dangerBody(7, i, 'ko'), contains('7'));
        expect(dangerBody(7, i, 'en'), contains('7'));
      }
    });

    test('dayIndex에 따라 문구가 순환한다', () {
      final ko = {for (var i = 0; i < 3; i++) dangerBody(5, i, 'ko')};
      expect(ko.length, 3); // 3종이 서로 달라야 한다
    });
  });
```

같은 파일 상단 import는 이미 `reminder_service.dart`를 가져오므로 추가 import는 없다.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `flutter test test/streak_danger_test.dart`
Expected: FAIL — `dangerTitle`/`dangerBody` 미정의.

- [ ] **Step 3: 문구 함수를 클래스 밖으로 빼고 마스코트 배고픔으로 교체**

`lib/core/notifications/reminder_service.dart`에서 `ReminderService` 클래스 **바깥**(예: `shouldScheduleStreakDanger` 정의 아래)에 추가:

```dart
/// 마스코트 이름. 알림은 BuildContext 없이 예약되므로 l10n 대신 상수를 쓴다
/// (고유명사라 ko/en 동일).
const mascotName = 'Shaun';

/// 배고픔 알림 제목 — 스트릭 위험을 마스코트 감정으로 전달한다(P2).
String dangerTitle(String locale) =>
    locale == 'en' ? '$mascotName is hungry 🍞' : '$mascotName이 배고파해요 🍞';

/// 배고픔 알림 본문. 마스코트만 말하면 실제로 잃는 것(스트릭)이 흐려지므로
/// 스트릭 일수를 함께 걸어 감정 훅과 손실 회피가 같이 작동하게 한다.
/// dayIndex로 3종을 순환시켜 매일 같은 문구가 뜨지 않게 한다.
String dangerBody(int currentStreak, int dayIndex, String locale) {
  final n = currentStreak;
  final options = locale == 'en'
      ? [
          'Feed $mascotName with one verse — your $n-day streak ends tonight too!',
          '$mascotName is waiting. One verse keeps both $mascotName and your $n-day streak 🍞',
          '⏰ Last call! One verse now feeds $mascotName and saves $n days.',
        ]
      : [
          '한 절로 $mascotName을 먹여주세요 — $n일 스트릭도 오늘 밤 끊겨요!',
          '$mascotName이 기다려요. 한 절이면 $mascotName도 $n일 스트릭도 지켜져요 🍞',
          '⏰ 마지막 기회! 지금 한 절이면 $mascotName도 $n일도 지킬 수 있어요.',
        ];
  return options[dayIndex % options.length];
}
```

그리고 클래스 안의 기존 `_pickDangerBody` 메서드 전체를 **삭제**한다:

```dart
  String _pickDangerBody(int currentStreak, String locale) {
    ...
  }
```

`refreshStreakDanger` 안의 호출부를 다음과 같이 바꾼다. 기존:

```dart
    final body = _pickDangerBody(streak!.currentLen, locale);
    await _plugin.zonedSchedule(
      _dangerNotificationId,
      locale == 'en' ? 'Streak in danger!' : '스트릭이 위험해요!',
      body,
```

교체 후:

```dart
    final dayIndex = tz.TZDateTime.now(tz.local).difference(tz.TZDateTime(tz.local, 2000)).inDays;
    final body = dangerBody(streak!.currentLen, dayIndex, locale);
    await _plugin.zonedSchedule(
      _dangerNotificationId,
      dangerTitle(locale),
      body,
```

(알림 ID·채널·`androidScheduleMode`·payload 등 나머지는 그대로 둔다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `flutter test test/streak_danger_test.dart`
Expected: PASS (기존 스케줄링 조건 테스트도 전부 통과해야 한다 — 조건 로직은 건드리지 않았다.)

- [ ] **Step 5: 전체 테스트 + 분석**

Run: `flutter test`
Expected: 전체 PASS.

Run: `flutter analyze`
Expected: 신규 코드 무경고.

- [ ] **Step 6: 수동 검증**

Run: `flutter run`
확인:
1. 플랜이 있고 오늘 아직 안 했으면 → 홈에 **sad Shaun + "Shaun이 배고파해요..."**.
2. 오늘 목표만큼 암송하고 홈 복귀 → **축하 오버레이 1회** + Shaun **happy** + "오늘도 해냈어요! Shaun도 신났어요".
3. 홈을 나갔다 다시 들어와도 **축하가 다시 뜨지 않음**.
4. 설정에서 리마인더를 켜고 위험 시각을 가까운 시각으로 두면 → 알림 제목이 **"Shaun이 배고파해요 🍞"**.

- [ ] **Step 7: 커밋**

```bash
git add lib/core/notifications/reminder_service.dart test/streak_danger_test.dart
git commit -m "feat(mascot): 스트릭 위험 알림을 마스코트 배고픔 문구로 교체"
```

---

## 완료 기준

- [ ] 무드 파생 함수가 스펙 §1 표의 4분기를 정확히 따르고 단위 테스트로 검증된다.
- [ ] 오늘 홈에 Shaun(96px) + 무드 문구 + 스트릭/목숨이 뜨고, 바로 아래 오늘 목표가 붙는다.
- [ ] 오늘치 달성 시 축하 연출이 **하루 1회만** 재생된다.
- [ ] 저녁 위험 알림 제목/본문이 Shaun의 배고픔 + 스트릭 일수로 바뀐다(발사 조건은 불변).
- [ ] 사용자 노출 문구에서 마스코트를 **Shaun**으로 부른다(ko/en 동일).
- [ ] 새 drift 테이블 0개, 신규 마스코트 아트 0개.
- [ ] `flutter test` 전체 통과, `flutter analyze` 신규 코드 무경고.

## 이 계획에 포함되지 않은 것

- 배고픔 단계 세분화(중간 아트), 먹이주기 인터랙션 — 스펙 §7 범위 밖.
- 앱 아이콘 동적 변경 — 채택하지 않음(iOS 팝업 강제·Android 미지원).
- 카드 컬렉션, 데일리루프 P3(섹션/장/N절 타깃·프리셋·서버 동기화) — 별개 스펙.
