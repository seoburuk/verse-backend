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
