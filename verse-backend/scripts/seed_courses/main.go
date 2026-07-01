// seed_courses — 개발용 코스 시드 데이터 적재.
// bible_verses에서 verse_id를 조회해 courses + course_items를 멱등 INSERT한다.
// (ON CONFLICT DO NOTHING — 여러 번 실행해도 안전)
//
// 사용: make seed (DATABASE_URL 필요)
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// verseRef — 시드에 넣을 절 참조
type verseRef struct {
	book    int16
	chapter int16
	verse   int16
	topic   string
}

// seedCourse — 시드할 코스 정의
type seedCourse struct {
	slug   string
	title  string
	theme  string
	ord    int
	hidden bool
	verses []verseRef
}

// seedSection — 코스 내 주제 섹션
type seedSection struct {
	title  string
	verses []r
}

// seedCourseWithSections — 섹션 기반 코스 정의
type seedCourseWithSections struct {
	slug     string
	title    string
	theme    string
	ord      int
	sections []seedSection
}

// r — (book, chapter, verse) 단축 표기.
type r struct{ b, c, v int16 }

// mkCourse — slug/title/ord와 절 목록으로 hidden=true seedCourse를 만든다.
// 30개 주제 개별 코스는 모두 숨김 처리(워밍업 섹터로 대체).
func mkCourse(ord int, slug, title string, refs ...r) seedCourse {
	verses := make([]verseRef, len(refs))
	for i, ref := range refs {
		verses[i] = verseRef{book: ref.b, chapter: ref.c, verse: ref.v, topic: title}
	}
	return seedCourse{slug: slug, title: title, theme: slug, ord: ord, hidden: true, verses: verses}
}

// sec — seedSection 단축 생성.
func sec(title string, refs ...r) seedSection { return seedSection{title: title, verses: refs} }

