// lives_handler.go — 목숨 조회 핸들러.
package handler

import (
	"net/http"
	"time"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
	"github.com/seoburuk/verse-backend/internal/service"
)

func (h *Handler) GetMyLives(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	lives, err := h.attempt.GetLives(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	var nextRefillSec int64
	if lives.Count < service.MaxLives {
		remaining := service.LivesRefillTTL - time.Since(lives.UpdatedAt)
		if remaining > 0 {
			nextRefillSec = int64(remaining.Seconds())
		}
	}

	writeJSON(w, http.StatusOK, dto.LivesResponse{
		Lives:         lives.Count,
		MaxLives:      service.MaxLives,
		NextRefillSec: nextRefillSec,
		UpdatedAt:     lives.UpdatedAt.Format(time.RFC3339),
	})
}
