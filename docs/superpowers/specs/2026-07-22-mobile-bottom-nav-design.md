# 모바일 하단 내비게이션 바 설계 (2026-07-22)

PIXBIBLE **모바일(Flutter) 앱** 전용으로, 지금 각 화면 AppBar에 흩어져 있는 이동 수단을
**지속되는 하단 탭 바 5개**로 통합한다. (웹 `verse-web-next`는 자체 내비를 유지하며 이 설계 대상이 아니다.)

- **대상**: `verse-flutter/`만. 오프라인 우선 원칙 유지.
- **범위 상태**: 하단 바 내비 재편 = 이 스펙. **카드 컬렉션 화면 자체는 별개 후속 스펙**(§6).

---

## 1. 배경 / 문제

현재 화면 이동이 흩어져 있다:
- `courses_list_screen`의 AppBar 우측 아이콘 4개(북마크·대시보드·랭킹·설정).
- `today_screen`의 AppBar 액션("코스 둘러보기").
- 라우트 간 `context.push`(스택)와 `context.go`(교체) 혼용.

지속되는 하단 바가 없어 주요 목적지 접근이 일관되지 않고, 데일리루프 홈(`/today`)이
시작 화면이 됐는데도 다른 목적지로의 이동 동선이 명확하지 않다.

---

## 2. 탭 구성 (5탭)

| 순서 | 탭 | 라우트 | 화면 |
|---|---|---|---|
| 1 | 오늘 | `/today` | `TodayScreen`(데일리루프 홈, 시작 탭) |
| 2 | 코스 | `/courses` | `CoursesListScreen` |
| 3 | 랭킹 | `/rankings` | `RankingsScreen` |
| 4 | 카드 | `/cards` | `CardCollectionScreen` — **이 스펙에선 플레이스홀더**(§6) |
| 5 | 설정 | `/settings` | `SettingsScreen` |

- 아이콘은 기존 픽셀 아이콘 시스템(`PixelIcon`)과 톤을 맞춘다. 각 탭 라벨은 l10n(ko/en).
- 대시보드(통계)·북마크는 탭에서 제외하고, 코스 또는 설정 화면 내 진입점으로 유지한다.

---

## 3. 아키텍처 — `StatefulShellRoute.indexedStack`

go_router의 `StatefulShellRoute.indexedStack`으로 구현한다. 각 탭이 **자기 Navigator 브랜치**를
갖고, 탭 전환 시 **스크롤·드릴다운 스택이 보존**된다(코스→섹션→절로 파고든 뒤 랭킹 갔다 와도 유지).

- 셸을 감싸는 `AppShell` 위젯이 하단 `NavigationBar`(픽셀 스타일)를 그린다.
- 각 브랜치 = 한 탭. 브랜치 내부에서 파고드는 하위 화면은 그 브랜치 Navigator에 push되어
  **하단 바가 그대로 보인다**.
- 대안 B(공유 Scaffold + `context.go`)는 탭마다 상태가 리셋되고 뒤로가기가 어색해 채택하지 않는다.

### 3.1 바가 보이는 화면 / 숨는 화면

- **바 유지(브랜치 내부)**: 오늘·코스·랭킹·카드·설정 + 코스상세·섹션·대시보드·북마크.
- **바 숨김(셸 위 최상위 라우트로 push, 전체화면 몰입)**:
  - 암송 `/memorize/:itemId`
  - 플랜 생성 `/plan/new`
  - 로그인 `/login`, 회원가입 `/signup`
  - 섹션 완료 `/courses/:c/sections/:s/complete`(축하 몰입 화면)

---

## 4. 라우터 재편

`lib/app/router.dart`를 `StatefulShellRoute.indexedStack` 구조로 재구성한다.

