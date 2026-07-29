// reading_handler.go — 통독 진행 조회 핸들러.
// 업로드는 별도 엔드포인트가 없다 — 통독 시도는 기존 배치 attempts POST로
// 올라오고, 이 핸들러는 재설치 복원을 위해 그것을 되돌려준다.
package handler

import (
	"net/http"
	"time"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetMyReading(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	rows, err := h.attempt.GetReadingProgress(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	items := make([]dto.ReadingItemDTO, len(rows))
	for i, row := range rows {
		items[i] = dto.ReadingItemDTO{
			CourseItemID: row.CourseItemID,
			TypedAt:      row.TypedAt.UTC().Format(time.RFC3339),
		}
	}

	writeJSON(w, http.StatusOK, dto.ReadingProgressResponse{Items: items})
}
