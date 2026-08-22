# 목숨 축소·오프라인 배너 제거·알림/스트릭·광고 조기노출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목숨 최대치·리필 주기 축소(5개/30분), Today 화면 동기화 배너 완전 제거, 통독 광고 간격 단축, 스트릭 서버-로컬 날짜 정합, 스트릭 시각 강화, 알림 타이밍 확장(목숨 풀충전·자정 임박 재알림)을 스펙(`docs/superpowers/specs/2026-08-21-lives-streak-ads-notif-design.md`)대로 구현한다.

**Architecture:** Flutter 클라이언트(`verse-flutter`)와 Go 서버(`verse-backend`)에 걸친 8개의 독립적인 작업. 각 작업은 별도로 테스트 가능하고 서로 순서 의존성이 거의 없다(예외: Task 5는 Task 4가 만든 서버 DTO 필드에 의존).

**Tech Stack:** Flutter/Dart(drift, riverpod, flutter_local_notifications), Go(net/http, sqlc 스타일 repository)

## Global Constraints

- 목숨 최대치: 10 → **5**. 리필 주기: 20분 → **30분**. 클라이언트·서버 양쪽 동일하게 적용(스펙 §1).
- 기존에 6~10개 보유한 사용자는 다음 정산 시 `clamp(0, 5)`로 자동 축소된다 — 별도 마이그레이션/보상 없음(사용자 승인 완료).
- Today 화면의 동기화 배너(오프라인·로그인필요)는 **완전 제거**. `SyncOutcome` enum 자체와 재시도 로직은 유지.
- 통독 전면광고 간격: 장 경계 3분 → **2분**, 절 경계 10분 → **7분**. 첫 장 스킵 로직(`isFirstChapter`)은 이미 "앱 전체 최초 통독 장 1회"로 올바르게 스코프되어 있음이 확인됨(`reading.countAll() == 0` 기준) — **추가 플래그 불필요**, 상수만 변경.
- 스트릭 "오늘" 판정은 서버가 UTC 대신 클라이언트가 보낸 로컬 날짜(`local_day`, `YYYY-MM-DD`)를 우선 사용하되, 없거나 형식이 잘못되면 UTC로 폴백(구버전 클라이언트 호환).
- 커밋은 각 태스크(스텝 묶음)마다 수행한다.

---

### Task 1: 목숨 상수 축소 + 관련 하드코딩 값 정리 (클라이언트)

**Files:**
- Modify: `verse-flutter/lib/core/db/lives_streak_repository.dart:8-9`
- Modify: `verse-flutter/lib/features/progress/dashboard_screen.dart:94`
- Modify: `verse-flutter/lib/core/sync/session_sync_coordinator.dart:137`
- Modify: `verse-flutter/lib/l10n/app_ko.arb` (`memorizeCoachLivesBody`, `splashTip1`)
- Modify: `verse-flutter/lib/l10n/app_en.arb` (`memorizeCoachLivesBody`, `splashTip1`)
- Test: `verse-flutter/test/lives_streak_repository_test.dart` (기존 테스트, 상수 참조만 하므로 회귀 확인용)

**Interfaces:**
- Consumes: 없음
- Produces: `maxLives`(top-level `const int`, 값 5), `livesRefillInterval`(top-level `const Duration`, 값 30분) — Task 1 내부 및 다른 화면에서 계속 이 이름으로 참조됨.

- [ ] **Step 1: 기존 테스트가 상수를 그대로 참조하는지 확인(사전 확인, 실패 없음)**

Run: `cd verse-flutter && flutter test test/lives_streak_repository_test.dart`
Expected: PASS (현재 maxLives=10 기준으로 통과 — 변경 전 베이스라인 확인용)

- [ ] **Step 2: 상수 변경**

`verse-flutter/lib/core/db/lives_streak_repository.dart:8-9`을 다음으로 교체:

```dart
const maxLives = 5;
const livesRefillInterval = Duration(minutes: 30);
```

- [ ] **Step 3: 대시보드 하드코딩 "/ 10" 제거**

`verse-flutter/lib/features/progress/dashboard_screen.dart`에서 import 추가:

```dart
import '../../core/db/lives_streak_repository.dart' show maxLives;
```

`dashboard_screen.dart:94`의 `data: (v) => '$v / 10',`를 다음으로 교체:

```dart
data: (v) => '$v / $maxLives',
```

- [ ] **Step 4: 계정 전환 시 목숨 초기화 하드코딩 값 정리**

`verse-flutter/lib/core/sync/session_sync_coordinator.dart` 상단에 import 추가:

```dart
import '../db/lives_streak_repository.dart' show maxLives;
```

`session_sync_coordinator.dart:135-138`을 다음으로 교체:

```dart
      await _db.into(_db.livesState).insertOnConflictUpdate(
            LivesStateCompanion.insert(id: const Value(0), count: const Value(maxLives), updatedAt: DateTime.now()),
          );
```

(직전 줄의 "maxLives 값과 동일하게 유지" 주석은 이제 실제로 상수를 참조하므로 삭제)

- [ ] **Step 5: 리필 주기 안내 문구 수정(ko/en arb)**

`verse-flutter/lib/l10n/app_ko.arb`:
- `"memorizeCoachLivesBody": "하트는 20분마다 1개씩 차고, 광고를 보면 바로 채울 수 있어요.",` → `"memorizeCoachLivesBody": "하트는 30분마다 1개씩 차고, 광고를 보면 바로 채울 수 있어요.",`
- `"splashTip1": "하트는 20분마다 1개씩 차올라요",` → `"splashTip1": "하트는 30분마다 1개씩 차올라요",`

`verse-flutter/lib/l10n/app_en.arb`:
- `"memorizeCoachLivesBody": "Hearts refill 1 every 20 minutes, or instantly with a rewarded ad.",` → `"memorizeCoachLivesBody": "Hearts refill 1 every 30 minutes, or instantly with a rewarded ad.",`
- `"splashTip1": "Hearts refill 1 every 20 minutes",` → `"splashTip1": "Hearts refill 1 every 30 minutes",`

