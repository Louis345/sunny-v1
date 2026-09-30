import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChildExperiencePacket } from "../useChildExperiencePacket";

describe("useChildExperiencePacket", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches the chart-backed adventure board packet for a child", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/child-experience/reina") {
        return Response.json({
          childChart: { childId: "reina" },
          activeSessionPlan: {
            adventureBoard: { boardId: "board-reina" },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("reina", true));

    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/child-experience/reina", { signal: expect.any(AbortSignal) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("stays idle when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("reina", false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.packet).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("refreshes canonical route state on demand without restarting Quest/Boss preparation", async () => {
    let packetVersion = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/child-experience/reina") {
        packetVersion += 1;
        return Response.json({
          childChart: { childId: "reina" },
          activeSessionPlan: { adventureBoard: { boardId: `board-reina-${packetVersion}` } },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("reina", true));
    await waitFor(() => {
      expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina-1");
    });

    await act(async () => {
      await result.current.refreshPacket();
    });

    expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an older packet response replace the targeted board after Discovery", async () => {
    // Human catch: Discovery completed and board_ready was logged, but the browser
    // reopened Word Radar. The lab only resolved packet requests in request order.
    let resolveInitial!: (value: Response) => void;
    const initial = new Promise<Response>((resolve) => { resolveInitial = resolve; });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => initial)
      .mockResolvedValueOnce(Response.json({
        childChart: { childId: "ila", learningCycle: { homeworkId: "hw-1", lifecycle: "board_ready" } },
        activeSessionPlan: {
          planId: "targeted:hw-1",
          adventureBoard: { boardId: "targeted-board" },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("ila", true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.refreshPacket();
    });
    expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("targeted-board");

    await act(async () => {
      resolveInitial(Response.json({
        childChart: { childId: "ila", learningCycle: { homeworkId: "hw-1", lifecycle: "evaluation_active" } },
        activeSessionPlan: {
          planId: "discovery:hw-1",
          adventureBoard: { boardId: "stale-discovery" },
        },
      }));
      await initial;
    });

    expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("targeted-board");
  });

  it("keeps the open session board stable while the next chapter is generated", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let packetVersion = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/child-experience/reina") {
        packetVersion += 1;
        return Response.json({
          childChart: {
            childId: "reina",
            learningCycle: {
              homeworkId: "hw-math",
              lifecycle: packetVersion === 1 ? "baseline_ready" : packetVersion === 2 ? "quest_generating" : "quest_ready",
              revision: packetVersion,
            },
          },
          activeSessionPlan: {
            adventureBoard: { boardId: `board-reina-${packetVersion}` },
          },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("reina", true));
    await waitFor(() => {
      expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina-1");
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("sunny_learning_cycle_progression"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina-1");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/child-experience/reina")).toHaveLength(1);
  });
});
