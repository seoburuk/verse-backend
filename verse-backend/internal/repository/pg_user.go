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
	q *db.Queries
}

func NewUserRepo(pool *pgxpool.Pool) UserRepo {
	return &pgUserRepo{q: db.New(pool)}
}

func (r *pgUserRepo) CreateUser(ctx context.Context, email, displayName, passwordHash string) (domain.User, error) {
	row, err := r.q.CreateUser(ctx, db.CreateUserParams{
		Email:        email,
		DisplayName:  displayName,
		PasswordHash: passwordHash,
	})
	if err != nil {
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) GetUserByEmail(ctx context.Context, email string) (domain.User, error) {
	row, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func toDomainUser(u db.User) domain.User {
	return domain.User{
		ID:           u.ID,
		Email:        u.Email,
		DisplayName:  u.DisplayName,
		PasswordHash: u.PasswordHash,
		CreatedAt:    u.CreatedAt.Time, // pgtype.Timestamptz → time.Time
	}
}
