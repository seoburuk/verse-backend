// auth_handler.go — 인증 관련 HTTP 핸들러.
// 책임: 요청 파싱 → service 호출 → 응답 직렬화. 로직은 service에.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/seoburuk/verse-backend/internal/handler/dto"
)

func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req dto.SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	user, token, err := h.auth.SignUp(r.Context(), req.Email, req.DisplayName, req.Password)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, dto.TokenResponse{
		AccessToken: token,
		UserID:      user.ID,
		DisplayName: user.DisplayName,
	})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req dto.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	user, token, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, dto.TokenResponse{
		AccessToken: token,
		UserID:      user.ID,
		DisplayName: user.DisplayName,
	})
}
