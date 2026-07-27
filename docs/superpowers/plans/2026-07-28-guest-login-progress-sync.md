# 게스트→로그인 기록 승계 · 계정 전환 안전화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 성공 시 서버 진도를 기기로 pull하고, 로그아웃/계정 전환 시 로컬 기록이 안전하게
승계·초기화되도록 `SessionSyncCoordinator`를 도입한다.

**Architecture:** `verse-flutter`의 `SyncMeta` 키-값 테이블에 `active_user_id`를 추가해 "로컬 DB가
누구 것인지" 표시한다. 새 `SessionSyncCoordinator` 클래스가 로그인 성공(`onLoginSuccess`)과
로그아웃(`onLogout`) 두 진입점에서 기존 `SyncService`(push)·`GET /me/progress`(pull)·
`FavoritesSyncService`를 오케스트레이션한다. `AuthRepository`는 건드리지 않는다(토큰 책임만
유지). 백엔드 변경 없음 — 기존 `POST /sync/attempts`, `GET /me/progress`만 쓴다.

**Tech Stack:** Flutter, Riverpod, Drift(SQLite), Dio.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-28-guest-login-progress-sync-design.md`
- 목숨(`LivesState`)·스트릭(`StreakState`)은 서버에서 **pull하지 않는다** — 계정 전환 시 기본값
  리셋만 한다(목숨=10, 스트릭 currentLen/longestLen=0, lastDay=null).
- 즐겨찾기(`Bookmarks`)는 계정 전환 시 **비우기만** 하고, 새 계정 pull은 기존
  `FavoritesSyncService.pull()`을 재사용한다(새로 만들지 않음).
- 테스트는 `verse-flutter/test/favorites_sync_service_test.dart`의 패턴을 그대로 따른다:
  `AppDatabase.forTesting(NativeDatabase.memory())` + `_FakeAdapter`(Dio `HttpClientAdapter`
  구현) + `flutter_secure_storage` 채널 목.
- 커밋 메시지는 한국어, 기존 커밋 스타일(`fix:`, `docs:` 등 conventional prefix) 따름.

---

### Task 1: `SyncMeta`에 계정 식별자 읽기/쓰기 — `SessionSyncCoordinator` 뼈대 + `activeUserId` 헬퍼

**Files:**
- Create: `verse-flutter/lib/core/sync/session_sync_coordinator.dart`
- Test: `verse-flutter/test/session_sync_coordinator_test.dart`

**Interfaces:**
- Consumes: `AppDatabase`(`lib/core/db/app_database.dart`, 이미 존재하는 `SyncMeta` 테이블 —
  컬럼 `key`(TextColumn, PK), `value`(TextColumn)), `ApiClient`(`lib/core/network/api_client.dart`).
- Produces:
  - `class SessionSyncCoordinator`의 생성자 `SessionSyncCoordinator(AppDatabase db, ApiClient client, SyncService syncService, FavoritesSyncService favoritesSyncService)`
  - `Future<int?> get activeUserId` — 저장된 `active_user_id`를 int로 읽음(없으면 null)
  - `Future<void> _setActiveUserId(int userId)` — private, Task 2/3에서 사용
  - 이후 Task에서 `onLoginSuccess`/`onLogout`을 이 클래스에 추가한다(같은 파일).

- [ ] **Step 1: 실패하는 테스트 작성**

```dart
import 'package:drift/native.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/core/db/app_database.dart';
import 'package:verse_flutter/core/network/api_client.dart';
import 'package:verse_flutter/core/sync/favorites_sync_service.dart';
import 'package:verse_flutter/core/sync/session_sync_coordinator.dart';
import 'package:verse_flutter/core/sync/sync_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureStorageChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(secureStorageChannel, (call) async => null);

  late AppDatabase db;
  late ApiClient client;
  late SessionSyncCoordinator coordinator;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    client = ApiClient(TokenStore());
    coordinator = SessionSyncCoordinator(
      db,
      client,
      SyncService(db, client),
      FavoritesSyncService(db, client),
    );
  });

  tearDown(() => db.close());

  group('activeUserId', () {
    test('저장된 적 없으면 null을 반환한다', () async {
      expect(await coordinator.activeUserId, isNull);
    });
  });
}
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: FAIL — `session_sync_coordinator.dart` 파일이 없어 컴파일 에러(`Target of URI doesn't exist`).

