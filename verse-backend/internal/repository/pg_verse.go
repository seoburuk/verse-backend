package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/seoburuk/verse-backend/internal/domain"
	db "github.com/seoburuk/verse-backend/internal/repository/sqlc"
)

type pgVerseRepo struct {
	q *db.Queries
}

func NewVerseRepo(pool *pgxpool.Pool) VerseRepo {
	return &pgVerseRepo{q: db.New(pool)}
}

func (r *pgVerseRepo) GetVerse(ctx context.Context, book, chapter, verse int16) (domain.Verse, error) {
	row, err := r.q.GetVerse(ctx, db.GetVerseParams{
		Book:    book,
		Chapter: chapter,
		Verse:   verse,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Verse{}, domain.ErrNotFound
		}
		return domain.Verse{}, err
	}
	return toDomainVerse(row), nil
}

func (r *pgVerseRepo) GetChapter(ctx context.Context, book, chapter int16) ([]domain.Verse, error) {
	rows, err := r.q.GetChapter(ctx, db.GetChapterParams{
		Book:    book,
		Chapter: chapter,
	})
	if err != nil {
		return nil, err
	}
	verses := make([]domain.Verse, len(rows))
	for i, row := range rows {
		verses[i] = toDomainVerse(row)
	}
	return verses, nil
}

func (r *pgVerseRepo) ListSegmentsByVerse(ctx context.Context, verseID int64) ([]domain.Segment, error) {
	rows, err := r.q.ListSegmentsByVerse(ctx, verseID)
	if err != nil {
		return nil, err
	}
	segments := make([]domain.Segment, len(rows))
	for i, row := range rows {
		segments[i] = toDomainSegment(row)
	}
	return segments, nil
}

func toDomainVerse(v db.BibleVerse) domain.Verse {
	return domain.Verse{
		ID:      v.ID,
		Book:    v.Book,
		Chapter: v.Chapter,
		Verse:   v.Verse,
		Text:    v.Text,
	}
}

func toDomainSegment(s db.VerseSegment) domain.Segment {
	return domain.Segment{
		ID:           s.ID,
		VerseID:      s.VerseID,
		SegmentLabel: s.SegmentLabel,
		Text:         s.Text,
		WordCount:    int(s.WordCount),
		Ord:          int(s.Ord),
	}
}
