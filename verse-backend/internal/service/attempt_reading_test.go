package service

import (
	"testing"

	"github.com/seoburuk/verse-backend/internal/domain"
)

func TestIsPracticeMode(t *testing.T) {
	cases := []struct {
		mode domain.Mode
		want bool
	}{
		{domain.ModeDictation, true},
		{domain.ModeReading, true},
		{domain.ModeDrag, false},
		{domain.ModeType, false},
		{domain.ModeHard, false},
	}
	for _, c := range cases {
		if got := domain.IsPracticeMode(c.mode); got != c.want {
			t.Errorf("IsPracticeMode(%q) = %v, want %v", c.mode, got, c.want)
		}
	}
}

func TestModeReadingWire(t *testing.T) {
	if domain.ModeReading != "reading" {
		t.Errorf("ModeReading = %q, want \"reading\"", domain.ModeReading)
	}
}