- [ ] **Step 3: 최소 구현 작성**

```dart
// lib/core/sync/session_sync_coordinator.dart
import 'package:drift/drift.dart';

import '../db/app_database.dart';
import '../network/api_client.dart';
import 'favorites_sync_service.dart';
import 'sync_service.dart';

/// 로그인/로그아웃 시점에 로컬 DB와 서버 계정을 정합하게 맞추는 오케스트레이터.
/// 세 상태 전이(게스트→로그인, 로그아웃, 계정 전환)를 처리한다
/// (docs/superpowers/specs/2026-07-28-guest-login-progress-sync-design.md).
class SessionSyncCoordinator {
  SessionSyncCoordinator(this._db, this._client, this._syncService, this._favoritesSyncService);

  final AppDatabase _db;
  final ApiClient _client;
  final SyncService _syncService;
  final FavoritesSyncService _favoritesSyncService;

  static const _activeUserIdKey = 'active_user_id';

  Future<int?> get activeUserId async {
    final row = await (_db.select(_db.syncMeta)..where((t) => t.key.equals(_activeUserIdKey))).getSingleOrNull();
    if (row == null) return null;
    return int.tryParse(row.value);
  }

  Future<void> _setActiveUserId(int userId) => _db.into(_db.syncMeta).insertOnConflictUpdate(
        SyncMetaCompanion.insert(key: _activeUserIdKey, value: userId.toString()),
      );
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/core/sync/session_sync_coordinator.dart test/session_sync_coordinator_test.dart
git commit -m "feat: SessionSyncCoordinator 뼈대와 active_user_id 저장소 추가"
```

---

### Task 2: `onLoginSuccess` — 게스트/동일 계정 로그인 (push → progress pull → 저장)

**Files:**
- Modify: `verse-flutter/lib/core/sync/session_sync_coordinator.dart`
- Modify: `verse-flutter/test/session_sync_coordinator_test.dart`

**Interfaces:**
- Consumes: Task 1의 `SessionSyncCoordinator`, `_setActiveUserId`, `activeUserId`. 기존
  `SyncService.syncPendingAttempts({bool force})`(`lib/core/sync/sync_service.dart:32`, 이미
  구현됨, 시그니처 변경 없음). `ApiClient.dio`(Dio 인스턴스, `GET /me/progress` 호출용). 서버
  응답 모양(`verse-backend/internal/handler/dto/progress_dto.go`):
  `{"streak": {...}, "courses": [...], "items": [{"course_item_id": int, "grade": string, "cleared": bool, "book": int, "chapter": int, "verse": int}]}`.
  로컬 `Progress` 테이블(`lib/core/db/app_database.dart:56-64`): 컬럼 `courseItemId`(int, PK),
  `grade`(text), `cleared`(bool), `updatedAt`(DateTime).
