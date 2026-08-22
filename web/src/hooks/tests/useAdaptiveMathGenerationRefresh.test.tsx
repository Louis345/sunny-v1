import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdaptiveMathGenerationRefresh } from "../useAdaptiveMathGenerationRefresh";

describe("useAdaptiveMathGenerationRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes the board when durable generation changes and stops when work is complete", async () => {
    const onStatusChanged = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ updatedAt: "t1", phase: "board_generating", nodes: [{ nodeId: "N1", status: "preparing" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ updatedAt: "t2", phase: "board_generating", nodes: [{ nodeId: "N1", status: "ready" }, { nodeId: "N2", status: "preparing" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ updatedAt: "t3", phase: "board_ready", nodes: [{ nodeId: "N1", status: "ready" }, { nodeId: "N2", status: "ready" }] }) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAdaptiveMathGenerationRefresh({
      childId: "reina",
      homeworkId: "hw-1",
      enabled: true,
      intervalMs: 30_000,
      onStatusChanged,
    }));

    await act(async () => { await Promise.resolve(); });
    expect(onStatusChanged).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(onStatusChanged).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not poll when the board has no pending generation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useAdaptiveMathGenerationRefresh({ childId: "reina", homeworkId: "hw-1", enabled: false, onStatusChanged: vi.fn() }));
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
