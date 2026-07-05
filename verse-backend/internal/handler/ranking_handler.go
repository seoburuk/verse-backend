// ranking_handler.go — 전역 랭킹 조회 핸들러.
package handler

import (
	"net/http"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetRankings(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	result, err := h.ranking.GetRankings(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	entries := make([]dto.RankingEntryDTO, len(result.Entries))
	for i, e := range result.Entries {
		entries[i] = toRankingEntryDTO(e)
	}

	resp := dto.RankingResponse{Entries: entries}
	if result.Me != nil {
		me := toRankingEntryDTO(*result.Me)
		resp.Me = &me
	}
	writeJSON(w, http.StatusOK, resp)
}

func toRankingEntryDTO(e domain.RankingEntry) dto.RankingEntryDTO {
	return dto.RankingEntryDTO{
		Rank:          e.Rank,
		Username:      e.Username,
		Streak:        e.Streak,
		ClearedVerses: e.ClearedVerses,
		DictationPts:  e.DictationPts,
		Score:         e.Score,
	}
}
