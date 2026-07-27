# 게스트→로그인 기록 승계 · 계정 전환 안전화 설계

## 배경

이전 조사에서 확인된 3가지 문제:

1. **서버→기기 진도 pull 부재**: 새 기기/재설치 후 로그인해도 서버에 이미 있는 진도가 기기로
   내려오지 않는다. 모바일 화면은 항상 로컬 DB(`progress` 테이블) 기준이라, 다른 기기·웹에서
   쌓은 기록이 안 보인다.
2. **계정 전환 시 기록 섞임**: 로컬 DB에 "이 데이터가 어느 계정 것인지" 표시가 전혀 없다
   (`SyncMeta` 키-값 테이블은 있지만 user_id를 안 씀). 계정 A로 로그아웃 후 계정 B로 로그인하면
   A의 로컬 진도가 그대로 남아 B의 화면에 섞여 보인다.
3. **게스트 기록 유실 창**: 게스트 상태에서 쌓은 미동기화 기록은 다음 앱 재시작/복귀 때까지
   기다렸다가 동기화된다. 그 사이 앱을 삭제하면 서버에 한 번도 반영되지 못한 기록이 영구
   유실된다.

서버에는 이미 `GET /me/progress`([progress_dto.go](verse-backend/internal/handler/dto/progress_dto.go))가
존재하므로 신규 엔드포인트는 필요 없다. 수정은 전부 Flutter 클라이언트(`verse-flutter`) 쪽이다.

## 범위

- 대상: `verse-flutter`의 로그인/로그아웃 흐름, 로컬 DB 스키마(`SyncMeta`에 계정 식별자 추가),
  진도 pull 로직.
- 범위 밖: 목숨(`LivesState`)·스트릭(`StreakState`)은 **서버 값을 pull하지 않는다** — 그대로
  기기 로컬 계산 전용으로 둔다. 스트릭은 `lastDay` 기반 자체 계산 로직
  ([lives_streak_repository.dart:74](verse-flutter/lib/core/db/lives_streak_repository.dart:74))이
  이미 완결적이고, 서버 `ProgressResponse`는 `lastDay`를 안 주므로 여기 억지로 덮어쓰면 로컬
  스트릭 판정이 깨진다. (단, 계정 *전환* 시 이전 계정 값이 새 계정에 섞이지 않도록 기본값으로
  리셋은 한다 — 아래 (3)번 참고. "pull 안 함"과 "전환 시 리셋"은 별개다.) 즐겨찾기(bookmarks)는
  이미 [favorites_sync_service.dart](verse-flutter/lib/core/sync/favorites_sync_service.dart)에
  push/pull이 있으므로 이번 변경과 별개로 그대로 재사용한다.
- 백엔드 변경 없음 — 기존 `GET /me/progress`, `POST /sync/attempts`만 사용한다.

## 핵심 아이디어: 계정 식별자

`SyncMeta`(키-값 테이블)에 `active_user_id` 키를 추가한다. 로그인 성공 시 서버가 돌려주는
`user_id`를 기록한다. 게스트 상태에서는 이 키가 없다. 이 값이 "지금 로컬 DB의 진도/기록이
누구 것인지"를 판별하는 유일한 기준이 된다.

## 상태 전이 3가지

### (1) 로그인 (게스트→로그인, 또는 같은 계정 재로그인)

조건: `active_user_id`가 없음 **또는** 서버가 돌려준 `user_id`와 같음.

1. `syncPendingAttempts(force: true)` — 로컬에 쌓인 미동기화 기록(게스트 기록 포함)을 즉시
   push. 게스트 기록 유실 창 문제(3번)를 직접 해결하는 지점 — 지금까지는 다음 앱 재시작/복귀를
   기다렸지만, 로그인 성공 직후 그 자리에서 강제 동기화한다.
2. `GET /me/progress` 호출 → 응답의 `items`(course_item_id/grade/cleared)를 로컬 `progress`
   테이블에 upsert. 방금 1번에서 push한 것까지 포함해 서버가 이제 최신 상태이므로, 병합 로직
   없이 서버 값으로 덮어써도 안전하다(server-authoritative, 사용자 확정 사항).
3. `active_user_id`를 서버 `user_id`로 기록(이미 같았다면 no-op).

### (2) 로그아웃

1. `syncPendingAttempts(force: true)` — best-effort. 기존 코드베이스의 다른 sync 호출들과
   동일하게 실패해도 무시하고 진행한다([favorites_sync_service.dart:19](verse-flutter/lib/core/sync/favorites_sync_service.dart:19)의
   `push()`와 같은 패턴).
2. 토큰 삭제(기존 `AuthRepository.logout()` 동작 그대로).
3. **로컬 `progress`/`attemptQueue`/`active_user_id`는 건드리지 않는다.** 사용자 확인 사항 —
   로그아웃 후 재로그인 없이 게스트로 계속 쓰면 직전 계정의 진도가 그대로 이어져 보여야 한다.

### (3) 계정 전환 (다른 계정으로 로그인)

조건: `active_user_id`가 있고 서버가 돌려준 `user_id`와 다름.

1. 로컬 `progress`, `attemptQueue`, `bookmarks`를 전부 비우고, `livesState`/`streakState`는
   기본값(목숨 만렙·스트릭 0)으로 리셋한다(사용자 확인 사항 — 로그인 시점에 초기화). 이 리셋은
   서버 값을 가져오는 게 아니라 단순히 "이전 계정 값이 새 계정 화면에 안 보이게" 지우는 것이다
   — 목숨/스트릭의 실제 서버 동기화는 이번 스코프 밖(범위 절 참고). 직전 계정의 미동기화
   기록은 로그아웃(2번) 때 이미 best-effort로 push되었으므로 정상적인 경우 유실이 없다.
