import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useMemorize } from "./useMemorize";
import * as attempts from "../../api/attempts";

const VERSE = "In the beginning God created the heavens and the earth.";

function setup() {
  return renderHook(() => useMemorize(1, VERSE));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("초기 상태", () => {
  it("study 단계로 시작한다", () => {
    const { result } = setup();
    expect(result.current.phase).toBe("study");
    expect(result.current.mode).toBe("drag");
  });

  it("타일 풀에 최소 정답 토큰 수만큼 타일이 있다", () => {
    const { result } = setup();
    expect(result.current.tiles.length).toBeGreaterThan(0);
    expect(result.current.placed).toHaveLength(0);
  });
});

describe("phase 전이", () => {
  it("startRecall 호출 시 recall 단계로 전환된다", () => {
    const { result } = setup();
    act(() => result.current.startRecall());
    expect(result.current.phase).toBe("recall");
  });

  it("submit 성공 시 result 단계로 전환된다", async () => {
    vi.spyOn(attempts, "submitAttempt").mockResolvedValue({
      attempt_id: 1,
      client_grade: "green",
      server_grade: "green",
    });
    const { result } = setup();
    act(() => result.current.startRecall());
    await act(async () => result.current.submit());
    expect(result.current.phase).toBe("result");
    expect(result.current.serverGrade).toBe("green");
  });

  it("reset 호출 시 study 단계로 복귀하고 상태가 초기화된다", async () => {
    vi.spyOn(attempts, "submitAttempt").mockResolvedValue({
      attempt_id: 1,
      client_grade: "green",
      server_grade: "green",
    });
    const { result } = setup();
    act(() => result.current.startRecall());
    await act(async () => result.current.submit());
    act(() => result.current.reset());
    expect(result.current.phase).toBe("study");
    expect(result.current.placed).toHaveLength(0);
    expect(result.current.typed).toBe("");
    expect(result.current.serverGrade).toBeNull();
  });
});

describe("drag 모드 — tapTile", () => {
  it("풀에서 타일 탭 시 placed로 이동한다", () => {
    const { result } = setup();
    act(() => result.current.startRecall());
    const tile = result.current.tiles[0];
    act(() => result.current.tapTile(tile, true));
    expect(result.current.placed).toContain(tile);
  });

  it("placed에서 타일 탭 시 풀로 반환된다", () => {
    const { result } = setup();
    act(() => result.current.startRecall());
    const tile = result.current.tiles[0];
    act(() => result.current.tapTile(tile, true));
    act(() => result.current.tapTile(tile, false));
    expect(result.current.placed).not.toContain(tile);
    expect(result.current.tiles).toContain(tile);
  });

  it("study 단계에서는 tapTile이 무시된다", () => {
    const { result } = setup();
    const tile = result.current.tiles[0];
    act(() => result.current.tapTile(tile, true));
    expect(result.current.placed).toHaveLength(0);
  });
});

describe("type 모드 — liveGrade", () => {
  it("정답 입력 시 liveGrade가 green이 된다", () => {
    const { result } = setup();
    act(() => result.current.setMode("type"));
    act(() => result.current.startRecall());
    act(() => result.current.setTyped(VERSE));
    expect(result.current.liveGrade).toBe("green");
  });

  it("빈 입력 시 liveGrade가 red이다", () => {
    const { result } = setup();
    act(() => result.current.setMode("type"));
    act(() => result.current.startRecall());
    // attempt 토큰 없음 → LCS 0 / answer.length = 0% → red
    expect(result.current.liveGrade).toBe("red");
  });
});

describe("mismatch 감지", () => {
  it("서버 채점이 클라이언트와 다르면 mismatch가 true가 된다", async () => {
    vi.spyOn(attempts, "submitAttempt").mockResolvedValue({
      attempt_id: 1,
      client_grade: "green",
      server_grade: "yellow",
    });
    const { result } = setup();
    act(() => result.current.startRecall());
    await act(async () => result.current.submit());
    expect(result.current.mismatch).toBe(true);
    expect(result.current.serverGrade).toBe("yellow");
  });
});
