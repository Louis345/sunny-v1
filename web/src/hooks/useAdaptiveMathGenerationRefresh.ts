import { useCallback, useEffect, useRef, useState } from "react";

export type GenerationStatus = {
  updatedAt: string;
  phase: string;
  startedAt?: string;
  error?: string;
  nodes: Array<{ nodeId: string; status: string }>;
};

const GENERATION_WATCH_DELAYS_MS = [
  30_000,
  30_000,
  60_000,
  90_000,
  120_000,
  180_000,
  240_000,
  300_000,
  300_000,
] as const;

export function useAdaptiveMathGenerationRefresh(input: {
  childId: string | null;
  homeworkId: string | null | undefined;
  enabled: boolean;
  intervalMs?: number;
  onStatusChanged: (status: GenerationStatus) => unknown | Promise<unknown>;
}) {
  const scope = `${input.childId ?? ""}:${input.homeworkId ?? ""}`;
  const [snapshot, setSnapshot] = useState<{
    scope:string;
    status:GenerationStatus|null;
    error:string|null;
    paused:boolean;
    checking:boolean;
    checkedAt:number|null;
  }>({scope,status:null,error:null,paused:false,checking:false,checkedAt:null});
  const checkRef = useRef<(() => void) | null>(null);
  const checkNow = useCallback(() => checkRef.current?.(), []);
  useEffect(() => {
    const childId = input.childId?.trim().toLowerCase() ?? "";
    const homeworkId = input.homeworkId?.trim() ?? "";
    if (!input.enabled || !childId || !homeworkId) return;

    let cancelled = false;
    let pollCount = 0;
    let lastUpdatedAt: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let controller: AbortController | null = null;
    let requestSequence = 0;
    setSnapshot({scope,status:null,error:null,paused:false,checking:false,checkedAt:null});

    const poll = async (manual = false): Promise<void> => {
      if (cancelled || pollCount >= 10) {
        if (!cancelled && pollCount >= 10) setSnapshot(prev=>({...prev,paused:true}));
        return;
      }
      const requestId = ++requestSequence;
      running = true;
      pollCount += 1;
      controller = new AbortController();
      const requestController = controller;
      let succeeded = false;
      if (manual) setSnapshot(prev=>({...prev,checking:true,error:null}));
      const deadline = setTimeout(() => requestController.abort(), 15_000);
      try {
        const response = await fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(homeworkId)}/generation-status`, { signal: requestController.signal });
        if (!response.ok) throw new Error(`generation_status_${response.status}`);
        const status = await response.json() as GenerationStatus;
        if (cancelled || requestId !== requestSequence) return;
        setSnapshot(prev=>({scope,status,error:null,paused:false,checking:prev.checking,checkedAt:prev.checkedAt}));
        const statusChanged = status.updatedAt !== lastUpdatedAt;
        if (statusChanged) {
          if (await input.onStatusChanged(status) === null) throw new Error("generation_board_refresh_unavailable");
        }
        if (cancelled || requestId !== requestSequence) return;
        if (lastUpdatedAt !== null && statusChanged) pollCount = 0;
        lastUpdatedAt = status.updatedAt;
        succeeded = true;
        if (status.phase === "board_ready" || status.phase === "probe_ready" || status.phase === "successor_published" || (status.phase === "needs_attention" && !status.nodes.some(node=>node.status === "preparing"))) return;
      } catch (error: unknown) {
        if (cancelled || requestId !== requestSequence) return;
        console.warn(" 🎮 [adaptive-math-status] [poll] [unavailable]", error);
        if (!cancelled) setSnapshot(prev=>({...prev,error:"Progress is temporarily unavailable. Saved work is not lost."}));
      } finally {
        clearTimeout(deadline);
        if (controller === requestController) controller = null;
        if (requestId === requestSequence) {
          running = false;
          setSnapshot(prev=>({
            ...prev,
            checking:false,
            checkedAt:manual && succeeded ? Date.now() : prev.checkedAt,
          }));
        }
      }
      if (cancelled || requestId !== requestSequence) return;
      if (!cancelled && pollCount >= 10) {
        console.log(" 🎮 [adaptive-math-status] [poll] [bounded-exit]");
        setSnapshot(prev=>({...prev,paused:true}));
      } else if (!cancelled) {
        const delayMs = input.intervalMs ?? GENERATION_WATCH_DELAYS_MS[Math.min(Math.max(pollCount - 1, 0), GENERATION_WATCH_DELAYS_MS.length - 1)]!;
        timer = setTimeout(() => { void poll(false).catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error)); }, delayMs);
      }
    };

    const check = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      pollCount = 0;
      if (running) {
        console.log(" 🎮 [adaptive-math-status] [manual-check] [replacing-stale-request]");
        controller?.abort();
      } else {
        console.log(" 🎮 [adaptive-math-status] [manual-check] [started]");
      }
      void poll(true).catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error));
    };
    checkRef.current = check;
    void poll(false).catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error));
    return () => {
      cancelled = true;
      requestSequence += 1;
      controller?.abort();
      if (checkRef.current === check) checkRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [scope, input.childId, input.enabled, input.homeworkId, input.intervalMs, input.onStatusChanged]);
  return { ...(snapshot.scope === scope ? snapshot : {status:null,error:null,paused:false,checking:false,checkedAt:null}), checkNow };
}
