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
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json({
          ok: true,
          childId: "reina",
          jobs: [],
          running: [],
          briefs: [],
        }, { status: 202 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("reina", true));

    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/child-experience/reina");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/homework/quest-boss/prepare",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ childId: "reina" }),
      }),
    );
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
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json({ ok: true, childId: "reina", jobs: [], running: [], briefs: [] }, { status: 202 });
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
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/homework/quest-boss/prepare")).toHaveLength(1);
  });

  it("polls Quest/Boss prep status and reloads the packet when content becomes reviewable", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let packetVersion = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/child-experience/reina") {
        packetVersion += 1;
        return Response.json({
          childChart: { childId: "reina" },
          activeSessionPlan: {
            adventureBoard: { boardId: `board-reina-${packetVersion}` },
          },
        });
      }
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json({
          ok: true,
          childId: "reina",
          jobs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
          running: ["reina:brief-quest"],
          briefs: [{ briefId: "brief-quest", kind: "quest", status: "brief_only" }],
        }, { status: 202 });
      }
      if (url === "/api/homework/quest-boss/status?childId=reina") {
        return Response.json({
          ok: true,
          childId: "reina",
          jobs: [],
          running: [],
          briefs: [{ briefId: "brief-quest", kind: "quest", status: "ready_for_review" }],
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
      await vi.advanceTimersByTimeAsync(5000);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/homework/quest-boss/status?childId=reina");
      expect(result.current.questBossPreparation?.briefs[0]?.status).toBe("ready_for_review");
      expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina-2");
    });
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
      if (url === "/api/homework/quest-boss/prepare") {
        return Response.json({ ok: true, childId: "reina", jobs: [], running: [], briefs: [] }, { status: 202 });
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
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina-1");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/child-experience/reina")).toHaveLength(1);
  });
});