- Produces: `Future<void> onLoginSuccess(int userId)` — 이후 Task 3에서 계정 전환 분기를 추가할
  진입점.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/session_sync_coordinator_test.dart`의 `main()` 안, 기존 `group('activeUserId', ...)` 다음에
아래 그룹을 추가하고, 파일 상단 import에 `dart:convert`, `dio`, `_FakeAdapter`/`_json` 헬퍼를
`favorites_sync_service_test.dart`에서 그대로 복사해 추가한다(같은 파일 안에 중복 정의 —
`test/` 디렉터리에 공유 헬퍼 파일이 없으므로 기존 관례대로 각 테스트 파일에 자체 포함):

```dart
  group('onLoginSuccess - 게스트/동일 계정', () {
    test('active_user_id 없으면 강제 push 후 progress pull하고 user_id를 저장한다', () async {
      // 로컬에 미동기화 시도 하나를 만들어 push가 실제로 도는지 확인
      await db.into(db.attemptQueue).insert(AttemptQueueCompanion.insert(
            clientSeq: const Value('seq-1'),
            courseItemId: 1,
            mode: 'drag',
            clientGrade: 'green',
            tokensJson: '[]',
            createdAt: DateTime.now(),
          ));

      final requestedPaths = <String>[];
      adapter = _FakeAdapter((options) async {
        requestedPaths.add(options.path);
        if (options.path == '/sync/attempts') {
          return _json({
            'results': [
              {'client_seq': 'seq-1', 'status': 'ok', 'client_grade': 'green', 'server_grade': 'green'}
            ]
          });
        }
        if (options.path == '/me/progress') {
          return _json({
            'streak': {'current': 0, 'longest': 0},
            'courses': [],
            'items': [
              {'course_item_id': 99, 'grade': 'green', 'cleared': true, 'book': 43, 'chapter': 3, 'verse': 16}
            ],
          });
        }
        throw StateError('unexpected path ${options.path}');
      });
      client.dio.httpClientAdapter = adapter;

      await coordinator.onLoginSuccess(7);

      expect(requestedPaths, containsAll(['/sync/attempts', '/me/progress']));
      expect(await coordinator.activeUserId, 7);
      final row = await (db.select(db.progress)..where((t) => t.courseItemId.equals(99))).getSingle();
      expect(row.grade, 'green');
      expect(row.cleared, isTrue);
    });

    test('active_user_id가 이미 같은 유저면 pull만 반영한다(no-op push 포함)', () async {
      await coordinator.onLoginSuccess(7); // 위와 별개 인스턴스 흐름 — 여기서는 직접 SyncMeta 세팅
      adapter = _FakeAdapter((options) async {
        if (options.path == '/sync/attempts') {
          throw DioException(requestOptions: options, response: null); // pending 없으면 호출 안 될 수도 있음: 방어적으로 실패해도 무해
        }
        return _json({
          'streak': {'current': 0, 'longest': 0},
          'courses': [],
          'items': [
            {'course_item_id': 5, 'grade': 'yellow', 'cleared': false, 'book': 1, 'chapter': 1, 'verse': 1}
          ],
        });
      });
      client.dio.httpClientAdapter = adapter;

      await coordinator.onLoginSuccess(7);

      expect(await coordinator.activeUserId, 7);
      final row = await (db.select(db.progress)..where((t) => t.courseItemId.equals(5))).getSingle();
      expect(row.grade, 'yellow');
    });
  });
```

주의: 두 번째 테스트는 첫 호출에서 `/sync/attempts`가 pending 없어 호출되지 않을 수 있으므로,
어댑터가 그 경로를 절대 안 부르는 것도 정상 취급하도록 짰다(호출되면 DioException을 던지되
`onLoginSuccess`가 그 실패를 삼켜야 함 — 이는 Step 3 구현이 try/catch로 보장).

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: FAIL — `onLoginSuccess` 메서드가 없어 컴파일 에러.

- [ ] **Step 3: 최소 구현 작성**

`session_sync_coordinator.dart`에 추가:

```dart
  /// 로그인 성공 직후 호출(로그인/회원가입/구글/애플 공통).
  /// active_user_id가 없거나 로그인한 userId와 같으면 게스트/동일 계정 경로:
  /// 강제 push → 서버 progress pull → active_user_id 갱신.
  Future<void> onLoginSuccess(int userId) async {
    final current = await activeUserId;
    if (current != null && current != userId) {
      await _clearLocalProgressForAccountSwitch();
    }

    try {
      await _syncService.syncPendingAttempts(force: true);
    } on Object {
      // 오프라인이어도 로그인 자체는 계속 진행한다.
    }

    try {
      final res = await _client.dio.get('/me/progress');
      final items = (res.data as Map<String, dynamic>)['items'] as List<dynamic>;
      await _db.batch((batch) {
        for (final raw in items) {
          final item = raw as Map<String, dynamic>;
          batch.insert(
            _db.progress,
            ProgressCompanion.insert(
              courseItemId: Value(item['course_item_id'] as int),
              grade: item['grade'] as String,
              cleared: Value(item['cleared'] as bool),
              updatedAt: DateTime.now(),
            ),
            mode: InsertMode.insertOrReplace,
          );
        }
      });
    } on Object {
      // progress pull 실패해도 로그인은 완료된 상태로 둔다.
    }

    await _favoritesSyncService.pull();
    await _setActiveUserId(userId);
  }

  Future<void> _clearLocalProgressForAccountSwitch() async {
    // Task 3에서 채운다.
  }
