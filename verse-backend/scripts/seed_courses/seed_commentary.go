// seed_commentary.go — commentary/ 디렉토리의 마크다운 해설을 courses 테이블에 적재.
// 파일명 규칙: {slug}.ko.md / {slug}.en.md (예: book-43-john.ko.md)
// 디렉토리가 비어있거나 없어도 에러 없이 스킵한다. 멱등(재실행 시 덮어씀).
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

func seedCommentary(ctx context.Context, pool *pgxpool.Pool) error {
	dir := "scripts/seed_courses/commentary"
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Println("OK: commentary dir not found, skipping")
			return nil
		}
		return fmt.Errorf("read commentary dir: %w", err)
	}

	// slug -> {ko, en}
	byslug := map[string]struct{ ko, en string }{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		var slug, lang string
		switch {
		case strings.HasSuffix(name, ".ko.md"):
			slug = strings.TrimSuffix(name, ".ko.md")
			lang = "ko"
		case strings.HasSuffix(name, ".en.md"):
			slug = strings.TrimSuffix(name, ".en.md")
			lang = "en"
		default:
			continue
		}

		content, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}

		v := byslug[slug]
		if lang == "ko" {
			v.ko = string(content)
		} else {
			v.en = string(content)
		}
		byslug[slug] = v
	}

	if len(byslug) == 0 {
		fmt.Println("OK: no commentary files found, skipping")
		return nil
	}

	for slug, v := range byslug {
		tag, err := pool.Exec(ctx, `
			UPDATE courses SET commentary = NULLIF($1, ''), commentary_en = NULLIF($2, '')
			WHERE slug = $3
		`, v.ko, v.en, slug)
		if err != nil {
			return fmt.Errorf("update commentary for %q: %w", slug, err)
		}
		if tag.RowsAffected() == 0 {
			fmt.Printf("WARN: commentary for %q found but no matching course\n", slug)
			continue
		}
		fmt.Printf("OK: commentary %q seeded\n", slug)
	}

	return nil
}
