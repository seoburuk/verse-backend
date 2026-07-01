// stats_handler.go — 대시보드 통계 조회 핸들러.
package handler

import (
	"net/http"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetMyStats(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	stats, err := h.attempt.GetStats(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	categories := make([]dto.CategoryProgressDTO, len(stats.Categories))
	for i, c := range stats.Categories {
		categories[i] = dto.CategoryProgressDTO{Category: c.Category, Cleared: c.Cleared, Total: c.Total}
	}

	writeJSON(w, http.StatusOK, dto.StatsResponse{
		Streak:       dto.StreakDTO{Current: stats.Streak.CurrentLen, Longest: stats.Streak.LongestLen},
		TotalCleared: stats.TotalCleared,
		Categories:   categories,
		Grades: dto.GradeDistributionDTO{
			Green:  stats.Grades.Green,
			Yellow: stats.Grades.Yellow,
			Red:    stats.Grades.Red,
		},
	})
}
