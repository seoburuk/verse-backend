// progress_handler.go — 로그인 사용자의 진도·스트릭 조회 핸들러.
// 서버에 쌓인 progress/streaks를 읽어 코스별 완료 집계와 절별 진도로 내려준다.
package handler

import (
	"net/http"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetMyProgress(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	summary, err := h.attempt.GetProgress(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	courses := make([]dto.CourseProgressDTO, len(summary.Courses))
	for i, c := range summary.Courses {
		courses[i] = dto.CourseProgressDTO{CourseID: c.CourseID, Cleared: c.Cleared, Total: c.Total}
	}
	items := make([]dto.ItemProgressDTO, len(summary.Items))
	for i, it := range summary.Items {
		items[i] = dto.ItemProgressDTO{
			CourseItemID: it.CourseItemID,
			Grade:        string(it.Grade),
			Cleared:      it.Cleared,
			Book:         it.Book,
			Chapter:      it.Chapter,
			Verse:        it.Verse,
		}
	}

	writeJSON(w, http.StatusOK, dto.ProgressResponse{
		Streak:  dto.StreakDTO{Current: summary.Streak.CurrentLen, Longest: summary.Streak.LongestLen},
		Courses: courses,
		Items:   items,
	})
}
