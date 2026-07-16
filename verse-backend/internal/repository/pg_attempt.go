package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/seoburuk/verse-backend/internal/domain"
	db "github.com/seoburuk/verse-backend/internal/repository/sqlc"
)

type pgAttemptRepo struct {
	q *db.Queries
}

func NewAttemptRepo(pool *pgxpool.Pool) AttemptRepo {
	return &pgAttemptRepo{q: db.New(pool)}
}

func (r *pgAttemptRepo) InsertAttempt(ctx context.Context, params InsertAttemptParams) (domain.Attempt, error) {
	row, err := r.q.InsertAttempt(ctx, db.InsertAttemptParams{
		UserID:       params.UserID,
		CourseItemID: params.CourseItemID,
		Mode:         string(params.Mode),
		ClientGrade:  string(params.ClientGrade),
		ServerGrade:  string(params.ServerGrade),
	})
	if err != nil {
		return domain.Attempt{}, err
	}
	return domain.Attempt{
		ID:           row.ID,
		UserID:       row.UserID,
		CourseItemID: row.CourseItemID,
		Mode:         domain.Mode(row.Mode),
		ClientGrade:  domain.Grade(row.ClientGrade),
		ServerGrade:  domain.Grade(row.ServerGrade),
		CreatedAt:    row.CreatedAt.Time, // pgtype.Timestamptz → time.Time
	}, nil
}

func (r *pgAttemptRepo) UpsertProgress(ctx context.Context, params UpsertProgressParams) error {
	return r.q.UpsertProgress(ctx, db.UpsertProgressParams{
		UserID:       params.UserID,
		CourseItemID: params.CourseItemID,
		Grade:        string(params.Grade),
		Cleared:      params.Cleared,
	})
}

func (r *pgAttemptRepo) GetStreak(ctx context.Context, userID int64) (domain.Streak, error) {
	row, err := r.q.GetStreak(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Streak{UserID: userID}, nil
		}
		return domain.Streak{}, err
	}
	var lastDay *string
	if row.LastDay.Valid {
		s := row.LastDay.Time.Format("2006-01-02")
		lastDay = &s
	}
	return domain.Streak{
		UserID:     row.UserID,
		CurrentLen: row.CurrentLen,
		LongestLen: row.LongestLen,
		LastDay:    lastDay,
	}, nil
}

func (r *pgAttemptRepo) ListUserProgress(ctx context.Context, userID int64) ([]domain.ItemProgress, error) {
	rows, err := r.q.ListUserProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.ItemProgress, len(rows))
	for i, row := range rows {
		out[i] = domain.ItemProgress{
			CourseItemID: row.CourseItemID,
			Grade:        domain.Grade(row.Grade),
			Cleared:      row.Cleared,
			Book:         row.Book,
			Chapter:      row.Chapter,
			Verse:        row.Verse,
		}
	}
	return out, nil
}

func (r *pgAttemptRepo) ListCourseProgress(ctx context.Context, userID int64) ([]domain.CourseProgress, error) {
	rows, err := r.q.ListCourseProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CourseProgress, len(rows))
	for i, row := range rows {
		out[i] = domain.CourseProgress{
			CourseID: row.CourseID,
			Cleared:  int(row.Cleared),
			Total:    int(row.Total),
		}
	}
	return out, nil
}

func (r *pgAttemptRepo) GetCategoryProgress(ctx context.Context, userID int64) ([]domain.CategoryProgress, error) {
	rows, err := r.q.GetCategoryProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CategoryProgress, len(rows))
	for i, row := range rows {
		out[i] = domain.CategoryProgress{
			Category: row.Category,
			Cleared:  int(row.Cleared),
			Total:    int(row.Total),
		}
	}
	return out, nil
}

func (r *pgAttemptRepo) GetBookProgress(ctx context.Context, userID int64) ([]domain.BookProgress, error) {
	rows, err := r.q.GetBookProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.BookProgress, len(rows))
	for i, row := range rows {
		out[i] = domain.BookProgress{
			Book:    row.Book,
			Cleared: int(row.Cleared),
			Total:   int(row.Total),
		}
	}
	return out, nil
}

func (r *pgAttemptRepo) GetGradeDistribution(ctx context.Context, userID int64) (domain.GradeDistribution, error) {
	row, err := r.q.GetGradeDistribution(ctx, userID)
	if err != nil {
		return domain.GradeDistribution{}, err
	}
	return domain.GradeDistribution{
		Green:  int(row.Green),
		Yellow: int(row.Yellow),
		Red:    int(row.Red),
	}, nil
}