- [ ] **Step 6: l10n 재생성**

Run: `cd verse-flutter && flutter gen-l10n`
Expected: 종료 코드 0, `lib/l10n/app_localizations_ko.dart`·`app_localizations_en.dart`의 `memorizeCoachLivesBody`/`splashTip1` 문자열이 30분으로 갱신됨을 `git diff`로 확인.

- [ ] **Step 7: 테스트 재실행**

Run: `cd verse-flutter && flutter test test/lives_streak_repository_test.dart`
Expected: PASS (maxLives=5, livesRefillInterval=30분 기준으로도 기존 테스트는 상수를 참조하므로 그대로 통과)

- [ ] **Step 8: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-flutter/lib/core/db/lives_streak_repository.dart verse-flutter/lib/features/progress/dashboard_screen.dart verse-flutter/lib/core/sync/session_sync_coordinator.dart verse-flutter/lib/l10n/app_ko.arb verse-flutter/lib/l10n/app_en.arb verse-flutter/lib/l10n/app_localizations_ko.dart verse-flutter/lib/l10n/app_localizations_en.dart
git commit -m "feat(lives): 목숨 최대치 10→5, 리필 주기 20분→30분(클라이언트)"
```

---

### Task 2: 목숨 상수 축소 (서버)

**Files:**
- Modify: `verse-backend/internal/service/lives_service.go:19-21`
- Modify: `verse-backend/internal/service/lives_service_test.go` (기존 케이스가 `MaxLives`/`20 * time.Minute` 리터럴을 하드코딩하고 있어 갱신 필요)

**Interfaces:**
- Consumes: 없음
- Produces: `MaxLives`(const int32, 값 5), `LivesRefillTTL`(const time.Duration, 값 30분)

- [ ] **Step 1: 기존 테스트 베이스라인 확인**

Run: `cd verse-backend && go test ./internal/service/ -run TestSettleLives -v`
Expected: PASS (변경 전, 20분/10 기준)

- [ ] **Step 2: 상수 변경**

`verse-backend/internal/service/lives_service.go:19-21`을 다음으로 교체:

```go
const (
	MaxLives       = 5
	LivesRefillTTL = 30 * time.Minute
)
```

- [ ] **Step 3: 테스트 케이스를 새 주기(30분)에 맞게 갱신**

`verse-backend/internal/service/lives_service_test.go`의 `cases` 슬라이스를 다음으로 전체 교체(기존 20분 기준 케이스를 30분 기준으로, MaxLives 참조는 그대로 심볼릭 유지):

```go
	cases := []struct {
		name      string
		stored    domain.Lives
		now       time.Time
		wantCount int32
		wantAt    time.Time
	}{
		{
			name:      "no time elapsed: unchanged",
			stored:    domain.Lives{Count: 3, UpdatedAt: base},
			now:       base,
			wantCount: 3,
			wantAt:    base,
		},
		{
			name:      "less than one interval: unchanged",
			stored:    domain.Lives{Count: 3, UpdatedAt: base},
			now:       base.Add(29 * time.Minute),
			wantCount: 3,
			wantAt:    base,
		},
		{
			name:      "exactly one interval: +1, clock advances by interval",
			stored:    domain.Lives{Count: 3, UpdatedAt: base},
			now:       base.Add(30 * time.Minute),
			wantCount: 4,
			wantAt:    base.Add(30 * time.Minute),
		},
		{
			name:      "partial second interval: remainder preserved",
			stored:    domain.Lives{Count: 3, UpdatedAt: base},
			now:       base.Add(40 * time.Minute),
			wantCount: 4,
			wantAt:    base.Add(30 * time.Minute),
		},
		{
			name:      "multiple intervals",
			stored:    domain.Lives{Count: 1, UpdatedAt: base},
			now:       base.Add(95 * time.Minute),
			wantCount: 4,
			wantAt:    base.Add(90 * time.Minute),
		},
		{
			name:      "caps at max, resets clock to now",
			stored:    domain.Lives{Count: 4, UpdatedAt: base},
			now:       base.Add(3 * time.Hour),
			wantCount: MaxLives,
			wantAt:    base.Add(3 * time.Hour),
		},
		{
			name:      "already at max: clock resets to now",
			stored:    domain.Lives{Count: MaxLives, UpdatedAt: base},
			now:       base.Add(3 * time.Hour),
			wantCount: MaxLives,
			wantAt:    base.Add(3 * time.Hour),
		},
	}
```

- [ ] **Step 4: 테스트 실행 및 통과 확인**

Run: `cd verse-backend && go test ./internal/service/ -run TestSettleLives -v`
Expected: PASS, 7개 서브테스트 모두 통과

- [ ] **Step 5: 전체 서비스 패키지 테스트로 회귀 확인**

Run: `cd verse-backend && go test ./internal/service/... -v`
Expected: PASS (다른 테스트가 `MaxLives`/`LivesRefillTTL` 리터럴에 의존하지 않는지 확인)

- [ ] **Step 6: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-backend/internal/service/lives_service.go verse-backend/internal/service/lives_service_test.go
git commit -m "feat(lives): 목숨 최대치 10→5, 리필 주기 20분→30분(서버)"
```

---

### Task 3: Today 화면 동기화 배너 완전 제거

