package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// seedBooks — 66권을 book=코스/chapter=섹션/verse=아이템(전체 절)으로 멱등 시드.
// courses.ord는 기존 시드(1~32)와 겹치지 않게 100번대부터 사용한다.
func seedBooks(ctx context.Context, pool *pgxpool.Pool) error {
	totalItems := 0
	for _, b := range books {
		slug := fmt.Sprintf("book-%02d-%s", b.num, bookSlug(b.en))
		var courseID int64
		err := pool.QueryRow(ctx, `
			INSERT INTO courses(slug, title, theme, ord, category, hidden)
			VALUES ($1, $2, $3, $4, $5, FALSE)
			ON CONFLICT (slug) DO UPDATE SET category = EXCLUDED.category, title = EXCLUDED.title
			RETURNING id
		`, slug, b.ko, bookSlug(b.en), 100+int(b.num), b.category()).Scan(&courseID)
		if err != nil {
			return fmt.Errorf("upsert book course %q: %w", slug, err)
		}

		chapterRows, err := pool.Query(ctx,
			`SELECT DISTINCT chapter FROM bible_verses WHERE book=$1 ORDER BY chapter`, b.num)
		if err != nil {
			return fmt.Errorf("list chapters for book %d: %w", b.num, err)
		}
		var chapters []int16
		for chapterRows.Next() {
			var ch int16
			if err := chapterRows.Scan(&ch); err != nil {
				chapterRows.Close()
				return fmt.Errorf("scan chapter: %w", err)
			}
			chapters = append(chapters, ch)
		}
		chapterRows.Close()

		for _, ch := range chapters {
			var sectionID int64
			err := pool.QueryRow(ctx, `
				INSERT INTO course_sections(course_id, title, ord)
				VALUES ($1, $2, $3)
				ON CONFLICT (course_id, ord) DO UPDATE SET title = EXCLUDED.title
				RETURNING id
			`, courseID, fmt.Sprintf("%d장", ch), int(ch)).Scan(&sectionID)
			if err != nil {
				return fmt.Errorf("upsert section (book %d, chapter %d): %w", b.num, ch, err)
			}

			tag, err := pool.Exec(ctx, `
				INSERT INTO course_items(course_id, section_id, verse_id, ord, topic)
				SELECT $1, $2, id, verse, LEFT(text, 40)
				FROM bible_verses
				WHERE book = $3 AND chapter = $4
				ON CONFLICT (section_id, ord) WHERE section_id IS NOT NULL DO NOTHING
			`, courseID, sectionID, b.num, ch)
			if err != nil {
				return fmt.Errorf("insert items (book %d, chapter %d): %w", b.num, ch, err)
			}
			totalItems += int(tag.RowsAffected())
		}

		fmt.Printf("OK: book course %q seeded (%d chapters)\n", slug, len(chapters))
	}

	fmt.Printf("OK: 66 book courses seeded (%d items total)\n", totalItems)
	return nil
}
