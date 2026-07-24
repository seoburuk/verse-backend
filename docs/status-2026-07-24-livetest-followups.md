# 실기기(시뮬레이터) 테스트 중 발견한 후속 수정 (2026-07-24)

데일리루프 P1/P2·카드 컬렉션·하단 바 작업을 iOS 시뮬레이터에서 실제로 눌러보며
발견한 버그와 그 조치 기록. `verse-flutter` 저장소 기준.

---

## 확정 수정 (커밋 완료)

### 1. 오늘 홈 → 암송/플랜 생성 진입 시 뒤로가기가 안 먹던 문제
**커밋**: `74ebb12`

`TodayScreen`의 세 지점(빈 상태 "플랜 만들기", "이어서 외우기", 완주 후 "다음 플랜 만들기")이
`context.go(...)`를 써서 라우트를 교체하고 있었다. `go()`는 스택을 쌓지 않으므로 진입한
화면에서 뒤로 갈 곳이 없었고, 플랜 생성 화면은 아예 뒤로가기 아이콘 자체가 안 보였다
(`Navigator.canPop()`이 false라 Flutter가 자동 back 버튼을 안 그림).

세 지점 모두 `context.push(...)`로 교체. `section_complete_screen.dart`의 `go()` 2곳은
"닫기(X)" 의미가 맞는 의도된 동작이라 그대로 뒀다.

### 2. 목숨 소비·충전 후 하트 배지가 갱신되지 않던 문제
**커밋**: `dd932c3`

`currentLivesProvider`(`FutureProvider.autoDispose`)를 무효화하는 코드가 어디에도 없었다.
DB에서는 정상적으로 깎이지만, 같은 화면에 머무는 한(예: 암송 중 뒤로가기로 목숨만
소비하고 화면 전환이 없는 경우) `LivesBadge`가 캐시된 값을 계속 보여줬다.

목숨을 소비·충전하는 3곳 전부에 `ref.invalidate(currentLivesProvider)` 추가:
- `memorize_controller.dart` `backToStudy()` (뒤로가기 페널티)
- `memorize_controller.dart` `submit()` (오답 페널티)
- `memorize_screen.dart` `_OutOfLivesView`의 보상형 광고 `onReward`

### 3. 플랜 제목이 로케일을 바꿔도 항상 만들 때 언어로 고정되던 문제
**커밋**: `dd932c3`

`MemorizationPlan.title`은 플랜 **생성 시점**에 저장되는 스냅샷이다. 로케일을 나중에
영어로 바꿔도 이미 만든 플랜은 저장된 한글 제목("기초")을 그대로 보여줬다.

`PlanRepository.planView()`가 `Courses` 테이블에서 해당 코스를 다시 조회해
`courseTitle`/`courseTitleEn`을 `PlanView`에 추가하고, `TodayScreen`이 그 두 필드에서
**표시 시점 로케일로 매번 다시 계산**하도록 변경. `plan.title` 컬럼 자체는 유지하되
화면 표시에는 더 이상 쓰지 않는다.

**시뮬레이터로 실제 확인**: 영어 로케일에서 "기초"가 아니라 "Foundations"로 정확히 뜨는 것을
스크린샷으로 검증함.

---

## 구현했지만 시뮬레이터로 직접 확인 못한 것

이 세션 후반부에 시뮬레이터가 반복된 boot/erase/shutdown으로 상태가 불안정해져
(같은 좌표를 탭해도 반응했다 안 했다 하고, 앱이 스플래시에서 수 분간 멈추는 등)
아래는 **자동 테스트(139/139 통과)로만 검증**됐다:

- 위 세 가지 뒤로가기·하트 배지 수정 자체의 라이브 동작
- 타이핑 모드에서 마지막 줄 밑줄이 안 보이는 문제 — **원인 미해결**.
  요한복음 3:16 기준 재현 스크린샷은 확보했고, 원문 데이터(`courses.json`)는 온전함을
  확인했으나 렌더링 경로(`_TypeScaffold`/`_scaffoldWord`)의 정적 코드 리딩만으로는
  원인을 특정하지 못함. 재현이 매번인지 이 구절만인지 확인 필요.

---

## 열린 질문 (미조사)

- **"목숨 0인데 왜 암송이 더 되냐"** — 사용자가 라이브 테스트 중 제기. `startRecall()`은
  `livesRepositoryProvider.current()`를 매번 새로 읽어 0이면 `outOfLives=true`로 막는
  구조라 코드 리딩상으로는 막혀야 정상(`memorize_controller.dart:179`). 다음 중 하나로 추정:
  - 이 세션 내내 반복된 "빌드 안 하고 예전 바이너리로 테스트" 패턴의 재발(가장 유력).
  - 특정 진입 경로(다음 절 연속 진행, 딕테이션 모드 등)가 게이트를 우회하는 실제 버그.
  재현 상황(어느 모드·어느 화면에서 시작했는지)을 다시 확인해야 한다.

---

## 시뮬레이터 관련 메모

- 이번 세션에서 iOS 시뮬레이터(iPhone 17 Pro, `F0A6DABA-8F0B-4CCB-ADFE-415C4273BD2C`)를
  여러 번 boot/shutdown/erase 반복한 뒤로 터치 입력이 간헐적으로 반응하지 않는 상태가
  됐다(같은 좌표가 됐다 안 됐다 함). 껐다 켜는 것으로 해결 안 됐고, 원인 미상.
- 앱 시작 시 iOS ATT(App Tracking Transparency) 권한 요청(`ad_service.dart`,
  커밋 `9907878`)이 시뮬레이터에서 스플래시를 수 분간 멈추게 한 사례 관찰(자연 해소됨).
  실기기에서도 재현되는지, 유료 사용자 이탈로 이어지지 않는지 별도 확인 필요.
- 다음 검증 세션은 **완전히 새 시뮬레이터(erase 후 최초 1회 boot)** 로 시작하는 걸 권장.

---

## 참고

- 관련 커밋: `9907878`(ATT+뒤로가기 페널티 원본), `74ebb12`(뒤로가기 push),
  `dd932c3`(로케일 재계산+하트 배지)
- 코드: `lib/features/today/today_screen.dart`, `lib/core/plan/plan_repository.dart`,
  `lib/features/memorize/memorize_controller.dart`, `lib/features/memorize/memorize_screen.dart`
