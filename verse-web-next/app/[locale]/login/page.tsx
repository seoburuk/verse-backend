"use client";

import { useState, useEffect, Suspense, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/lib/hooks/useAuth";
import { ApiError } from "@/lib/api/client";
import type { AuthResponse } from "@/lib/api/auth";

const SAVED_USERNAME_KEY = "kjv_saved_username";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, signup } = useAuth();
  const router = useRouter();
  const { setTheme } = useTheme();
  const t = useTranslations("login");
  const searchParams = useSearchParams();
  const [isSignup, setIsSignup] = useState(searchParams.get("mode") === "signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saveUsername, setSaveUsername] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_USERNAME_KEY);
    if (saved) {
      setUsername(saved);
      setSaveUsername(true);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let res: AuthResponse;
      if (isSignup) {
        res = await signup(username, password, displayName);
      } else {
        res = await login(username, password);
      }
      if (saveUsername) {
        localStorage.setItem(SAVED_USERNAME_KEY, username);
      } else {
        localStorage.removeItem(SAVED_USERNAME_KEY);
      }
      setTheme(res.theme);
      router.push("/courses", { locale: res.language as "ko" | "en" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center login-center">
      <div className="card">
        <h1 className="title">PIX BIBLE</h1>
        <p className="subtitle">{t("subtitle")}</p>
        <form onSubmit={handleSubmit} className="form">
          <input
            className="input"
            type="text"
            name="username"
            id="username"
            autoComplete="username"
            placeholder={t("username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            name="password"
            id="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {isSignup && (
            <input
              className="input"
              type="text"
              name="displayName"
              id="displayName"
              autoComplete="name"
              placeholder={t("name")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          {!isSignup && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={saveUsername}
                onChange={(e) => setSaveUsername(e.target.checked)}
              />
              {t("saveUsername")}
            </label>
          )}
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? t("processing") : isSignup ? t("signup") : t("login")}
          </button>
        </form>
        <button
          className="btn-link"
          onClick={() => { setIsSignup(!isSignup); setError(null); }}
        >
          {isSignup ? t("haveAccount") : t("createAccount")}
        </button>
      </div>
    </div>
  );
}