```

`import 'package:dio/dio.dart';`는 필요 없다(catch가 `on Object`라 특정 타입 import 불필요).

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/core/sync/session_sync_coordinator.dart test/session_sync_coordinator_test.dart
git commit -m "feat: onLoginSuccess에 강제 push + 서버 progress pull 구현"
```

---

### Task 3: 계정 전환 감지 시 로컬 초기화

**Files:**
- Modify: `verse-flutter/lib/core/sync/session_sync_coordinator.dart`
- Modify: `verse-flutter/test/session_sync_coordinator_test.dart`

**Interfaces:**
- Consumes: Task 2의 `onLoginSuccess`, `_clearLocalProgressForAccountSwitch`(빈 스텁). 로컬 테이블:
  `Progress`, `AttemptQueue`, `Bookmarks`, `LivesState`(컬럼 `id`(PK, default 0), `count`(default
  10), `updatedAt`), `StreakState`(컬럼 `id`(PK, default 0), `currentLen`(default 0),
  `longestLen`(default 0), `lastDay`(nullable)).
- Produces: `_clearLocalProgressForAccountSwitch()` 완전 구현 — Task 2의 `onLoginSuccess`가 이미
  이 메서드를 호출하도록 되어 있으므로 이 Task는 내부 구현만 채운다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/session_sync_coordinator_test.dart`에 추가:

```dart
  group('onLoginSuccess - 계정 전환', () {
    test('active_user_id가 다르면 로컬 progress/attemptQueue/bookmarks를 비우고 lives/streak을 리셋한다', () async {
      // 계정 A 상태 시뮬레이션
      await db.into(db.syncMeta).insertOnConflictUpdate(
            const SyncMetaCompanion(key: Value('active_user_id'), value: Value('1')),
          );
      await db.into(db.progress).insert(ProgressCompanion.insert(
            courseItemId: const Value(1),
            grade: 'green',
            cleared: const Value(true),
            updatedAt: DateTime.now(),
          ));
      await db.into(db.bookmarks).insert(
            BookmarksCompanion.insert(courseItemId: const Value(1), createdAt: DateTime.now()),
          );
      await db.into(db.livesState).insertOnConflictUpdate(
            LivesStateCompanion.insert(id: const Value(0), count: const Value(3), updatedAt: DateTime.now()),
          );
      await db.into(db.streakState).insertOnConflictUpdate(
            StreakStateCompanion.insert(
              id: const Value(0),
              currentLen: const Value(5),
              longestLen: const Value(5),
              lastDay: const Value('2026-07-27'),
            ),
          );

      adapter = _FakeAdapter((options) async {
        if (options.path == '/me/progress') {
          return _json({'streak': {'current': 0, 'longest': 0}, 'courses': [], 'items': []});
        }
        return _json({}); // /sync/attempts — pending 없음
      });
      client.dio.httpClientAdapter = adapter;

      await coordinator.onLoginSuccess(2); // 다른 계정(userId=2)

      expect(await db.select(db.progress).get(), isEmpty);
      expect(await db.select(db.bookmarks).get(), isEmpty);
      final lives = await (db.select(db.livesState)..where((t) => t.id.equals(0))).getSingle();
      expect(lives.count, 10);
      final streak = await (db.select(db.streakState)..where((t) => t.id.equals(0))).getSingle();
      expect(streak.currentLen, 0);
      expect(streak.longestLen, 0);
      expect(streak.lastDay, isNull);
      expect(await coordinator.activeUserId, 2);
    });

    test('active_user_id가 같으면 로컬 progress를 비우지 않는다', () async {
      await db.into(db.syncMeta).insertOnConflictUpdate(
            const SyncMetaCompanion(key: Value('active_user_id'), value: Value('2')),
          );
      await db.into(db.progress).insert(ProgressCompanion.insert(
            courseItemId: const Value(1),
            grade: 'green',
            cleared: const Value(true),
            updatedAt: DateTime.now(),
          ));

      adapter = _FakeAdapter((options) async {
        if (options.path == '/me/progress') {
          return _json({'streak': {'current': 0, 'longest': 0}, 'courses': [], 'items': []});
        }
        return _json({});
      });
      client.dio.httpClientAdapter = adapter;

      await coordinator.onLoginSuccess(2);

      final row = await (db.select(db.progress)..where((t) => t.courseItemId.equals(1))).getSingleOrNull();
      expect(row, isNotNull); // 안 비워짐 — 이후 pull(items 없음)도 기존 값을 안 건드림
    });
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: FAIL — 계정 전환 테스트에서 `progress`/`bookmarks`가 안 비워짐, lives/streak 리셋 안 됨
(스텁이 빈 메서드이므로).

- [ ] **Step 3: 최소 구현 작성**

`_clearLocalProgressForAccountSwitch` 본문 채우기:

```dart
  Future<void> _clearLocalProgressForAccountSwitch() async {
    await _db.transaction(() async {
      await _db.delete(_db.progress).go();
      await _db.delete(_db.attemptQueue).go();
      await _db.delete(_db.bookmarks).go();
      await _db.into(_db.livesState).insertOnConflictUpdate(
            LivesStateCompanion.insert(id: const Value(0), count: const Value(10), updatedAt: DateTime.now()),
          );
      await _db.into(_db.streakState).insertOnConflictUpdate(
            const StreakStateCompanion(
              id: Value(0),
              currentLen: Value(0),
              longestLen: Value(0),
              lastDay: Value(null),
            ),
          );
    });
  }
```

`maxLives`(10)는 `lib/core/db/lives_streak_repository.dart:5`에 정의된 상수와 값이 같아야 한다 —
이 파일에서 새로 import하기보다(순환 의존 방지 목적, `SessionSyncCoordinator`는 sync 레이어,
`LivesRepository`는 db 레이어) 리터럴 10을 쓰고 주석으로 근거를 남긴다:

```dart
      await _db.into(_db.livesState).insertOnConflictUpdate(
            // maxLives(lib/core/db/lives_streak_repository.dart) 값과 동일하게 유지
            LivesStateCompanion.insert(id: const Value(0), count: const Value(10), updatedAt: DateTime.now()),
          );
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/core/sync/session_sync_coordinator.dart test/session_sync_coordinator_test.dart
git commit -m "feat: 계정 전환 감지 시 로컬 진도/즐겨찾기 초기화 + 목숨·스트릭 리셋"
```

---

### Task 4: `onLogout` — 로그아웃 시 best-effort 강제 push (데이터는 보존)

**Files:**
- Modify: `verse-flutter/lib/core/sync/session_sync_coordinator.dart`
- Modify: `verse-flutter/test/session_sync_coordinator_test.dart`

**Interfaces:**
- Consumes: Task 1의 `SyncService`(주입됨).
- Produces: `Future<void> onLogout()`.

- [ ] **Step 1: 실패하는 테스트 작성**

```dart
  group('onLogout', () {
    test('강제 동기화를 시도하지만 로컬 progress/active_user_id는 그대로 둔다', () async {
      await db.into(db.syncMeta).insertOnConflictUpdate(
            const SyncMetaCompanion(key: Value('active_user_id'), value: Value('9')),
          );
      await db.into(db.progress).insert(ProgressCompanion.insert(
            courseItemId: const Value(1),
            grade: 'green',
            cleared: const Value(true),
            updatedAt: DateTime.now(),
          ));

      var syncCalled = false;
      adapter = _FakeAdapter((options) async {
        syncCalled = true;
        return _json({'results': <dynamic>[]});
      });
      client.dio.httpClientAdapter = adapter;
      await db.into(db.attemptQueue).insert(AttemptQueueCompanion.insert(
            clientSeq: const Value('seq-x'),
            courseItemId: 1,
            mode: 'drag',
            clientGrade: 'green',
            tokensJson: '[]',
            createdAt: DateTime.now(),
          ));

      await coordinator.onLogout();

      expect(syncCalled, isTrue);
      expect(await coordinator.activeUserId, 9);
      final row = await (db.select(db.progress)..where((t) => t.courseItemId.equals(1))).getSingleOrNull();
      expect(row, isNotNull);
    });

    test('오프라인이어도 예외 없이 종료된다', () async {
      adapter = _FakeAdapter((options) async => throw DioException(requestOptions: options));
      client.dio.httpClientAdapter = adapter;

      await expectLater(coordinator.onLogout(), completes);
    });
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: FAIL — `onLogout` 메서드 없음(컴파일 에러).

- [ ] **Step 3: 최소 구현 작성**

```dart
  /// 로그아웃 버튼을 누른 시점, 토큰을 지우기 전에 호출.
  /// best-effort — 실패해도 로그아웃 자체를 막지 않는다. 로컬 progress와
  /// active_user_id는 그대로 둔다(재로그인 없이 게스트로 계속 쓰는 경우 대비).
  Future<void> onLogout() async {
    try {
      await _syncService.syncPendingAttempts(force: true);
    } on Object {
      // 무시 — 로그아웃은 항상 성공해야 한다.
    }
  }
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/session_sync_coordinator_test.dart`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/core/sync/session_sync_coordinator.dart test/session_sync_coordinator_test.dart
git commit -m "feat: onLogout에 best-effort 강제 동기화 구현(로컬 데이터 보존)"
```

---

### Task 5: Riverpod provider 등록

**Files:**
- Modify: `verse-flutter/lib/app/providers.dart`

**Interfaces:**
- Consumes: `databaseProvider`, `apiClientProvider`, `syncServiceProvider`,
  `favoritesSyncServiceProvider`(모두 기존, `providers.dart:27-49`).
- Produces: `final sessionSyncCoordinatorProvider = Provider<SessionSyncCoordinator>(...)` — Task 6에서
  `login_screen.dart`/`settings_screen.dart`가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

이 Task는 순수 provider 배선이라 별도 단위 테스트 대신, 기존 위젯 테스트 스위트가 provider
그래프를 깨뜨리지 않는지로 검증한다(추가 코드 없이 전체 테스트가 통과해야 함). 먼저 현재
상태에서 전체 테스트를 돌려 베이스라인을 기록한다:

Run: `cd verse-flutter && flutter test`
Expected: 기존 테스트 전부 PASS(베이스라인 — 아직 provider를 안 건드렸으므로 실패 없음).

- [ ] **Step 2: (해당 없음 — 배선 변경은 실패 재현 없이 바로 구현)**

이 Task는 새 동작을 추가하는 게 아니라 기존에 검증된 클래스를 provider로 노출하는 것뿐이므로,
Step 1의 베이스라인 통과 확인으로 "실패 확인" 단계를 대체한다.

- [ ] **Step 3: 구현 작성**

`lib/app/providers.dart` 상단 import에 추가:

```dart
import '../core/sync/session_sync_coordinator.dart';
```

`favoritesSyncServiceProvider` 정의 바로 다음(`providers.dart:49` 직후)에 추가:

```dart
final sessionSyncCoordinatorProvider = Provider<SessionSyncCoordinator>(
  (ref) => SessionSyncCoordinator(
    ref.watch(databaseProvider),
    ref.watch(apiClientProvider),
    ref.watch(syncServiceProvider),
    ref.watch(favoritesSyncServiceProvider),
  ),
);
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test`
Expected: PASS — 기존 전체 스위트 + Task 1-4에서 만든 `session_sync_coordinator_test.dart` 모두 통과.

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/app/providers.dart
git commit -m "feat: sessionSyncCoordinatorProvider 등록"
```

---

### Task 6: 로그인 화면에서 `onLoginSuccess` 호출

**Files:**
- Modify: `verse-flutter/lib/features/auth/login_screen.dart:38-111`
- Test: `verse-flutter/test/login_screen_sync_test.dart`

**Interfaces:**
- Consumes: `sessionSyncCoordinatorProvider`(Task 5), `AuthRepository.login/loginWithGoogle/loginWithApple`가
  반환하는 `AuthUser`(필드 `userId`, `auth_repository.dart:18`).
- Produces: 세 로그인 메서드 모두 인증 성공 직후, `_afterAuthSuccess(context)` 호출 전에
  `ref.read(sessionSyncCoordinatorProvider).onLoginSuccess(user.userId)`를 await.

기존 코드(`login_screen.dart:38-57`)는 이렇다:

```dart
  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).login(username: _username.text, password: _password.text);
      ref.invalidate(hasSessionProvider);
      if (mounted) _afterAuthSuccess(context);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = AppLocalizations.of(context)!.loginFailed);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
