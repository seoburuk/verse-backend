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
