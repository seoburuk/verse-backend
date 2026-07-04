// 8-bit 타격음 합성 (Web Audio, 오디오 파일 없음).
// Flutter 이식용 합성 파라미터:
//   hit  — square 파형, 주파수 440Hz × 2^(min(combo,12)/12), 길이 60ms, gain 0.25 → 지수 감쇠
//   miss — sawtooth 파형, 110Hz, 길이 100ms, gain 0.2 → 지수 감쇠

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    if (!window.AudioContext) return null;
    ctx = new AudioContext();
  }
  // iOS 등에서 사용자 입력 전 suspended 상태 대응
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function blip(type: OscillatorType, freq: number, duration: number, gain: number) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

// 정답 히트음. 콤보가 오를수록 반음씩 pitch 상승 (최대 한 옥타브)
export function playHit(combo: number) {
  blip("square", 440 * Math.pow(2, Math.min(combo, 12) / 12), 0.06, 0.25);
}

// 오답음 (완성했던 단어가 깨졌을 때 등)
export function playMiss() {
  blip("sawtooth", 110, 0.1, 0.2);
}

// 콤보 마일스톤(5의 배수) 알림음 — 상승 아르페지오 3음
export function playMilestone() {
  const notes = [440, 554.37, 659.25]; // A4, C#5, E5
  notes.forEach((freq, i) => {
    setTimeout(() => blip("square", freq, 0.08, 0.22), i * 60);
  });
}
