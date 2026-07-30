# 플랜 생성 흐름 개선 설계 (2026-07-30)

`verse-flutter` 플랜 생성(`/plan/new`)의 5가지 문제를 고친다.

1. 예언 성취 코스가 1,199절 통째로 플랜이 된다.
2. 플랜 대상 목록의 순서가 정해져 있지 않고, 구약/신약이 "성경" 하나로 묶여 있다.
3. 권 고르기·장 고르기가 중첩 바텀시트라 뒤로가기가 없다.
4. 장 고르기가 다중선택이라 첫 플랜부터 과해진다.
5. 통독 플랜은 1장이라 하루면 끝나는데 마감 프리셋이 "이번 주/이번 달"이다.

## 배경: 예언 코스 실측

`assets/courses/courses.json`의 `messiah-prophecy` 코스:

| 단위 | 수 |
|---|---|
| 전체 절 | 1,199 |
| 섹션(= 구약 책) | 23 — 이사야 447절, 시편 309절, 스가랴 122절 |
| 주제(topic, 예언 1건) | 303 — 절 평균 4.0, 최대 27 |

원인은 [plan_scope_picker.dart](../../../verse-flutter/lib/features/today/plan_scope_picker.dart)의
`_smallCategories = ['foundations', 'lords-prayer', 'messiah']`다. 5절짜리 기초·주기도문과
같은 부류로 묶여 있어 하위 선택 단계 없이 코스 전체가 플랜이 된다.

핵심 사실: `courses.json`의 각 아이템은 이미 `topic` / `topic_en`을 들고 있고,
같은 주제의 절들은 섹션 안에서 연속된 `ord`로 놓여 있다. 즉 **콘텐츠 재시드나 서버
변경 없이** 주제 단위 플랜을 만들 수 있다.

## 결정 사항 (브레인스토밍 합의)

1. 예언 성취는 **주제(예언 1건) 단위** — 권 고르기 → 주제 고르기 2단계.
2. 플랜 저장은 `sectionIds`에 **`topics` 컬럼을 더해** 표현한다. 섹션=주제로
   **재시드하지 않는다** — 서버 시드 + `courses.json` 재생성 + `section_id` 전면
   변경이라 진행도·카드까지 위험이 번지는데 얻는 결과는 같다.
3. 대상 목록 순서 고정: 기초 · 주기도문 · 워밍업 · 예언 성취 · 구약 · 신약.
4. 권/장 선택을 바텀시트에서 **화면 내 단계**로 옮긴다 — 뒤로가기 문제의 근본 원인.
5. 장·주제 선택은 **단일선택**. 마친 장도 계속 노출한다(복습 허용).
6. 통독은 **마감 없는 자동 롤오버** — 한 장을 끝내면 같은 권의 다음 장으로 전진.
7. 암송 트랙의 마감 프리셋(이번 주/이번 달)은 그대로 둔다. 이번 변경은 통독만.

## 1. 데이터 모델

drift `schemaVersion` 3 → 4. `MemorizationPlan`에 컬럼 추가:

```dart
TextColumn get topics => text().nullable()();  // "여자의 씨(처녀의 출산)" — null이면 섹션 전체
```

§4의 단일선택 때문에 이 컬럼에는 항상 주제 하나만 들어간다. 그래도 파싱·필터는
목록으로 다루는데(`isIn`), 이는 `sectionIds`와 대칭을 맞추기 위한 것이고 UI가
여러 개를 쓰게 되면 저장 계층을 다시 손볼 필요가 없기 때문이다.

- 마이그레이션: `m.addColumn(memorizationPlan, memorizationPlan.topics)`.
  기존 플랜은 `topics=null` → 섹션 전체로 해석, 동작 불변.
- 주제명은 표시용 한글 원문을 그대로 저장한다. 영문 표시는 `course_items.topic_en`으로
  조회해 렌더링한다(플랜 라벨이 로케일을 따라가야 하므로 `plan.title`과 같은 스냅샷
  방식을 쓰지 않는다).
- 주제명에 콤마가 들어갈 수 있다. `sectionIds`의 콤마 조인과 달리 **주제는 개행(`\n`)
  으로 조인**한다 — 303개 주제명 중 콤마 포함 항목이 없다는 것에 기대지 않는다.
