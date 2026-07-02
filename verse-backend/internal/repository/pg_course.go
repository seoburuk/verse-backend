package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/seoburuk/verse-backend/internal/domain"
	db "github.com/seoburuk/verse-backend/internal/repository/sqlc"
)

func asPgError(err error) (*pgconn.PgError, bool) {
	var pgErr *pgconn.PgError
	return pgErr, errors.As(err, &pgErr)
}

type pgCourseRepo struct {
	q *db.Queries
}

func NewCourseRepo(pool *pgxpool.Pool) CourseRepo {
	return &pgCourseRepo{q: db.New(pool)}
}

func (r *pgCourseRepo) ListCourses(ctx context.Context) ([]domain.Course, error) {
	rows, err := r.q.ListCourses(ctx)
	if err != nil {
		return nil, err
	}
	courses := make([]domain.Course, len(rows))
	for i, row := range rows {
		courses[i] = toDomainCourse(row)
	}
	return courses, nil
}

func (r *pgCourseRepo) GetCourseBySlug(ctx context.Context, slug string) (domain.Course, error) {
	row, err := r.q.GetCourseBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Course{}, domain.ErrNotFound
		}
		return domain.Course{}, err
	}
	return toDomainCourse(row), nil
}

func (r *pgCourseRepo) ListCourseItems(ctx context.Context, courseID int64) ([]domain.CourseItem, error) {
	rows, err := r.q.ListCourseItems(ctx, courseID)
	if err != nil {
		return nil, err
	}
	items := make([]domain.CourseItem, len(rows))
	for i, row := range rows {
		items[i] = toDomainCourseItem(row)
	}
	return items, nil
}

func (r *pgCourseRepo) ListCourseItemsWithVerse(ctx context.Context, courseID int64) ([]domain.CourseItemWithVerse, error) {
	rows, err := r.q.ListCourseItemsWithVerse(ctx, courseID)
	if err != nil {
		return nil, err
	}
	items := make([]domain.CourseItemWithVerse, len(rows))
	for i, row := range rows {
		items[i] = domain.CourseItemWithVerse{
			CourseItemID: row.CourseItemID,
			Ord:          int(row.Ord),
			Topic:        row.Topic.String, // pgtype.Text → string (NULL이면 "")
			Book:         row.Book,
			Chapter:      row.Chapter,
			Verse:        row.Verse,
			Text:         row.Text,
		}
	}
	return items, nil
}

func (r *pgCourseRepo) GetCourseItemVerse(ctx context.Context, courseItemID int64) (domain.CourseItemWithVerse, error) {
	row, err := r.q.GetCourseItemVerse(ctx, courseItemID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.CourseItemWithVerse{}, domain.ErrNotFound
		}
		return domain.CourseItemWithVerse{}, err
	}
	return domain.CourseItemWithVerse{
		CourseItemID: row.CourseItemID,
		Book:         row.Book,
		Chapter:      row.Chapter,
		Verse:        row.Verse,
		Text:         row.Text,
	}, nil
}

func (r *pgCourseRepo) ListSectionsByCourse(ctx context.Context, courseID int64) ([]domain.CourseSection, error) {
	rows, err := r.q.ListSectionsByCourse(ctx, courseID)
	if err != nil {
		return nil, err
	}
	sections := make([]domain.CourseSection, len(rows))
	for i, row := range rows {
		sections[i] = domain.CourseSection{
			ID:       row.ID,
			CourseID: row.CourseID,
			Title:    row.Title,
			Ord:      int(row.Ord),
		}
	}
	return sections, nil
}

func (r *pgCourseRepo) ListItemsBySection(ctx context.Context, sectionID int64) ([]domain.CourseItemWithVerse, error) {
	rows, err := r.q.ListItemsBySection(ctx, pgtype.Int8{Int64: sectionID, Valid: true})
	if err != nil {
		return nil, err
	}
	items := make([]domain.CourseItemWithVerse, len(rows))
	for i, row := range rows {
		items[i] = domain.CourseItemWithVerse{
			CourseItemID: row.CourseItemID,
			Ord:          int(row.Ord),
			Topic:        row.Topic.String,
			Book:         row.Book,
			Chapter:      row.Chapter,
			Verse:        row.Verse,
			Text:         row.Text,
		}
	}
	return items, nil
}

func (r *pgCourseRepo) GetSectionByID(ctx context.Context, sectionID int64) (domain.CourseSection, error) {
	row, err := r.q.GetSectionByID(ctx, sectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.CourseSection{}, domain.ErrNotFound
		}
		return domain.CourseSection{}, err
	}
	return domain.CourseSection{
		ID:       row.ID,
		CourseID: row.CourseID,
		Title:    row.Title,
		Ord:      int(row.Ord),
	}, nil
}

func (r *pgCourseRepo) AddFavorite(ctx context.Context, userID, courseItemID int64) error {
	err := r.q.AddFavorite(ctx, db.AddFavoriteParams{UserID: userID, CourseItemID: courseItemID})
	if err != nil {
		// 23503 = foreign_key_violation (courseItemID가 없는 경우)
		if pgErr, ok := asPgError(err); ok && pgErr.Code == "23503" {
			return domain.ErrNotFound
		}
		return err
	}
	return nil
}

func (r *pgCourseRepo) RemoveFavorite(ctx context.Context, userID, courseItemID int64) error {
	return r.q.RemoveFavorite(ctx, db.RemoveFavoriteParams{UserID: userID, CourseItemID: courseItemID})
}

func (r *pgCourseRepo) ListFavoriteItems(ctx context.Context, userID int64) ([]domain.FavoriteItem, error) {
	rows, err := r.q.ListFavoriteItems(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.FavoriteItem, len(rows))
	for i, row := range rows {
		fav := domain.FavoriteItem{
			CourseItemID: row.CourseItemID,
			Topic:        row.Topic.String,
			CourseSlug:   row.CourseSlug,
			CourseTitle:  row.CourseTitle,
			Book:         row.Book,
			Chapter:      row.Chapter,
			Verse:        row.Verse,
			Text:         row.Text,
		}
		if row.SectionID.Valid {
			v := row.SectionID.Int64
			fav.SectionID = &v
		}
		if row.SectionTitle.Valid {
			v := row.SectionTitle.String
			fav.SectionTitle = &v
		}
		out[i] = fav
	}
	return out, nil
}

func toDomainCourse(c db.Course) domain.Course {
	return domain.Course{
		ID:       c.ID,
		Slug:     c.Slug,
		Title:    c.Title,
		Theme:    c.Theme.String,
		Ord:      int(c.Ord),
		Hidden:   c.Hidden,
		Category: c.Category,
	}
}

func toDomainCourseItem(c db.CourseItem) domain.CourseItem {
	return domain.CourseItem{
		ID:       c.ID,
		CourseID: c.CourseID,
		VerseID:  c.VerseID,
		Ord:      int(c.Ord),
		Topic:    c.Topic.String,
	}
}