```

`await ref.read(authRepositoryProvider).login(...)`이 `void`를 버리고 있어 `user.userId`를 못 쓴다
— 반환값을 받도록 바꿔야 한다. `_loginWithGoogle`(62-82), `_loginWithApple`(87-111)도 동일한
패턴.

- [ ] **Step 1: 실패하는 테스트 작성**

`login_screen_sync_test.dart`는 위젯 풀 렌더링 없이, "로그인 성공 후 `onLoginSuccess`가 호출되는
로직"만 검증하기엔 위젯 테스트 셋업 비용이 크다(GoRouter, l10n 델리게이트 등). 대신 이 Task는
**로직 회귀를 막는 게 목적이 아니라 배선**이므로, Task 2/3/4에서 이미 `onLoginSuccess`/`onLogout`
자체는 충분히 단위 테스트되어 있다. 여기서는 실제 파일을 고치고 `flutter analyze`로 타입 오류
없음을 확인하는 것으로 검증을 대신한다(코드베이스에 기존 위젯 테스트가 로그인 화면 자체를
다루지 않음 — `grep`으로 확인됨).

Run: `cd verse-flutter && flutter analyze lib/features/auth/login_screen.dart`
Expected: 현재 상태에서는 통과(아직 안 고쳤으므로 에러 없음) — 이건 베이스라인 확인.

- [ ] **Step 2: (베이스라인 확인으로 대체, Step 1 참고)**

- [ ] **Step 3: 구현 작성**

`_login` 전체를 교체:

```dart
  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = await ref.read(authRepositoryProvider).login(username: _username.text, password: _password.text);
      await ref.read(sessionSyncCoordinatorProvider).onLoginSuccess(user.userId);
      ref.invalidate(hasSessionProvider);
      if (mounted) _afterAuthSuccess(context);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = AppLocalizations.of(context)!.loginFailed);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
