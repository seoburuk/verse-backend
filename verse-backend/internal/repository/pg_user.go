package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
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

func (r *pgUserRepo) GetUserByGoogleSub(ctx context.Context, googleSub string) (domain.User, error) {
	row, err := r.q.GetUserByGoogleSub(ctx, pgtype.Text{String: googleSub, Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) CreateGoogleUser(ctx context.Context, username, displayName, email, googleSub string) (domain.User, error) {
	row, err := r.q.CreateGoogleUser(ctx, db.CreateGoogleUserParams{
		Username:    username,
		DisplayName: displayName,
		Email:       pgtype.Text{String: email, Valid: email != ""},
		GoogleSub:   pgtype.Text{String: googleSub, Valid: true},
	})
	if err != nil {
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) GetUserByAppleSub(ctx context.Context, appleSub string) (domain.User, error) {
	row, err := r.q.GetUserByAppleSub(ctx, pgtype.Text{String: appleSub, Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) CreateAppleUser(ctx context.Context, username, displayName, email, appleSub string) (domain.User, error) {
	row, err := r.q.CreateAppleUser(ctx, db.CreateAppleUserParams{
		Username:    username,
		DisplayName: displayName,
		Email:       pgtype.Text{String: email, Valid: email != ""},
		AppleSub:    pgtype.Text{String: appleSub, Valid: true},
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

func (r *pgUserRepo) GetUserByID(ctx context.Context, userID int64) (domain.User, error) {
	row, err := r.q.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) UpdateThemeLanguage(ctx context.Context, userID int64, theme, language *string) (domain.User, error) {
	row, err := r.q.UpdateUserPrefs(ctx, db.UpdateUserPrefsParams{
		ID:       userID,
		Theme:    toPgText(theme),
		Language: toPgText(language),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) UpdateDisplayName(ctx context.Context, userID int64, displayName string) (domain.User, error) {
	row, err := r.q.UpdateDisplayName(ctx, db.UpdateDisplayNameParams{
		ID:          userID,
		DisplayName: displayName,
	})
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

	for _, table := range []string{"item_favorites", "attempts", "progress", "streaks"} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE user_id = $1", userID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, "DELETE FROM users WHERE id = $1", userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *pgUserRepo) GetLives(ctx context.Context, userID int64) (domain.Lives, error) {
	row, err := r.q.GetUserLives(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Lives{}, domain.ErrNotFound
		}
		return domain.Lives{}, err
	}
	return domain.Lives{Count: row.Lives, UpdatedAt: row.LivesUpdatedAt.Time}, nil
}

func (r *pgUserRepo) UpdateLives(ctx context.Context, userID int64, lives domain.Lives) error {
	return r.q.UpdateUserLives(ctx, db.UpdateUserLivesParams{
		ID:             userID,
		Lives:          lives.Count,
		LivesUpdatedAt: pgtype.Timestamptz{Time: lives.UpdatedAt, Valid: true},
	})
}

func (r *pgUserRepo) GetUserByVerifiedEmail(ctx context.Context, email string) (domain.User, error) {
	row, err := r.q.GetUserByVerifiedEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.User{}, domain.ErrNotFound
		}
		return domain.User{}, err
	}
	return toDomainUser(row), nil
}

func (r *pgUserRepo) SetUserEmailPending(ctx context.Context, userID int64, email string) error {
	return r.q.SetUserEmailPending(ctx, db.SetUserEmailPendingParams{
		ID:    userID,
		Email: pgtype.Text{String: email, Valid: email != ""},
	})
}

func (r *pgUserRepo) SetUserEmailVerified(ctx context.Context, userID int64) error {
	return r.q.SetUserEmailVerified(ctx, userID)
}

func (r *pgUserRepo) UpdatePasswordHash(ctx context.Context, userID int64, passwordHash string) error {
	return r.q.UpdatePasswordHash(ctx, db.UpdatePasswordHashParams{
		ID:           userID,
		PasswordHash: passwordHash,
	})
}

func (r *pgUserRepo) CreateAuthCode(ctx context.Context, userID int64, purpose, codeHash, email string, expiresAt time.Time) error {
	_, err := r.q.CreateAuthCode(ctx, db.CreateAuthCodeParams{
		UserID:    userID,
		Purpose:   purpose,
		CodeHash:  codeHash,
		Email:     email,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	return err
}

func (r *pgUserRepo) GetLatestAuthCode(ctx context.Context, userID int64, purpose string) (domain.AuthCode, error) {
	row, err := r.q.GetLatestAuthCode(ctx, db.GetLatestAuthCodeParams{UserID: userID, Purpose: purpose})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.AuthCode{}, domain.ErrNotFound
		}
		return domain.AuthCode{}, err
	}
	return domain.AuthCode{
		ID:        row.ID,
		UserID:    row.UserID,
		Purpose:   row.Purpose,
		CodeHash:  row.CodeHash,
		Email:     row.Email,
		Attempts:  row.Attempts,
		ExpiresAt: row.ExpiresAt.Time,
	}, nil
}

func (r *pgUserRepo) IncrementAuthCodeAttempts(ctx context.Context, id int64) error {
	return r.q.IncrementAuthCodeAttempts(ctx, id)
}

func (r *pgUserRepo) DeleteAuthCodes(ctx context.Context, userID int64, purpose string) error {
	return r.q.DeleteAuthCodes(ctx, db.DeleteAuthCodesParams{UserID: userID, Purpose: purpose})
}

func (r *pgUserRepo) CountRecentAuthCodes(ctx context.Context, userID int64, purpose string) (int64, error) {
	return r.q.CountRecentAuthCodes(ctx, db.CountRecentAuthCodesParams{UserID: userID, Purpose: purpose})
}

func toPgText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func toDomainUser(u db.User) domain.User {
	user := domain.User{
		ID:           u.ID,
		Username:     u.Username,
		DisplayName:  u.DisplayName,
		PasswordHash: u.PasswordHash,
		CreatedAt:    u.CreatedAt.Time, // pgtype.Timestamptz → time.Time
		Theme:        u.Theme,
		Language:     u.Language,
		Email:         u.Email.String,
		GoogleSub:     u.GoogleSub.String,
		EmailVerified: u.EmailVerifiedAt.Valid,
	}
	if u.DisplayNameUpdatedAt.Valid {
		t := u.DisplayNameUpdatedAt.Time
		user.DisplayNameUpdatedAt = &t
	}
	return user
}