**Files:**
- Modify: `verse-flutter/lib/features/today/today_screen.dart`
- Modify: `verse-flutter/lib/l10n/app_ko.arb`
- Modify: `verse-flutter/lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: 없음
- Produces: 없음(위젯 제거이므로 다른 태스크가 의존하는 산출물 없음)

- [ ] **Step 1: `_SyncBanner` 호출부 제거**

`verse-flutter/lib/features/today/today_screen.dart`에서 `_SyncBanner(outcome: ...)`를 렌더 트리에 배치하는 코드를 찾아 제거한다(`grep -n "_SyncBanner(" verse-flutter/lib/features/today/today_screen.dart`로 정확한 위치를 확인 후 해당 위젯 호출과 이를 감싸는 불필요한 `Column`/`SizedBox` 래퍼가 있다면 그 줄만 제거).

- [ ] **Step 2: `_SyncBanner` 클래스 및 `_banner` 헬퍼 삭제**

`today_screen.dart`의 `class _SyncBanner extends ConsumerWidget { ... }` 전체 블록(생성자, `build`, `_banner` 메서드 포함)을 삭제한다.

- [ ] **Step 3: 정적 분석으로 미사용 import/심볼 확인**

Run: `cd verse-flutter && flutter analyze lib/features/today/today_screen.dart`
Expected: `_SyncBanner` 관련 에러 없음. `SyncOutcome`을 더 이상 today_screen.dart에서 참조하지 않는다면 관련 import(`../../core/sync/sync_service.dart` 등, 다른 용도로 안 쓰일 때만) 제거.

- [ ] **Step 4: 고아가 된 l10n 문자열 제거**

`verse-flutter/lib/l10n/app_ko.arb`에서 `"commonOffline": "오프라인 상태예요",`와 `"syncLoginRequired": "동기화하려면 로그인이 필요해요",` 삭제.
`verse-flutter/lib/l10n/app_en.arb`에서 `"commonOffline": "You're offline",`와 `"syncLoginRequired": "Sign in to sync your progress",` 삭제.

먼저 `syncLoginRequired`가 today_screen.dart 외 다른 곳에서 쓰이지 않는지 확인:

Run: `grep -rn "syncLoginRequired\|commonOffline" verse-flutter/lib --include="*.dart" | grep -v app_localizations`
Expected: 결과 없음(today_screen.dart의 참조가 이미 Step 1~2에서 제거되었으므로). 만약 다른 화면에서 참조가 남아있다면 그 문자열은 arb에서 삭제하지 않는다.

- [ ] **Step 5: l10n 재생성**

Run: `cd verse-flutter && flutter gen-l10n`
Expected: 종료 코드 0. `app_localizations.dart`(추상 getter), `app_localizations_ko.dart`, `app_localizations_en.dart`에서 `commonOffline`/`syncLoginRequired` 관련 라인이 사라졌는지 `git diff`로 확인.

- [ ] **Step 6: 전체 analyze로 미사용 참조 없는지 최종 확인**

Run: `cd verse-flutter && flutter analyze`
Expected: 기존에 없던 새 에러 없음(경고성 미사용 import는 직접 확인 후 제거).

- [ ] **Step 7: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-flutter/lib/features/today/today_screen.dart verse-flutter/lib/l10n/app_ko.arb verse-flutter/lib/l10n/app_en.arb verse-flutter/lib/l10n/app_localizations.dart verse-flutter/lib/l10n/app_localizations_ko.dart verse-flutter/lib/l10n/app_localizations_en.dart
git commit -m "feat(today): 오프라인/로그인필요 동기화 배너 완전 제거"
```

---

### Task 4: 스트릭 서버 로컬-데이 정합 (서버)

**Files:**
- Modify: `verse-backend/internal/service/streak_service.go`
- Modify: `verse-backend/internal/service/streak_service_test.go`
- Modify: `verse-backend/internal/service/attempt_service.go`
- Modify: `verse-backend/internal/handler/dto/attempt_dto.go`
- Modify: `verse-backend/internal/handler/attempt_handler.go`

**Interfaces:**
- Consumes: 없음(서버 내부 변경)
- Produces: `UpdateStreak(ctx, repo, userID int64, localDay string) error`(기존 3-파라미터 → 4-파라미터로 시그니처 변경), `AttemptService.SubmitAttempt(..., localDay string)`(기존 시그니처 끝에 파라미터 추가), `BatchAttemptInput.LocalDay string`(신규 필드), JSON 요청 필드 `local_day`(단건·배치 공통) — Task 5(클라이언트 업로드)가 이 JSON 필드명을 그대로 사용한다.

- [ ] **Step 1: `resolveToday` 순수 함수 추가 + 실패 테스트 작성**

`verse-backend/internal/service/streak_service_test.go`에 추가:

```go
func TestResolveToday(t *testing.T) {
	cases := []struct {
		name     string
		localDay string
		want     bool // true면 localDay 그대로, false면 UTC now와 같아야 함
	}{
		{name: "valid local day used as-is", localDay: "2026-08-20", want: true},
		{name: "empty falls back to UTC now", localDay: "", want: false},
		{name: "malformed falls back to UTC now", localDay: "not-a-date", want: false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := resolveToday(c.localDay)
			if c.want {
				if got != c.localDay {
					t.Errorf("got %q, want %q", got, c.localDay)
				}
			} else {
				wantUTC := time.Now().UTC().Format("2006-01-02")
				if got != wantUTC {
					t.Errorf("got %q, want UTC today %q", got, wantUTC)
				}
			}
		})
	}
}
```

- [ ] **Step 2: 테스트 실행해 컴파일 실패 확인**

Run: `cd verse-backend && go test ./internal/service/ -run TestResolveToday -v`
Expected: FAIL — `undefined: resolveToday`

- [ ] **Step 3: `resolveToday` 구현 + `UpdateStreak` 시그니처 변경**

`verse-backend/internal/service/streak_service.go`의 `UpdateStreak` 함수를 다음으로 교체(파일 상단 주석의 "MVP에서는 서버 UTC 기준" 문구도 갱신):

