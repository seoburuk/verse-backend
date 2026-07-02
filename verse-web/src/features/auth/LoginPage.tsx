import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../api/client";

export function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      navigate("/courses");
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
            placeholder="아이디"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {isSignup && (
            <input
              className="input"
              type="text"
              placeholder="이름"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
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
