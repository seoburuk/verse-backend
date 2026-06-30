package service

import (
	"testing"
)

func TestNormalize(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"In the beginning,", []string{"in", "the", "beginning"}},
		{"thee Thou HAST", []string{"thee", "thou", "hast"}},      // 고어 철자 보존
		{"God's grace.", []string{"god", "s", "grace"}},           // 소유격 분리
		{"  spaces   ", []string{"spaces"}},
		{"", []string{}},
	}
	for _, c := range cases {
		got := Normalize(c.in)
		if len(got) != len(c.want) {
			t.Errorf("Normalize(%q) = %v, want %v", c.in, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("Normalize(%q)[%d] = %q, want %q", c.in, i, got[i], c.want[i])
			}
		}
	}
}

func TestGradeRecall(t *testing.T) {
	answer := []string{"in", "the", "beginning", "god", "created"}

	cases := []struct {
		name    string
		attempt []string
		want    string
	}{
		{"정답", []string{"in", "the", "beginning", "god", "created"}, "green"},
		{"한 단어 빠짐(LCS=4, 0.80)", []string{"in", "the", "beginning", "created"}, "yellow"},
		{"두 단어 빠짐(LCS=3, 0.60)", []string{"in", "beginning", "created"}, "yellow"},
		{"순서 밀림(LCS=4, 0.80)", []string{"in", "beginning", "the", "god", "created"}, "yellow"},
		{"절반 이하(LCS=2, 0.40)", []string{"in", "the"}, "red"},
		{"빈 시도", []string{}, "red"},
	}
	for _, c := range cases {
		got := GradeRecall(answer, c.attempt)
		if got != c.want {
			t.Errorf("[%s] GradeRecall() = %q, want %q", c.name, got, c.want)
		}
	}

	// 정답 없음 → none
	if got := GradeRecall([]string{}, []string{"anything"}); got != "none" {
		t.Errorf("empty answer should return none, got %q", got)
	}
}
