import type { CSSProperties } from "react";

interface Props {
  seq: number;
}

const BURST_COLORS = ["var(--green)", "var(--yellow)", "var(--pink)", "var(--pink-soft)"];
const PARTICLE_COUNT = 12;

// 정답 타격 시 방사형으로 흩어지는 픽셀 파편. seq가 바뀔 때마다 리마운트되어 재생.
export function PixelBurst({ seq }: Props) {
  return (
    <span className="pixel-burst" key={seq}>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const angle = (360 / PARTICLE_COUNT) * i;
        const rad = (angle * Math.PI) / 180;
        const dist = 22 + (i % 3) * 7;
        const dx = Math.cos(rad) * dist;
        const dy = Math.sin(rad) * dist;
        return (
          <i
            key={i}
            className="pixel-burst-particle"
            style={
              {
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                background: BURST_COLORS[i % BURST_COLORS.length],
                animationDelay: `${(i % 3) * 0.02}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </span>
  );
}
