# 알람(리마인더) 문구 확장 + 마일스톤/복귀 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** verse-flutter 리마인더 알림의 문구 풀을 확장하고, 마일스톤(7/30/100일) 전야 전용 문구와 스트릭이 끊긴 뒤 2일차에 1회 발화하는 복귀 유도 알림(ID 1004)을 추가한다.

**Architecture:** 기존 `ReminderService`(`verse-flutter/lib/core/notifications/reminder_service.dart`)의 문구 선택 함수(`_pickBody`, `dangerBody`)를 확장하고, 기존 `refreshStreakDanger` 패턴을 그대로 복제한 `refreshComeback` 메서드를 추가한다. 판정 로직은 순수 함수(`shouldScheduleComeback`)로 분리해 단위 테스트 가능하게 유지 — 기존 `shouldScheduleStreakDanger`/`shouldPauseReminders`와 동일한 스타일.

**Tech Stack:** Flutter/Dart, `flutter_local_notifications`, `timezone`, `flutter_test`.

## Global Constraints

- 모든 신규/변경 문구는 ko/en 쌍으로 존재해야 한다 (스펙 §Phase A, §B-1, §B-2).
- 신규 알림 ID는 기존 1001/1002/1003과 충돌하지 않는 `1004`를 사용한다.
- 복귀 알림은 리마인더가 꺼져 있으면(`settings.enabled == false`) 절대 예약되지 않는다.
- 순수 판정 함수는 `BuildContext`/플러그인 의존 없이 단위 테스트 가능해야 한다(기존 `shouldScheduleStreakDanger` 스타일 유지).

---

### Task 1: 데일리/위험 알림 문구 풀 확장 (Phase A)

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart:54-68` (`dangerBody`), `:268-304` (`_pickBody`)
- Test: `verse-flutter/test/streak_danger_test.dart`

**Interfaces:**
- Consumes: 없음 (기존 함수 시그니처 유지 — `dangerBody(int currentStreak, int dayIndex, String locale)`, `_pickBody`는 private이라 클래스 내부에서만 호출)
- Produces: 확장된 문구 풀 (이후 Task 2가 마일스톤 분기를 이 함수들 앞단에 추가할 때 참조)

- [ ] **Step 1: 위험 알림 4번째 문구 테스트 추가 (실패 확인용)**

`verse-flutter/test/streak_danger_test.dart`의 `배고픔 알림 문구` 그룹에 추가:

```dart
    test('풀이 5종으로 확장되어 dayIndex=3,4도 서로 다른 문구를 반환한다', () {
      final all = {for (var i = 0; i < 5; i++) dangerBody(5, i, 'ko')};
      expect(all.length, 5);
      final allEn = {for (var i = 0; i < 5; i++) dangerBody(5, i, 'en')};
      expect(allEn.length, 5);
    });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: FAIL — `dayIndex=3,4`가 `dayIndex % 3`으로 앞의 문구를 재사용하므로 `all.length`가 5가 아니라 3.

- [ ] **Step 3: `dangerBody` 문구 풀을 3종 → 5종으로 확장**

`reminder_service.dart:54-68`을 다음으로 교체:

```dart
String dangerBody(int currentStreak, int dayIndex, String locale) {
  final n = currentStreak;
  final options = locale == 'en'
      ? [
          'Feed $mascotName with one verse — your $n-day streak ends tonight too!',
          '$mascotName is waiting. One verse keeps both $mascotName and your $n-day streak 🍞',
          '⏰ Last call! One verse now feeds $mascotName and saves $n days.',
          '$n days vanish at midnight. Just one verse for $mascotName 🍞',
          '$mascotName: "just one verse…" 🥺 your $n-day streak is waiting',
        ]
      : [
          '한 절로 $mascotName을 먹여주세요 — $n일 스트릭도 오늘 밤 끊겨요!',
          '$mascotName이 기다려요. 한 절이면 $mascotName도 $n일 스트릭도 지켜져요 🍞',
          '⏰ 마지막 기회! 지금 한 절이면 $mascotName도 $n일도 지킬 수 있어요.',
          '$n일이 오늘 밤 12시에 사라져요. $mascotName에게 한 절만 🍞',
          '$mascotName: "한 절만 있으면 되는데…" 🥺 $n일 스트릭이 기다려요',
        ];
  return options[dayIndex % options.length];
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS

- [ ] **Step 5: 데일리 문구 풀 확장 (테스트 없이 직접 교체 — 기존 테스트가 이 함수를 직접 커버하지 않음)**

`reminder_service.dart:268-304`의 `_pickBody`를 다음으로 교체:

```dart
  String _pickBody(int currentStreak, String locale) {
    final dayIndex = tz.TZDateTime.now(tz.local)
        .difference(tz.TZDateTime(tz.local, 2000))
        .inDays;

    if (currentStreak > 0) {
      final n = currentStreak;
      final options = locale == 'en'
          ? [
              "You're on a $n-day streak — memorize a verse today?",
              "$n days in a row! One verse today keeps it going 🔥",
              "Don't let the streak break — day $n!",
              '$n days were built one verse at a time. Today too',
              "$mascotName's been with you $n days 🍞 one more verse!",
              'One verse turns $n days into ${n + 1}',
            ]
          : [
              '$n일째 이어가는 중이에요 — 오늘도 한 절 외워볼까요?',
              '$n일 연속! 오늘 한 절이면 기록이 계속돼요 🔥',
              '불꽃을 꺼뜨리지 마세요 — $n일째예요 🔥',
              '$n일을 만든 건 매일의 한 절이었어요. 오늘도요',
              '$mascotName도 $n일째 함께 걷는 중 🍞 오늘 한 절 더!',
              '오늘 한 절이면 $n일이 ${n + 1}일이 돼요',
            ];
      return options[dayIndex % options.length];
    }

    final options = locale == 'en'
        ? [
            "Ready to memorize today's verse?",
            'One verse, planted in your heart ✨',
            "Just one verse is enough — shall we start today?",
            "It only takes a minute — today's verse? ⏱️",
            'Plant a seed in your heart today 🌱',
            '$mascotName brought you today\'s verse 🍞',
            'One verse before bed — a good way to end the day 🌙',
            'One verse instead of one more scroll? 📖',
          ]
        : [
            '오늘의 한 절을 외워볼까요?',
            '말씀 한 구절, 마음에 새겨봐요 ✨',
            '딱 한 절이면 충분해요 — 오늘도 시작해볼까요?',
            '1분이면 돼요. 오늘의 한 절 어때요? ⏱️',
            '오늘 한 절로 마음에 씨앗을 심어봐요 🌱',
            '$mascotName이 오늘의 말씀을 물고 왔어요 🍞',
            '잠들기 전 한 절, 오늘을 잘 닫는 법이에요 🌙',
            '스크롤 대신 한 절 어때요? 📖',
          ];
    return options[dayIndex % options.length];
  }
```

- [ ] **Step 6: 전체 리마인더 테스트 실행**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart test/reminder_repository_test.dart`
Expected: PASS (모두)

- [ ] **Step 7: Commit**

```bash
cd verse-flutter && git add lib/core/notifications/reminder_service.dart test/streak_danger_test.dart
git commit -m "feat: 리마인더 알림 문구 풀 확장 (데일리 8/6종, 위험 5종)"
```

---