```

`_loginWithGoogle` 안의 해당 줄:

```dart
      await ref.read(authRepositoryProvider).loginWithGoogle(idToken);
      ref.invalidate(hasSessionProvider);
```

를 다음으로 교체:

```dart
      final user = await ref.read(authRepositoryProvider).loginWithGoogle(idToken);
      await ref.read(sessionSyncCoordinatorProvider).onLoginSuccess(user.userId);
      ref.invalidate(hasSessionProvider);
```

`_loginWithApple` 안의 해당 줄:

```dart
      await ref.read(authRepositoryProvider).loginWithApple(idToken, name: name.isEmpty ? null : name);
      ref.invalidate(hasSessionProvider);
```

를 다음으로 교체:

```dart
      final user = await ref.read(authRepositoryProvider).loginWithApple(idToken, name: name.isEmpty ? null : name);
      await ref.read(sessionSyncCoordinatorProvider).onLoginSuccess(user.userId);
      ref.invalidate(hasSessionProvider);
```

파일 상단 import에 추가:

```dart
import '../../app/providers.dart'; // 이미 있음 — sessionSyncCoordinatorProvider도 여기서 export됨
```

(`providers.dart`를 통으로 import하고 있으므로 추가 import 불필요 — `login_screen.dart:11`에
`import '../../app/providers.dart';`가 이미 있음을 확인했다.)

- [ ] **Step 4: 검증**

Run: `cd verse-flutter && flutter analyze lib/features/auth/login_screen.dart`
Expected: `No issues found!`

Run: `cd verse-flutter && flutter test`
Expected: 전체 스위트 PASS(회귀 없음).

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/features/auth/login_screen.dart
git commit -m "feat: 로그인 성공 시 onLoginSuccess 호출해 진도 pull"
```

