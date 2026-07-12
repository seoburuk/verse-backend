// verse_handler.go — 공개 구절 조회 핸들러 (구절 공유 페이지용).
package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
)

func (h *Handler) GetVerse(w http.ResponseWriter, r *http.Request) {
	book, err1 := strconv.ParseInt(chi.URLParam(r, "book"), 10, 16)
	chapter, err2 := strconv.ParseInt(chi.URLParam(r, "chapter"), 10, 16)
	verse, err3 := strconv.ParseInt(chi.URLParam(r, "verse"), 10, 16)
	if err1 != nil || err2 != nil || err3 != nil ||
		book < 1 || book > 66 || chapter < 1 || verse < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid verse reference"})
		return
	}

	v, err := h.courses.GetVerse(r.Context(), int16(book), int16(chapter), int16(verse))
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, dto.VerseResponse{
		Book:    v.Book,
		Chapter: v.Chapter,
		Verse:   v.Verse,
		Text:    v.Text,
	})
}
