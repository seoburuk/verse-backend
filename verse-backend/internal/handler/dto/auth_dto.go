// auth_dto.go — 인증 요청/응답 전용 구조체.
//
// 왜 domain 타입을 직접 안 쓰고 DTO를 두는가:
// domain.User에는 PasswordHash가 있다. 이걸 그대로 JSON 직렬화하면 해시가
// 외부로 샌다. DTO는 "외부에 보여줄 모양"을 명시적으로 통제하는 경계다.
package dto

type SignupRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email,omitempty"` // 선택 — 입력하면 가입 직후 인증 코드 발송
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type GoogleLoginRequest struct {
	IDToken string `json:"id_token"`
}

type AppleLoginRequest struct {
	IDToken string `json:"id_token"`
	Name    string `json:"name,omitempty"` // 애플이 최초 1회만 주는 이름(선택)
}

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	UserID      int64  `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Theme       string `json:"theme"`
	Language    string `json:"language"`
}

type UpdateProfileRequest struct {
	DisplayName *string `json:"display_name"`
	Theme       *string `json:"theme"`
	Language    *string `json:"language"`
}

type ProfileResponse struct {
	DisplayName string `json:"display_name"`
	Theme       string `json:"theme"`
	Language    string `json:"language"`
}

type MeResponse struct {
	UserID        int64  `json:"user_id"`
	Username      string `json:"username"`
	DisplayName   string `json:"display_name"`
	Theme         string `json:"theme"`
	Language      string `json:"language"`
	CreatedAt     string `json:"created_at"`
	Email         string `json:"email,omitempty"`
	EmailVerified bool   `json:"email_verified"`
	HasPassword   bool   `json:"has_password"`
}

type RequestEmailVerificationRequest struct {
	Email string `json:"email"`
}

type ConfirmEmailVerificationRequest struct {
	Code string `json:"code"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type RequestPasswordResetRequest struct {
	Email string `json:"email"`
}

type ConfirmPasswordResetRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"new_password"`
}