```go
// streak_service.go — 연속일(streak) 계산. 기획서 §8 리텐션 주력 장치.
//
// 규칙:
//   - 오늘 == last_day      → 변화 없음(하루 여러 번 해도 1일)
//   - 오늘 == last_day + 1  → current_len++, longest 갱신
//   - 그 외(하루 이상 공백) → current_len = 1로 리셋
//
// "오늘"은 클라이언트가 보낸 로컬 날짜(localDay, YYYY-MM-DD)를 우선 사용한다.
// 비어있거나 형식이 잘못되면(구버전 클라이언트) UTC 기준으로 폴백한다.
package service

import (
	"context"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

// resolveToday — localDay가 "2006-01-02" 형식으로 유효하면 그대로 쓰고,
// 아니면 UTC 기준 오늘로 폴백한다.
func resolveToday(localDay string) string {
	if _, err := time.Parse("2006-01-02", localDay); err != nil {
		return time.Now().UTC().Format("2006-01-02")
	}
	return localDay
}

// UpdateStreak — 시도 제출 후 streak를 갱신한다.
// attempt_service가 InsertAttempt 후 순차 호출.
func UpdateStreak(ctx context.Context, repo repository.AttemptRepo, userID int64, localDay string) error {
	today := resolveToday(localDay)

	streak, err := repo.GetStreak(ctx, userID)
	if err != nil && err != domain.ErrNotFound {
		return err
	}

	params := repository.UpsertStreakParams{
		UserID:     userID,
		CurrentLen: streak.CurrentLen,
		LongestLen: streak.LongestLen,
		LastDay:    &today,
	}

	switch {
	case streak.LastDay == nil:
		// 첫 시도
		params.CurrentLen = 1
		params.LongestLen = 1

	case *streak.LastDay == today:
		// 오늘 이미 했음 — 변화 없음

	case isNextDay(*streak.LastDay, today):
		// 연속
		params.CurrentLen++
		if params.CurrentLen > params.LongestLen {
			params.LongestLen = params.CurrentLen
		}

	default:
		// 공백 발생 — 리셋
		params.CurrentLen = 1
	}

	return repo.UpsertStreak(ctx, params)
}

// isNextDay — prev가 today의 바로 전날인지 확인. "2006-01-02" 형식.
func isNextDay(prev, today string) bool {
	prevT, err1 := time.Parse("2006-01-02", prev)
	todayT, err2 := time.Parse("2006-01-02", today)
	if err1 != nil || err2 != nil {
		return false
	}
	return todayT.Sub(prevT) == 24*time.Hour
}
```

- [ ] **Step 4: `resolveToday` 테스트 통과 확인**

Run: `cd verse-backend && go test ./internal/service/ -run TestResolveToday -v`
Expected: PASS, 3개 서브테스트 모두 통과

- [ ] **Step 5: 기존 `TestUpdateStreak` 호출부를 새 시그니처에 맞게 수정**

`verse-backend/internal/service/streak_service_test.go`의 `TestUpdateStreak` 안에서 `UpdateStreak(ctx, repo, uid)`를 호출하는 라인(109번 근처)을 다음으로 교체:

```go
			if err := UpdateStreak(ctx, repo, uid, ""); err != nil {
```

(빈 문자열을 넘겨 기존 UTC 기준 테스트 케이스들이 그대로 동작하게 한다 — `resolveToday("")`는 UTC now로 폴백하므로 기존 테스트의 `dayStr(time.Now())` 기반 fixture와 일치)

- [ ] **Step 6: 서비스 패키지 전체 테스트로 회귀 확인**

Run: `cd verse-backend && go test ./internal/service/... -v`
Expected: FAIL — `AttemptService.SubmitAttempt`가 아직 `UpdateStreak`를 3개 인자로 호출 중이라 컴파일 에러(다음 스텝에서 해결)

- [ ] **Step 7: `AttemptService.SubmitAttempt`에 `localDay` 파라미터 추가**

`verse-backend/internal/service/attempt_service.go`의 `SubmitAttempt` 시그니처(약 44번째 줄)를 교체:

```go
func (s *AttemptService) SubmitAttempt(
	ctx context.Context,
	userID, courseItemID int64,
	mode domain.Mode,
	clientGrade domain.Grade,
	tokens []string,
	localDay string,
) (AttemptResult, error) {
```

같은 파일의 `UpdateStreak(ctx, s.attempts, userID)` 호출(주석 "// 5. 연속일 갱신" 아래)을 교체:

```go
	if err := UpdateStreak(ctx, s.attempts, userID, localDay); err != nil {
```

`BatchAttemptInput` 구조체(주석 "// BatchAttemptInput — SubmitAttemptsBatch 항목 하나의 입력." 아래)에 필드 추가:

```go
type BatchAttemptInput struct {
	ClientSeq    string
	CourseItemID int64
	Mode         domain.Mode
	ClientGrade  domain.Grade
	Tokens       []string
	LocalDay     string
}
```

`SubmitAttemptsBatch` 안의 `s.SubmitAttempt(ctx, userID, item.CourseItemID, item.Mode, item.ClientGrade, item.Tokens)` 호출을 교체:

```go
		result, err := s.SubmitAttempt(ctx, userID, item.CourseItemID, item.Mode, item.ClientGrade, item.Tokens, item.LocalDay)
```

- [ ] **Step 8: DTO에 `local_day` 필드 추가**

`verse-backend/internal/handler/dto/attempt_dto.go`의 `SubmitAttemptRequest`에 필드 추가:

```go
type SubmitAttemptRequest struct {
	CourseItemID int64    `json:"course_item_id"`
	Mode         string   `json:"mode"`
	ClientGrade  string   `json:"client_grade"`
	Tokens       []string `json:"tokens"` // 서버 재채점용 사용자 입력 토큰
	LocalDay     string   `json:"local_day"` // 클라이언트 로컬 자정 기준 오늘(YYYY-MM-DD). 없으면 서버 UTC로 폴백
}
```

`BatchAttemptItem`에도 동일하게 추가:

```go
type BatchAttemptItem struct {
	ClientSeq    string   `json:"client_seq"` // 클라 로컬 큐 항목 식별자(UUID 등), 응답 매칭용
	CourseItemID int64    `json:"course_item_id"`
	Mode         string   `json:"mode"`
	ClientGrade  string   `json:"client_grade"`
	Tokens       []string `json:"tokens"`
	LocalDay     string   `json:"local_day"`
}
```

