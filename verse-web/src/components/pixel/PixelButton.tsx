// PixelButton — 8비트 감성 버튼. 공통 픽셀 UI의 기본 단위. 기획서 §1.
export function PixelButton(props: { children: React.ReactNode; onClick?: () => void }) {
  return <button onClick={props.onClick}>{props.children}</button>;
}
