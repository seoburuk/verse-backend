import { apiFetch } from "./client";

export interface AuthResponse {
  access_token: string;
  user_id: number;
  username: string;
  display_name: string;
  theme: string;
  language: string;
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function signup(
  username: string,
  password: string,
  display_name: string,
  email?: string,
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password, display_name, ...(email ? { email } : {}) }),
  });
}

export function googleLogin(id_token: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token }),
  });
}

export function appleLogin(id_token: string, name?: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/apple", {
    method: "POST",
    body: JSON.stringify({ id_token, ...(name ? { name } : {}) }),
  });
}

export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/me", { method: "DELETE" });
}

export interface ProfileResponse {
  display_name: string;
  theme: string;
  language: string;
}

export interface UpdateProfilePatch {
  display_name?: string;
  theme?: string;
  language?: string;
}

export function updateProfile(patch: UpdateProfilePatch): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/me/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface MeResponse {
  user_id: number;
  username: string;
  display_name: string;
  theme: string;
  language: string;
  created_at: string;
  email?: string;
  email_verified: boolean;
  has_password: boolean;
}

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me");
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch<void>("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmPasswordReset(
  email: string,
  code: string,
  new_password: string,
): Promise<void> {
  return apiFetch<void>("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password }),
  });
}

export function changePassword(
  current_password: string,
  new_password: string,
): Promise<void> {
  return apiFetch<void>("/me/password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

export function requestEmailVerification(email: string): Promise<void> {
  return apiFetch<void>("/me/email/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmEmailVerification(code: string): Promise<void> {
  return apiFetch<void>("/me/email/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
