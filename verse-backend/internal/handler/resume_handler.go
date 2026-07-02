package handler

import (
	"net/http"
	"time"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetMyResume(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	target, err := h.attempt.GetResume(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	resp := dto.ResumeResponse{Resume: nil}
	if target != nil {
		resp.Resume = &dto.ResumeTargetDTO{
			CourseItemID:    target.CourseItemID,
			CourseSlug:      target.CourseSlug,
			CourseTitle:     target.CourseTitle,
			SectionID:       target.SectionID,
			SectionTitle:    target.SectionTitle,
			Book:            target.Book,
			Chapter:         target.Chapter,
			Verse:           target.Verse,
			LastAttemptedAt: target.LastAttemptedAt.Format(time.RFC3339),
		}
	}
	writeJSON(w, http.StatusOK, resp)
}
