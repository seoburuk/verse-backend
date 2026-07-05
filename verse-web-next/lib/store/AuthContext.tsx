"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { login as apiLogin, signup as apiSignup, updateProfile as apiUpdateProfile } from "../api/auth";
import { getToken, setToken, clearToken } from "../api/client";
import { USER_KEY, type StoredUser } from "./authStore";

interface AuthState {
  token: string | null;
  user: StoredUser | null;
}

interface AuthContextValue extends AuthState {
  isAuthed: boolean;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, displayName: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
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
    setState(loadStored());
    setReady(true);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    const user: StoredUser = { user_id: res.user_id, display_name: res.display_name };
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token: res.access_token, user });
  }, []);

  const signup = useCallback(async (username: string, password: string, displayName: string) => {
    const res = await apiSignup(username, password, displayName);
    const user: StoredUser = { user_id: res.user_id, display_name: res.display_name };
    setToken(res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token: res.access_token, user });
  }, []);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const res = await apiUpdateProfile(displayName);
    setState((prev) => {
      if (!prev.user) return prev;
      const user: StoredUser = { ...prev.user, display_name: res.display_name };
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
      value={{ ...state, ready, isAuthed: !!state.token, login, signup, updateDisplayName, logout }}
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
