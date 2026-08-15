# 스트릭 프리즈 + 복구 (설계)

## 배경

현재 스트릭은 하루라도 공백이 생기면 즉시 0으로 리셋된다(`StreakRepository.recordActivityToday()`,
`lib/core/db/lives_streak_repository.dart`). 듀오링고식 리텐션의 핵심은 "스트릭을 끊기 어렵게 만드는 것"이다
— 매몰비용이 한순간에 0이 되는 절벽 구조가 이탈을 만든다. 이번 스펙은 두 가지를 도입한다:

1. **프리즈**: 스트릭이 이어지는 중 하루(또는 이틀) 공백이 생겨도 자동으로 흡수해 스트릭을 지켜준다.
2. **복구**: 프리즈로도 못 막아 스트릭이 실제로 끊긴 경우, 끊긴 지 48시간 이내면 보상형 광고로 되살릴 수 있다.

## 결정 사항

1. **프리즈 획득**: `currentLen`이 7의 배수를 새로 넘을 때마다 자동 지급 1개.
2. **최대 보유**: 2개(클램프 — 이미 2개면 추가 지급 없음, 낭비 처리하지 않고 그냥 상한).
3. **소모 시점**: 활동이 없던 날 이후 사용자가 **다음에 앱을 열 때**(정확히는 다음 `recordActivityToday()`
   호출 시점) 자동·조용히 소모. 사용자가 아무것도 안 해도 동작(듀오링고 핵심 — 소모 여부를 사용자가
   결정하지 않는다).
4. **공백 커버리지**: 공백이 이틀이고 프리즈가 2개면 **둘 다 소모해서 이틀 공백도 막아준다**(gap ≤
   보유 프리즈 개수면 항상 커버). 프리즈가 부족하면(gap > 보유 개수) 기존처럼 리셋.
5. **복구 기한**: 스트릭이 실제로 끊긴 시점(gap이 프리즈로 못 막을 만큼 컸던 시점)으로부터 **48시간**
   이내. 그 안에 광고를 보면 끊기기 직전 `currentLen`으로 복원.
6. **복구 횟수**: 끊길 때마다 매번 가능(사용 횟수 제한 없음) — 프리즈와 같은 설계 철학, 광고 시청
   자체가 비용이라 별도 제한 불필요.

## DB 스키마 변경 (schemaVersion 5 → 6)

`StreakState` 테이블에 컬럼 4개 추가:

```dart
class StreakState extends Table {
  IntColumn get id => integer().withDefault(const Constant(0))();
  IntColumn get currentLen => integer().withDefault(const Constant(0))();
  IntColumn get longestLen => integer().withDefault(const Constant(0))();
  TextColumn get lastDay => text().nullable()(); // YYYY-MM-DD (로컬 자정 기준)

  /// 보유 프리즈 개수. 최대 2, 7일마다 자동 지급.
  IntColumn get freezeCount => integer().withDefault(const Constant(0))();

  /// 마지막으로 프리즈를 지급한 시점의 currentLen — "7의 배수를 이미 지급했는지"
  /// 판정용. currentLen이 리셋되면 이 값도 함께 리셋해야 같은 배수에서 중복
  /// 지급되지 않는다.
  IntColumn get freezeGrantedAtLen => integer().withDefault(const Constant(0))();

  /// 스트릭이 실제로 끊기기 직전의 currentLen. 복구 시 이 값으로 되돌린다.
  /// 끊긴 적이 없거나 이미 복구/만료됐으면 null.
  IntColumn get brokenFromLen => integer().nullable()();

  /// 스트릭이 끊긴 로컬 날짜(YYYY-MM-DD). 48시간 복구 기한 판정용.
  TextColumn get brokenOnDay => text().nullable()();
}
```

`app_database.dart`의 `migration.onUpgrade`에 `if (from < 6) { await m.addColumn(...) x4; }` 추가,
`schemaVersion`을 6으로.

## `StreakRepository.recordActivityToday()` 로직 변경

현재 로직(`lib/core/db/lives_streak_repository.dart:87-107`)을 다음 순서로 확장한다:

