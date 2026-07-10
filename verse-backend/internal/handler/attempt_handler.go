// attempt_handler.go — 암송 시도 제출 핸들러.
// 클라 client_grade를 받지만 서버가 재채점(server_grade)해 progress를 갱신한다.
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
	"github.com/seoburuk/verse-backend/internal/service"
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
	if mode != domain.ModeDrag && mode != domain.ModeType && mode != domain.ModeHard && mode != domain.ModeDictation {
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

// SubmitAttemptsBatch — 오프라인 우선 클라이언트(Flutter)의 로컬 동기화 큐를
// 한 번에 처리한다. 배치 크기를 과도하게 키우면 단일 요청 지연이 커지므로
// 상한을 둔다(클라이언트도 이 값 이하로 청크를 나눠 보내야 함).
const maxBatchSize = 200

func (h *Handler) SubmitAttemptsBatch(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req dto.BatchSubmitAttemptsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if len(req.Attempts) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "attempts required"})
		return
	}
	if len(req.Attempts) > maxBatchSize {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "too many attempts in one batch"})
		return
	}

	inputs := make([]service.BatchAttemptInput, len(req.Attempts))
	for i, a := range req.Attempts {
		mode := domain.Mode(a.Mode)
		if mode == "" {
			mode = domain.ModeDrag
		}
		if mode != domain.ModeDrag && mode != domain.ModeType && mode != domain.ModeHard && mode != domain.ModeDictation {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid mode at index " + strconv.Itoa(i)})
			return
		}
		if a.CourseItemID == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "course_item_id required at index " + strconv.Itoa(i)})
			return
		}
		inputs[i] = service.BatchAttemptInput{
			ClientSeq:    a.ClientSeq,
			CourseItemID: a.CourseItemID,
			Mode:         mode,
			ClientGrade:  domain.Grade(a.ClientGrade),
			Tokens:       a.Tokens,
		}
	}

	outputs, err := h.attempt.SubmitAttemptsBatch(r.Context(), userID, inputs)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	results := make([]dto.BatchAttemptResult, len(outputs))
	for i, o := range outputs {
		res := dto.BatchAttemptResult{ClientSeq: o.ClientSeq, Status: o.Status}
		switch o.Status {
		case "ok":
			res.AttemptID = o.Attempt.ID
			res.ClientGrade = string(o.Attempt.ClientGrade)
			res.ServerGrade = string(o.ServerGrade)
		case "error":
			if o.Err != nil {
				res.Error = o.Err.Error()
			}
		}
		results[i] = res
	}

	writeJSON(w, http.StatusOK, dto.BatchSubmitAttemptsResponse{Results: results})
}