---

### Task 7: 로그아웃 흐름에서 `onLogout` 호출

**Files:**
- Modify: `verse-flutter/lib/features/settings/settings_screen.dart:311-318`

**Interfaces:**
- Consumes: `sessionSyncCoordinatorProvider`(Task 5).
- Produces: 로그아웃 `onTap`이 `authRepository.logout()` 호출 전에
  `sessionSyncCoordinatorProvider.onLogout()`을 await.

기존 코드(`settings_screen.dart:311-318`):

```dart
            _SettingsRow(
              title: l.settingsLogout,
              trailing: const Icon(Icons.logout),
              onTap: () async {
                await ref.read(authRepositoryProvider).logout();
                ref.invalidate(hasSessionProvider);
              },
            ),
```

- [ ] **Step 1: 베이스라인 확인**

Run: `cd verse-flutter && flutter analyze lib/features/settings/settings_screen.dart`
Expected: `No issues found!`(수정 전 베이스라인)

- [ ] **Step 2: (해당 없음 — Task 6과 동일한 이유로 analyze 베이스라인으로 대체)**

- [ ] **Step 3: 구현 작성**

```dart
            _SettingsRow(
              title: l.settingsLogout,
              trailing: const Icon(Icons.logout),
              onTap: () async {
                await ref.read(sessionSyncCoordinatorProvider).onLogout();
                await ref.read(authRepositoryProvider).logout();
                ref.invalidate(hasSessionProvider);
              },
            ),
```

