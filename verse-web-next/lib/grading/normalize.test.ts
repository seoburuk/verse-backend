// normalize.test.ts — 정규화/토크나이즈 규칙. 백엔드 grading_test.go(TestNormalize)와 미러링.
import { describe, it, expect } from "vitest";
import { normalize, tokenizeDisplay } from "./normalize";

describe("normalize", () => {
  const cases: Array<{ in: string; want: string[] }> = [
    { in: "In the beginning,", want: ["in", "the", "beginning"] },
    { in: "thee Thou HAST", want: ["thee", "thou", "hast"] }, // 고어 철자 보존
    { in: "God's grace.", want: ["god", "s", "grace"] },       // 소유격 분리
    { in: "  spaces   ", want: ["spaces"] },
    { in: "", want: [] },
  ];

  for (const c of cases) {
    it(`normalize(${JSON.stringify(c.in)})`, () => {
      expect(normalize(c.in)).toEqual(c.want);
    });
  }
});

describe("tokenizeDisplay", () => {
  it("대소문자를 보존한다", () => {
    expect(tokenizeDisplay("For God so loved")).toEqual(["For", "God", "so", "loved"]);
  });

  // 핵심 불변식: 표시 토큰을 소문자화하면 채점 토큰과 1:1로 정렬된다.
  // (드래그 타일은 표시용, 채점은 normalize용 — 둘이 어긋나면 클라/서버 채점 불일치)
  it("normalize와 토큰 경계가 동일하다", () => {
    const samples = [
      "For God so loved the world, that He gave...",
      "In the beginning, God created.",
      "thee Thou HAST",
      "",
    ];
    for (const s of samples) {
      const disp = tokenizeDisplay(s);
      const norm = normalize(s);
      expect(disp.map((w) => w.toLowerCase())).toEqual(norm);
    }
  });
});
