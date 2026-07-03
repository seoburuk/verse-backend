package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) GetMyFavorites(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	items, err := h.courses.ListFavoriteItems(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	out := make([]dto.FavoriteItemDTO, len(items))
	for i, it := range items {
		out[i] = dto.FavoriteItemDTO{
			CourseItemID:   it.CourseItemID,
			Topic:          it.Topic,
			CourseSlug:     it.CourseSlug,
			CourseTitle:    it.CourseTitle,
			CourseTitleEn:  it.CourseTitleEn,
			SectionID:      it.SectionID,
			SectionTitle:   it.SectionTitle,
			SectionTitleEn: it.SectionTitleEn,
			Book:           it.Book,
			Chapter:        it.Chapter,
			Verse:          it.Verse,
			Text:           it.Text,
		}
	}
	writeJSON(w, http.StatusOK, dto.FavoritesResponse{Items: out})
}

func (h *Handler) AddFavorite(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	itemID, err := strconv.ParseInt(chi.URLParam(r, "itemId"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid itemId"})
		return
	}
	if err := h.courses.AddFavorite(r.Context(), userID, itemID); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveFavorite(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	itemID, err := strconv.ParseInt(chi.URLParam(r, "itemId"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid itemId"})
		return
	}
	if err := h.courses.RemoveFavorite(r.Context(), userID, itemID); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
