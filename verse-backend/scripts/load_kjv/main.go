// load_kjv — Phase 0. KJV 본문(퍼블릭 도메인)을 bible_verses에 적재한다.
// 적재 후 카운트가 31,102인지 검증(기획서 §12, 부록). 일회성 운영 도구라
// cmd/api와 분리(프로덕션 바이너리에 섞이지 않게).
//
// 입력: files/data/kjv/{Books.json, <BookName>.json...}
// Books.json은 정경 순서의 책 이름("1 Samuel" 등 공백 포함) 배열이고,
// 책별 JSON 파일명은 공백이 제거된 형태("1Samuel.json")이다.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const expectedVerseCount = 31102

type bookFile struct {
	Book     string `json:"book"`
	Chapters []struct {
		Chapter string `json:"chapter"`
		Verses  []struct {
			Verse string `json:"verse"`
			Text  string `json:"text"`
		} `json:"verses"`
	} `json:"chapters"`
}

type verseRow struct {
	book    int16
	chapter int16
	verse   int16
	text    string
}

func main() {
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run() error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL must be set")
	}

	dataDir := os.Getenv("KJV_DATA_DIR")
	if dataDir == "" {
		dataDir = "../files/data/kjv"
	}

	rows, err := loadRows(dataDir)
	if err != nil {
		return fmt.Errorf("load rows: %w", err)
	}
	if len(rows) != expectedVerseCount {
		return fmt.Errorf("parsed %d verses, want %d", len(rows), expectedVerseCount)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	if err := insertRows(ctx, pool, rows); err != nil {
		return fmt.Errorf("insert: %w", err)
	}

	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM bible_verses").Scan(&count); err != nil {
		return fmt.Errorf("verify count: %w", err)
	}
	if count != expectedVerseCount {
		return fmt.Errorf("post-load count = %d, want %d", count, expectedVerseCount)
	}

	log.Printf("loaded %d verses into bible_verses", count)
	return nil
}

// loadRows는 Books.json의 정경 순서를 따라 각 책 파일을 파싱해
// (book, chapter, verse, text) 행 목록을 만든다.
func loadRows(dataDir string) ([]verseRow, error) {
	booksRaw, err := os.ReadFile(filepath.Join(dataDir, "Books.json"))
	if err != nil {
		return nil, fmt.Errorf("read Books.json: %w", err)
	}

	var bookNames []string
	if err := json.Unmarshal(booksRaw, &bookNames); err != nil {
		return nil, fmt.Errorf("parse Books.json: %w", err)
	}

	var rows []verseRow
	for i, name := range bookNames {
		bookNo := int16(i + 1)
		fileName := strings.ReplaceAll(name, " ", "") + ".json"

		raw, err := os.ReadFile(filepath.Join(dataDir, fileName))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", fileName, err)
		}

		var bf bookFile
		if err := json.Unmarshal(raw, &bf); err != nil {
			return nil, fmt.Errorf("parse %s: %w", fileName, err)
		}

		for _, ch := range bf.Chapters {
			chapterNo, err := strconv.Atoi(ch.Chapter)
			if err != nil {
				return nil, fmt.Errorf("%s: bad chapter %q: %w", fileName, ch.Chapter, err)
			}
			for _, v := range ch.Verses {
				verseNo, err := strconv.Atoi(v.Verse)
				if err != nil {
					return nil, fmt.Errorf("%s %d: bad verse %q: %w", fileName, chapterNo, v.Verse, err)
				}
				rows = append(rows, verseRow{
					book:    bookNo,
					chapter: int16(chapterNo),
					verse:   int16(verseNo),
					text:    v.Text,
				})
			}
		}
	}

	return rows, nil
}

// insertRows는 COPY로 한 번에 적재한다. 31,102건이라 개별 INSERT보다
// 훨씬 빠르고, 기존 데이터가 있으면 비워서 재실행 가능하게 한다.
func insertRows(ctx context.Context, pool *pgxpool.Pool, rows []verseRow) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "TRUNCATE verse_segments, bible_verses RESTART IDENTITY CASCADE"); err != nil {
		return fmt.Errorf("truncate: %w", err)
	}

	source := pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
		r := rows[i]
		return []any{r.book, r.chapter, r.verse, r.text}, nil
	})

	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"bible_verses"}, []string{"book", "chapter", "verse", "text"}, source); err != nil {
		return fmt.Errorf("copy from: %w", err)
	}

	return tx.Commit(ctx)
}
