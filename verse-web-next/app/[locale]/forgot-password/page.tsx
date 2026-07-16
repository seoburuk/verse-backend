"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { requestPasswordReset, confirmPasswordReset } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type Step = "email" | "code" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const t = useTranslations("reset");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequestEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmPasswordReset(email, code, newPassword);
      setStep("done");
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

        {step === "email" && (
          <form onSubmit={handleRequestEmail} className="form">
            <input
              className="input"
              type="email"
              placeholder={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="error-msg">{error}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? t("processing") : t("sendCode")}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleConfirm} className="form">
            <p className="subtitle">{t("codeSentHint", { email })}</p>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              placeholder={t("code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required
            />
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={t("newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
            {error && <p className="error-msg">{error}</p>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? t("processing") : t("resetPassword")}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="form">
            <p className="success-msg">{t("doneMessage")}</p>
            <button className="btn-primary" onClick={() => router.push("/login")}>
              {t("backToLogin")}
            </button>
          </div>
        )}

        {step !== "done" && (
          <button className="btn-link" onClick={() => router.push("/login")}>
            {t("backToLogin")}
          </button>
        )}
      </div>
    </div>
  );
}
