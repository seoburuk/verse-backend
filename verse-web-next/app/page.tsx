import type { Metadata } from "next";
import Link from "next/link";
import { AuthRedirect } from "../components/AuthRedirect";

export const metadata: Metadata = {
  title: "Pixel KJV — KJV 성경 암송 앱",
  description: "킹제임스 성경(KJV) 66권을 절별로 암송하는 레트로 픽셀 스타일 앱. 타일 배치와 직접 입력으로 말씀을 몸에 새기세요.",
  openGraph: {
    title: "Pixel KJV — KJV 성경 암송 앱",
    description: "킹제임스 성경(KJV) 66권을 절별로 암송하는 레트로 픽셀 스타일 앱.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <div className="page">
      <AuthRedirect />
      <main className="landing-main">
        <section className="landing-hero">
          <h1 className="landing-title">Pixel KJV</h1>
          <p className="landing-subtitle">킹제임스 성경(KJV)을 절별로 암송하는 레트로 픽셀 스타일 앱</p>
          <div className="landing-cta">
            <Link href="/login" className="btn-primary landing-cta-link">
              시작하기
            </Link>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">📖 66권 전체</h2>
            <p className="muted">창세기부터 요한계시록까지, 책 → 장 → 절 단위로 탐색하고 암송해요.</p>
          </div>
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">🧩 타일 배치 · 직접 입력</h2>
            <p className="muted">단어 타일을 탭해 배치하거나 직접 타이핑해서 암송을 확인해요.</p>
          </div>
          <div className="landing-feature-card">
            <h2 className="landing-feature-title">🔥 스트릭 · ❤️ 목숨</h2>
            <p className="muted">매일 이어가는 스트릭과 목숨 시스템으로 꾸준함을 만들어요.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