- [ ] **Step 9: 핸들러에서 `local_day` 전달**

`verse-backend/internal/handler/attempt_handler.go`의 `SubmitAttempt` 핸들러 안 `h.attempt.SubmitAttempt(...)` 호출을 교체:

```go
	result, err := h.attempt.SubmitAttempt(
		r.Context(),
		userID,
		req.CourseItemID,
		mode,
		domain.Grade(req.ClientGrade),
		req.Tokens,
		req.LocalDay,
	)
```

`SubmitAttemptsBatch` 핸들러 안 `inputs[i] = service.BatchAttemptInput{...}` 리터럴에 필드 추가:

```go
		inputs[i] = service.BatchAttemptInput{
			ClientSeq:    a.ClientSeq,
			CourseItemID: a.CourseItemID,
			Mode:         mode,
			ClientGrade:  domain.Grade(a.ClientGrade),
			Tokens:       a.Tokens,
			LocalDay:     a.LocalDay,
		}
```

- [ ] **Step 10: 전체 빌드 및 테스트 통과 확인**

Run: `cd verse-backend && go build ./... && go test ./... -v`
Expected: 빌드 성공, 모든 테스트 PASS(다른 패키지에서 `SubmitAttempt`를 옛 시그니처로 호출하는 곳이 있다면 컴파일 에러로 드러나므로 해당 호출부도 `""` 또는 실제 값으로 갱신)

- [ ] **Step 11: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-backend/internal/service/streak_service.go verse-backend/internal/service/streak_service_test.go verse-backend/internal/service/attempt_service.go verse-backend/internal/handler/dto/attempt_dto.go verse-backend/internal/handler/attempt_handler.go
git commit -m "feat(streak): 서버가 클라이언트 로컬 날짜(local_day) 기준으로 스트릭 판정"
```

---

### Task 5: 스트릭 로컬-데이 업로드 (클라이언트)

**Files:**
- Modify: `verse-flutter/lib/core/sync/sync_service.dart:61-69`

**Interfaces:**
- Consumes: Task 4에서 서버가 받는 JSON 필드 `local_day`(단건/배치 공통), `todayLocalString()`(기존 함수, `verse-flutter/lib/core/date/local_day.dart`)
- Produces: 없음

- [ ] **Step 1: 배치 업로드 payload에 `local_day` 추가**

`verse-flutter/lib/core/sync/sync_service.dart` 상단에 import 추가:

```dart
import '../date/local_day.dart';
```

`_syncChunk`의 요청 body 구성부(약 61-69번째 줄)를 교체:

```dart
      final res = await _client.dio.post('/sync/attempts', data: {
        'attempts': chunk
            .map((a) => {
                  'client_seq': a.clientSeq,
                  'course_item_id': a.courseItemId,
                  'mode': a.mode,
                  'client_grade': a.clientGrade,
                  'tokens': jsonDecode(a.tokensJson),
                  'local_day': todayLocalString(),
                })
            .toList(),
      });
```

("업로드 시점의 로컬 오늘"을 보낸다 — 각 attempt 레코드 자체에 생성 시점 로컬 날짜를 저장해두지 않으므로, 배치 업로드 시점 기준이 현재 가능한 최선의 근사치다. attempt_queue가 보통 앱 재개/로그인 시 곧바로 flush되므로 생성일과 업로드일이 대부분 같은 로컬 날짜다.)

- [ ] **Step 2: 기존 sync 관련 테스트가 있다면 실행해 회귀 확인**

Run: `cd verse-flutter && find test -iname "*sync*"`

테스트 파일이 존재하면 실행: `cd verse-flutter && flutter test <해당 경로>`
Expected: PASS. (테스트 파일이 없으면 이 스텝은 확인만 하고 통과로 간주 — mock 서버가 필요한 통합 성격이라 유닛 테스트 부재는 기존 상태와 동일함)

- [ ] **Step 3: 정적 분석**

Run: `cd verse-flutter && flutter analyze lib/core/sync/sync_service.dart`
Expected: 새 에러 없음

- [ ] **Step 4: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-flutter/lib/core/sync/sync_service.dart
git commit -m "feat(streak): 시도 업로드 시 로컬 날짜(local_day)를 서버에 함께 전송"
```

---

### Task 6: 통독 전면광고 간격 단축

**Files:**
- Modify: `verse-flutter/lib/features/reading/reading_ad_gate.dart`
- Modify: `verse-flutter/test/reading_ad_gate_test.dart`

**Interfaces:**
- Consumes: 없음
- Produces: `kChapterAdGap`(Duration, 값 2분으로 변경), `kVerseAdGap`(Duration, 값 7분으로 변경) — 다른 코드는 상수 이름만 참조하므로 값 변경 외 영향 없음.

- [ ] **Step 1: 새 간격에 맞게 실패하는 테스트로 기존 테스트 수정**

`verse-flutter/test/reading_ad_gate_test.dart` 전체를 다음으로 교체:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:verse_flutter/features/reading/reading_ad_gate.dart';

void main() {
  test('첫 장은 무조건 면제된다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: true,
        sinceLastAd: const Duration(hours: 1),
      ),
      isFalse,
    );
  });

  test('장 경계에서 2분이 지났으면 노출한다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 2),
      ),
      isTrue,
    );
  });

  test('장 경계라도 2분이 안 지났으면 노출하지 않는다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 1, seconds: 59),
      ),
      isFalse,
    );
  });

  test('장 내부 절 경계는 7분이 지나야 노출한다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: false,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 7),
      ),
      isTrue,
    );
  });

  test('장 내부 절 경계에서 7분 미만이면 노출하지 않는다', () {
    expect(
      shouldShowInterstitial(
        isChapterBoundary: false,
        isFirstChapter: false,
        sinceLastAd: const Duration(minutes: 6, seconds: 59),
      ),
      isFalse,
    );
  });

  test('짧은 장을 연달아 마쳐도 2분 가드에 묶인다', () {
    // 시편 117편(2절) → 118편 시나리오
    expect(
      shouldShowInterstitial(
        isChapterBoundary: true,
        isFirstChapter: false,
        sinceLastAd: const Duration(seconds: 40),
      ),
      isFalse,
    );
  });

  test('상수는 스펙대로 2분·7분이다', () {
    expect(kChapterAdGap, const Duration(minutes: 2));
    expect(kVerseAdGap, const Duration(minutes: 7));
  });
}
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/reading_ad_gate_test.dart`
Expected: FAIL — 마지막 상수 검증 테스트와 2분/7분 경계 테스트들이 기존 3분/10분 상수 기준으로 실패

- [ ] **Step 3: 상수 변경**

`verse-flutter/lib/features/reading/reading_ad_gate.dart:5,8`을 교체:

```dart
/// 장 경계에서의 최소 간격. 짧은 장 연타(시편 117편 2절 → 118편)를 묶는다.
const Duration kChapterAdGap = Duration(minutes: 2);

