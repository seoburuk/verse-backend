# 마일스톤 임계값 통일 (설계)

## 배경

스트릭 마일스톤 임계값이 두 곳에 따로 정의돼 있다:

- `lib/shared/milestones.dart`의 `streakMilestones = [3, 7, 14, 30, 60, 100, 200, 365]` — 화면 축하 연출
  (`claimStreakMilestone`)에 쓴다.
- `lib/core/notifications/reminder_service.dart`의 `const _milestones = {7, 30, 100}` — 알림 전용 문구
  (`milestoneBody`)에 쓴다.

3일·14일·60일·200일·365일을 달성하면 화면은 축하하는데 알림(예: 위험 경고)은 그냥 평범한 순환 문구를
보여준다 — 같은 사용자의 같은 성취에 두 표면이 서로 다르게 반응하는 불일치.

## 결정 사항

**카드 보상은 이번 스펙에서 제외한다.** 카드는 현재 절 진도에서 파생 계산되는 구조라(`CardRepository`가
`progress.cleared`만 보고 즉석 계산, 별도 소유 테이블 없음) "절과 무관한 스트릭 보상 카드"를 만들려면
새 테이블·카탈로그 확장·지급 UI가 필요한 훨씬 큰 작업이다. 이번엔 **임계값 통일만** 처리하고, 카드 보상은
별도 스펙으로 남긴다.

## 구현

`milestoneBody()`(`reminder_service.dart`)는 이미 `$next`로 텍스트를 일반화해서 쓰므로(하드코딩된
문구 없음), 임계값 집합만 `shared/milestones.dart`의 `streakMilestones`로 바꾸면 된다 — 중복 정의를
없애고 단일 소스로 통일한다.

`lib/core/notifications/reminder_service.dart`:

변경 전:
```dart
/// 마일스톤(7/30/100일) 달성 전야 전용 문구. currentStreak+1이 마일스톤에
/// 해당하지 않으면 null — 호출부는 null이면 기존 순환 풀로 폴백한다.
const _milestones = {7, 30, 100};

String? milestoneBody(int currentStreak, String locale, {required bool isDanger}) {
  final next = currentStreak + 1;
  if (!_milestones.contains(next)) return null;
  ...
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
  ...
```

`reminder_service.dart` 상단에 `import '../../shared/milestones.dart' show streakMilestones;` 추가.

## 범위 밖

- 카드 보상(스트릭 마일스톤 → 카드 지급)은 별도 스펙.
- `milestones.dart`의 절수 마일스톤(`milestones = [1,5,10,...]`)·초반 광고 임계값(`earlyAdThresholds`)은
  스트릭과 무관한 별개 체계라 손대지 않는다.

## 테스트

`test/streak_danger_test.dart`의 `milestoneBody` 그룹에 3/14/60/200/365 케이스 추가(기존 6/29/99
케이스는 그대로 유지 — 여전히 유효한 7/30/100 전야 값).