1. `today == lastDay`면 기존과 동일하게 그대로 반환(변경 없음).
2. gap(=오늘과 lastDay의 날짜 차이)을 계산.
3. **gap이 1이거나 2이고 `freezeCount >= gap`**: 프리즈를 gap만큼 소모(`freezeCount -= gap`), `currentLen`은
   리셋하지 않고 +1, `lastDay`를 오늘로. `brokenFromLen`/`brokenOnDay`는 그대로 null 유지(끊긴 적 없음).
4. **그 외(gap이 0/1/2인데 프리즈 부족, 또는 gap ≥ 3)**: 기존처럼 `currentLen`을 1로 리셋하되, 리셋 직전
   `currentLen`이 1 이상이었으면(끊기기 전 스트릭이 있었으면) `brokenFromLen`에 그 값을, `brokenOnDay`에
   **오늘**(리셋이 감지된 날 = 복구 기한 계산 기준일)을 기록. `freezeGrantedAtLen`도 0으로 리셋(다음 7일
   배수부터 다시 카운트).
5. 매 호출 끝에서 `currentLen`이 `freezeGrantedAtLen + 7`을 넘었으면 `freezeCount`를 `min(freezeCount + 1, 2)`로
   올리고 `freezeGrantedAtLen`을 그 7의 배수로 갱신(연속으로 여러 배수를 건너뛰는 경우는 없음 — 하루에
   1씩만 오르므로 한 번에 최대 1개 지급).

의사코드:

```dart
Future<StreakStateData> recordActivityToday() async {
  final row = await ...;
  final today = todayLocalString();

  if (row == null || row.lastDay == null) {
    // 최초 기록 — 기존과 동일, freeze 관련 필드는 기본값(0/0/null/null).
  }

  if (row.lastDay == today) return row;

  final gap = DateTime.parse(today).difference(DateTime.parse(row.lastDay!)).inDays;

  int newCurrent;
  int newFreezeCount = row.freezeCount;
  int? newBrokenFromLen = row.brokenFromLen;
  String? newBrokenOnDay = row.brokenOnDay;
  int newFreezeGrantedAtLen = row.freezeGrantedAtLen;

  if (gap >= 1 && gap <= 2 && row.freezeCount >= gap) {
    newCurrent = row.currentLen + 1;
    newFreezeCount = row.freezeCount - gap;
  } else {
    if (row.currentLen >= 1) {
      newBrokenFromLen = row.currentLen;
      newBrokenOnDay = today;
    }
    newCurrent = 1;
    newFreezeGrantedAtLen = 0;
  }

  if (newCurrent >= newFreezeGrantedAtLen + 7) {
    newFreezeCount = min(newFreezeCount + 1, 2);
    newFreezeGrantedAtLen = (newCurrent ~/ 7) * 7;
  }

  final newLongest = newCurrent > row.longestLen ? newCurrent : row.longestLen;
  // 저장 + 반환
}
```

## 복구 API

`StreakRepository`에 새 메서드 추가:

```dart
/// 복구 가능 여부. brokenOnDay로부터 48시간 이내인지 로컬 시각으로 판정한다.
/// 날짜 문자열(자정 기준)만으로는 48시간을 정확히 못 재므로, 이 판정만은
/// brokenOnDay를 로컬 자정 DateTime으로 변환해 DateTime.now()와 직접 비교한다.
Future<bool> canRecover() async {
  final row = await current();
  if (row?.brokenFromLen == null || row?.brokenOnDay == null) return false;
  final brokenAt = DateTime.parse(row!.brokenOnDay!); // 로컬 자정
  return DateTime.now().difference(brokenAt) <= const Duration(hours: 48);
}

/// 광고 시청 완료 후 호출 — 끊기기 직전 currentLen으로 복원.
Future<void> recoverStreak() async {
  final row = await current();
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
```

`canRecover()`가 48시간을 넘긴 걸 감지했을 때 `brokenFromLen`/`brokenOnDay`를 지우는 정리는
`recordActivityToday()`가 다음 활동 때 자연히 덮어쓰므로 별도 청소 로직 없이도 무한정 남지 않는다
(단, 사용자가 그 사이 앱을 안 열면 화면에 만료된 배너가 뜰 수 있으므로 UI에서도 `canRecover()`의 48시간
판정을 신뢰하고, 만료됐으면 배너 자체를 숨긴다 — DB 값 정리 여부와 무관하게 UI가 항상 재판정).