/// 장 내부 절 경계에서의 최소 간격. 시편 119편(176절)처럼 한 장이 아주 긴
/// 경우에도 수익이 나게 하는 백업 트리거다.
const Duration kVerseAdGap = Duration(minutes: 7);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/reading_ad_gate_test.dart`
Expected: PASS, 7개 테스트 모두 통과

- [ ] **Step 5: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-flutter/lib/features/reading/reading_ad_gate.dart verse-flutter/test/reading_ad_gate_test.dart
git commit -m "feat(reading-ads): 전면광고 간격 단축(장 3분→2분, 절 10분→7분)"
```

---

### Task 7: 알림 — 목숨 풀충전 알림 + 자정 임박 스트릭 위험 재알림

**Files:**
- Modify: `verse-flutter/lib/core/notifications/reminder_service.dart`
- Modify: `verse-flutter/lib/core/db/lives_streak_repository.dart` (목숨 소모 시점 후킹)
- Test: `verse-flutter/test/streak_danger_test.dart` (기존 파일에 자정 임박 판정 함수 테스트 추가)

**Interfaces:**
- Consumes: `livesRefillInterval`(Task 1에서 30분으로 변경됨), `maxLives`(Task 1에서 5로 변경됨), `todayLocalString()`
- Produces: `ReminderService.scheduleLivesFullNotification(DateTime consumedAt, {required int countAfterConsume})`(신규 메서드), `shouldScheduleMidnightDanger(StreakStateData? streak, String todayLocal, DateTime nowLocal, int dangerHour, int dangerMinute) → bool`(신규 순수 함수)

- [ ] **Step 1: 자정 임박 재알림 판정 함수 실패 테스트 작성**

`verse-flutter/test/streak_danger_test.dart` 파일 끝에 다음 테스트 그룹 추가(파일 상단에 이미 `import 'package:verse_flutter/core/notifications/reminder_service.dart';`와 `import 'package:verse_flutter/core/db/lives_streak_repository.dart';`가 있는지 확인 후 없으면 추가):