// courses — 섹션 없는 기존 코스 (beginnings + 30개 주제 개별 코스).
var courses = []seedCourse{
	{
		slug:  "beginnings",
		title: "Foundations",
		theme: "faith",
		ord:   1,
		verses: []verseRef{
			{43, 3, 16, "God so loved"},            // John 3:16
			{19, 23, 1, "The Lord is my shepherd"}, // Psalm 23:1
			{1, 1, 1, "In the beginning"},           // Genesis 1:1
			{45, 8, 28, "All things work together"}, // Romans 8:28
			{20, 3, 5, "Trust in the Lord"},         // Proverbs 3:5
		},
	},
	mkCourse(2, "word", "말씀", r{40, 4, 23}, r{40, 4, 24}, r{40, 4, 25}, r{44, 6, 4}, r{58, 4, 12}, r{19, 119, 103}, r{19, 119, 105}),
	mkCourse(3, "prayer", "기도", r{40, 6, 33}, r{40, 7, 7}, r{40, 7, 8}, r{41, 9, 29}, r{43, 14, 14}, r{24, 33, 3}),
	mkCourse(4, "holy-spirit", "성령", r{43, 3, 5}, r{44, 1, 8}, r{44, 2, 38}, r{46, 2, 10}, r{49, 5, 18}),
	mkCourse(5, "repentance", "회개", r{40, 3, 11}, r{47, 5, 17}, r{62, 1, 9}, r{66, 2, 16}, r{23, 1, 18}),
	mkCourse(6, "devil", "마귀", r{41, 16, 17}, r{49, 6, 11}, r{59, 4, 7}, r{60, 5, 8}, r{5, 28, 7}),
	mkCourse(7, "praise", "찬송", r{59, 5, 13}, r{19, 69, 30}, r{19, 69, 31}, r{19, 113, 3}, r{19, 150, 6}, r{23, 43, 21}),
	mkCourse(8, "evangelism", "전도", r{40, 11, 28}, r{40, 28, 19}, r{41, 8, 36}, r{41, 16, 15}, r{51, 4, 2}, r{51, 4, 3}, r{51, 4, 4}),
	mkCourse(9, "blessing", "축복", r{64, 1, 2}, r{1, 12, 3}, r{5, 8, 18}, r{5, 28, 8}, r{6, 1, 8}),
	mkCourse(10, "thanksgiving", "감사", r{50, 4, 6}, r{51, 4, 2}, r{52, 5, 16}, r{52, 5, 17}, r{52, 5, 18}, r{49, 5, 20}, r{19, 106, 1}),
	mkCourse(11, "healing", "치료", r{44, 3, 6}, r{59, 5, 15}, r{2, 15, 26}, r{19, 103, 1}, r{19, 103, 2}, r{19, 103, 3}, r{19, 103, 4}, r{19, 103, 5}, r{39, 4, 2}),
	mkCourse(12, "cross", "십자가", r{42, 14, 27}, r{45, 6, 6}, r{46, 2, 2}, r{48, 5, 24}, r{23, 53, 5}),
	mkCourse(13, "resurrection", "부활", r{40, 27, 53}, r{40, 28, 6}, r{43, 11, 25}, r{43, 11, 26}, r{46, 15, 16}, r{60, 1, 3}),
	mkCourse(14, "faith", "믿음", r{45, 10, 17}, r{55, 4, 7}, r{58, 11, 1}, r{59, 5, 15}, r{20, 3, 5}, r{20, 3, 6}),
	mkCourse(15, "hope", "소망", r{45, 5, 3}, r{45, 5, 4}, r{45, 12, 12}, r{46, 13, 13}, r{19, 23, 4}, r{19, 23, 5}, r{19, 39, 7}),
	mkCourse(16, "love", "사랑", r{43, 3, 16}, r{43, 13, 34}, r{43, 13, 35}, r{46, 13, 1}, r{48, 5, 22}, r{48, 5, 23}, r{64, 1, 2}),
	mkCourse(17, "god", "하나님", r{43, 3, 16}, r{43, 3, 17}, r{43, 4, 24}, r{45, 8, 14}, r{45, 8, 28}, r{23, 40, 28}),
	mkCourse(18, "jesus", "예수님", r{42, 19, 10}, r{43, 8, 12}, r{43, 10, 10}, r{43, 14, 6}, r{58, 13, 8}),
	mkCourse(19, "salvation", "구원", r{46, 1, 18}, r{49, 6, 17}, r{19, 3, 8}, r{19, 18, 2}, r{19, 50, 15}),
	mkCourse(20, "grace", "은혜", r{45, 3, 23}, r{45, 3, 24}, r{46, 15, 10}, r{47, 8, 9}, r{60, 4, 10}, r{5, 5, 10}),
	mkCourse(21, "power", "능력", r{41, 9, 23}, r{44, 19, 11}, r{50, 4, 13}, r{55, 1, 7}, r{23, 40, 29}),
	mkCourse(22, "humility", "겸손", r{40, 11, 29}, r{40, 23, 12}, r{49, 4, 2}, r{59, 4, 6}, r{20, 18, 12}),
	mkCourse(23, "obedience", "순종", r{44, 5, 29}, r{45, 12, 1}, r{60, 5, 5}, r{5, 13, 4}, r{23, 1, 19}),
	mkCourse(24, "peace", "평안", r{40, 11, 28}, r{40, 11, 29}, r{40, 11, 30}, r{43, 14, 27}, r{45, 14, 17}, r{50, 4, 6}, r{4, 6, 26}),
	mkCourse(25, "diligence", "성실", r{19, 25, 21}, r{19, 37, 3}, r{19, 89, 2}, r{19, 119, 30}, r{23, 11, 5}),
	mkCourse(26, "patience", "인내", r{45, 5, 3}, r{45, 5, 4}, r{59, 1, 3}, r{59, 1, 4}, r{59, 5, 11}, r{66, 14, 12}, r{18, 23, 10}),
	mkCourse(27, "heaven", "천국", r{40, 3, 2}, r{40, 4, 23}, r{40, 5, 3}, r{40, 7, 21}, r{66, 21, 18}),
	mkCourse(28, "faithfulness", "충성", r{40, 25, 23}, r{42, 16, 10}, r{48, 5, 22}, r{19, 101, 6}, r{20, 13, 17}),
	mkCourse(29, "holiness", "거룩", r{60, 1, 16}, r{3, 11, 45}, r{3, 20, 8}, r{19, 103, 1}, r{23, 6, 3}),
	mkCourse(30, "testimony", "증거", r{43, 1, 12}, r{43, 14, 6}, r{44, 16, 31}, r{45, 8, 16}, r{19, 42, 2}),
	mkCourse(31, "self-control", "절제", r{46, 7, 9}, r{46, 9, 25}, r{48, 5, 22}, r{48, 5, 23}, r{20, 23, 2}, r{20, 29, 11}),
}

