// navigator.vibrate 미지원 브라우저(iOS Safari 등)에서는 조용히 no-op.
function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

export function vibrateHit() {
  vibrate(10);
}

export function vibrateMiss() {
  vibrate([30, 30, 30]);
}

export function vibrateMilestone() {
  vibrate([20, 20, 20, 20, 20]);
}
