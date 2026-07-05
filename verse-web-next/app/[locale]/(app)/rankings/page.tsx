"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { getRankings, type Rankings, type RankingEntry } from "@/lib/api/rankings";
import { PixelIcon } from "@/components/PixelIcon";

export default function RankingsPage() {
  const router = useRouter();
  const t = useTranslations("rankings");
  const [data, setData] = useState<Rankings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRankings()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const meInTop = data?.me != null && data.entries.some((e) => e.rank === data.me!.rank && e.username === data.me!.username);

  const row = (e: RankingEntry, isMe: boolean) => (
    <div key={`${e.rank}-${e.username}`} className={isMe ? "rank-row rank-me" : "rank-row"}>
      <span className="rank-pos">{e.rank}</span>
      <span className="rank-name">{e.username}</span>
      <span className="rank-score">
        <span className="rank-score-value">{e.score}</span>
      </span>
    </div>
  );

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-link" onClick={() => router.push("/courses")}>{t("back")}</button>
        <h1 className="title">
          <PixelIcon name="star" size={16} /> {t("title")}
        </h1>
      </header>
      <main className="content">
        {loading && <p className="muted">{t("loading")}</p>}
        {error && <p className="error-msg">{error}</p>}
        {data && (
          <>
            {data.entries.length === 0 ? (
              <p className="muted">{t("empty")}</p>
            ) : (
              <div className="rank-list">
                {data.entries.map((e) => row(e, data.me?.rank === e.rank && data.me?.username === e.username))}
              </div>
            )}

            {data.me && !meInTop && (
              <div className="section-group">
                <h2 className="section-title">{t("myRank")}</h2>
                <div className="rank-list">{row(data.me, true)}</div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
