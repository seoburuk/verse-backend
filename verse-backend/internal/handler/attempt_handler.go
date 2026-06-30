// attempt_handler.go — 암송 시도 제출 핸들러.
// 클라 client_grade를 받지만 서버가 재채점(server_grade)해 progress를 갱신한다.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) SubmitAttempt(w http.ResponseWriter, r *http.Request) {
	// context에서 userID 추출 (RequireAuth 미들웨어가 주입)
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req dto.SubmitAttemptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if req.CourseItemID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "course_item_id required"})
		return
	}

	mode := domain.Mode(req.Mode)
	if mode == "" {
		mode = domain.ModeDrag
	}
	if mode != domain.ModeDrag && mode != domain.ModeType && mode != domain.ModeHard {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid mode"})
		return
	}

	result, err := h.attempt.SubmitAttempt(
		r.Context(),
		userID,
		req.CourseItemID,
		mode,
		domain.Grade(req.ClientGrade),
		req.Tokens,
	)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, dto.AttemptResponse{
		AttemptID:   result.Attempt.ID,
		ClientGrade: string(result.Attempt.ClientGrade),
		ServerGrade: string(result.ServerGrade),
	})
}
