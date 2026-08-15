# 통독/받아쓰기 스트릭 인정 (설계)

## 배경

`StreakRepository.recordActivityToday()`를 호출하는 곳이
[`memorize_controller.dart:434`](../../../verse-flutter/lib/features/memorize/memorize_controller.dart)
한 곳뿐이고, 그마저 `mode != 'dictation'` 조건이 걸려 있다. 결과적으로:

- 통독([`reading_controller.dart`](../../../verse-flutter/lib/features/reading/reading_controller.dart))만
  매일 하는 사용자는 스트릭이 영원히 0
- 받아쓰기(암송의 세 모드 drag/type/**dictation** 중 하나 — 채점·하트·진도 기록이 없는 무부담 연습 모드)만
  쓰는 사용자도 마찬가지

앱이 통독을 정식 트랙(플랜 모드 memorize/reading)으로 밀고 있는데, 정작 리텐션의 핵심 장치인 스트릭에서는
그 사용자를 활동이 없는 사람처럼 취급하고 있었다.

## 범위

통독 + 받아쓰기 둘 다 스트릭 인정 대상에 포함(사용자 결정). drag/type 암송은 이미 인정되고 있어 변경 없음.

## 수정 방향

### 통독 — `reading_controller.dart`

`_completeVerse()`(현재 141행 부근)가 `await _reading.markTyped(item.id);`를 호출하는 직후 스트릭을
기록한다. `ReadingController`는 `ref` 없이 저장소를 생성자로 직접 주입받는 구조라(`memorize_controller`와
다름), `StreakRepository`를 새 생성자 파라미터로 추가한다.

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
  }) : ...

  final StreakRepository _streak;
  ...

  Future<void> _completeVerse(int combo) async {
    final item = state.verse;
    await _reading.markTyped(item.id);
    await _streak.recordActivityToday();
    await _enqueueAttempt(item);
    ...
```

[`providers.dart:299`](../../../verse-flutter/lib/app/providers.dart)의 `readingControllerProvider`에서
`ref.watch(streakRepositoryProvider)`를 새 인자로 넘긴다.

### 받아쓰기 — `memorize_controller.dart`

`_completeDictation()`(현재 264행 부근)은 이미 `_ref`를 가진 컨트롤러이므로 한 줄만 추가:

```dart
  Future<void> _completeDictation() async {
    final current = state.value;
    if (current == null) return;
    final db = _ref.read(databaseProvider);
    final tokens = grading.normalize(current.item.verseText);
    await db.into(db.attemptQueue).insert(AttemptQueueCompanion.insert(...));
    await _ref.read(streakRepositoryProvider).recordActivityToday();
    state = AsyncValue.data(current.copyWith(dictationDoneTick: current.dictationDoneTick + 1));
    unawaited(_ref.read(syncServiceProvider).syncPendingAttempts());
  }
```

기존 주석("progress/하트/스트릭은 건드리지 않는다")은 이번에 사실과 달라지므로 함께 수정한다.

## 범위 밖

- 통독/받아쓰기 완료 시점의 리마인더(위험 경고 1002·복귀 알림 1004) 즉시 재계산은 넣지 않는다.
  `recordActivityToday()`가 스트릭 상태 자체는 바로 갱신하고, 알림 재예약은 다음 앱 시작이나 암송
  완료(`memorize_controller`의 기존 흐름) 시점에 자연히 따라온다. 통독/받아쓰기 완료 시점에도 알림을
  즉시 재계산하려면 `ReadingController`에 `ref` 전체를 주입하는 더 큰 리팩터가 필요한데, 이번 스펙은
  "스트릭이 오르는가"만 고치는 것으로 범위를 좁힌다.
- `recordActivityToday()`는 같은 로컬 날짜에 여러 번 호출해도 안전하다(`lastDay == today`면 그대로
  반환) — 절마다 호출해도 문제없다.

## 테스트

- `reading_controller_test.dart`(또는 관련 기존 테스트 파일): 절 하나를 완료하면 `StreakRepository`의
  `currentLen`이 1이 되는지 확인하는 테스트 추가. `ReadingController` 생성자 시그니처가 바뀌므로 기존
  테스트의 생성 호출부도 함께 갱신.
- `memorize_controller_test.dart`(또는 관련 기존 테스트 파일): 받아쓰기 모드로 절을 완료하면 스트릭이
  오르는지 확인하는 테스트 추가(기존에 "dictation은 스트릭을 안 건드린다"를 검증하는 테스트가 있다면
  그 반대로 수정).
