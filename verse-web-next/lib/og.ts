// 동적 OG 이미지 공용 유틸 — Galmuri 폰트 로드 + 픽셀 스타일 상수.
// satori는 woff2를 지원하지 않아 레포에 커밋한 TTF를 fs로 읽는다.
// (셀프호스팅 next start 환경이라 edge 런타임 불가 — 라우트에서 runtime="nodejs" 필수)
import { readFile } from "fs/promises";
import path from "path";

let fontCache: Buffer | null = null;

export async function loadGalmuri(): Promise<Buffer> {
  if (!fontCache) {
    fontCache = await readFile(
      path.join(process.cwd(), "assets/fonts/Galmuri11.ttf"),
    );
  }
  return fontCache;
}

export const OG_SIZE = { width: 1200, height: 630 };

// 메신저로 이미지 파일을 직접 공유할 때 쓰는 세로형 카드 — 링크 미리보기(OG_SIZE)와는 별개.
export const OG_STORY_SIZE = { width: 1080, height: 1920 };

export const OG_COLORS = {
  bg: "#0d0d0d",
  fg: "#f5f5f5",
  muted: "#aaaaaa",
  green: "#4ade80",
  yellow: "#facc15",
  border: "#f5f5f5",
};
