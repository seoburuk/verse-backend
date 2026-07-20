import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PIXBIBLE — KJV 성경 암송 앱";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
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
          background: "#0d0d0d",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontSize: 72, color: "#f5f5f5", letterSpacing: 8, marginBottom: 24 }}>
          PIXBIBLE
        </div>
        <div style={{ fontSize: 28, color: "#aaaaaa", letterSpacing: 2 }}>
          KJV 성경 66권 · 절별 암송
        </div>
        <div
          style={{
            marginTop: 48,
            padding: "12px 32px",
            border: "3px solid #f5f5f5",
            color: "#f5f5f5",
            fontSize: 20,
            letterSpacing: 4,
          }}
        >
          MEMORIZE ▶
        </div>
      </div>
    ),
    { ...size },
  );
}
