"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/useAuth";
import { ApiError } from "../../lib/api/client";

const SAVED_USERNAME_KEY = "kjv_saved_username";

export default function LoginPage() {
  const { login, signup } = useAuth();
  const router = useRouter();
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
      setError(err instanceof ApiError ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <h1 className="title">Pixel KJV</h1>
        <p className="subtitle">KJV 성경 암송</p>
        <form onSubmit={handleSubmit} className="form">
          <input
            className="input"
            type="text"
            name="username"
            id="username"
            autoComplete="username"
            placeholder="아이디"
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
            placeholder="비밀번호"
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
              placeholder="이름"
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
              아이디 저장
            </label>
          )}
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? "처리 중..." : isSignup ? "회원가입" : "로그인"}
          </button>
        </form>
        <button
          className="btn-link"
          onClick={() => { setIsSignup(!isSignup); setError(null); }}
        >
          {isSignup ? "이미 계정이 있어요" : "계정 만들기"}
        </button>
      </div>
    </div>
  );
}