## UI

- **오늘 화면**([today_screen.dart:200-210](../../../verse-flutter/lib/features/today/today_screen.dart)):
  스트릭 숫자 옆에 `freezeCount > 0`일 때만 `❄️×N` 표시(기존 🔥 + 목숨 배지 사이).
- **프리즈 자동 소모 안내**: 프리즈가 소모된 걸 감지하면(이전 세션 대비 `freezeCount` 감소 + 스트릭 안 끊김)
  오늘 화면에 1회성 배너 "Shaun이 하루 대신 지켜줬어요 ❄️" — 마일스톤 축하 배너와 동일한 위치/패턴
  (`AppSettingsRepository`에 "마지막으로 안내한 소모 이벤트"를 저장해 중복 안내 방지).
- **복구 배너**: `canRecover()`가 true면 오늘 화면 상단에 "스트릭이 끊겼어요 — 광고 보고 이어하기"
  배너. 탭하면 `AdService.showRewarded()` → 성공 콜백에서 `recoverStreak()` 호출 후 화면 갱신.

## 알림 연동

`reminder_service.dart`의 `shouldScheduleComeback`(gap 1~2 구간에 복귀 알림 예약)은 프리즈가 그 공백을
이미 메울 수 있는 경우 억제해야 한다 — 안 끊긴 스트릭에 "복귀하세요" 알림이 뜨는 모순 방지.
`refreshComeback()` 호출부에서 `streak.freezeCount >= gap`이면 예약을 건너뛰도록 가드 추가
(`shouldScheduleComeback` 순수 함수 자체에 freezeCount 파라미터를 추가하는 형태 — 기존 시그니처에
파라미터 하나 늘어남, 호출부 전부 갱신 필요).

## 마이그레이션

기존 사용자는 `freezeCount=0`으로 시작(스키마 기본값) — 첫 7일 배수를 다시 넘을 때 지급되므로 소급 지급
없음. `brokenFromLen`/`brokenOnDay`도 기본 null — 스펙 적용 이전에 끊긴 스트릭에 대한 소급 복구는 없다.

## 테스트

- `StreakRepository` 단위 테스트(순수 로직): gap=1/2 프리즈 소모 후 스트릭 유지, gap이 프리즈 초과 시
  리셋 + `brokenFromLen` 기록, 7의 배수 도달 시 프리즈 지급(최대 2 클램프 포함), `canRecover()`의
  48시간 경계값(47시간59분 true, 48시간1분 false), `recoverStreak()` 호출 후 `currentLen` 복원 및
  `brokenFromLen`/`brokenOnDay` 초기화.
- `shouldScheduleComeback` 관련 순수 함수 테스트에 freezeCount 파라미터 케이스 추가.
- UI 위젯 테스트는 배너 노출 조건(있음/없음) 정도로 가볍게.

## 구현 완료

`docs/superpowers/plans/2026-08-16-streak-freeze-recovery.md` 계획대로 구현 완료. schemaVersion 5→6,
`StreakRepository`에 `missedDays` 기준 프리즈 소모/지급과 `canRecover`/`recoverStreak` 추가,
`shouldScheduleComeback`이 프리즈로 커버되는 공백엔 예약하지 않도록 수정(단, missedDays=0인 정상 상태는
freezeCount와 무관하게 기존 로직을 따르도록 오프바이원 버그를 계획 단계에서 미리 고침), 오늘 화면에
프리즈 배지(❄️×N)와 48시간 복구 배너 추가. 구현 중 기존 `plan_migration_v4_to_v5_test.dart`가 手작업
v4 fixture에 `streak_state` 테이블을 안 만들어서 v6 마이그레이션(addColumn)이 실패하는 걸 발견해 함께
수정. `flutter test` 전체 469개 통과, `flutter analyze` 이번 변경과 무관한 기존 이슈만 남음.