파일 상단에 `sessionSyncCoordinatorProvider`를 쓰려면 import 확인 필요 — 이미
`settings_screen.dart`가 `authRepositoryProvider`를 쓰고 있으므로 `app/providers.dart`를 통으로
import 중일 가능성이 높다. 없다면 추가:

```bash
grep -n "^import.*providers.dart" lib/features/settings/settings_screen.dart
```

없으면 파일 상단에 `import '../../app/providers.dart';` 추가.

- [ ] **Step 4: 검증**

Run: `cd verse-flutter && flutter analyze lib/features/settings/settings_screen.dart`
Expected: `No issues found!`

Run: `cd verse-flutter && flutter test`
Expected: 전체 스위트 PASS.

- [ ] **Step 5: Commit**

```bash
cd verse-flutter
git add lib/features/settings/settings_screen.dart
git commit -m "feat: 로그아웃 시 onLogout 호출해 미동기화 기록 best-effort 반영"
```

---

## Self-Review 메모 (계획 작성자 자체 점검)

1. **스펙 커버리지**: (1) 진도 pull → Task 2. (2) 계정 전환 시 섞임 방지 → Task 3. (3) 게스트
   유실 창 축소(로그인 직후 강제 push) → Task 2 Step 3의 `syncPendingAttempts(force: true)` 호출.
   (2)의 "로그아웃 시 데이터 보존" → Task 4. 배선(provider/호출부) → Task 5, 6, 7. 스펙의 모든
   섹션이 대응하는 Task를 가진다.
2. **플레이스홀더 스캔**: "TBD"/"나중에"/"적절히 처리" 패턴 없음 — 모든 Step에 실제 코드 포함.
3. **타입 일관성**: `SessionSyncCoordinator` 생성자 시그니처가 Task 1(정의)과 Task 5(provider
   배선)에서 동일(`db, client, syncService, favoritesSyncService` 순서 고정). `onLoginSuccess(int
   userId)`, `onLogout()` 시그니처가 Task 2/4(정의)와 Task 6/7(호출부)에서 일치.
