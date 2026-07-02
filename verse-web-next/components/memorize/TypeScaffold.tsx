import type { TypeHintWord } from "./useMemorize";

interface Props {
  reveal: TypeHintWord[];
}

// 단어별 밑줄 스캐폴드. 첫 글자는 미리 공개, 나머지는 빈 밑줄.
// 정확히 입력한 단어(filled)는 전체 글자를 초록으로 채운다.
export function TypeScaffold({ reveal }: Props) {
  return (
    <div className="type-scaffold">
      {reveal.map(({ word, filled }, i) => (
        <span
          key={`hint-${i}-${word}`}
          className={filled ? "hint-word filled" : "hint-word"}
        >
          {word.split("").map((ch, j) => (
            <i key={j} className={filled ? "blank-char filled" : "blank-char"}>
              {filled || j === 0 ? ch : ""}
            </i>
          ))}
        </span>
      ))}
    </div>
  );
}
