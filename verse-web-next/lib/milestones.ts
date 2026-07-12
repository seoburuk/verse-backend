// 암송 절수 마일스톤 — 결과 화면 축하 카드 트리거.
// localStorage에 "이미 축하한 최고 임계값"을 저장해 중복 축하를 막는다(기기 단위).
export const MILESTONES = [1, 5, 10, 20, 50, 100, 200, 300, 500, 1000];

const STORAGE_KEY = "pixbible_celebrated_milestone";

// totalCleared가 아직 축하하지 않은 임계값을 넘었으면 그중 최고값을 반환하고 기록한다.
// 넘은 게 없으면 null.
export function claimMilestone(totalCleared: number): number | null {
  if (typeof window === "undefined") return null;
  const celebrated = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
  let hit: number | null = null;
  for (const m of MILESTONES) {
    if (m <= totalCleared && m > celebrated) hit = m;
  }
  if (hit !== null) {
    window.localStorage.setItem(STORAGE_KEY, String(hit));
  }
  return hit;
}
