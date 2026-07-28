# 알람(리마인더) 기능 향상 — 설계 스펙

- 날짜: 2026-07-28
- 대상: `verse-flutter/lib/core/notifications/`
- 범위: Phase A(문구 확장) + Phase B(마일스톤 전야 문구, 복귀 유도 알림)

## 배경

현재 알림은 세 종류다.

| 알림 | ID | 발화 조건 | 문구 풀 |
|---|---|---|---|
| 데일리 리마인더 | 1001 | 매일 지정 시각 반복 | 스트릭 있음 3종 / 없음 5종, `dayIndex` 순환 |
| 스트릭 위험 | 1002 | 리마인더 1시간 전, 어제까지 스트릭 있고 오늘 미암송 | 3종, `dayIndex` 순환 |
| 자동 중단 안내 | 1003 | 7일 이상 무응답 시 1회 | 고정 문구 |

문제: (1) 문구 풀이 짧아 반복 체감이 빠르다. (2) 스트릭이 끊긴 뒤 2~6일 구간은 알림이 완전히 침묵한다 — 위험 알림은 공백 1일에만, 중단 안내는 7일째에만 발화. (3) 마일스톤(7/30/100일) 달성 전야에도 일반 문구와 동일하게 나간다.

## Phase A — 문구 풀 확장

**변경 파일**: `reminder_service.dart`만. 로직 변경 없음 — `_pickBody`, `dangerBody`의 `List<String>` 리터럴을 교체.

- 데일리(스트릭 없음): 5종 → 8종 (ko/en 각각)
- 데일리(스트릭 진행 중): 3종 → 6종
- 스트릭 위험: 3종 → 5종

문구 목록은 대화에서 이미 확정한 아래 내용을 그대로 반영한다.

**데일리 — 스트릭 없음**
1. 오늘의 한 절을 외워볼까요? / Ready to memorize today's verse?
2. 말씀 한 구절, 마음에 새겨봐요 ✨ / One verse, planted in your heart ✨
3. 딱 한 절이면 충분해요 — 오늘도 시작해볼까요? / Just one verse is enough — shall we start?
4. 오늘 한 절로 마음에 씨앗을 심어봐요 🌱 / Plant a seed in your heart today 🌱
5. 1분이면 돼요. 오늘의 한 절 어때요? ⏱️ / It only takes a minute — today's verse? ⏱️
6. Shaun이 오늘의 말씀을 물고 왔어요 🍞 / Shaun brought you today's verse 🍞
7. 잠들기 전 한 절, 오늘을 잘 닫는 법이에요 🌙 / One verse before bed — a good way to end the day 🌙
8. 스크롤 대신 한 절 어때요? 📖 / One verse instead of one more scroll? 📖

**데일리 — 스트릭 진행 중** (`$n` = currentStreak)
1. $n일째 이어가는 중이에요 — 오늘도 한 절 외워볼까요? / You're on a $n-day streak — one verse today?
2. $n일 연속! 오늘 한 절이면 기록이 계속돼요 🔥 / $n days in a row! One verse keeps it going 🔥
3. 불꽃을 꺼뜨리지 마세요 — $n일째예요 🔥 / Don't let the flame go out — day $n 🔥
4. $n일을 만든 건 매일의 한 절이었어요. 오늘도요 / $n days were built one verse at a time. Today too
5. Shaun도 $n일째 함께 걷는 중 🍞 오늘 한 절 더! / Shaun's been with you $n days 🍞 one more verse!
6. 오늘 한 절이면 $n일이 ${n+1}일이 돼요 / One verse turns $n days into ${n+1}

**스트릭 위험** (`$n` = currentStreak, 기존 3종 뒤에 2종 추가)
4. $n일이 오늘 밤 12시에 사라져요. Shaun에게 한 절만 🍞 / $n days vanish at midnight. Just one verse for Shaun 🍞
5. Shaun: "한 절만 있으면 되는데…" 🥺 $n일 스트릭이 기다려요 / Shaun: "just one verse…" 🥺 your $n-day streak is waiting

자동 중단 안내(1003)는 변경하지 않는다.

**테스트 영향**: `streak_danger_test.dart`의 `dayIndex에 따라 문구가 순환한다` 테스트는 `i < 3`으로 3종만 검사한다 — 풀이 5종으로 늘어도 앞 3개가 서로 다르면 통과하므로 수정 불필요. 새 문구가 실제로 포함되는지 확인하는 케이스를 하나 추가한다(예: `dangerBody`가 4번째 문구를 포함하는지 `dayIndex=3`으로 검증).

## Phase B — 컨텍스트 인지 알림

### B-1. 마일스톤 전야 문구

`currentStreak + 1 ∈ {7, 30, 100}`일 때, 데일리 리마인더와 스트릭 위험 알림 모두 순환 풀 대신 전용 고정 문구를 사용한다.

