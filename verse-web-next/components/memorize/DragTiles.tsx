"use client";

import type { Grade } from "../../lib/grading/grade";

interface Props {
  placed: string[];
  pool: string[];
  liveGrade: Grade;
  onTap: (tile: string, fromPool: boolean) => void;
}

const gradeColor: Record<Grade, string> = {
  green: "var(--green)",
  yellow: "var(--yellow)",
  red: "var(--red)",
  none: "#555",
};

export function DragTiles({ placed, pool, liveGrade, onTap }: Props) {
  return (
    <div className="tiles-root">
      <div
        className="placed-area"
        style={{ borderColor: gradeColor[liveGrade] }}
      >
        {placed.length === 0 && (
          <span className="placeholder">단어를 탭해서 배치하세요</span>
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
