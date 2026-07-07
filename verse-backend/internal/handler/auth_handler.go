// auth_handler.go — 인증 관련 HTTP 핸들러.
// 책임: 요청 파싱 → service 호출 → 응답 직렬화. 로직은 service에.
package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
	mw "github.com/seoburuk/verse-backend/internal/handler/middleware"
)

func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req dto.SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	user, token, err := h.auth.SignUp(r.Context(), req.Username, req.DisplayName, req.Password)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, dto.TokenResponse{
		AccessToken: token,
		UserID:      user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Theme:       user.Theme,
		Language:    user.Language,
	})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req dto.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	user, token, err := h.auth.Login(r.Context(), req.Username, req.Password)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, dto.TokenResponse{
		AccessToken: token,
		UserID:      user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Theme:       user.Theme,
		Language:    user.Language,
	})
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req dto.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	var user domain.User
	var err error
	if req.DisplayName != nil {
		user, err = h.auth.UpdateDisplayName(r.Context(), userID, *req.DisplayName)
		if err != nil {
			writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
			return
		}
	}
	if req.Theme != nil || req.Language != nil {
		user, err = h.auth.UpdateThemeLanguage(r.Context(), userID, req.Theme, req.Language)
		if err != nil {
			writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
			return
		}
	}

	writeJSON(w, http.StatusOK, dto.ProfileResponse{
		DisplayName: user.DisplayName,
		Theme:       user.Theme,
		Language:    user.Language,
	})
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	user, err := h.auth.GetMe(r.Context(), userID)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, dto.MeResponse{
		UserID:      user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Theme:       user.Theme,
		Language:    user.Language,
		CreatedAt:   user.CreatedAt.Format(time.RFC3339),
	})
}

func (h *Handler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.auth.DeleteAccount(r.Context(), userID); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
