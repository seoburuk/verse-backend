# 플랜 관리·범위 선택 설계 (2026-07-27)

`verse-flutter` 데일리루프 플랜의 3가지 공백을 메운다: (1) 플랜 포기/변경 불가,
(2) 플랜 생성 시 전체 코스가 평평한 드롭다운 하나, (3) 구약/신약 코스가 권
전체(창세기 1,533절)라 코스 단위 플랜이 비현실적.

## 배경: 콘텐츠 실측

`assets/courses/courses.json` 기준 70코스:

| 카테고리 | 코스 수 | 구조 |
|---|---|---|
| foundations / lords-prayer / messiah | 각 1 | 소형(5절 안팎), 섹션 없음 |
| warmup | 1 | 섹터(주제) 30섹션 = 175절 |
| ot | 39 | 권당 1코스, 섹션 = 장, 전체 절 포함 |
| nt | 27 | 동일 (마태 등) |

핵심 결론: **구약/신약은 장(섹션) 단위, 워밍업은 섹터 단위로 플랜을 잡을 수
있어야 한다.** 진행도(progress)는 코스 기준이라 플랜과 독립 — 플랜을
포기/변경해도 외운 절은 보존된다.

## 결정 사항 (브레인스토밍 합의)

1. 플랜 대상 = **코스 + 선택적 섹션 목록**. 섹션 미지정이면 코스 전체(소형 코스).
2. 장 선택은 범위(start–end)가 아니라 **칩 다중 선택** — "창세기 1장, 2장"처럼
   원하는 장만, 비연속 허용.
3. Today 플랜 카드 탭 → 바텀시트(마감 변경 / 플랜 변경 / 플랜 포기).
4. '플랜 변경' = 기존 플랜 종료 + 생성 화면으로 이동(별도 편집 화면 없음).
5. 마감은 프리셋(이번 주/이번 달) + date picker 직접 선택, 생성 후에도 변경 가능.
6. 추가 채택: (A) 마감 만료 처리, (B) 완료 후 이어하기 추천.
   (C) 권장 마감 자동 제안은 이번 범위 제외.

## 1. 데이터 모델

drift `schemaVersion` 2 → 3. `MemorizationPlan`에 컬럼 추가:

```dart
TextColumn get sectionIds => text().nullable()();  // "12,13,15" — null이면 코스 전체
```

- `status`는 기존 TEXT 그대로 값만 추가: `active | completed | abandoned`.
- 마이그레이션: `m.addColumn(memorizationPlan, memorizationPlan.sectionIds)`.
  기존 플랜은 sectionIds=null → 코스 전체로 해석, 동작 불변.

### PlanRepository 변경

- `createPlan(...)`에 `List<int>? sectionIds` 파라미터 추가(콤마 조인 저장).
- `abandonPlan(int id)` — status='abandoned'만 기록. progress 불변.
- `updateDeadline(int id, String deadlineDay)`.
- `_countItems`/`_countCleared`에 섹션 필터: sectionIds가 있으면
  `courseItems.sectionId IN (...)` 조건 추가.
- `PlanView`에 `List<int>? sectionIds`와 표시용 범위 라벨 재료(섹션 제목 목록
  또는 첫/끝 섹션 제목) 추가.

### 다음 절 선택(providers.dart)

`planNextItemProvider` / `planNextNavArgsProvider`가 쓰는
`firstUnclearedInCourse(courseId)`에 섹션 필터가 없다. 섹션 목록을 받는 변형
(`firstUnclearedInCourse(courseId, {List<int>? sectionIds})`)으로 확장하고,
`listItemsByCourse`도 플랜 네비게이션 경로에서는 선택 섹션의 절만 넘긴다
(암송 체이닝이 플랜 밖 절로 새지 않도록).

## 2. Today 플랜 카드 → 바텀시트

카드(제목~진행바~D-day 영역 전체)를 `InkWell`로 감싸 탭 시 바텀시트:

- 헤더: 플랜 라벨("창세기 1–2장" / "워밍업 · 기도" / "기초") + `24/80절 · D-12`.
- **마감 변경**: 프리셋 2개 + date picker(오늘 이후만). 저장 시
  `updateDeadline` + `activePlanViewProvider` invalidate.
- **플랜 변경**: 확인 다이얼로그 → `abandonPlan` → `/plan/new` push.
- **플랜 포기**: 확인 다이얼로그 — 본문에 "플랜만 사라지고, 외운 절은 그대로
  남아요" 명시 → `abandonPlan` → 시트 닫고 Today는 빈 상태(플랜 만들기)로.