func (r *pgAttemptRepo) GetTotalCleared(ctx context.Context, userID int64) (int, error) {
	total, err := r.q.GetTotalCleared(ctx, userID)
	if err != nil {
		return 0, err
	}
	return int(total), nil
}

func (r *pgAttemptRepo) GetResume(ctx context.Context, userID int64) (*domain.ResumeTarget, error) {
	last, err := r.q.GetLastAttempt(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	target := &domain.ResumeTarget{
		CourseID:        last.CourseID,
		CourseSlug:      last.Slug,
		CourseTitle:     last.CourseTitle,
		LastAttemptedAt: last.CreatedAt.Time,
	}
	if last.CourseTitleEn.Valid {
		v := last.CourseTitleEn.String
		target.CourseTitleEn = &v
	}

	// 마지막 시도 절이 아직 완료(cleared) 아니면(틀렸거나 진행 중) 그 절을
	// 그대로 이어간다 — "이사야 40:31을 틀림 → 이어가기도 40:31". 완료된
	// 경우에만 같은 코스의 다음 미완료 절로 진행한다.
	if !last.Cleared {
		target.CourseItemID = last.CourseItemID
		target.Book = last.Book
		target.Chapter = last.Chapter
		target.Verse = last.Verse
		if last.SectionID.Valid {
			v := last.SectionID.Int64
			target.SectionID = &v
		}
		if last.SectionTitle.Valid {
			v := last.SectionTitle.String
			target.SectionTitle = &v
		}
		if last.SectionTitleEn.Valid {
			v := last.SectionTitleEn.String
			target.SectionTitleEn = &v
		}
		return target, nil
	}

	next, err := r.q.GetNextUnclearedItem(ctx, db.GetNextUnclearedItemParams{
		UserID:   userID,
		CourseID: last.CourseID,
		Ord:      last.ItemOrd,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	if errors.Is(err, pgx.ErrNoRows) {
		// 코스 전체 완료 → 마지막 시도 절 자체로 반환
		target.CourseItemID = last.CourseItemID
		target.Book = last.Book
		target.Chapter = last.Chapter
		target.Verse = last.Verse
		if last.SectionID.Valid {
			v := last.SectionID.Int64
			target.SectionID = &v
		}
		if last.SectionTitle.Valid {
			v := last.SectionTitle.String
			target.SectionTitle = &v
		}
		if last.SectionTitleEn.Valid {
			v := last.SectionTitleEn.String
			target.SectionTitleEn = &v
		}
	} else {
		target.CourseItemID = next.CourseItemID
		target.Book = next.Book
		target.Chapter = next.Chapter
		target.Verse = next.Verse
		if next.SectionID.Valid {
			v := next.SectionID.Int64
			target.SectionID = &v
		}
		if next.SectionTitle.Valid {
			v := next.SectionTitle.String
			target.SectionTitle = &v
		}
		if next.SectionTitleEn.Valid {
			v := next.SectionTitleEn.String
			target.SectionTitleEn = &v
		}
	}

	return target, nil
}

func (r *pgAttemptRepo) UpsertStreak(ctx context.Context, params UpsertStreakParams) error {
	var pgDate pgtype.Date
	if params.LastDay != nil {
		t, err := time.Parse("2006-01-02", *params.LastDay)
		if err != nil {
			return err
		}
		pgDate = pgtype.Date{Time: t, Valid: true}
	}
	return r.q.UpsertStreak(ctx, db.UpsertStreakParams{
		UserID:     params.UserID,
		CurrentLen: params.CurrentLen,
		LongestLen: params.LongestLen,
		LastDay:    pgDate, // pgtype.Date
	})
}

func (r *pgAttemptRepo) GetRankingRaw(ctx context.Context) ([]domain.RankingRaw, error) {
	rows, err := r.q.GetRankingRaw(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.RankingRaw, len(rows))
	for i, row := range rows {
		out[i] = domain.RankingRaw{
			UserID:        row.UserID,
			Username:      row.Username,
			Streak:        int(row.Streak),
			ClearedVerses: int(row.ClearedVerses),
			DictationPts:  int(row.DictationPts),
		}
	}
	return out, nil
}
