// grade.test.ts — 채점 등급 규칙. 백엔드 grading_test.go(TestGradeRecall)와 미러링.
// green은 LCS 100%(완벽)일 때만, 0.50~0.99는 yellow, 그 미만 red.
import { describe, it, expect } from "vitest";
import { gradeRecall } from "./grade";

describe("gradeRecall", () => {
  const answer = ["in", "the", "beginning", "god", "created"];

  const cases: Array<{ name: string; attempt: string[]; want: string }> = [
    { name: "정답(LCS=5, 1.0)", attempt: ["in", "the", "beginning", "god", "created"], want: "green" },
    { name: "한 단어 빠짐(LCS=4, 0.80)", attempt: ["in", "the", "beginning", "created"], want: "yellow" },
    { name: "두 단어 빠짐(LCS=3, 0.60)", attempt: ["in", "beginning", "created"], want: "yellow" },
    { name: "순서 밀림(LCS=4, 0.80)", attempt: ["in", "beginning", "the", "god", "created"], want: "yellow" },
    { name: "절반 이하(LCS=2, 0.40)", attempt: ["in", "the"], want: "red" },
    { name: "빈 시도", attempt: [], want: "red" },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(gradeRecall(answer, c.attempt)).toBe(c.want);
    });
  }

  it("여분 토큰이 있어도 LCS가 100%면 green", () => {
    // distractor를 끼워도 정답이 순서대로 부분수열이면 green
    expect(gradeRecall(answer, ["in", "the", "beginning", "god", "created", "of"])).toBe("green");
  });

  it("정답 토큰이 없으면 none", () => {
    expect(gradeRecall([], ["anything"])).toBe("none");
  });
});
