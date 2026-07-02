package repository

import (
	"context"

	"github.com/seoburuk/verse-backend/internal/domain"
)

// UserRepo — 사용자 저장소 인터페이스.
// service는 이것만 알고, 실제 구현(sqlc)은 모른다 → 테스트 시 mock 교체 가능.
type UserRepo interface {
	CreateUser(ctx context.Context, username, displayName, passwordHash string) (domain.User, error)
	GetUserByUsername(ctx context.Context, username string) (domain.User, error)
	DeleteUser(ctx context.Context, userID int64) error
	GetLives(ctx context.Context, userID int64) (domain.Lives, error)
	UpdateLives(ctx context.Context, userID int64, lives domain.Lives) error
}

// CourseRepo — 코스 저장소 인터페이스.
type CourseRepo interface {
	ListCourses(ctx context.Context) ([]domain.Course, error)
	GetCourseBySlug(ctx context.Context, slug string) (domain.Course, error)
	ListCourseItems(ctx context.Context, courseID int64) ([]domain.CourseItem, error)
	ListCourseItemsWithVerse(ctx context.Context, courseID int64) ([]domain.CourseItemWithVerse, error)
	GetCourseItemVerse(ctx context.Context, courseItemID int64) (domain.CourseItemWithVerse, error)
	ListCourseItemsByVerse(ctx context.Context, verseID int64) ([]int64, error)
	ListSectionsByCourse(ctx context.Context, courseID int64) ([]domain.CourseSection, error)
	ListItemsBySection(ctx context.Context, sectionID int64) ([]domain.CourseItemWithVerse, error)
	GetSectionByID(ctx context.Context, sectionID int64) (domain.CourseSection, error)
}

// VerseRepo — 본문 저장소 인터페이스.
type VerseRepo interface {
	GetVerse(ctx context.Context, book, chapter, verse int16) (domain.Verse, error)
	GetChapter(ctx context.Context, book, chapter int16) ([]domain.Verse, error)
	ListSegmentsByVerse(ctx context.Context, verseID int64) ([]domain.Segment, error)
}

// AttemptRepo — 시도/진도/연속일 저장소 인터페이스.
type AttemptRepo interface {
	InsertAttempt(ctx context.Context, params InsertAttemptParams) (domain.Attempt, error)
	UpsertProgress(ctx context.Context, params UpsertProgressParams) error
	GetStreak(ctx context.Context, userID int64) (domain.Streak, error)
	UpsertStreak(ctx context.Context, params UpsertStreakParams) error
	ListUserProgress(ctx context.Context, userID int64) ([]domain.ItemProgress, error)
	ListCourseProgress(ctx context.Context, userID int64) ([]domain.CourseProgress, error)
	GetCategoryProgress(ctx context.Context, userID int64) ([]domain.CategoryProgress, error)
	GetGradeDistribution(ctx context.Context, userID int64) (domain.GradeDistribution, error)
	GetTotalCleared(ctx context.Context, userID int64) (int, error)
}

// --- 파라미터 타입 ---
type InsertAttemptParams struct {
	UserID       int64
	CourseItemID int64
	Mode         string
	ClientGrade  string
	ServerGrade  string
}

type UpsertProgressParams struct {
	UserID       int64
	CourseItemID int64
	Grade        string
	Cleared      bool
}

type UpsertStreakParams struct {
	UserID     int64
	CurrentLen int32
	LongestLen int32
	LastDay    *string // YYYY-MM-DD, nil이면 NULL
}