플랜 라벨 규칙: 섹션 선택이 연속이면 "창세기 1–3장", 비연속이면
"창세기 1, 3, 5장", 워밍업은 섹터 제목, 섹션 없으면 코스 제목.

## 3. 플랜 생성 화면 재설계

기존 드롭다운 폐기. 한 화면 내 단계 진행(새 라우트 없음, 화면 내 상태 전환):

**1단계 — 무엇을 외울까** (카테고리 중간 단계 없음):
- 소형 코스 3개(기초/주기도문/메시아)를 절 수와 함께 바로 나열 — 탭하면 3단계로.
- "워밍업 주제 골라서" → 섹터 30개 목록, 1개 선택(라디오).
- "성경 책별로" → 구약/신약 탭 + 권 목록(권별 진행 절수 표시) → 장 선택으로.

**2단계 — 장 선택** (성경 책 경로만): 장 번호 칩 그리드(1~N장), 다중 토글.
- 기본 선택: 그 권에서 아직 안 깬 첫 장부터 연속 3장(남은 게 적으면 남은 만큼).
- 각 칩에 완료 표시(이미 다 외운 장은 체크 뱃지, 선택은 여전히 가능).

**3단계 — 마감**: 이번 주 / 이번 달 / 직접 선택(date picker).
- 하단에 상시 미리보기: "총 80절 · 하루 약 7절". 하루 10절 초과 시 경고
  색상(레트로 팔레트의 경고색)으로 표시. 차단은 하지 않음 — 정보만.
- 시작 버튼 → `createPlan(sectionIds: ...)` → Today 복귀.

## 4. 마감 만료 처리 (A)

현재 `_remainingDays`는 `max(1, ...)`라 마감이 지나면 영원히 D-1 + 남은 절
전부가 오늘 목표가 되는 버그성 동작. 수정:

- `PlanView`에 `bool get expired` (deadlineDay < 오늘 UTC).
- expired면 Today 플랜 카드 자리에 만료 안내 카드: "마감이 지났어요" +
  진행 요약 + [마감 연장] [새 플랜 만들기] 두 버튼.
  - 연장 = 바텀시트의 마감 변경 UI 재사용.
  - 새 플랜 = abandonPlan 후 생성 화면.
- expired 상태에선 todayTarget 계산·"이어서 외우기" CTA를 숨긴다(연장하면 복원).

## 5. 완료 후 이어하기 추천 (B)

`planComplete` 시 기존 `_completeCta`(축하 + "다음 플랜") 확장:

- 플랜이 성경 책(ot/nt) + 섹션 플랜이었고 그 권에 안 깬 장이 남아 있으면
  "이어서: 창세기 4–6장" 원탭 버튼 추가 — 기존 플랜을 completed 처리하고
  같은 마감 길이(직전 플랜의 생성~마감 일수)로 즉시 새 플랜 생성.
- 남은 장이 없거나 소형 코스/워밍업이면 기존 "다음 플랜 만들기"만.

## 오류·엣지 케이스

- 콘텐츠 갱신으로 sectionIds의 섹션이 사라진 경우: 카운트 쿼리가 자연히 0절
  처리 → planView가 total 0이면 만료 카드가 아니라 "플랜을 다시 만들어 주세요"
  빈 상태로 폴백.
- 이미 다 외운 장만 골라 생성한 플랜: 생성 직후 planComplete → 기존 완료
  플로우가 그대로 처리(별도 차단 없음).
- date picker 최소값은 내일(UTC 기준) — 생성 즉시 만료되는 플랜 방지.

## 테스트

- PlanRepository: sectionIds 필터 카운트, abandon/updateDeadline, 만료 판정,
  마이그레이션 v2→v3 (기존 행 null 해석).
- 위젯: 플랜 카드 탭 → 시트 항목 3개, 포기 확인 문구, 만료 카드 분기,
  생성 화면 장 칩 다중 선택 + 하루 절수 미리보기, 완료 화면 이어하기 버튼.
- 기존 140개 테스트 회귀 통과.

## 범위 제외

- 권장 마감 자동 제안(C), 복수 활성 플랜, 임의 절 범위(코스 밖) 플랜,
  플랜 서버 동기화 변경(플랜은 현재도 로컬 전용).
