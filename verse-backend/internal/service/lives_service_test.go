package service

import (
	"testing"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
)

func TestSettleLives(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	cases := []struct {
		name      string
		stored    domain.Lives
		now       time.Time
		wantCount int32
		wantAt    time.Time
	}{
		{
			name:      "no time elapsed: unchanged",
			stored:    domain.Lives{Count: 5, UpdatedAt: base},
			now:       base,
			wantCount: 5,
			wantAt:    base,
		},
		{
			name:      "less than one interval: unchanged",
			stored:    domain.Lives{Count: 5, UpdatedAt: base},
			now:       base.Add(19 * time.Minute),
			wantCount: 5,
			wantAt:    base,
		},
		{
			name:      "exactly one interval: +1, clock advances by interval",
			stored:    domain.Lives{Count: 5, UpdatedAt: base},
			now:       base.Add(20 * time.Minute),
			wantCount: 6,
			wantAt:    base.Add(20 * time.Minute),
		},
		{
			name:      "partial second interval: remainder preserved",
			stored:    domain.Lives{Count: 5, UpdatedAt: base},
			now:       base.Add(25 * time.Minute),
			wantCount: 6,
			wantAt:    base.Add(20 * time.Minute),
		},
		{
			name:      "multiple intervals",
			stored:    domain.Lives{Count: 2, UpdatedAt: base},
			now:       base.Add(65 * time.Minute),
			wantCount: 5,
			wantAt:    base.Add(60 * time.Minute),
		},
		{
			name:      "caps at max, resets clock to now",
			stored:    domain.Lives{Count: 9, UpdatedAt: base},
			now:       base.Add(3 * time.Hour),
			wantCount: MaxLives,
			wantAt:    base.Add(3 * time.Hour),
		},
		{
			name:      "already at max: unchanged even with elapsed time",
			stored:    domain.Lives{Count: MaxLives, UpdatedAt: base},
			now:       base.Add(3 * time.Hour),
			wantCount: MaxLives,
			wantAt:    base,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := SettleLives(c.stored, c.now)
			if got.Count != c.wantCount {
				t.Errorf("count: got %d, want %d", got.Count, c.wantCount)
			}
			if !got.UpdatedAt.Equal(c.wantAt) {
				t.Errorf("updatedAt: got %v, want %v", got.UpdatedAt, c.wantAt)
			}
		})
	}
}
