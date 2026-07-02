package service

import (
	"context"
	"testing"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

// fakeCourseRepo — verse_id 하나가 여러 course_item에 걸쳐 있는 상황(워밍업/예언 코스와
// 구약/신약 권별 코스가 같은 절을 공유)을 재현하기 위한 인메모리 스텁.
type fakeCourseRepo struct {
	repository.CourseRepo
	itemVerse    map[int64]domain.CourseItemWithVerse // course_item_id -> verse
	itemsByVerse map[int64][]int64                    // verse_id -> course_item_ids
}

func (f *fakeCourseRepo) GetCourseItemVerse(ctx context.Context, courseItemID int64) (domain.CourseItemWithVerse, error) {
	v, ok := f.itemVerse[courseItemID]
	if !ok {
		return domain.CourseItemWithVerse{}, domain.ErrNotFound
	}
	return v, nil
}

func (f *fakeCourseRepo) ListCourseItemsByVerse(ctx context.Context, verseID int64) ([]int64, error) {
	return f.itemsByVerse[verseID], nil
}

// fakeAttemptRepo — progress upsert 호출을 기록하고, InsertAttempt/GetStreak/UpsertStreak는
// 최소 동작만 흉내낸다.
type fakeAttemptRepo struct {
	repository.AttemptRepo
	progress map[int64]repository.UpsertProgressParams // course_item_id -> 마지막 진도
}

func (f *fakeAttemptRepo) InsertAttempt(ctx context.Context, p repository.InsertAttemptParams) (domain.Attempt, error) {
	return domain.Attempt{ID: 1, UserID: p.UserID, CourseItemID: p.CourseItemID}, nil
}

func (f *fakeAttemptRepo) UpsertProgress(ctx context.Context, p repository.UpsertProgressParams) error {
	f.progress[p.CourseItemID] = p
	return nil
}

func (f *fakeAttemptRepo) GetStreak(ctx context.Context, userID int64) (domain.Streak, error) {
	return domain.Streak{UserID: userID}, nil
}

func (f *fakeAttemptRepo) UpsertStreak(ctx context.Context, p repository.UpsertStreakParams) error {
	return nil
}

// fakeUserRepo — 목숨이 항상 충분한 사용자.
type fakeUserRepo struct {
	repository.UserRepo
}

func (f *fakeUserRepo) GetLives(ctx context.Context, userID int64) (domain.Lives, error) {
	return domain.Lives{Count: MaxLives, UpdatedAt: time.Now()}, nil
}

func (f *fakeUserRepo) UpdateLives(ctx context.Context, userID int64, lives domain.Lives) error {
	return nil
}

// TestSubmitAttempt_SyncsProgressAcrossSiblingCourseItems — 같은 절(verse_id)이 워밍업
// 코스(course_item_id=10)와 구약 권별 코스(course_item_id=20)에 동시에 들어 있을 때,
// 워밍업 쪽에서 제출한 시도가 구약 쪽 진도에도 반영되어야 한다.
func TestSubmitAttempt_SyncsProgressAcrossSiblingCourseItems(t *testing.T) {
	const verseID = int64(100)
	const warmupItemID = int64(10)
	const otItemID = int64(20)

	courses := &fakeCourseRepo{
		itemVerse: map[int64]domain.CourseItemWithVerse{
			warmupItemID: {CourseItemID: warmupItemID, VerseID: verseID, Text: "In the beginning God created the heaven and the earth."},
		},
		itemsByVerse: map[int64][]int64{
			verseID: {warmupItemID, otItemID},
		},
	}
	attempts := &fakeAttemptRepo{progress: map[int64]repository.UpsertProgressParams{}}
	users := &fakeUserRepo{}

	svc := NewAttemptService(courses, attempts, users)

	tokens := Normalize("In the beginning God created the heaven and the earth.")
	_, err := svc.SubmitAttempt(context.Background(), 1, warmupItemID, domain.ModeType, domain.GradeGreen, tokens)
	if err != nil {
		t.Fatalf("SubmitAttempt: %v", err)
	}

	warmupProgress, ok := attempts.progress[warmupItemID]
	if !ok || !warmupProgress.Cleared {
		t.Fatalf("워밍업 course_item(%d) 진도가 cleared로 갱신되지 않음: %+v", warmupItemID, attempts.progress)
	}
	otProgress, ok := attempts.progress[otItemID]
	if !ok || !otProgress.Cleared {
		t.Fatalf("형제 course_item(구약, %d) 진도가 동기화되지 않음: %+v", otItemID, attempts.progress)
	}
	if otProgress.Grade != string(domain.GradeGreen) {
		t.Errorf("형제 course_item grade: got %q, want %q", otProgress.Grade, domain.GradeGreen)
	}
}
