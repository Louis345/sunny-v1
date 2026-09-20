import { useCallback, useEffect, useRef, useState } from "react";

export type GenerationStatus = {
  updatedAt: string;
  phase: string;
  startedAt?: string;
  error?: string;
  nodes: Array<{ nodeId: string; status: string }>;
};

export function useAdaptiveMathGenerationRefresh(input: {
  childId: string | null;
  homeworkId: string | null | undefined;
  enabled: boolean;
  intervalMs?: number;
  onStatusChanged: (status: GenerationStatus) => unknown | Promise<unknown>;
}) {
  const scope = `${input.childId ?? ""}:${input.homeworkId ?? ""}`;
  const [snapshot, setSnapshot] = useState<{scope:string;status:GenerationStatus|null;error:string|null;paused:boolean;checking:boolean}>({scope,status:null,error:null,paused:false,checking:false});
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
    let manualCheckQueued = false;
    let manualReplacementController: AbortController | null = null;
    const intervalMs = input.intervalMs ?? 30_000;
    setSnapshot({scope,status:null,error:null,paused:false,checking:false});

    const poll = async (source: "automatic" | "manual" = "automatic"): Promise<void> => {
      if (cancelled || pollCount >= 10) {
        if (!cancelled && pollCount >= 10) setSnapshot(prev=>({...prev,paused:true}));
        return;
      }
      running = true;
      pollCount += 1;
      controller = new AbortController();
      const requestController = controller;
      const deadline = setTimeout(() => requestController.abort(), 15_000);
      let terminal = false;
      try {
        const response = await fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(homeworkId)}/generation-status`, { signal: requestController.signal });
        if (!response.ok) throw new Error(`generation_status_${response.status}`);
        const status = await response.json() as GenerationStatus;
        if (cancelled) return;
        setSnapshot(prev=>({scope,status,error:null,paused:false,checking:prev.checking}));
        if (status.updatedAt !== lastUpdatedAt) {
          if (await input.onStatusChanged(status) === null) throw new Error("generation_board_refresh_unavailable");
        }
        lastUpdatedAt = status.updatedAt;
        if (source === "manual") console.log(` 🎮 [adaptive-math-status] [manual-check] [refreshed] phase=${status.phase}`);
        terminal = status.phase === "board_ready" || (status.phase === "needs_attention" && !status.nodes.some(node=>node.status === "preparing"));
      } catch (error: unknown) {
        if (requestController !== manualReplacementController) {
          console.warn(" 🎮 [adaptive-math-status] [poll] [unavailable]", error);
          if (!cancelled) setSnapshot(prev=>({...prev,error:"Progress is temporarily unavailable. Saved work is not lost."}));
        }
      } finally {
        clearTimeout(deadline);
        if (controller === requestController) controller = null;
        running = false;
        if (source === "manual" && !cancelled) setSnapshot(prev=>({...prev,checking:false}));
      }
      if (!cancelled && manualCheckQueued) {
        manualCheckQueued = false;
        manualReplacementController = null;
        console.log(" 🎮 [adaptive-math-status] [manual-check] [started]");
        queueMicrotask(() => {
          if (!cancelled) void poll("manual").catch(error=>console.error(" 🎮 [adaptive-math-status] [manual-check] [failed]",error));
        });
        return;
      }
      if (terminal) return;
      if (!cancelled && pollCount >= 10) {
        console.log(" 🎮 [adaptive-math-status] [poll] [bounded-exit]");
        setSnapshot(prev=>({...prev,paused:true}));
      } else if (!cancelled) timer = setTimeout(() => { void poll().catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error)); }, intervalMs);
    };

    const check = () => {
      if (cancelled) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pollCount = 0;
      setSnapshot(prev=>({...prev,checking:true}));
      if (running) {
        manualCheckQueued = true;
        manualReplacementController = controller;
        console.log(" 🎮 [adaptive-math-status] [manual-check] [queued]");
        controller?.abort();
        return;
      }
      console.log(" 🎮 [adaptive-math-status] [manual-check] [started]");
      void poll("manual").catch(error=>console.error(" 🎮 [adaptive-math-status] [manual-check] [failed]",error));
    };
    checkRef.current = check;
    void poll().catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error));
    return () => {
      cancelled = true;
      controller?.abort();
      if (checkRef.current === check) checkRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [scope, input.childId, input.enabled, input.homeworkId, input.intervalMs, input.onStatusChanged]);
  return { ...(snapshot.scope === scope ? snapshot : {status:null,error:null,paused:false,checking:false}), checkNow };
}
