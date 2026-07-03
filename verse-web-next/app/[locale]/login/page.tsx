"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { useAuth } from "@/lib/hooks/useAuth";
import { ApiError } from "@/lib/api/client";

const SAVED_USERNAME_KEY = "kjv_saved_username";

export default function LoginPage() {
  const { login, signup } = useAuth();
  const router = useRouter();
  const t = useTranslations("login");
  const [isSignup, setIsSignup] = useState(false);
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
      if (isSignup) {
        await signup(username, password, displayName);
      } else {
        await login(username, password);
      }
      if (saveUsername) {
        localStorage.setItem(SAVED_USERNAME_KEY, username);
      } else {
        localStorage.removeItem(SAVED_USERNAME_KEY);
      }
      router.push("/courses");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
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
