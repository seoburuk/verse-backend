package service

// 공유 테스트 벡터(docs/grading_vectors.json) 검증 — Dart/TS 구현과의 계약 고정.

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type gradingVectors struct {
	Normalize []struct {
		In   string   `json:"in"`
		Want []string `json:"want"`
	} `json:"normalize"`
	Grade []struct {
		Name    string   `json:"name"`
		Answer  []string `json:"answer"`
		Attempt []string `json:"attempt"`
		Want    string   `json:"want"`
	} `json:"grade"`
}

func TestSharedGradingVectors(t *testing.T) {
	data, err := os.ReadFile("../../../docs/grading_vectors.json")
	if err != nil {
		t.Skipf("shared vectors not found: %v", err)
	}
	var v gradingVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("invalid vectors json: %v", err)
	}

	for _, c := range v.Normalize {
		if got := Normalize(c.In); !reflect.DeepEqual(got, c.Want) {
			t.Errorf("Normalize(%q) = %v, want %v", c.In, got, c.Want)
		}
	}
	for _, c := range v.Grade {
		if got := GradeRecall(c.Answer, c.Attempt); got != c.Want {
			t.Errorf("[%s] GradeRecall() = %q, want %q", c.Name, got, c.Want)
		}
	}
}
