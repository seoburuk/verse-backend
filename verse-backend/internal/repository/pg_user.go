package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/seoburuk/verse-backend/internal/domain"
	db "github.com/seoburuk/verse-backend/internal/repository/sqlc"
)

type pgUserRepo struct {
	q    *db.Queries
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) UserRepo {
	return &pgUserRepo{q: db.New(pool), pool: pool}
}

func (r *pgUserRepo) CreateUser(ctx context.Context, username, displayName, passwordHash string) (domain.User, error) {
	row, err := r.q.CreateUser(ctx, db.CreateUserParams{
		Username:     username,
		DisplayName:  displayName,
		PasswordHash: passwordHash,
	})
	if err != nil {
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) GetUserByUsername(ctx context.Context, username string) (domain.User, error) {
	row, err := r.q.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

// DeleteUser — 사용자 데이터 전체 삭제. FK에 CASCADE가 없어 자식 테이블을 먼저 지운다.
func (r *pgUserRepo) DeleteUser(ctx context.Context, userID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, table := range []string{"attempts", "progress", "streaks"} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE user_id = $1", userID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, "DELETE FROM users WHERE id = $1", userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func toDomainUser(u db.User) domain.User {
	return domain.User{
		ID:           u.ID,
		Username:     u.Username,
		DisplayName:  u.DisplayName,
		PasswordHash: u.PasswordHash,
		CreatedAt:    u.CreatedAt.Time, // pgtype.Timestamptz → time.Time
	}
}
