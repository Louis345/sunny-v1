import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChildExperiencePacket } from "../useChildExperiencePacket";

describe("useChildExperiencePacket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the chart-backed adventure board packet for a child", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        childChart: { childId: "reina" },
        activeSessionPlan: {
          adventureBoard: { boardId: "board-reina" },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChildExperiencePacket("reina", true));

    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.packet?.activeSessionPlan?.adventureBoard?.boardId).toBe("board-reina");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/child-experience/reina");
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
});
