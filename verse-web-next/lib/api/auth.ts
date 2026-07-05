import { apiFetch } from "./client";

export interface AuthResponse {
  access_token: string;
  user_id: number;
  display_name: string;
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

export function deleteAccount(): Promise<void> {
  return apiFetch<void>("/me", { method: "DELETE" });
}

export interface ProfileResponse {
  display_name: string;
}

export function updateProfile(display_name: string): Promise<ProfileResponse> {
  return apiFetch<ProfileResponse>("/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ display_name }),
  });
}
