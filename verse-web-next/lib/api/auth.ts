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
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password, display_name }),
  });
}

export function googleLogin(id_token: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token }),
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
}

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me");
}
