// Lamb — 도트 어린양 마스코트. 기획서 §8 리텐션 주력 장치.
// 점수 비중을 낮춘 만큼, 어린양 감정이 "내 행동의 결과"로 느껴지게 만드는 게 핵심.
// 상태에 따라 표정/애니메이션이 바뀐다(아래 LambMood).
export function Lamb(props: { mood: LambMood }) {
  return <div data-mood={props.mood}>🐑</div>;
}

// LambMood — 어린양 감정 상태. 연속일·정답률 등에 연동.
export type LambMood = "happy" | "neutral" | "sad" | "cheer";