```
ShellRoute(AppShell + NavigationBar)
├─ branch: /today        (+ 하위: 없음; /plan/new·/memorize는 셸 밖)
├─ branch: /courses      (+ 하위: /courses/category/:c, /courses/:c, /courses/:c/sections/:s)
├─ branch: /rankings
├─ branch: /cards
└─ branch: /settings     (+ 하위: /bookmarks, /dashboard)

셸 밖 최상위(바 없음): /login, /signup, /memorize/:id, /plan/new,
                       /courses/:c/sections/:s/complete
```

- `initialLocation`은 P1대로 `/today` 유지.
- 대시보드·북마크는 설정 브랜치의 하위로 이동(설정 화면에 진입 항목 추가). 코스 화면 AppBar의
  기존 아이콘 4개는 제거한다(하단 바로 대체).

---

## 5. 기존 내비게이션 정리

- `courses_list_screen`의 AppBar 우측 아이콘(북마크·대시보드·랭킹·설정) **제거**.
- `today_screen`의 "코스 둘러보기" 액션 **제거**(하단 탭으로 대체).
- 각 화면 간 `context.go`/`context.push`는 브랜치 규칙에 맞게 정리:
  탭 전환은 `StatefulNavigationShell.goBranch`, 브랜치 내 드릴다운은 `context.push` 유지.

---

## 6. 카드 탭 스코프 (중요)

**카드 컬렉션 화면(`CardCollectionScreen`)은 아직 없다.** 섹션 완료 "카드 수집"은 개념만 있고
수집 데이터 모델·갤러리 UI가 구현돼 있지 않다.

- 이 스펙에서는 **탭 자리(`/cards`)와 라우트만 만들고, 화면은 "준비 중" 플레이스홀더**로 둔다.
- 실제 카드 컬렉션(수집 데이터 모델 + 갤러리 + 획득 연출)은 **별도 브레인스토밍/스펙**으로 진행한다.
  데일리루프 P2/P3와 연결될 수 있다.
- 이렇게 하면 하단 바 재편(내비 작업)과 카드 컬렉션(신규 기능)이 서로를 막지 않는다.

---

## 7. 테스트

- **위젯 테스트**: `AppShell`에 5개 탭이 렌더되고, 탭 탭(tap) 시 해당 라우트로 전환되는지.
- **상태 보존**: 코스 브랜치에서 하위로 push한 뒤 다른 탭 갔다 돌아오면 스택이 유지되는지.
- **바 숨김**: `/memorize/:id`·`/plan/new` 진입 시 하단 바가 없는지.
- 기존 화면 위젯 테스트(`today_screen_test`, `create_plan_screen_test` 등)가 셸 구조 변경 후에도
  통과하도록 라우터 오버라이드 방식을 맞춘다.

---

## 8. 결정 사항 (구현 기준)

- **카드 탭 플레이스홀더**: 중앙에 마스코트(`MascotSprite`, idle) + "카드 컬렉션 준비 중" 문구
  (l10n). 티저는 최소로. 실제 컬렉션은 별개 스펙(§6).
- **대시보드·북마크 동선**: 설정 화면의 **리스트 항목**으로 진입(별도 섹션 아님). 코스 화면
  AppBar 아이콘 제거분을 여기서 흡수.
- **`NavigationBar`**: Material 3 `NavigationBar` 위젯을 사용하고 `pixel_theme` 색으로 스타일링한다.
  완전 커스텀 픽셀 위젯은 만들지 않는다(YAGNI). 아이콘은 `PixelIcon` 사용.
- **테마별 바 색**: `pixel_theme`의 surface/선택 색을 그대로 따르며, 다크/라이트 자동 대응.

---

## 참고

- 라우트: `lib/app/router.dart`
- 진입점이 흩어진 화면: `lib/features/courses/courses_list_screen.dart`(AppBar 아이콘),
  `lib/features/today/today_screen.dart`(AppBar 액션)
- 픽셀 UI: `lib/shared/widgets/pixel_icon.dart`, `lib/shared/theme/pixel_theme.dart`
- 데일리루프: `docs/superpowers/specs/2026-07-22-daily-loop-design.md`
