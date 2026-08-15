# 마일스톤 임계값 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 알림 전용 마일스톤 문구(`milestoneBody`)가 화면 축하 연출과 같은 임계값 집합(`streakMilestones`)을 쓰도록 통일한다.

**Architecture:** `reminder_service.dart`의 자체 `_milestones` 상수를 삭제하고 `shared/milestones.dart`의 `streakMilestones`를 import해서 그대로 쓴다.

**Tech Stack:** Flutter/Dart, `flutter_test`.

## Global Constraints

- 카드 보상은 범위 밖 — 별도 스펙.
- `milestones.dart`의 절수 마일스톤/초반 광고 임계값은 손대지 않는다.

---

### Task 1: `milestoneBody`가 `streakMilestones`를 쓰도록 변경

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart`
- Test: `verse-flutter/test/streak_danger_test.dart`

**Interfaces:**
- Consumes: `streakMilestones`(`List<int>`, `package:verse_flutter/shared/milestones.dart`)
- Produces: `milestoneBody()`의 공개 시그니처는 그대로 — 반환값이 3/14/60/200/365 전야에도 non-null이 됨.

- [ ] **Step 1: 실패하는 테스트 작성**

`verse-flutter/test/streak_danger_test.dart`의 `milestoneBody` 그룹, `'currentStreak+1이 7/30/100이면
전용 문구를 반환한다'` 테스트를 다음으로 교체:

```dart
    test('currentStreak+1이 3/7/14/30/60/100/200/365면 전용 문구를 반환한다', () {
      for (final n in [2, 6, 13, 29, 59, 99, 199, 364]) {
        expect(milestoneBody(n, 'ko', isDanger: false), isNotNull, reason: 'n=$n');
        expect(milestoneBody(n, 'en', isDanger: false), isNotNull, reason: 'n=$n');
      }
    });
```

`'마일스톤이 아니면 null을 반환한다'` 테스트는 그대로 두되(5, 10은 여전히 비마일스톤), 다음 케이스를 추가:

```dart
    test('4/8/15처럼 여전히 마일스톤이 아닌 값은 null을 반환한다', () {
      expect(milestoneBody(4, 'ko', isDanger: false), isNull);
      expect(milestoneBody(8, 'ko', isDanger: false), isNull);
      expect(milestoneBody(15, 'ko', isDanger: false), isNull);
    });
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart --plain-name "3/7/14/30/60/100/200/365"`
Expected: FAIL — n=2(3일 전야), n=13(14일 전야) 등에서 null 반환.

- [ ] **Step 3: 구현 교체**

`verse-flutter/lib/core/notifications/reminder_service.dart` 상단 import에 추가:

```dart
import '../../shared/milestones.dart' show streakMilestones;
```

`_milestones` 정의와 `milestoneBody` 시작부:

변경 전:
```dart
/// 마일스톤(7/30/100일) 달성 전야 전용 문구. currentStreak+1이 마일스톤에
/// 해당하지 않으면 null — 호출부는 null이면 기존 순환 풀로 폴백한다.
const _milestones = {7, 30, 100};

String? milestoneBody(int currentStreak, String locale, {required bool isDanger}) {
  final next = currentStreak + 1;
  if (!_milestones.contains(next)) return null;
```

변경 후:
```dart
/// 마일스톤 달성 전야 전용 문구. currentStreak+1이 마일스톤에 해당하지
/// 않으면 null — 호출부는 null이면 기존 순환 풀로 폴백한다. 임계값은
/// 화면 축하 연출(shared/milestones.dart의 streakMilestones)과 동일한
/// 걸 쓴다 — 알림과 화면이 서로 다른 날에 반응하면 안 된다.
String? milestoneBody(int currentStreak, String locale, {required bool isDanger}) {
  final next = currentStreak + 1;
  if (!streakMilestones.contains(next)) return null;
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
cd verse-flutter
git add lib/core/notifications/reminder_service.dart test/streak_danger_test.dart
git commit -m "fix: 알림 마일스톤 임계값을 화면 축하 연출과 통일"
```

---

### Task 2: 전체 회귀 확인 및 스펙 완료 표시

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-milestone-threshold-unify-design.md`

- [ ] **Step 1: 전체 테스트 + analyze**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS.

Run: `cd verse-flutter && flutter analyze`
Expected: 이번 변경과 관련된 새 이슈 없음.

- [ ] **Step 2: 스펙에 구현 완료 메모 추가 후 커밋**

`docs/superpowers/specs/2026-08-16-milestone-threshold-unify-design.md` 끝에 추가:

```markdown

## 구현 완료

`docs/superpowers/plans/2026-08-16-milestone-threshold-unify.md` 계획대로 구현 완료.
`milestoneBody()`가 `streakMilestones`를 쓰도록 통일.
```

```bash
git add docs/superpowers/specs/2026-08-16-milestone-threshold-unify-design.md
git commit -m "docs: 마일스톤 임계값 통일 스펙에 구현 완료 표시"
```
