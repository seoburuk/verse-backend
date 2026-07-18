import type { ReactNode } from "react";

// renderInline — 문단/제목/인용 내 인라인 문법(**볼드**)을 파싱한다.
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={key++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// splitRow — "| a | b | c |" → ["a", "b", "c"]. 양끝 파이프 제거 후 분리.
function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// isSeparatorRow — GFM 표 구분선(|---|:--:|) 여부.
function isSeparatorRow(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line) && line.includes("-");
}

// renderCommentaryMarkdown — 해설 마크다운을 경량 파싱해 React 엘리먼트로 렌더.
// 제목(#, ##), 문단, 인용 블록(>), 인라인 볼드(**), GFM 파이프 표(|)만 지원 — 의존성 없이 서버에서 렌더한다.
export function renderCommentaryMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let table: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(<p key={key++}>{renderInline(paragraph.join(" "))}</p>);
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push(
        <blockquote key={key++} className="commentary-quote">
          {renderInline(quote.join(" "))}
        </blockquote>,
      );
      quote = [];
    }
  };
  const flushTable = () => {
    if (table.length === 0) return;
    const rows = table.filter((l) => !isSeparatorRow(l)).map(splitRow);
    table = [];
    if (rows.length === 0) return;
    const [header, ...body] = rows;
    blocks.push(
      <div key={key++} className="commentary-table-wrap">
        <table className="commentary-table">
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th key={i}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushQuote();
      flushTable();
      continue;
    }
    if (line.startsWith("|")) {
      flushParagraph();
      flushQuote();
      table.push(line);
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushQuote();
      flushTable();
      blocks.push(<h3 key={key++}>{renderInline(line.slice(3))}</h3>);
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushQuote();
      flushTable();
      blocks.push(<h2 key={key++}>{renderInline(line.slice(2))}</h2>);
      continue;
    }
    if (line.startsWith(">")) {
      flushParagraph();
      flushTable();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    flushTable();
    paragraph.push(line);
  }
  flushParagraph();
  flushQuote();
  flushTable();

  return blocks;
}