```dart
  group('shouldScheduleMidnightDanger', () {
    final streak = StreakStateData(
      id: 0,
      currentLen: 5,
      longestLen: 5,
      lastDay: '2026-08-20',
      freezeCount: 0,
      freezeGrantedAtLen: 0,
      brokenFromLen: null,
      brokenOnDay: null,
    );

    test('오늘 아직 안 했고 자정 2시간 전이면 예약한다', () {
      final now = DateTime(2026, 8, 21, 22, 0); // 자정 2시간 전
      expect(
        shouldScheduleMidnightDanger(streak, '2026-08-21', now, 20, 0),
        isTrue,
      );
    });

    test('오늘 이미 저녁 위험 알림 시각(dangerHour)에 이미 예약된 시간대라면 자정 임박은 스킵', () {
      final now = DateTime(2026, 8, 21, 19, 0); // dangerHour(20시) 이전
      expect(
        shouldScheduleMidnightDanger(streak, '2026-08-21', now, 20, 0),
        isFalse,
      );
    });

    test('오늘 이미 활동했으면 예약하지 않는다', () {
      final doneToday = StreakStateData(
        id: 0,
        currentLen: 6,
        longestLen: 6,
        lastDay: '2026-08-21',
        freezeCount: 0,
        freezeGrantedAtLen: 0,
        brokenFromLen: null,
        brokenOnDay: null,
      );
      final now = DateTime(2026, 8, 21, 22, 0);
      expect(
        shouldScheduleMidnightDanger(doneToday, '2026-08-21', now, 20, 0),
        isFalse,
      );
    });

    test('지킬 스트릭이 없으면 예약하지 않는다', () {
      final now = DateTime(2026, 8, 21, 22, 0);
      expect(
        shouldScheduleMidnightDanger(null, '2026-08-21', now, 20, 0),
        isFalse,
      );
    });
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: FAIL — `shouldScheduleMidnightDanger` 미정의

- [ ] **Step 3: `shouldScheduleMidnightDanger` 구현**

`verse-flutter/lib/core/notifications/reminder_service.dart`의 `shouldScheduleComeback` 함수 바로 아래에 추가:

```dart
/// 자정 2시간 전 재알림 예약 판단(순수 함수, 단위 테스트용). 저녁 위험 알림
/// (dangerHour) 시각을 이미 지난 시점에만 의미가 있다 — 그 전이면 저녁
/// 알림이 아직 안 왔으므로 중복 알림을 막기 위해 예약하지 않는다.
/// nowLocal은 판정 시점의 로컬 시각(자정 임박 여부 계산용).
bool shouldScheduleMidnightDanger(
  StreakStateData? streak,
  String todayLocal,
  DateTime nowLocal,
  int dangerHour,
  int dangerMinute,
) {
  if (!shouldScheduleStreakDanger(streak, todayLocal)) return false;
  final dangerTime = DateTime(nowLocal.year, nowLocal.month, nowLocal.day, dangerHour, dangerMinute);
  return !nowLocal.isBefore(dangerTime);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart`
Expected: PASS, 신규 4개 서브테스트 포함 전체 통과

- [ ] **Step 5: `refreshStreakDanger`에 자정 임박 재알림 배선**

`verse-flutter/lib/core/notifications/reminder_service.dart`의 `refreshStreakDanger` 메서드 끝(현재 `_zonedSchedule(...)` 호출 뒤, 메서드 닫는 `}` 직전)에 추가:

```dart

    final nowLocal = DateTime.now();
    if (shouldScheduleMidnightDanger(streak, todayLocal, nowLocal, settings.dangerHour, settings.dangerMinute)) {
      final midnight = tz.TZDateTime(tz.local, nowLocal.year, nowLocal.month, nowLocal.day + 1);
      await _zonedSchedule(
        _midnightDangerNotificationId,
        dangerTitle(locale),
        locale == 'en'
            ? "Midnight is close — one verse keeps your ${streak.currentLen}-day streak"
            : '자정이 얼마 안 남았어요 — 한 절이면 ${streak.currentLen}일 스트릭을 지켜요',
        midnight.subtract(const Duration(hours: 2)),
        const NotificationDetails(
          android: AndroidNotificationDetails(
            _dangerChannelId,
            '스트릭 위험 경고',
            channelDescription: '스트릭이 끊기기 전 저녁에 경고를 보냅니다',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        payload: notificationPayloadStreakDanger,
      );
    } else {
      await _plugin.cancel(_midnightDangerNotificationId);
    }
```

같은 클래스의 상수 목록(`_dangerNotificationId` 근처)에 신규 알림 ID 추가:

```dart
  static const _midnightDangerNotificationId = 1005;
```

- [ ] **Step 6: 목숨 풀충전 알림 메서드 추가**

`reminder_service.dart`에 신규 알림 채널 ID 상수 추가(기존 `_comebackChannelId` 근처):

```dart
  static const _livesFullNotificationId = 1006;
  static const _livesFullChannelId = 'lives_full';
```

같은 클래스에 신규 public 메서드 추가(`refreshComeback` 메서드 뒤):

```dart
  /// 목숨이 0에서 최대치로 완전히 회복되는 시점에 1회성 알림을 예약한다.
  /// [consumedAt]은 마지막 목숨이 소모된 시각, [countAfterConsume]은 소모
  /// 직후 남은 목숨 수 — 0이 아니면(아직 완전히 소진되지 않았으면) 예약하지
  /// 않는다.
  Future<void> scheduleLivesFullNotification(
    DateTime consumedAt, {
    required int countAfterConsume,
    required String locale,
  }) async {
    await _ensureInitialized();
    if (countAfterConsume > 0) {
      await _plugin.cancel(_livesFullNotificationId);
      return;
    }
    final fullAt = consumedAt.add(livesRefillInterval * maxLives);
    final when = tz.TZDateTime.from(fullAt, tz.local);
    await _zonedSchedule(
      _livesFullNotificationId,
      locale == 'en' ? 'Hearts are full' : '하트가 다 찼어요',
      locale == 'en'
          ? 'All $maxLives hearts are back — ready to continue?'
          : '하트 $maxLives개가 모두 채워졌어요 — 이어서 해볼까요?',
      when,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _livesFullChannelId,
          '하트 충전 알림',
          channelDescription: '하트가 다 찼을 때 알려줍니다',
          importance: Importance.defaultImportance,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: notificationPayloadDaily,
    );
  }
```

파일 상단 import에 `import '../db/lives_streak_repository.dart';`가 이미 있는지 확인(있음 — `StreakStateData` 등 이미 사용 중이므로 `maxLives`/`livesRefillInterval`도 같은 import로 접근 가능).

- [ ] **Step 7: `LivesRepository.consume()`가 알림 예약을 트리거하도록 후킹**

`verse-flutter/lib/core/db/lives_streak_repository.dart`의 `LivesRepository`는 `ReminderService`를 모르므로(계층 분리), 알림 트리거는 리포지토리가 아니라 이를 호출하는 컨트롤러 레이어에서 담당한다. `LivesRepository.consume()` 자체는 수정하지 않는다 — 대신 `consume()`을 호출하는 지점(예: 암송 실패 처리)에서 반환값을 사용해 알림을 예약해야 한다는 점을 다음 스텝에서 처리한다.

Run: `grep -rn "\.consume()" verse-flutter/lib --include="*.dart" | grep -v test`

이 grep 결과에 나오는 호출부(암송 컨트롤러 등)를 확인한다.

- [ ] **Step 8: 목숨 소모 호출부에서 알림 예약**

Step 7의 grep 결과 중 `LivesRepository.consume()`을 호출하는 위치(예: `memorize_controller.dart`)를 찾아, 해당 호출을 다음 패턴으로 감싼다:

```dart
final remaining = await _lives.consume();
await _reminders.scheduleLivesFullNotification(
  DateTime.now(),
  countAfterConsume: remaining,
  locale: /* 해당 컨트롤러가 이미 갖고 있는 locale 값, 없으면 'ko' */,
);
```

정확한 변수명과 `_reminders`(ReminderService 인스턴스) 주입 방식은 grep으로 찾은 실제 컨트롤러의 기존 생성자/의존성 주입 패턴을 따른다 — 이미 `_streakRepository`처럼 리포지토리를 주입받는 컨트롤러라면 동일한 방식으로 `ReminderService`를 주입한다. 컨트롤러가 이미 `ReminderService`를 주입받고 있지 않다면, 해당 컨트롤러의 provider 정의(`app/providers.dart`)에서 `ref.watch(reminderServiceProvider)`를 추가로 넘긴다.

- [ ] **Step 9: 정적 분석 및 기존 테스트 회귀 확인**

Run: `cd verse-flutter && flutter analyze lib/core/notifications/reminder_service.dart lib/core/db/lives_streak_repository.dart`
Expected: 새 에러 없음

Run: `cd verse-flutter && flutter test test/streak_danger_test.dart test/lives_streak_repository_test.dart`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-flutter/lib/core/notifications/reminder_service.dart verse-flutter/lib/core/db/lives_streak_repository.dart verse-flutter/test/streak_danger_test.dart
git commit -m "feat(notif): 목숨 풀충전 알림 + 자정 임박 스트릭 위험 재알림 추가"
```

---

### Task 8: 스트릭 시각 강화 — 프리즈 개수 표시 + 다음 마일스톤 진행률

**Files:**
- Modify: `verse-flutter/lib/features/progress/dashboard_screen.dart`
- Modify: `verse-flutter/lib/l10n/app_ko.arb`
- Modify: `verse-flutter/lib/l10n/app_en.arb`

**Interfaces:**
- Consumes: `StreakStateData.freezeCount`(기존 필드, `verse-flutter/lib/core/db/app_database.dart:110`), `streakMilestones`(기존 상수, `verse-flutter/lib/shared/milestones.dart`)
- Produces: 없음(리프 UI 위젯)

- [ ] **Step 1: l10n에 프리즈 라벨 문구 추가**

`verse-flutter/lib/l10n/app_ko.arb`의 `"dashboardStreakMilestones"` 라인 바로 뒤에 추가:

```json
  "dashboardFreezeCount": "프리즈 {count}개",
  "@dashboardFreezeCount": {
    "placeholders": {
      "count": {"type": "int"}
    }
  },
  "dashboardNextMilestone": "다음 마일스톤까지 {remaining}일",
  "@dashboardNextMilestone": {
    "placeholders": {
      "remaining": {"type": "int"}
    }
  },
```

`verse-flutter/lib/l10n/app_en.arb`의 대응 위치(`"dashboardStreakMilestones"` 라인 뒤)에 추가:

```json
  "dashboardFreezeCount": "{count} freeze",
  "@dashboardFreezeCount": {
    "placeholders": {
      "count": {"type": "int"}
    }
  },
  "dashboardNextMilestone": "{remaining} days to next milestone",
  "@dashboardNextMilestone": {
    "placeholders": {
      "remaining": {"type": "int"}
    }
  },
```

- [ ] **Step 2: l10n 재생성**

Run: `cd verse-flutter && flutter gen-l10n`
Expected: 종료 코드 0, `dashboardFreezeCount`/`dashboardNextMilestone` getter가 생성된 3개 dart 파일에 추가됨

- [ ] **Step 3: 프리즈 개수 + 다음 마일스톤 진행률 위젯 추가**

`verse-flutter/lib/features/progress/dashboard_screen.dart`의 `_StreakMilestonesRow` 클래스 바로 앞에 새 위젯 추가:

```dart
/// 보유 프리즈 개수 + 다음 스트릭 마일스톤까지 남은 일수를 함께 보여준다.
/// currentLen 기준(끊기면 0부터 다시 계산) — 이미 달성한 배지 표시인
/// _StreakMilestonesRow(longestLen 기준)와는 의도적으로 다른 기준이다.
class _StreakProgressHeader extends StatelessWidget {
  const _StreakProgressHeader({required this.currentLen, required this.freezeCount});
  final int currentLen;
  final int freezeCount;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final p = context.pixel;
    final nextMilestone = streakMilestones.firstWhere(
      (m) => m > currentLen,
      orElse: () => streakMilestones.last,
    );
    final remaining = (nextMilestone - currentLen).clamp(0, nextMilestone);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        if (remaining > 0)
          Text(l.dashboardNextMilestone(remaining), style: TextStyle(color: p.muted, fontSize: 12)),
        if (freezeCount > 0)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('❄️', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 4),
              Text(l.dashboardFreezeCount(freezeCount), style: TextStyle(color: p.muted, fontSize: 12)),
            ],
          ),
      ],
    );
  }
}
```

- [ ] **Step 4: 대시보드 본문에 배치**

`dashboard_screen.dart`에서 `_StreakMilestonesRow(longestLen: streak!.longestLen)`를 렌더링하는 블록(약 145번째 줄 부근, `if ((streak?.longestLen ?? 0) > 0) ...`) 바로 앞에 추가:

```dart
                  if ((streak?.currentLen ?? 0) > 0) ...[
                    const SizedBox(height: 8),
                    _StreakProgressHeader(
                      currentLen: streak!.currentLen,
                      freezeCount: streak.freezeCount,
                    ),
                  ],
```

- [ ] **Step 5: 정적 분석**

Run: `cd verse-flutter && flutter analyze lib/features/progress/dashboard_screen.dart`
Expected: 새 에러 없음(특히 `streak!`가 이미 non-null임을 앞선 `if` 가드가 보장하는지 확인 — `streak?.currentLen ?? 0 > 0` 가드 안에서는 `streak`가 null이 아님이 타입상 보장되지 않으므로 `streak!.currentLen` 대신 `(streakAsync.value)!.currentLen` 등으로 analyze 경고가 뜨면 로컬 변수로 한 번 바인딩해 정리)

- [ ] **Step 6: Commit**

```bash
cd /Users/yunsu-in/Downloads/kjvapp
git add verse-flutter/lib/features/progress/dashboard_screen.dart verse-flutter/lib/l10n/app_ko.arb verse-flutter/lib/l10n/app_en.arb verse-flutter/lib/l10n/app_localizations.dart verse-flutter/lib/l10n/app_localizations_ko.dart verse-flutter/lib/l10n/app_localizations_en.dart
git commit -m "feat(dashboard): 스트릭 프리즈 개수·다음 마일스톤 진행률 표시"
```

---

## 최종 검증

- [ ] **전체 클라이언트 테스트**

Run: `cd verse-flutter && flutter test`
Expected: 전체 PASS

- [ ] **전체 서버 테스트**

Run: `cd verse-backend && go build ./... && go test ./...`
Expected: 빌드 성공, 전체 PASS

- [ ] **전체 analyze**

Run: `cd verse-flutter && flutter analyze`
Expected: 새로 추가된 에러 없음
</content>