- 주제명이 권을 넘어 중복될 수 있으나, 플랜은 항상 특정 권(`sectionIds` 길이 1) 안에
  있으므로 필터 충돌은 발생하지 않는다.

### PlanRepository 변경

- `parseTopics(String? raw)` 추가 (`parseSectionIds`의 개행 판).
- `createPlan(...)`에 `List<String>? topics` 파라미터 추가.
- `_countItems` / `_countCleared` / `_countRead`에 공통 필터 추가:
  `topics != null`이면 `courseItems.topic.isIn(topics)`.
- `PlanView`에 `List<String>? topics` 추가.

### CourseRepository 변경

- `listItemsByCourse(courseId, {sectionIds, topics})` — `topics` 필터 추가.
- `firstUnclearedInCourse(courseId, {sectionIds, topics})` — 동일.

두 곳 모두 플랜 네비게이션(`planNextItemProvider`, `planNextNavArgsProvider`)이
쓰는 경로다. 필터가 빠지면 암송 체이닝이 플랜 밖 주제로 새어 나간다.

## 2. 플랜 대상 목록

한 화면에 6개 항목, 고정 순서:

| 순서 | 항목 | 다음 단계 |
|---|---|---|
| 1 | 기초 | 없음 (코스 전체) |
| 2 | 주기도문 | 없음 (코스 전체) |
| 3 | 워밍업 | 섹터 고르기 (단일선택) |
| 4 | 예언 성취 | 권 고르기 → 주제 고르기 |
| 5 | 구약 | 권 고르기 → 장 고르기 |
| 6 | 신약 | 권 고르기 → 장 고르기 |

- 지금 "성경" 하나로 묶인 진입점을 구약(`category == 'ot'`)/신약(`'nt'`)으로 분리한다.
- `_smallCategories`는 `['foundations', 'lords-prayer']`로 줄인다. 순서는 이 리스트의
  순서를 그대로 쓴다(코스의 `ord`에 기대지 않는다).
- 통독 트랙(`bibleOnly: true`)은 구약·신약만 노출한다. 기존 규칙 유지 — 소형 코스·
  워밍업 섹터·예언 성취는 암송 전용 큐레이션이다.

## 3. 뒤로가기 — 화면 내 단계로 교체

현재 `_openBooks`가 권 시트를 `await`한 뒤 장 시트를 `await`하는 구조라, 장 시트에서
뒤로 누르면 `null`이 반환되며 흐름 전체가 1단계로 튕긴다. 시트를 버리고 단계 상태를
`CreatePlanScreen`으로 올린다:

```dart
enum _Step { track, scopeRoot, sections, leaves, deadline }
```

- `track` — 암송/통독 갈림길 (기존 `_trackStep`).
- `scopeRoot` — §2의 6개 항목.
- `sections` — 워밍업 섹터 / 성경·예언의 권 목록.
- `leaves` — 장 칩 또는 주제 칩.
- `deadline` — 마감 (통독은 이 단계를 건너뛴다, §5).

`AppBar`의 `BackButton` 하나가 `_Step`을 한 단계 되돌린다. `_Step.track`에서는
`leading: null`(라우터 pop). 화면 내 단계이므로 Android 시스템 백도 `PopScope`로
같은 핸들러에 붙여 동일하게 동작시킨다.

`PlanScopePicker`는 시트 없는 단계별 뷰로 축소된다: `ScopeRootStep`,
`SectionListStep`, `LeafChipStep`(장/주제 공용) — 각각 선택 결과를 콜백으로만
올려보내고 자체 네비게이션을 하지 않는다.

## 4. 장·주제 선택 — 단일선택

- `FilterChip` 다중선택 → `ChoiceChip` 단일선택. `PlanScope.sectionIds`는 항상 길이 1
  (예언은 `sectionIds` 길이 1 + `topics` 길이 1).
- 마친 장·주제도 목록에 계속 노출하고 체크 아이콘만 붙인다. 다시 고를 수 있다(복습).
- 기본 선택은 지금과 같이 **아직 안 깬 첫 항목** 하나. 전부 마쳤으면 첫 항목.
- 확인 버튼이 사라진다 — 칩을 탭하면 곧바로 다음 단계로 넘어간다(단일선택이라
  확정 액션이 불필요하고, 뒤로가기로 되돌릴 수 있다).

## 5. 통독 — 마감 없는 자동 롤오버

