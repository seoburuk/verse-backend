// cmd/migrate — golang-migrate 기반 DB 마이그레이션 러너.
//
// `go run ./cmd/migrate up|down|version` 형태로 실행한다.
// DATABASE_URL은 환경변수에서 읽는다(.env.example 참고).
package main

import (
	"errors"
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

const migrationsDir = "file://db/migrations"

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: migrate <up|down|version>")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL must be set")
	}

	m, err := migrate.New(migrationsDir, dbURL)
	if err != nil {
		log.Fatalf("migrate init: %v", err)
	}
	defer m.Close()

	switch os.Args[1] {
	case "up":
		err = m.Up()
	case "down":
		err = m.Down()
	case "version":
		version, dirty, vErr := m.Version()
		if vErr != nil {
			log.Fatalf("migrate version: %v", vErr)
		}
		fmt.Printf("version=%d dirty=%v\n", version, dirty)
		return
	default:
		log.Fatalf("unknown command: %s", os.Args[1])
	}

	if err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatalf("migrate %s: %v", os.Args[1], err)
	}
}
