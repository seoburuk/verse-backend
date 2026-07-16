"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  login as apiLogin,
  signup as apiSignup,
  googleLogin as apiGoogleLogin,
  appleLogin as apiAppleLogin,
  updateProfile as apiUpdateProfile,
  getMe as apiGetMe,
  type AuthResponse,
  type UpdateProfilePatch,
} from "../api/auth";
import { getToken, setToken, clearToken } from "../api/client";
import { USER_KEY, type StoredUser } from "./authStore";

interface AuthState {
  token: string | null;
  user: StoredUser | null;
}

interface AuthContextValue extends AuthState {
  isAuthed: boolean;
  ready: boolean;
  login: (username: string, password: string) => Promise<AuthResponse>;
  signup: (username: string, password: string, displayName: string, email?: string) => Promise<AuthResponse>;
  googleLogin: (idToken: string) => Promise<AuthResponse>;
  appleLogin: (idToken: string, name?: string) => Promise<AuthResponse>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updateProfile: (patch: UpdateProfilePatch) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored(): AuthState {
  const token = getToken();
  const raw = typeof window !== "undefined" ? localStorage.getItem(USER_KEY) : null;
  const user = raw ? (JSON.parse(raw) as StoredUser) : null;
  if (!token || !user) return { token: null, user: null };
  return { token, user };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, user: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = loadStored();
    setState(initial);
    setReady(true);

    // 구세션(username/created_at 없음) 갱신.
    if (initial.token && initial.user && !initial.user.username) {
      apiGetMe()
        .then((res) => {
          const user: StoredUser = {
            user_id: res.user_id,
            username: res.username,
            display_name: res.display_name,
            theme: res.theme,
            language: res.language,
            created_at: res.created_at,
          };
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          setState((prev) => (prev.token ? { ...prev, user } : prev));
        })
        .catch(() => {});
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    const user: StoredUser = {
      user_id: res.user_id,
      username: res.username,
      display_name: res.display_name,
      theme: res.theme,
      language: res.language,
    };
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token: res.access_token, user });
    return res;
  }, []);

  const signup = useCallback(async (username: string, password: string, displayName: string, email?: string) => {
    const res = await apiSignup(username, password, displayName, email);
    const user: StoredUser = {
      user_id: res.user_id,
      username: res.username,
      display_name: res.display_name,
      theme: res.theme,
      language: res.language,
    };
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token: res.access_token, user });
    return res;
  }, []);

  const googleLogin = useCallback(async (idToken: string) => {
    const res = await apiGoogleLogin(idToken);
    const user: StoredUser = {
      user_id: res.user_id,
      username: res.username,
      display_name: res.display_name,
      theme: res.theme,
      language: res.language,
    };
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token: res.access_token, user });
    return res;
  }, []);

  const appleLogin = useCallback(async (idToken: string, name?: string) => {
    const res = await apiAppleLogin(idToken, name);
    const user: StoredUser = {
      user_id: res.user_id,
      username: res.username,
      display_name: res.display_name,
      theme: res.theme,
      language: res.language,
    };
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token: res.access_token, user });
    return res;
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const res = await apiUpdateProfile({ display_name: displayName });
    setState((prev) => {
      if (!prev.user) return prev;
      const user: StoredUser = { ...prev.user, display_name: res.display_name };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { ...prev, user };
    });
  }, []);

  const updateProfile = useCallback(async (patch: UpdateProfilePatch) => {
    const res = await apiUpdateProfile(patch);
    setState((prev) => {
      if (!prev.user) return prev;
      const user: StoredUser = {
        ...prev.user,
        display_name: res.display_name,
        theme: res.theme,
        language: res.language,
      };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { ...prev, user };
    });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(USER_KEY);
    setState({ token: null, user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        ready,
        isAuthed: !!state.token,
        login,
        signup,
        googleLogin,
        appleLogin,
        updateDisplayName,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be inside AuthProvider");
  return ctx;
}
