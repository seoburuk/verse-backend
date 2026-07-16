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

	// 이메일은 선택 입력 — 넣었으면 미인증 상태로 저장만 해둔다. 인증(코드
	// 발송/확인)은 여기서 하지 않고, 설정 화면에서 나중에 따로 진행한다.
	// 저장 실패해도 가입 자체는 이미 성공했으므로 막지 않는다.
	if req.Email != "" {
		_ = h.auth.SetPendingEmail(r.Context(), user.ID, req.Email)
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

func (h *Handler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	var req dto.GoogleLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	user, token, err := h.auth.GoogleLogin(r.Context(), req.IDToken)
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

func (h *Handler) AppleLogin(w http.ResponseWriter, r *http.Request) {
	var req dto.AppleLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	user, token, err := h.auth.AppleLogin(r.Context(), req.IDToken, req.Name)
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
		UserID:        user.ID,
		Username:      user.Username,
		DisplayName:   user.DisplayName,
		Theme:         user.Theme,
		Language:      user.Language,
		CreatedAt:     user.CreatedAt.Format(time.RFC3339),
		Email:         user.Email,
		EmailVerified: user.EmailVerified,
		HasPassword:   user.PasswordHash != "",
	})
}

func (h *Handler) RequestEmailVerification(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req dto.RequestEmailVerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if err := h.auth.RequestEmailVerification(r.Context(), userID, req.Email); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

func (h *Handler) ConfirmEmailVerification(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req dto.ConfirmEmailVerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if err := h.auth.ConfirmEmailVerification(r.Context(), userID, req.Code); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"verified": true})
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(mw.CtxUserID).(int64)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req dto.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if err := h.auth.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req dto.RequestPasswordResetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	// 계정 존재 여부와 무관하게 항상 202를 반환한다(열거 공격 방지).
	_ = h.auth.RequestPasswordReset(r.Context(), req.Email)
	w.WriteHeader(http.StatusAccepted)
}

func (h *Handler) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req dto.ConfirmPasswordResetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if err := h.auth.ConfirmPasswordReset(r.Context(), req.Email, req.Code, req.NewPassword); err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
