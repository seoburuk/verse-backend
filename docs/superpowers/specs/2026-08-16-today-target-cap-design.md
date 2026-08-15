# 오늘 목표 상한 (설계)

## 배경

`PlanView.todayTarget`(`lib/core/plan/plan_repository.dart`)은 `ceil(remainingVerses / remainingDays)`로
계산된다. 이 공식은 뒤처질수록 목표가 커지는 구조다 — 이틀 밀리면 하루 3절이 5절이 되고, 5절이 8절이
되는 식으로 눈덩이처럼 불어난다. 어느 순간 "오늘 안에 못 하겠다"는 판단이 서면 그날로 이탈한다.

듀오링고식 리텐션의 핵심 중 하나는 일일 목표가 **고정**이라는 점이다(사용자가 고른 10/20/30 XP). 밀렸다고
벌주지 않는다. 이번 스펙은 오늘 목표에 상한을 둬서 이 죽음의 나선을 끊는다.

## 결정 사항

**상한 = 플랜 생성 시점 원래 페이스의 1.5배.** 플랜 생성 시점의 "총 절수 ÷ 총 기간"을 기준 페이스로 삼고,
`todayTarget`이 그 1.5배를 넘지 않도록 클램프한다.

## 구현

새 스키마 불필요 — 기존 `MemorizationPlanData.createdAt`(인스턴트)과 `plan.deadlineDay`(로컬 날짜 문자열)
로 원래 페이스를 역산할 수 있다.

`lib/core/plan/plan_repository.dart`의 `PlanView`에 추가:

```dart
import 'dart:math';
// (파일 상단에 이미 dart:math가 import돼 있으면 중복 추가하지 않는다 — _remainingDays가 이미 max()를 씀)

  /// 플랜 생성 시점의 원래 하루 페이스 — createdAt(인스턴트)을 로컬 자정으로
  /// 정규화한 날짜와 deadlineDay(로컬 날짜 문자열) 사이 총 기간으로 역산한다.
  /// _remainingDays와 동일한 "오늘 포함 +1" 관례를 따른다.
  int get _originalPace {
    final created = plan.createdAt.toLocal();
    final createdDay = DateTime(created.year, created.month, created.day);
    final deadline = DateTime.parse(plan.deadlineDay);
    final totalDays = max(1, deadline.difference(createdDay).inDays + 1);
    return (totalVerses / totalDays).ceil();
  }

  /// 만료 플랜은 오늘 목표가 없다. 이 가드가 없으면 _remainingDays의 max(1,..)
  /// 때문에 남은 절 전부가 매일 "오늘 목표"로 쏟아진다.
  /// 통독은 범위가 장 하나라 남은 절이 곧 오늘 목표다.
  ///
  /// 뒤처져서 naive 계산값(남은 절/남은 일수)이 원래 페이스의 1.5배를 넘으면
  /// 그 1.5배로 클램프한다 — 밀릴수록 목표가 눈덩이처럼 불어나는 걸 막는다.
  /// 마감을 자동으로 늘리진 않는다. 상한에 걸리면 마감 전까지 다 못 끝낼 수
  /// 있는데, 이건 의도된 트레이드오프다(일일 목표는 페이스 가이드일 뿐 "그날까지
  /// 완주 보장"이 아니다).
  int get todayTarget {
    if (mode == 'reading') return remainingVerses;
    if (expired || remainingVerses <= 0) return 0;
    final naive = (remainingVerses / remainingDays).ceil();
    final cap = max(1, (_originalPace * 1.5).ceil());
    return min(naive, cap);
  }
```

`createdAt`은 이미 `.toUtc()`로 저장되는 진짜 인스턴트이므로(`plan_repository.dart`의 `createPlan()`),
`.toLocal()`로 정규화 후 날짜만 뽑는다 — 이전 UTC/로컬 작업(패턴 B)과 동일한 규칙.

## 범위 밖

- 마감 자동 연장/재조정 없음(위 설명대로 의도된 트레이드오프).
- 통독(`mode == 'reading'`)은 대상 범위가 장 하나뿐이라 애초에 나선 문제가 없음 — 변경 없음.
- 플랜 생성 화면(`create_plan_screen.dart`)의 "하루 약 N절" 미리보기(`versesPerDay`)는 생성 시점
  계산이라 이 상한과 무관 — 변경 없음.

## 테스트

`test/plan_view_test.dart`에 추가:
- 원래 페이스(생성 시 총 절/총 기간)의 1.5배를 naive 계산값이 넘는 케이스 — `todayTarget`이 상한값으로
  클램프되는지.
- 정상 진행 중(밀리지 않음)이면 상한에 안 걸리고 기존 naive 값 그대로인지(회귀 방지).
- 상한 계산이 최소 1은 보장하는지(총 절수가 아주 적은 플랜 경계값).
