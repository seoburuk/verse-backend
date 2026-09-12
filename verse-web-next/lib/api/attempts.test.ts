import { describe, expect, it } from "vitest";
import { localDayString } from "./attempts";

describe("localDayString", () => {
  it("로컬 시간대 기준으로 YYYY-MM-DD를 만든다", () => {
    expect(localDayString(new Date(2026, 0, 5, 1, 30))).toBe("2026-01-05");
  });

  it("월/일을 두 자리로 채운다", () => {
    expect(localDayString(new Date(2026, 8, 9, 23, 59))).toBe("2026-09-09");
  });
});