### Task 2: 마일스톤 전야 전용 문구 (Phase B-1)

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart` (Task 1 완료 후 상태)
- Test: `verse-flutter/test/streak_danger_test.dart`

**Interfaces:**
- Consumes: `mascotName` 상수 (기존, `reminder_service.dart:45`)
- Produces: 최상위 함수 `String? milestoneBody(int currentStreak, String locale, {required bool isDanger})` — Task 1의 `dangerBody`/`_pickBody`가 호출

- [ ] **Step 1: `milestoneBody` 테스트 작성**

`streak_danger_test.dart`에 새 그룹 추가:

```dart
  group('milestoneBody', () {
    test('currentStreak+1이 7/30/100이면 전용 문구를 반환한다', () {
      for (final n in [6, 29, 99]) {
        expect(milestoneBody(n, 'ko', isDanger: false), isNotNull);
        expect(milestoneBody(n, 'en', isDanger: false), isNotNull);
      }
    });

    test('마일스톤이 아니면 null을 반환한다', () {
      expect(milestoneBody(5, 'ko', isDanger: false), isNull);
      expect(milestoneBody(10, 'ko', isDanger: false), isNull);
    });

    test('문구에 마일스톤 숫자가 포함된다', () {
      expect(milestoneBody(6, 'ko', isDanger: false), contains('7'));
      expect(milestoneBody(29, 'en', isDanger: false), contains('30'));
    });

    test('isDanger에 따라 다른 문구를 반환한다', () {
      expect(milestoneBody(6, 'ko', isDanger: false),
          isNot(equals(milestoneBody(6, 'ko', isDanger: true))));
    });
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: FAIL — `milestoneBody` undefined

- [ ] **Step 3: `milestoneBody` 함수 구현**

`reminder_service.dart`의 `mascotName` 상수(라인 45) 바로 뒤에 추가:

```dart
/// 마일스톤(7/30/100일) 달성 전야 전용 문구. currentStreak+1이 마일스톤에
/// 해당하지 않으면 null — 호출부는 null이면 기존 순환 풀로 폴백한다.
const _milestones = {7, 30, 100};

String? milestoneBody(int currentStreak, String locale, {required bool isDanger}) {
  final next = currentStreak + 1;
  if (!_milestones.contains(next)) return null;

  if (isDanger) {
    return locale == 'en'
        ? 'Finish tonight for your $next-day badge — don\'t miss it 🏅'
        : '오늘 밤 안에 한 절이면 $next일 달성! 놓치지 마세요 🏅';
  }
  return locale == 'en'
      ? 'One verse away from a $next-day badge 🏅 — finish it now?'
      : '오늘 한 절이면 $next일 달성이에요 🏅 지금 채워볼까요?';
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS

- [ ] **Step 5: `dangerBody`와 `_pickBody`가 `milestoneBody`를 우선 사용하도록 배선**

`dangerBody` 함수 시작부(Task 1에서 수정한 버전)를 다음으로 교체:

```dart
String dangerBody(int currentStreak, int dayIndex, String locale) {
  final milestone = milestoneBody(currentStreak, locale, isDanger: true);
  if (milestone != null) return milestone;

  final n = currentStreak;
  final options = locale == 'en'
      ? [
```

(이하 기존 리스트 그대로 유지, `return options[dayIndex % options.length];` 앞까지 변경 없음)

`_pickBody`의 `if (currentStreak > 0) {` 블록 시작부를 다음으로 교체:

```dart
    if (currentStreak > 0) {
      final milestone = milestoneBody(currentStreak, locale, isDanger: false);
      if (milestone != null) return milestone;

      final n = currentStreak;
```

- [ ] **Step 6: 마일스톤 문구가 실제로 우선 반환되는지 통합 테스트 추가**

`streak_danger_test.dart`의 `배고픔 알림 문구` 그룹에 추가:

```dart
    test('마일스톤 전야에는 dangerBody가 milestoneBody를 그대로 반환한다', () {
      expect(dangerBody(6, 0, 'ko'), equals(milestoneBody(6, 'ko', isDanger: true)));
      expect(dangerBody(29, 2, 'en'), equals(milestoneBody(29, 'en', isDanger: true)));
    });
```

- [ ] **Step 7: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd verse-flutter && git add lib/core/notifications/reminder_service.dart test/streak_danger_test.dart
git commit -m "feat: 마일스톤(7/30/100일) 전야 전용 알림 문구 추가"
```

---

### Task 3: 복귀 유도 알림 판정 로직 (Phase B-2, 순수 함수)

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart`
- Test: `verse-flutter/test/streak_danger_test.dart`

**Interfaces:**
- Consumes: `StreakStateData` (기존, `verse-flutter/lib/core/db/app_database.dart`의 drift 생성 타입 — `lastDay: String?`, `currentLen: int` 필드), `todayUtcString()` (기존)
- Produces: 최상위 함수 `bool shouldScheduleComeback(StreakStateData? streak, String todayUtc)` — Task 4가 `refreshComeback`에서 호출

- [ ] **Step 1: `shouldScheduleComeback` 테스트 작성**

`streak_danger_test.dart`에 새 그룹 추가 (`shouldPauseReminders` 그룹 뒤):

```dart
  group('shouldScheduleComeback', () {
    const today = '2026-07-16';

    test('기록이 없으면 false', () {
      expect(shouldScheduleComeback(null, today), isFalse);
      expect(shouldScheduleComeback(_streak(0, null), today), isFalse);
    });

    test('오늘 이미 활동했으면(gap=0) false', () {
      expect(shouldScheduleComeback(_streak(3, '2026-07-16'), today), isFalse);
    });

    test('gap=1이면 true (목표 시각 lastDay+2일이 아직 안 옴)', () {
      expect(shouldScheduleComeback(_streak(3, '2026-07-15'), today), isTrue);
    });

    test('gap=2이면 true (목표 시각 당일)', () {
      expect(shouldScheduleComeback(_streak(0, '2026-07-14'), today), isTrue);
    });

    test('gap=3 이상이면 false (목표 시각이 이미 지남)', () {
      expect(shouldScheduleComeback(_streak(0, '2026-07-13'), today), isFalse);
      expect(shouldScheduleComeback(_streak(0, '2026-07-01'), today), isFalse);
    });
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: FAIL — `shouldScheduleComeback` undefined

- [ ] **Step 3: `shouldScheduleComeback` 구현**

`reminder_service.dart`의 `shouldScheduleStreakDanger` 함수(라인 31-41) 바로 뒤에 추가:

```dart
/// 복귀 유도 알림 예약 판단(순수 함수, 단위 테스트용): 스트릭이 끊긴 뒤
/// 침묵 구간(위험 알림 이후~중단 안내 이전)을 메운다. 목표 발화 시각은
/// lastDay+2일이므로, 그 시각이 아직 오지 않았거나(gap<=2) 당일이면
/// 예약을 유지하고, 이미 지났으면(gap>=3) 뒤늦게 스팸성으로 쏘지 않는다.
bool shouldScheduleComeback(StreakStateData? streak, String todayUtc) {
  final lastDay = streak?.lastDay;
  if (lastDay == null) return false;
  final last = DateTime.parse(lastDay).toUtc();
  final today = DateTime.parse(todayUtc).toUtc();
  final gap = today.difference(last).inDays;
  return gap >= 1 && gap <= 2;
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd verse-flutter && git add lib/core/notifications/reminder_service.dart test/streak_danger_test.dart
git commit -m "feat: 복귀 유도 알림 예약 판단 함수(shouldScheduleComeback) 추가"
```

---

### Task 4: 복귀 유도 알림 예약/취소 + 문구 (Phase B-2, ReminderService 통합)

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart`
- Test: 수동 검증 (플러그인 의존이라 단위 테스트 불가 — 기존 `scheduleDaily`/`refreshStreakDanger`와 동일하게 테스트 대상 아님)

**Interfaces:**
- Consumes: `shouldScheduleComeback` (Task 3), `ReminderSettings` (기존, `reminder_repository.dart`의 `hour`/`minute`/`enabled` 필드), `_nextInstanceOf`는 사용하지 않음(과거 날짜 기준 계산이 필요해 별도 로직)
- Produces: `notificationPayloadComeback` 상수, `ReminderService.refreshComeback(...)`, `ReminderService.cancelComeback()` — Task 5(호출 지점 배선), Task 6(payload 라우팅), Task 7(취소 배선)이 사용

- [ ] **Step 1: payload 상수 추가**

`reminder_service.dart:11-12`를 다음으로 교체:

```dart
const notificationPayloadDaily = 'daily_reminder';
const notificationPayloadStreakDanger = 'streak_danger';
const notificationPayloadComeback = 'reminder_comeback';
```

- [ ] **Step 2: 복귀 알림 ID/채널 상수 추가**

`_pauseChannelId` 선언(라인 88 부근) 바로 뒤에 추가:

```dart
  static const _comebackNotificationId = 1004;
  static const _comebackChannelId = 'reminder_comeback';
```

- [ ] **Step 3: `cancelComeback` 메서드 추가**

`cancelStreakDanger` 메서드(라인 185-188) 바로 뒤에 추가:

```dart
  Future<void> cancelComeback() async {
    await _ensureInitialized();
    await _plugin.cancel(_comebackNotificationId);
  }
```

- [ ] **Step 4: `refreshComeback` 메서드 추가**

`refreshStreakDanger` 메서드가 끝나는 지점(라인 240, `showPauseNotice` 메서드 시작 전) 바로 뒤에 추가:

```dart
  /// 복귀 유도 알림(1004)을 현재 상태에 맞게 재예약한다. 스트릭이 끊긴
  /// 뒤 침묵 구간(위험 알림=공백 1일 이후 ~ 중단 안내=공백 7일 이전)을
  /// 메우는 1회성 알림 — 목표 발화 시각은 항상 lastDay+2일, 사용자의
  /// 리마인더 시각(settings.hour/minute)을 그대로 재사용한다.
  Future<void> refreshComeback({required ReminderSettings settings, required String locale}) async {
    await _ensureInitialized();
    if (!settings.enabled) {
      await _plugin.cancel(_comebackNotificationId);
      return;
    }

    final streak = await _streakRepository.current();
    final todayUtc = todayUtcString();

    if (!shouldScheduleComeback(streak, todayUtc)) {
      await _plugin.cancel(_comebackNotificationId);
      return;
    }

    final lastDay = DateTime.parse(streak!.lastDay!).toUtc();
    final targetUtcDate = lastDay.add(const Duration(days: 2));
    final localTarget = tz.TZDateTime(
      tz.local,
      targetUtcDate.year,
      targetUtcDate.month,
      targetUtcDate.day,
      settings.hour,
      settings.minute,
    );
    final now = tz.TZDateTime.now(tz.local);
    final when = localTarget.isBefore(now) ? now.add(const Duration(minutes: 1)) : localTarget;

    final gap = DateTime.parse(todayUtc).toUtc().difference(lastDay).inDays;
    final body = _comebackBody(gap, locale);

    await _plugin.zonedSchedule(
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
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      payload: notificationPayloadComeback,
    );
  }

  /// 복귀 유도 문구 2종. dayIndex처럼 순환할 만큼 자주 뜨지 않는 알림이라
  /// gap 값의 홀짝으로 양자택일한다.
  String _comebackBody(int gap, String locale) {
    final options = locale == 'en'
        ? [
            'Streaks break, but the verses stay with you. Start again today 🌱',
            "$mascotName's waiting at the door. Just one verse to start 🍞",
          ]
        : [
            '스트릭은 끊겨도 외운 말씀은 그대로예요. 오늘 다시 시작해요 🌱',
            '$mascotName이 문 앞에서 기다리고 있어요. 딱 한 절부터 🍞',
          ];
    return options[gap.isEven ? 0 : 1];
  }
```

- [ ] **Step 5: 정적 분석으로 컴파일 확인 (테스트 파일이 플러그인을 mock하지 않으므로 단위 테스트 대신 analyze 사용)**

Run: `cd verse-flutter && flutter analyze lib/core/notifications/reminder_service.dart`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
cd verse-flutter && git add lib/core/notifications/reminder_service.dart
git commit -m "feat: 복귀 유도 알림(1004) 예약/취소 메서드 추가"
```

---

### Task 5: 앱 시작 시 복귀 알림 재예약 배선

**Files:**
- Modify: `verse-flutter/lib/app/providers.dart:181-186`

**Interfaces:**
- Consumes: `ReminderService.refreshComeback` (Task 4)

- [ ] **Step 1: `refreshStreakDanger` 호출 뒤에 `refreshComeback` 추가**

`providers.dart:181-186`을 다음으로 교체:

```dart
    } else if (!reminder.paused) {
      await reminderService.scheduleDaily(hour: reminder.hour, minute: reminder.minute, locale: locale);
      // 스트릭 위험 경고(1002)도 현재 스트릭 상태에 맞춰 갱신 — 오늘 이미 했으면
      // 내일로, 지킬 스트릭이 없으면 취소된다.
      await reminderService.refreshStreakDanger(settings: reminder, locale: locale);
      // 복귀 유도 알림(1004)도 함께 갱신 — 위험 알림 이후의 침묵 구간을 메운다.
      await reminderService.refreshComeback(settings: reminder, locale: locale);
    }
```

- [ ] **Step 2: 정적 분석 확인**

Run: `cd verse-flutter && flutter analyze lib/app/providers.dart`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
cd verse-flutter && git add lib/app/providers.dart
git commit -m "feat: 앱 시작 시 복귀 유도 알림 재예약 배선"
```

---

### Task 6: 암송 완료 시 복귀 알림 재예약 배선

**Files:**
- Modify: `verse-flutter/lib/features/memorize/memorize_controller.dart:361-365`

**Interfaces:**
- Consumes: `ReminderService.refreshComeback` (Task 4)

- [ ] **Step 1: `refreshStreakDanger` 호출 뒤에 `refreshComeback` 추가**

`memorize_controller.dart:361-365`을 다음으로 교체:

```dart
        if (settings.enabled) {
          await reminderService.scheduleDaily(hour: settings.hour, minute: settings.minute, locale: locale);
          // 오늘 몫을 채웠으니 스트릭 위험 경고(1002)는 내일로 밀어둔다.
          await reminderService.refreshStreakDanger(settings: settings, locale: locale);
          // 오늘 활동했으니 복귀 유도 알림(1004)은 취소 대상(gap=0)이 된다.
          await reminderService.refreshComeback(settings: settings, locale: locale);
        }
```

- [ ] **Step 2: 정적 분석 확인**

Run: `cd verse-flutter && flutter analyze lib/features/memorize/memorize_controller.dart`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
cd verse-flutter && git add lib/features/memorize/memorize_controller.dart
git commit -m "feat: 암송 완료 시 복귀 유도 알림 재예약 배선"
```

---

### Task 7: 리마인더 끄기/알림 탭 라우팅에 복귀 알림 배선

**Files:**
- Modify: `verse-flutter/lib/features/settings/settings_screen.dart:211-216`
- Modify: `verse-flutter/lib/core/notifications/notification_router.dart`

**Interfaces:**
- Consumes: `ReminderService.cancelComeback` (Task 4), `notificationPayloadComeback` (Task 4)

- [ ] **Step 1: 리마인더 끌 때 복귀 알림도 취소**

`settings_screen.dart:211-216`을 다음으로 교체:

```dart
    } else {
      final next = current.copyWith(enabled: false);
      await ref.read(reminderRepositoryProvider).save(next);
      await ref.read(reminderServiceProvider).cancel();
      await ref.read(reminderServiceProvider).cancelStreakDanger();
      await ref.read(reminderServiceProvider).cancelComeback();
    }
```

- [ ] **Step 2: 알림 탭 payload 라우팅에 복귀 알림 추가**

`notification_router.dart` 전체를 다음으로 교체:

```dart
import '../../app/router.dart';
import 'reminder_service.dart';

/// 알림 탭 payload → 화면 이동. 세 알림 모두 오늘 홈으로 보낸다 — 거기서
/// "이어서 외우기"가 바로 다음 절로 데려가므로 코스 목록을 한 번 더 거칠
/// 필요가 없다(예전엔 /courses로 보내 한 단계 더 거쳐야 했다).
void handleNotificationPayload(String? payload) {
  switch (payload) {
    case notificationPayloadDaily:
    case notificationPayloadStreakDanger:
    case notificationPayloadComeback:
      appRouter.go('/today');
  }
}
```

- [ ] **Step 3: 정적 분석 확인**

Run: `cd verse-flutter && flutter analyze lib/features/settings/settings_screen.dart lib/core/notifications/notification_router.dart`
Expected: `No issues found!`

- [ ] **Step 4: 전체 테스트 스위트 실행 (최종 확인)**

Run: `cd verse-flutter && flutter test`
Expected: PASS (모두)

- [ ] **Step 5: Commit**

```bash
cd verse-flutter && git add lib/features/settings/settings_screen.dart lib/core/notifications/notification_router.dart
git commit -m "feat: 리마인더 끄기·알림 탭 라우팅에 복귀 알림 배선"
```

---

## Manual Verification (플러그인 의존이라 자동 테스트 불가)

`flutter_local_notifications`는 실제 OS 알림 스케줄러에 의존해 단위 테스트로 검증할 수 없다. 시뮬레이터/실기기에서 다음을 확인한다:

1. 설정 화면에서 리마인더를 켜고 시각을 아무 때나로 설정 → 데일리 알림이 예약되고, 앱을 재시작할 때마다 그날의 고정 문구가 뜨는지 확인 (Task 1 검증).
2. 스트릭을 6일로 만든 뒤(테스트 DB 조작 또는 6일 연속 플레이) 암송 완료 → 다음 위험/데일리 알림이 마일스톤 전용 문구("7일 달성")를 쓰는지 확인 (Task 2 검증).
3. 스트릭을 끊고(활동 없이 이틀 경과하도록 기기 시간 조작 또는 대기) → 위험 알림(1002) 발화 이후, 중단 안내(1003) 이전 구간에 복귀 알림(1004)이 1회 뜨는지 확인 (Task 3~7 검증).
4. 복귀 알림을 탭했을 때 `/today`로 이동하는지 확인.
5. 리마인더를 껐을 때 1001/1002/1004 알림이 모두 취소되는지(디바이스 알림 설정에서 예약 알림 목록 확인, 또는 로그로 `cancel` 호출 확인).
