package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// seedMessiahProphecy — 메시아 예언 코스를 멱등 시드한다. 절마다 topic이 달라
// insertCourseWithSections(sec 기반)를 재사용할 수 없어 전용 삽입 로직을 둔다.
func seedMessiahProphecy(ctx context.Context, pool *pgxpool.Pool) error {
	var courseID int64
	err := pool.QueryRow(ctx, `
		INSERT INTO courses(slug, title, theme, ord, category)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (slug) DO UPDATE SET category = EXCLUDED.category
		RETURNING id
	`, "messiah-prophecy", "메시아 예언", "messiah", 33, "messiah").Scan(&courseID)
	if err != nil {
		return fmt.Errorf("upsert messiah-prophecy course: %w", err)
	}

	totalItems := 0
	for secOrd, s := range messiahProphecySections {
		var sectionID int64
		err := pool.QueryRow(ctx, `
			INSERT INTO course_sections(course_id, title, ord)
			VALUES ($1, $2, $3)
			ON CONFLICT (course_id, ord) DO UPDATE SET title = EXCLUDED.title
			RETURNING id
		`, courseID, s.title, secOrd+1).Scan(&sectionID)
		if err != nil {
			return fmt.Errorf("upsert messiah section %q: %w", s.title, err)
		}

		for itemOrd, ref := range s.verses {
			var verseID int64
			err := pool.QueryRow(ctx,
				`SELECT id FROM bible_verses WHERE book=$1 AND chapter=$2 AND verse=$3`,
				ref.b, ref.c, ref.v,
			).Scan(&verseID)
			if err != nil {
				return fmt.Errorf("lookup verse %d:%d:%d: %w", ref.b, ref.c, ref.v, err)
			}

			_, err = pool.Exec(ctx, `
				INSERT INTO course_items(course_id, section_id, verse_id, ord, topic)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (section_id, ord) WHERE section_id IS NOT NULL DO NOTHING
			`, courseID, sectionID, verseID, itemOrd+1, ref.topic)
			if err != nil {
				return fmt.Errorf("insert messiah item (section %q, verse %d:%d:%d): %w", s.title, ref.b, ref.c, ref.v, err)
			}
			totalItems++
		}
	}

	fmt.Printf("OK: course %q seeded (%d sections, %d items)\n", "messiah-prophecy", len(messiahProphecySections), totalItems)
	return nil
}
