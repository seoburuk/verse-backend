"use client";

import type { CSSProperties } from "react";
import type { Grade } from "../../lib/grading/grade";

interface Props {
  placed: string[];
  pool: string[];
  liveGrade: Grade;
  onTap: (tile: string, fromPool: boolean) => void;
  placeholder?: string;
}

const gradeColor: Record<Grade, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  none: "var(--border)",
};

export function DragTiles({ placed, pool, liveGrade, onTap, placeholder = "단어를 탭해서 배치하세요" }: Props) {
  // 아직 아무것도 배치하지 않았으면 채점 색(빈 답안=red) 대신 중립 밑줄
  const lineColor = placed.length === 0 ? "var(--text)" : gradeColor[liveGrade];
  return (
    <div className="tiles-root">
      <div
        className="placed-area"
        style={{ "--line": lineColor } as CSSProperties}
      >
        {placed.length === 0 && (
          <span className="placeholder">{placeholder}</span>
        )}
        {placed.map((tile, i) => (
          <button
            key={`placed-${i}-${tile}`}
            className="tile tile-placed"
            onClick={() => onTap(tile, false)}
          >
            {tile}
          </button>
        ))}
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