// warmup — 30개 주제를 섹션으로 묶은 단일 코스.
var warmup = seedCourseWithSections{
	slug:  "warmup",
	title: "워밍업 섹터",
	theme: "warmup",
	ord:   32,
	sections: []seedSection{
		sec("말씀", r{40, 4, 23}, r{40, 4, 24}, r{40, 4, 25}, r{44, 6, 4}, r{58, 4, 12}, r{19, 119, 103}, r{19, 119, 105}),
		sec("기도", r{40, 6, 33}, r{40, 7, 7}, r{40, 7, 8}, r{41, 9, 29}, r{43, 14, 14}, r{24, 33, 3}),
		sec("성령", r{43, 3, 5}, r{44, 1, 8}, r{44, 2, 38}, r{46, 2, 10}, r{49, 5, 18}),
		sec("회개", r{40, 3, 11}, r{47, 5, 17}, r{62, 1, 9}, r{66, 2, 16}, r{23, 1, 18}),
		sec("마귀", r{41, 16, 17}, r{49, 6, 11}, r{59, 4, 7}, r{60, 5, 8}, r{5, 28, 7}),
		sec("찬송", r{59, 5, 13}, r{19, 69, 30}, r{19, 69, 31}, r{19, 113, 3}, r{19, 150, 6}, r{23, 43, 21}),
		sec("전도", r{40, 11, 28}, r{40, 28, 19}, r{41, 8, 36}, r{41, 16, 15}, r{51, 4, 2}, r{51, 4, 3}, r{51, 4, 4}),
		sec("축복", r{64, 1, 2}, r{1, 12, 3}, r{5, 8, 18}, r{5, 28, 8}, r{6, 1, 8}),
		sec("감사", r{50, 4, 6}, r{51, 4, 2}, r{52, 5, 16}, r{52, 5, 17}, r{52, 5, 18}, r{49, 5, 20}, r{19, 106, 1}),
		sec("치료", r{44, 3, 6}, r{59, 5, 15}, r{2, 15, 26}, r{19, 103, 1}, r{19, 103, 2}, r{19, 103, 3}, r{19, 103, 4}, r{19, 103, 5}, r{39, 4, 2}),
		sec("십자가", r{42, 14, 27}, r{45, 6, 6}, r{46, 2, 2}, r{48, 5, 24}, r{23, 53, 5}),
		sec("부활", r{40, 27, 53}, r{40, 28, 6}, r{43, 11, 25}, r{43, 11, 26}, r{46, 15, 16}, r{60, 1, 3}),
		sec("믿음", r{45, 10, 17}, r{55, 4, 7}, r{58, 11, 1}, r{59, 5, 15}, r{20, 3, 5}, r{20, 3, 6}),
		sec("소망", r{45, 5, 3}, r{45, 5, 4}, r{45, 12, 12}, r{46, 13, 13}, r{19, 23, 4}, r{19, 23, 5}, r{19, 39, 7}),
		sec("사랑", r{43, 3, 16}, r{43, 13, 34}, r{43, 13, 35}, r{46, 13, 1}, r{48, 5, 22}, r{48, 5, 23}, r{64, 1, 2}),
		sec("하나님", r{43, 3, 16}, r{43, 3, 17}, r{43, 4, 24}, r{45, 8, 14}, r{45, 8, 28}, r{23, 40, 28}),
		sec("예수님", r{42, 19, 10}, r{43, 8, 12}, r{43, 10, 10}, r{43, 14, 6}, r{58, 13, 8}),
		sec("구원", r{46, 1, 18}, r{49, 6, 17}, r{19, 3, 8}, r{19, 18, 2}, r{19, 50, 15}),
		sec("은혜", r{45, 3, 23}, r{45, 3, 24}, r{46, 15, 10}, r{47, 8, 9}, r{60, 4, 10}, r{5, 5, 10}),
		sec("능력", r{41, 9, 23}, r{44, 19, 11}, r{50, 4, 13}, r{55, 1, 7}, r{23, 40, 29}),
		sec("겸손", r{40, 11, 29}, r{40, 23, 12}, r{49, 4, 2}, r{59, 4, 6}, r{20, 18, 12}),
		sec("순종", r{44, 5, 29}, r{45, 12, 1}, r{60, 5, 5}, r{5, 13, 4}, r{23, 1, 19}),
		sec("평안", r{40, 11, 28}, r{40, 11, 29}, r{40, 11, 30}, r{43, 14, 27}, r{45, 14, 17}, r{50, 4, 6}, r{4, 6, 26}),
		sec("성실", r{19, 25, 21}, r{19, 37, 3}, r{19, 89, 2}, r{19, 119, 30}, r{23, 11, 5}),
		sec("인내", r{45, 5, 3}, r{45, 5, 4}, r{59, 1, 3}, r{59, 1, 4}, r{59, 5, 11}, r{66, 14, 12}, r{18, 23, 10}),
		sec("천국", r{40, 3, 2}, r{40, 4, 23}, r{40, 5, 3}, r{40, 7, 21}, r{66, 21, 18}),
		sec("충성", r{40, 25, 23}, r{42, 16, 10}, r{48, 5, 22}, r{19, 101, 6}, r{20, 13, 17}),
		sec("거룩", r{60, 1, 16}, r{3, 11, 45}, r{3, 20, 8}, r{19, 103, 1}, r{23, 6, 3}),
		sec("증거", r{43, 1, 12}, r{43, 14, 6}, r{44, 16, 31}, r{45, 8, 16}, r{19, 42, 2}),
		sec("절제", r{46, 7, 9}, r{46, 9, 25}, r{48, 5, 22}, r{48, 5, 23}, r{20, 23, 2}, r{20, 29, 11}),
	},
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	for _, co := range courses {
		if err := insertCourse(ctx, pool, co); err != nil {
			log.Fatalf("seed course %q: %v", co.slug, err)
		}
		fmt.Printf("OK: course %q seeded (%d items)\n", co.slug, len(co.verses))
	}

	totalItems, err := insertCourseWithSections(ctx, pool, warmup)
	if err != nil {
		log.Fatalf("seed course %q: %v", warmup.slug, err)
	}
	fmt.Printf("OK: course %q seeded (%d sections, %d items)\n", warmup.slug, len(warmup.sections), totalItems)

	if err := seedBooks(ctx, pool); err != nil {
		log.Fatalf("seed books: %v", err)
	}
}