### 생성

통독 트랙은 `_Step.deadline`을 건너뛰고 권+장 선택 직후 플랜을 만든다.
`deadlineDay`가 NOT NULL이므로 생성 시 `오늘 + 365일`을 넣되, 통독 경로에서는 이 값을
읽지 않는다.

### PlanView

```dart
bool get expired => mode == 'reading' ? false : plan.deadlineDay.compareTo(todayUtcDay()) < 0;
int get todayTarget => mode == 'reading'
    ? remainingVerses               // 현재 장의 남은 절 전부가 오늘치
    : (expired || remainingVerses <= 0) ? 0 : (remainingVerses / remainingDays).ceil();
```

`totalVerses`가 선택된 장 하나로 한정되므로 `remainingVerses`가 곧 "이 장의 남은 절"이다.

### 롤오버

통독 세션이 현재 장의 마지막 절을 기록해 `planComplete`가 되면, `markCompleted` 대신:

- 같은 권에서 **다음 안 읽은 장**을 찾아 `sectionIds`를 그 장으로 바꾼다
  (`PlanRepository.advanceReadingSection(planId)` 신규).
- 권의 모든 장을 끝냈으면 `markCompleted` + 기존 "완료 후 이어하기" 추천(다음 권).

전진은 사용자가 세션을 끝낸 직후 1회만 일어난다 — 하루에 두 장을 읽는 것을 막지 않는다
(전진 후 새 장의 `todayTarget`이 다시 채워지므로 계속 읽을 수 있다).

### Today 카드

통독 카드에서 D-day를 숨기고 **연속 일수(스트릭)** 를 표시한다. 스트릭은 기존
`currentStreakProvider`(`lib/app/providers.dart`)를 그대로 읽는다 — 통독 전용 스트릭을
새로 만들지 않는다. `plan_sheet.dart`의 '마감 변경' 항목은 통독 플랜에서
숨긴다('플랜 변경'/'플랜 포기'는 유지).

## 오류 처리

- 코스에 섹션이 하나도 없는 경우(콘텐츠 손상): `sections` 단계에서 빈 상태 문구를
  띄우고 다음 단계로 못 넘어가게 한다. 지금처럼 `sections.first`에 접근하지 않는다.
- `advanceReadingSection`이 다음 장을 못 찾으면(권 완료) `markCompleted`로 폴백한다.
- 플랜이 참조하는 주제가 콘텐츠 갱신으로 사라지면 `_countItems`가 0을 반환한다 →
  `planComplete`가 `totalVerses > 0` 가드를 이미 갖고 있어 완료로 오인되지 않는다.
  이 플랜은 진행 불가 상태로 남고, 사용자가 '플랜 변경'으로 벗어난다.

## 테스트

`test/`의 기존 플랜 테스트에 다음을 추가한다.

1. **마이그레이션** — v3 DB를 열어 v4로 올린 뒤, `topics=null`인 기존 플랜의
   `planView().totalVerses`가 마이그레이션 전과 같은지.
2. **주제 필터** — 예언 코스에서 `sectionIds=[창세기]`, `topics=['한 분의 왕']`인
   플랜의 `totalVerses`가 그 주제의 절 수와 일치하는지. 같은 권의 다른 주제 절을
   cleared 처리해도 `clearedVerses`가 0인지.
3. **주제명 개행 조인** — 콤마를 포함한 주제명을 넣고 `parseTopics` 왕복이 온전한지.
4. **통독 롤오버** — 1장의 모든 절을 기록 → `sectionIds`가 2장으로 바뀌고 status가
   `active`로 남는지. 마지막 장을 기록 → `completed`가 되는지.
5. **통독 마감 무시** — `deadlineDay`가 과거인 통독 플랜의 `expired`가 false,
   `todayTarget`이 남은 절 수와 같은지.
6. **단계 뒤로가기** (위젯 테스트) — 장 단계에서 뒤로 → 권 목록, 다시 뒤로 →
   대상 목록, 다시 뒤로 → 트랙 갈림길.

## 범위 밖

- 암송 트랙의 마감 프리셋 변경.
- 예언 코스 콘텐츠 축약, 섹션=주제 재시드, 서버·웹(`verse-web-next`) 변경.
- 주제 검색·필터 UI (권당 주제가 최대 114개인 이사야는 스크롤로 감당한다).
