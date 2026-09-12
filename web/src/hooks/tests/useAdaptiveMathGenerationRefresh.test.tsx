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
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(onStatusChanged).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(onStatusChanged).toHaveBeenCalledTimes(3);
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

  it("keeps watching planning before any node exists and publishes the first status", async () => {
    const onStatusChanged = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({updatedAt:"t1",phase:"targeted_planning",nodes:[]})})
      .mockResolvedValueOnce({ok:true,json:async()=>({updatedAt:"t2",phase:"board_designing",nodes:[]})})
      .mockResolvedValueOnce({ok:true,json:async()=>({updatedAt:"t3",phase:"board_generating",nodes:[{nodeId:"n1",status:"preparing"}]})});
    vi.stubGlobal("fetch",fetchMock);
    const {result}=renderHook(()=>useAdaptiveMathGenerationRefresh({childId:"ila",homeworkId:"hw-1",enabled:true,onStatusChanged}));
    await act(async()=>{await Promise.resolve();});
    expect(onStatusChanged).toHaveBeenCalledWith(expect.objectContaining({phase:"targeted_planning"}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(60_000);});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.status?.phase).toBe("board_generating");
  });

  it("bounds an unchanged watch and lets the child explicitly check again without a generation write", async () => {
    const onStatusChanged=vi.fn();
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({updatedAt:"t1",phase:"board_generating",nodes:[{nodeId:"n1",status:"preparing"}]})});
    vi.stubGlobal("fetch",fetchMock);
    const {result}=renderHook(()=>useAdaptiveMathGenerationRefresh({childId:"ila",homeworkId:"hw-1",enabled:true,onStatusChanged}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(600_000);});
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(result.current.paused).toBe(true);
    await act(async()=>{result.current.checkNow();});
    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(fetchMock.mock.calls.every(call=>!call[1]?.method || call[1]?.method === "GET")).toBe(true);
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
  });

  it("does not refresh another assignment when an old in-flight status returns", async () => {
    let finish!: (value:unknown)=>void;
    const onStatusChanged=vi.fn();
    vi.stubGlobal("fetch",vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({ok:true,json:async()=>({updatedAt:"t2",phase:"board_ready",nodes:[]})}));
    const {rerender}=renderHook(({homeworkId})=>useAdaptiveMathGenerationRefresh({childId:"ila",homeworkId,enabled:true,onStatusChanged}),{initialProps:{homeworkId:"old"}});
    rerender({homeworkId:"new"});
    await act(async()=>{finish({ok:true,json:async()=>({updatedAt:"old",phase:"board_generating",nodes:[]})});});
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    expect(onStatusChanged).toHaveBeenCalledWith(expect.objectContaining({updatedAt:"t2"}));
  });
  it("retries the same terminal status when the board refresh failed",async()=>{
    const onStatusChanged=vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({revision:2});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({updatedAt:"t1",phase:"board_ready",nodes:[]})}));
    const {result}=renderHook(()=>useAdaptiveMathGenerationRefresh({childId:"ila",homeworkId:"hw-1",enabled:true,onStatusChanged}));
    await act(async()=>{});
    expect(result.current.error).not.toBeNull();
    await act(async()=>{await vi.advanceTimersByTimeAsync(30_000);});
    expect(onStatusChanged).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
  it("times out an unresponsive status request so manual checking becomes available",async()=>{
    const onStatusChanged=vi.fn();
    vi.stubGlobal("fetch",vi.fn((_url,options)=>new Promise((_resolve,reject)=>options?.signal?.addEventListener("abort",()=>reject(new Error("request_timeout")),{once:true}))));
    const {result,unmount}=renderHook(()=>useAdaptiveMathGenerationRefresh({childId:"ila",homeworkId:"hw-1",enabled:true,onStatusChanged}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(15_001);});
    expect(result.current.error).not.toBeNull();
    await act(async()=>{result.current.checkNow();});
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
    expect(onStatusChanged).not.toHaveBeenCalled();
  });
});
