"use client";

import type { CSSProperties } from "react";
import type { Grade } from "../../lib/grading/grade";
import type { HitFx } from "./useMemorize";
import { PixelBurst } from "./PixelBurst";

interface Props {
  placed: string[];
  pool: string[];
  liveGrade: Grade;
  combo: number;
  fx?: HitFx | null;
  onTap: (tile: string, fromPool: boolean) => void;
  placeholder?: string;
}

const gradeColor: Record<Grade, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  none: "var(--border)",
};

export function DragTiles({ placed, pool, liveGrade, combo, fx, onTap, placeholder = "단어를 탭해서 배치하세요" }: Props) {
  // 아직 아무것도 배치하지 않았으면 채점 색(빈 답안=red) 대신 중립 밑줄
  const lineColor = placed.length === 0 ? "var(--text)" : gradeColor[liveGrade];
  const isMilestone = fx?.kind === "hit" && combo > 0 && combo % 5 === 0;
  const shakeClass = fx?.kind === "miss" ? ` fx-miss-${fx.seq % 2 ? "a" : "b"}` : "";
  return (
    <div className="tiles-root">
      <div
        className={`placed-area${shakeClass}`}
        style={{ "--line": lineColor } as CSSProperties}
      >
        {placed.length === 0 && (
          <span className="placeholder">{placeholder}</span>
        )}
        {combo >= 5 && (
          <span
            key={isMilestone ? `combo-${combo}` : "combo"}
            className={isMilestone ? "combo-badge milestone" : "combo-badge"}
            data-tier={combo >= 15 ? 3 : combo >= 10 ? 2 : 1}
          >
            x{combo}
          </span>
        )}
        {placed.map((tile, i) => {
          const isHit = fx?.kind === "hit" && i === placed.length - 1;
          return (
            <button
              key={isHit ? `placed-${i}-${tile}-${fx.seq}` : `placed-${i}-${tile}`}
              className={isHit ? "tile tile-placed tile-hit" : "tile tile-placed"}
              onClick={() => onTap(tile, false)}
            >
              {tile}
              {isHit && <PixelBurst seq={fx.seq} />}
            </button>
          );
        })}
      </div>
      <div className="pool-area">
        {pool.map((tile, i) => (
          <button
            key={`pool-${i}-${tile}`}
            className="tile tile-pool"
            onClick={() => onTap(tile, true)}
          >
            {tile}
          </button>
        ))}
      </div>
    </div>
  );
}
