// 마일스톤 공유용 동적 OG 이미지 — /api/og/milestone?count=10&name=철수&locale=ko
import { ImageResponse } from "next/og";
import { loadGalmuri, OG_SIZE, OG_COLORS } from "@/lib/og";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const count = Number(searchParams.get("count"));
  const locale = searchParams.get("locale") === "en" ? "en" : "ko";
  const name = (searchParams.get("name") ?? "").trim().slice(0, 20);

  if (!Number.isInteger(count) || count < 1 || count > 31102) {
    return new Response("invalid count", { status: 404 });
  }

  // 라우트 핸들러에는 next-intl을 끌어오지 않는다 — 문자열 2개뿐이라 하드코딩.
  const title =
    locale === "en"
      ? name
        ? `${name} memorized ${count} verses`
        : `${count} verses memorized`
      : name
        ? `${name}님이 성경 ${count}절을 외웠어요`
        : `성경 ${count}절 암송 달성`;
  const tagline =
    locale === "en" ? "Memorize the KJV Bible, pixel by pixel" : "픽셀로 외우는 KJV 성경";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: OG_COLORS.bg,
          fontFamily: "Galmuri11",
        }}
      >
        <div style={{ fontSize: 80, color: OG_COLORS.yellow, marginBottom: 16 }}>
          ★
        </div>
        <div
          style={{
            fontSize: 120,
            color: OG_COLORS.green,
            marginBottom: 8,
          }}
        >
          {String(count)}
        </div>
        <div
          style={{
            fontSize: 40,
            color: OG_COLORS.fg,
            textAlign: "center",
            padding: "0 80px",
            lineHeight: 1.4,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 24, color: OG_COLORS.muted, marginTop: 24 }}>
          {tagline}
        </div>
        <div
          style={{
            fontSize: 24,
            color: OG_COLORS.muted,
            letterSpacing: 6,
            marginTop: 40,
          }}
        >
          PIXBIBLE
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: "Galmuri11", data: await loadGalmuri(), style: "normal" }],
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
