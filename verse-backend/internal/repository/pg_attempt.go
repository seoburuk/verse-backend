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