func insertCourse(ctx context.Context, pool *pgxpool.Pool, co seedCourse) error {
	var courseID int64
	err := pool.QueryRow(ctx, `
		INSERT INTO courses(slug, title, theme, ord, hidden)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (slug) DO UPDATE SET hidden = EXCLUDED.hidden
		RETURNING id
	`, co.slug, co.title, co.theme, co.ord, co.hidden).Scan(&courseID)
	if err != nil {
		return fmt.Errorf("upsert course: %w", err)
	}

	for i, vr := range co.verses {
		var verseID int64
		err := pool.QueryRow(ctx,
			`SELECT id FROM bible_verses WHERE book=$1 AND chapter=$2 AND verse=$3`,
			vr.book, vr.chapter, vr.verse,
		).Scan(&verseID)
		if err != nil {
			return fmt.Errorf("lookup verse %d:%d:%d: %w", vr.book, vr.chapter, vr.verse, err)
		}

		_, err = pool.Exec(ctx, `
			INSERT INTO course_items(course_id, verse_id, ord, topic)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (course_id, verse_id) WHERE section_id IS NULL DO NOTHING
		`, courseID, verseID, i+1, vr.topic)
		if err != nil {
			return fmt.Errorf("insert course_item: %w", err)
		}
	}

	return nil
}

func insertCourseWithSections(ctx context.Context, pool *pgxpool.Pool, co seedCourseWithSections) (int, error) {
	var courseID int64
	err := pool.QueryRow(ctx, `
		INSERT INTO courses(slug, title, theme, ord)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
		RETURNING id
	`, co.slug, co.title, co.theme, co.ord).Scan(&courseID)
	if err != nil {
		return 0, fmt.Errorf("upsert course: %w", err)
	}

	totalItems := 0
	for secOrd, s := range co.sections {
		var sectionID int64
		err := pool.QueryRow(ctx, `
			INSERT INTO course_sections(course_id, title, ord)
			VALUES ($1, $2, $3)
			ON CONFLICT (course_id, ord) DO UPDATE SET title = EXCLUDED.title
			RETURNING id
		`, courseID, s.title, secOrd+1).Scan(&sectionID)
		if err != nil {
			return 0, fmt.Errorf("upsert section %q: %w", s.title, err)
		}

		for itemOrd, ref := range s.verses {
			var verseID int64
			err := pool.QueryRow(ctx,
				`SELECT id FROM bible_verses WHERE book=$1 AND chapter=$2 AND verse=$3`,
				ref.b, ref.c, ref.v,
			).Scan(&verseID)
			if err != nil {
				return 0, fmt.Errorf("lookup verse %d:%d:%d: %w", ref.b, ref.c, ref.v, err)
			}

			_, err = pool.Exec(ctx, `
				INSERT INTO course_items(course_id, section_id, verse_id, ord, topic)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (section_id, ord) WHERE section_id IS NOT NULL DO NOTHING
			`, courseID, sectionID, verseID, itemOrd+1, s.title)
			if err != nil {
				return 0, fmt.Errorf("insert course_item (section %q, verse %d:%d:%d): %w", s.title, ref.b, ref.c, ref.v, err)
			}
			totalItems++
		}
	}

	return totalItems, nil
}
