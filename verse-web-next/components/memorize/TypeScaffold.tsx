import type { TypeHintWord, HitFx } from "./useMemorize";
import { PixelBurst } from "./PixelBurst";

interface Props {
  reveal: TypeHintWord[];
  fx?: HitFx | null;
}

// 단어별 밑줄 스캐폴드. 첫 글자는 미리 공개, 나머지는 빈 밑줄.
// 정확히 입력한 단어(filled)는 전체 글자를 초록으로 채운다.
// 방금 맞힌 단어(fx.index)는 key에 seq를 섞어 리마운트 → 팝 애니메이션 재생.
export function TypeScaffold({ reveal, fx }: Props) {
  return (
    <div className="type-scaffold">
      {reveal.map(({ word, filled }, i) => {
        const isHit = fx?.kind === "hit" && fx.index === i;
        return (
          <span
            key={isHit ? `hint-${i}-${word}-${fx.seq}` : `hint-${i}-${word}`}
            className={
              filled
                ? isHit
                  ? "hint-word filled hit"
                  : "hint-word filled"
                : "hint-word"
            }
          >
            {word.split("").map((ch, j) => (
              <i key={j} className={filled ? "blank-char filled" : "blank-char"}>
                {filled || j === 0 ? ch : ""}
              </i>
            ))}
            {isHit && <PixelBurst seq={fx.seq} />}
          </span>
        );
      })}
    </div>
  );
}
