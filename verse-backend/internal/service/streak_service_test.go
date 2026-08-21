package service

import (
	"context"
	"testing"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

// stubAttemptRepo — AttemptRepo의 테스트 스텁.
type stubAttemptRepo struct {
	streak      domain.Streak
	getErr      error
	upserted    *repository.UpsertStreakParams
}

func (s *stubAttemptRepo) GetStreak(_ context.Context, _ int64) (domain.Streak, error) {
	return s.streak, s.getErr
}
func (s *stubAttemptRepo) UpsertStreak(_ context.Context, p repository.UpsertStreakParams) error {
	s.upserted = &p
	return nil
}
func (s *stubAttemptRepo) InsertAttempt(_ context.Context, _ repository.InsertAttemptParams) (domain.Attempt, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) UpsertProgress(_ context.Context, _ repository.UpsertProgressParams) error {
	panic("not implemented")
}
func (s *stubAttemptRepo) ListUserProgress(_ context.Context, _ int64) ([]domain.ItemProgress, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) ListCourseProgress(_ context.Context, _ int64) ([]domain.CourseProgress, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) GetCategoryProgress(_ context.Context, _ int64) ([]domain.CategoryProgress, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) GetBookProgress(_ context.Context, _ int64) ([]domain.BookProgress, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) GetGradeDistribution(_ context.Context, _ int64) (domain.GradeDistribution, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) GetTotalCleared(_ context.Context, _ int64) (int, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) GetResume(_ context.Context, _ int64) (*domain.ResumeTarget, error) {
	panic("not implemented")
}
func (s *stubAttemptRepo) ListReadingProgress(_ context.Context, _ int64) ([]domain.ReadingProgress, error) {
	panic("not implemented")
}

func dayStr(d time.Time) string { return d.UTC().Format("2006-01-02") }
func ptr(s string) *string      { return &s }

func TestUpdateStreak(t *testing.T) {
	ctx := context.Background()
	const uid = int64(1)

	today := dayStr(time.Now())
	yesterday := dayStr(time.Now().AddDate(0, 0, -1))
	twoDaysAgo := dayStr(time.Now().AddDate(0, 0, -2))

	cases := []struct {
		name           string
		streak         domain.Streak
		wantCurrentLen int32
		wantLongestLen int32
	}{
		{
			name:           "첫 시도 — LastDay nil → 1/1",
			streak:         domain.Streak{LastDay: nil, CurrentLen: 0, LongestLen: 0},
			wantCurrentLen: 1,
			wantLongestLen: 1,
		},
		{
			name:           "오늘 이미 함 — 변화 없음",
			streak:         domain.Streak{LastDay: ptr(today), CurrentLen: 3, LongestLen: 5},
			wantCurrentLen: 3,
			wantLongestLen: 5,
		},
		{
			name:           "연속 — currentLen 증가",
			streak:         domain.Streak{LastDay: ptr(yesterday), CurrentLen: 4, LongestLen: 4},
			wantCurrentLen: 5,
			wantLongestLen: 5,
		},
		{
			name:           "연속 + longest 갱신",
			streak:         domain.Streak{LastDay: ptr(yesterday), CurrentLen: 7, LongestLen: 7},
			wantCurrentLen: 8,
			wantLongestLen: 8,
		},
		{
			name:           "공백 — currentLen 1로 리셋",
			streak:         domain.Streak{LastDay: ptr(twoDaysAgo), CurrentLen: 10, LongestLen: 15},
			wantCurrentLen: 1,
			wantLongestLen: 15, // longest는 리셋 시 그대로
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			repo := &stubAttemptRepo{streak: c.streak}
			if err := UpdateStreak(ctx, repo, uid, ""); err != nil {
				t.Fatalf("UpdateStreak error: %v", err)
			}
			if repo.upserted == nil {
				t.Fatal("UpsertStreak was not called")
			}
			got := repo.upserted
			if got.CurrentLen != c.wantCurrentLen {
				t.Errorf("CurrentLen = %d, want %d", got.CurrentLen, c.wantCurrentLen)
			}
			if got.LongestLen != c.wantLongestLen {
				t.Errorf("LongestLen = %d, want %d", got.LongestLen, c.wantLongestLen)
			}
		})
	}
}

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

	t.Run("more than 1 day in future is rejected", func(t *testing.T) {
		future := dayStr(time.Now().AddDate(0, 0, 2))
		wantUTC := time.Now().UTC().Format("2006-01-02")
		if got := resolveToday(future); got != wantUTC {
			t.Errorf("got %q, want UTC today %q", got, wantUTC)
		}
	})

	t.Run("more than 1 day in past is rejected", func(t *testing.T) {
		past := dayStr(time.Now().AddDate(0, 0, -2))
		wantUTC := time.Now().UTC().Format("2006-01-02")
		if got := resolveToday(past); got != wantUTC {
			t.Errorf("got %q, want UTC today %q", got, wantUTC)
		}
	})

	t.Run("yesterday within window accepted as-is", func(t *testing.T) {
		yesterday := dayStr(time.Now().AddDate(0, 0, -1))
		if got := resolveToday(yesterday); got != yesterday {
			t.Errorf("got %q, want %q", got, yesterday)
		}
	})

	t.Run("tomorrow within window accepted as-is", func(t *testing.T) {
		tomorrow := dayStr(time.Now().AddDate(0, 0, 1))
		if got := resolveToday(tomorrow); got != tomorrow {
			t.Errorf("got %q, want %q", got, tomorrow)
		}
	})

	t.Run("non-canonical format re-formatted canonically", func(t *testing.T) {
		now := time.Now().UTC()
		nonCanonical := now.Format("2006-1-2")
		want := now.Format("2006-01-02")
		if got := resolveToday(nonCanonical); got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	})
}

func TestIsNextDay(t *testing.T) {
	cases := []struct {
		prev, today string
		want        bool
	}{
		{"2024-01-01", "2024-01-02", true},
		{"2024-01-31", "2024-02-01", true},  // 월말 → 월초
		{"2023-12-31", "2024-01-01", true},  // 연말 → 신년
		{"2024-01-01", "2024-01-03", false}, // 이틀 공백
		{"2024-01-01", "2024-01-01", false}, // 같은 날
		{"2024-01-02", "2024-01-01", false}, // 역방향
		{"bad-date", "2024-01-01", false},   // 파싱 실패
	}
	for _, c := range cases {
		got := isNextDay(c.prev, c.today)
		if got != c.want {
			t.Errorf("isNextDay(%q, %q) = %v, want %v", c.prev, c.today, got, c.want)
		}
	}
}