2. 이후 (1)과 동일하게 진행: 강제 동기화(비운 직후라 사실상 no-op) → 서버 진도 pull → 새
   `user_id`로 `active_user_id` 갱신.

**알려진 한계 (명시적으로 받아들이는 리스크):** 로그아웃 시점에 기기가 오프라인이면 2번의
push가 실패한다. 그 상태로 (재접속 없이) 바로 다른 계정에 로그인하면, 계정 전환 로직이 로컬
데이터를 비우면서 직전 계정의 미동기화 기록이 복구 불가능하게 사라진다. 이 경로는 "로그아웃
시 마침 오프라인 + 재로그인 없이 바로 다른 계정으로 전환"이 겹쳐야 하는 좁은 경우이고, 앱에
계정별 오프라인 큐를 별도로 유지하는 건 이번 스코프에 비해 과한 설계라 판단해 받아들인다.
(대안이 필요하면 별도로 논의)

## 컴포넌트

### 새 파일: `lib/core/sync/session_sync_coordinator.dart`

```dart
class SessionSyncCoordinator {
  SessionSyncCoordinator(this._db, this._client, this._syncService, this._favoritesSyncService);

  final AppDatabase _db;
  final ApiClient _client;
  final SyncService _syncService;
  final FavoritesSyncService _favoritesSyncService;

  static const _activeUserIdKey = 'active_user_id';

  /// 로그인 성공 직후 호출(로그인/회원가입/구글/애플 공통).
  Future<void> onLoginSuccess(int userId) async { ... }

  /// 로그아웃 버튼을 누른 시점, 토큰을 지우기 전에 호출.
  Future<void> onLogout() async { ... }
}
```

- `onLoginSuccess`: 위 상태 전이 (1)/(3) 로직. `active_user_id`를 읽어 분기.
- `onLogout`: 위 상태 전이 (2) 로직 — `syncPendingAttempts(force:true)`만 best-effort 호출.
- 로컬 테이블 초기화용 헬퍼(`_clearLocalProgress()`)를 이 클래스 안에 둔다 — 계정 전환에서만
  쓰이는 좁은 책임이라 `AppDatabase`에 범용 메서드로 얹지 않는다.

`AuthRepository`는 건드리지 않는다 — 토큰/HTTP 책임만 유지하고 동기화 오케스트레이션은 모른다
(기존 설계 원칙 유지).

### `app/providers.dart`

`sessionSyncCoordinatorProvider` 추가 (기존 `syncServiceProvider`/`favoritesSyncServiceProvider`와
같은 패턴).

### 호출부 변경

- `lib/features/auth/login_screen.dart`의 `_login`/`_loginWithGoogle`/`_loginWithApple`: 인증
  API 호출 성공 직후, `_afterAuthSuccess` 이전에 `sessionSyncCoordinatorProvider.onLoginSuccess(user.userId)`를
  awaited로 추가. 기존 `_loading` 스피너가 이 구간까지 자연히 덮는다.
- `lib/features/settings/settings_screen.dart`의 로그아웃 `onTap`: `authRepository.logout()`
  호출 **전에** `sessionSyncCoordinatorProvider.onLogout()`을 awaited로 추가.
- `AuthUser`에 이미 `userId`가 있으므로 (`auth_repository.dart:18`) 추가 필드 불필요.

### `lib/core/db/app_database.dart`

스키마 변경 없음 — `SyncMeta`는 이미 범용 키-값 테이블이라 `active_user_id` 키를 추가하는 데
마이그레이션이 필요 없다.

## 에러 처리

- `onLoginSuccess` 도중 `GET /me/progress`가 실패(오프라인 등)하면: 이미 로그인은 성공했으니
  실패를 삼키고 로그인 자체는 완료시킨다(기존 `catchError((_) {})` 패턴과 동일). 사용자는 다음
  앱 재시작/복귀 때의 일반 sync 경로에서 다시 시도된다 — 단, 그 경로는 push만 하고 progress
  pull은 하지 않으므로, `SessionSyncCoordinator`에 재시도 트리거를 별도로 추가하지 않는다(이번
  스코프 밖). 실패 시 사용자에게 별도 배너 없음 — 조용히 다음 로그인/앱 상태 갱신을 기다린다.
- `onLogout`의 push 실패는 완전히 무시 — 로그아웃 자체는 항상 성공해야 한다(사용자가 로그아웃을
  못 하게 막으면 안 됨).
- 계정 전환 시 로컬 테이블 비우기는 트랜잭션으로 묶어 부분 실패를 방지한다.

## 테스트

- `SessionSyncCoordinator`에 대한 단위 테스트(인메모리 DB, mock Dio):
  - 게스트(active_user_id 없음) → 로그인 → push 호출됨 + progress pull 후 로컬 upsert 확인.
  - 같은 계정 재로그인 → 로컬 테이블 안 비워짐, pull만 발생.
  - 다른 계정으로 전환 → 로컬 progress/attemptQueue/bookmarks/livesState/streakState 비워짐 확인
    → 이후 새 계정 pull 결과로 채워짐.
  - 로그아웃 → syncPendingAttempts(force:true) 호출됨, 로컬 progress/active_user_id 불변 확인.
  - 로그아웃 중 push 실패(오프라인 mock) → 예외 없이 정상 종료 확인.
