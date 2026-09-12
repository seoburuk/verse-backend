package domain

import "testing"

// 통독(reading)은 도메인에 정의돼 있는데도 핸들러 허용 목록에서 빠져 있어
// 배치 동기화 전체가 400으로 거부됐다. 회귀 방지용.
func TestIsValidMode(t *testing.T) {
	valid := []Mode{ModeDrag, ModeType, ModeHard, ModeDictation, ModeReading}
	for _, m := range valid {
		if !IsValidMode(m) {
			t.Errorf("IsValidMode(%q) = false, want true", m)
		}
	}
	for _, m := range []Mode{"", "unknown"} {
		if IsValidMode(m) {
			t.Errorf("IsValidMode(%q) = true, want false", m)
		}
	}
}
