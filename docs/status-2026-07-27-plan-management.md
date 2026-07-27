# 플랜 관리·범위 선택 구현 기록 (2026-07-27)

`verse-flutter`에 플랜 포기/변경과 장(섹션) 단위 범위 선택을 추가했다.
설계: `docs/superpowers/specs/2026-07-27-plan-management-design.md`.
계획: `docs/superpowers/plans/2026-07-27-plan-management.md`(10태스크).
subagent-driven-development로 태스크마다 구현 서브에이전트 + 리뷰 서브에이전트를
거쳐 진행했고, 전 태스크 승인(Approved) 완료.

작업은 `verse-flutter/.claude/worktrees/plan-management`(브랜치
`worktree-plan-management`)에서 진행했다. `main`에 아직 병합하지 않았다 —
사용자 리뷰 후 병합 방식(머지/PR) 결정 필요.

## 구현 내역

| 태스크 | 내용 | 커밋 |
|---|---|---|
| 1 | 스키마 v3 — `sectionIds` 컬럼(콤마 조인, null=코스 전체) | `266075c` |
| 2 | 플랜 절 카운트를 섹션 범위로 한정 (`parseSectionIds`, `_countItems`/`_countCleared`) | `d64e8e3` |
| 3 | `abandonPlan`/`updateDeadline`/`PlanView.expired` — 만료 시 `todayTarget=0` 버그 수정 | `cc7301d` |
| 4 | 다음 절·체이닝 목록을 섹션 범위로 한정 (`firstUnclearedInCourse`, `planNextNavArgsProvider`) | `1c5d48b` |
| 5 | `planLabel()` 공용 표시 라벨 함수 | `b52236a` |
| 6 | Today 플랜 카드 탭 → 플랜 관리 바텀시트(마감 변경/플랜 변경/포기, 확인 다이얼로그) | `e8894b5` |
| 7 | 마감 만료 카드 + 콘텐츠 소실(깨진 플랜) 폴백 카드 | `d346da1` |
| 8 | 플랜 생성 화면 재작성 — 단계형 범위 선택(소형 코스/워밍업/성경 책→장 칩), 하루 절수 미리보기 | `8a9a4a9` |
| 9 | 장 플랜 완주 후 다음 장 원탭 이어하기 | `54630f7` |

전 태스크 TDD(실패 테스트 → 구현 → 통과 → 커밋) + 태스크별 spec-compliance 리뷰.
Task 8(가장 큰 태스크)은 opus 리뷰어로 별도 검토, Critical/Important 없음.

## 스펙 대비 의도적 변경

- **플랜 라벨 단순화**(Task 5): 스펙의 "창세기 1–3장" 표기 대신 `창세기 · 1장` /
  `창세기 · 1장 외 2개`. 섹션 제목 문자열을 파싱·재조립하지 않고 그대로 써서
  로케일 안전성 확보(설계 문서에 사전 기록된 변경).
- **깨진 플랜 폴백 분기**(Task 7): 스펙 엣지 케이스로만 적혀 있던 "섹션이 콘텐츠
  갱신으로 사라진 플랜"을 실제 코드 분기(`totalVerses == 0` → 재생성 안내)와
  테스트로 구현. 만료 판정보다 먼저 걸러진다.

## 작업 중 발견·수정한 사고

**워크트리 베이스 불일치.** `EnterWorktree`가 기본으로 `origin/main`에서
브랜치를 만드는데, 로컬 `main`이 origin보다 11커밋 앞서 있었다(그중 하나가
오늘 커밋된 "모바일 UX 개선 16종" — `planNextNavArgsProvider` 등 이번 계획이
의존하는 코드 포함). Task 4까지 구현이 끝난 시점에 발견해 로컬 `main`
(`44c6054`)으로 리베이스했다. 충돌 없이 깨끗하게 적용됐고, 리베이스로 드러난
`planNextNavArgsProvider` Step 5 누락분을 Task 4 커밋에 마저 반영했다.
이후 태스크는 모두 올바른 베이스 위에서 진행됐다.

**서브에이전트가 `main`에 직접 커밋.** Task 5 구현 서브에이전트가 지정된
워크트리가 아니라 실제 `main` 체크아웃에 직접 커밋하는 사고가 있었다.
사용자 승인을 받아 해당 커밋을 올바른 워크트리 브랜치로 cherry-pick하고,
`main`은 `git reset --mixed` + 중복 파일 되돌리기로 원상 복구했다(사전에 있던
아이콘 이미지 등 무관한 미커밋 변경사항은 그대로 보존). 이후 태스크는 매번
"작업 디렉터리 확인 → 최종 커밋 전 브랜치 재확인" 지침을 강화해 디스패치했고
재발하지 않았다.

## 검증

- `flutter test`: 174/174 통과(기존 139 + 이번 작업 신규 테스트)
- `flutter analyze`: 에러 0, 사전 존재 info 3건 + warning 1건(변경 없음, 회귀 아님)
- **실기기/시뮬레이터 라이브 확인 — 영어 로케일 중심으로 수행**:
  - iPhone 17 Pro 시뮬레이터에 워크트리 코드를 직접 빌드(`flutter build ios
    --simulator`)해 설치·실행
  - Today 화면, 플랜 관리 바텀시트(마감 변경/플랜 변경/포기 3항목), "Change
    plan"·"Give up on this plan" 확인 다이얼로그 전체 문구(verse-preservation
    메시지 포함), Courses 화면(구약 39권/신약 27권 카운트 등) — 전부 영어로
    스펙대로 정확히 렌더링됨을 스크린샷으로 확인
  - **미확인**: 확인 다이얼로그의 "OK" 버튼 실제 탭·플랜 생성 화면(Task 8
    단계형 피커)·다음 장 이어하기(Task 9) 실사용 흐름은 시뮬레이터 좌표
    문제로 라이브 확인을 완료하지 못했다(취소 경로는 재현 확인함). 해당
    동작 자체는 각 태스크의 위젯 테스트(`plan_sheet_test.dart`,
    `create_plan_screen_test.dart`, `plan_scope_picker_test.dart`,
    `today_screen_test.dart`)가 실제 in-memory DB 대상으로 이미 검증했다.
    다음 세션에서 시뮬레이터로 이어서 확인 권장.

## 범위 제외 (스펙에 이미 명시)

- 권장 마감 자동 제안(C), 복수 활성 플랜, 임의 절 범위(코스 밖) 플랜,
  플랜 서버 동기화(플랜은 현재도 로컬 전용).

## 다음 단계

- `main`으로의 병합 방식 결정(직접 머지 vs PR) — `finishing-a-development-branch`
  스킬로 진행 예정.
- 위에서 언급한 미확인 라이브 플로우(생성 화면, 다음 장 이어하기) 시뮬레이터
  확인.