- 데일리: `오늘 한 절이면 7일 달성이에요 🏅 지금 채워볼까요?` / `One verse away from a 7-day badge 🏅 — finish it now?`
- 스트릭 위험: 위와 동일한 톤으로, "오늘 밤 놓치면" 프레임 추가 — `오늘 밤 안에 한 절이면 7일 달성! 놓치지 마세요 🏅` / `Finish tonight for your 7-day badge — don't miss it 🏅`

`7`은 마일스톤 숫자로 치환. `_pickBody`/`dangerBody` 시작부에 마일스톤 체크를 추가하고, 해당하면 순환 로직을 건너뛴다.

```dart
const _milestones = {7, 30, 100};

String? _milestoneBody(int currentStreak, String locale, {required bool isDanger}) {
  final next = currentStreak + 1;
  if (!_milestones.contains(next)) return null;
  // ko/en × isDanger 고정 문구 반환
}
```

### B-2. 복귀 유도 알림 (신규, ID 1004)

**목적**: 스트릭이 끊긴 직후(공백 2일차) 죄책감 없는 복귀 문구를 1회 발송. 위험 알림(공백 1일)과 중단 안내(7일) 사이의 침묵 구간을 메운다.

**발화 조건** — 순수 함수 `shouldScheduleComeback(StreakStateData? streak, String todayUtc)`:
- `lastDay == null` → false (기록 없음, 지킬 것도 회복할 것도 없음)
- `gap = todayUtc - lastDay` (일 단위)
- `gap == 0` (오늘 이미 활동) → false
- `gap in [1, 2]` → true (아직 목표 시각 lastDay+2일이 도래 전이거나 당일)
- `gap > 2` → false (목표 시각이 이미 지남 — 뒤늦게 스팸성으로 쏘지 않음)

**예약 로직** (`refreshComeback` in `ReminderService`, 기존 `refreshStreakDanger`와 같은 패턴):
- 대상 시각 = `lastDay + 2일`, 시:분은 `settings.hour/minute`(리마인더 시각) 재사용 — 별도 시각 설정 UI를 추가하지 않는다.
- `shouldScheduleComeback`이 false면 `_plugin.cancel(_comebackNotificationId)`.
- true면 위 대상 시각으로 `zonedSchedule` (payload: `notificationPayloadComeback`, 새 상수).

**호출 지점**: `refreshStreakDanger`를 호출하는 두 곳과 동일 — `providers.dart`(앱 시작 시 리마인더 리프레시)와 `memorize_controller.dart`(암송 완료 후). `refreshStreakDanger` 바로 뒤에 `refreshComeback` 호출을 추가한다. `enabled`가 false면(리마인더 꺼짐) 호출하지 않음 — 기존 `if (reminder.enabled)` 분기 안에 있으면 충분.

**문구** (고정 2종, dayIndex로 순환할 만큼 자주 뜨지 않으므로 매번 1번째 사용):
- 스트릭은 끊겨도 외운 말씀은 그대로예요. 오늘 다시 시작해요 🌱 / Streaks break, but the verses stay with you. Start again today 🌱
- Shaun이 문 앞에서 기다리고 있어요. 딱 한 절부터 🍞 / Shaun's waiting at the door. Just one verse to start 🍞

두 문구를 lastDay 기반 홀짝(또는 gap 값)으로 양자택일 — 예: `gap.isEven ? 0 : 1`.

**채널**: `reminder_comeback`, importance `defaultImportance`(위험 알림보다 낮게 — 급박함을 강조하지 않는 톤이므로).

**payload 라우팅**: `notification_router.dart`의 기존 switch문에 `notificationPayloadComeback` 케이스 추가, `/today`로 동일하게 이동.

**cancel 지점**: 리마인더를 끌 때(`_toggle(enable: false)` in `settings_screen.dart`) 기존에 `cancel()` + `cancelStreakDanger()`를 호출하는 곳에 `cancelComeback()`도 추가.

## 데이터 흐름 요약 (Phase B)

```
앱 시작 / 암송 완료
  → refreshStreakDanger(settings, locale)   [기존]
  → refreshComeback(settings, locale)        [신규]
       → streak = streakRepository.current()
       → shouldScheduleComeback(streak, todayUtc)
       → true: zonedSchedule(lastDay+2일 settings.hour:minute, comeback body)
       → false: cancel(1004)
```

## 테스트 계획

- `streak_danger_test.dart`에 `shouldScheduleComeback` 그룹 추가: gap 0/1/2/3/7일, lastDay null 케이스.
- 마일스톤 문구: `currentStreak=6`(→7 도달), `29`(→30), `99`(→100), `5`(해당 없음, 순환 문구로 폴백) 케이스.
- Phase A 문구 확장은 기존 순환 테스트가 커버 — 신규 문구 포함 여부만 1케이스 추가.

## 범위 밖

- 구절 프리뷰(다음 암송 구절을 알림 본문에 포함) — 진도 의존성과 문구 신선도 문제로 이번 스펙에서 제외.
- 시간대별 톤 분기(오전/밤) — 향후 별도 스펙으로 검토.
- 복귀 알림의 별도 온/오프 설정 — 기존 single-toggle 설계를 따라 메인 리마인더 토글에 종속.
