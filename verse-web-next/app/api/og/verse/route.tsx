// 구절 공유 페이지용 동적 OG 이미지 — /api/og/verse?b=43&c=3&v=16&locale=ko
import { ImageResponse } from "next/og";
import { getVerseServer } from "@/lib/api/server";
import { bookName } from "@/lib/bookRef";
import { loadGalmuri, OG_SIZE, OG_STORY_SIZE, OG_COLORS } from "@/lib/og";

export const runtime = "nodejs";

// 구절 길이에 따라 폰트 크기를 단계적으로 줄인다.
function verseFontSize(len: number): number {
  if (len <= 90) return 44;
  if (len <= 180) return 36;
  return 30;
}

// 세로형(story) 카드는 폭은 비슷하지만 세로 여백이 넉넉해 조금 더 크게 잡는다.
function storyFontSize(len: number): number {
  if (len <= 90) return 56;
  if (len <= 180) return 44;
  return 34;
}

const storyTagline: Record<"ko" | "en", string> = {
  ko: "픽셀로 외우는 KJV 성경",
  en: "Memorize the KJV Bible, pixel by pixel",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const b = Number(searchParams.get("b"));
  const c = Number(searchParams.get("c"));
  const v = Number(searchParams.get("v"));
  const locale = searchParams.get("locale") === "en" ? "en" : "ko";
  const isStory = searchParams.get("format") === "story";

  if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(v) ||
      b < 1 || b > 66 || c < 1 || v < 1) {
    return new Response("invalid verse reference", { status: 404 });
  }

  let text: string;
  try {
    ({ text } = await getVerseServer(b, c, v));
  } catch {
    return new Response("verse not found", { status: 404 });
  }

  const display = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const ref = `${bookName(b, locale)} ${c}:${v}`;

  const image = isStory ? (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        background: OG_COLORS.bg,
        fontFamily: "Galmuri11",
        padding: "96px 72px",
      }}
    >
      <div style={{ display: "flex", fontSize: 32, color: OG_COLORS.green, letterSpacing: 8 }}>
        PIXBIBLE
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: `4px solid ${OG_COLORS.border}`,
          padding: "56px 48px",
          maxWidth: 920,
        }}
      >
        <div
          style={{
            fontSize: storyFontSize(display.length),
            color: OG_COLORS.fg,
            lineHeight: 1.55,
          }}
        >
          {display}
        </div>
        <div style={{ fontSize: 32, color: OG_COLORS.green, marginTop: 40 }}>
          {`${ref} (KJV)`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 26,
          color: OG_COLORS.muted,
          textAlign: "center",
        }}
      >
        {storyTagline[locale]}
      </div>
    </div>
  ) : (
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
        padding: 60,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: `4px solid ${OG_COLORS.border}`,
          padding: "48px 56px",
          maxWidth: 1000,
        }}
      >
        <div
          style={{
            fontSize: verseFontSize(display.length),
            color: OG_COLORS.fg,
            lineHeight: 1.5,
          }}
        >
          {display}
        </div>
        <div style={{ fontSize: 28, color: OG_COLORS.green, marginTop: 32 }}>
          {`${ref} (KJV)`}
        </div>
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
  );

  return new ImageResponse(image, {
    ...(isStory ? OG_STORY_SIZE : OG_SIZE),
    fonts: [{ name: "Galmuri11", data: await loadGalmuri(), style: "normal" }],
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
