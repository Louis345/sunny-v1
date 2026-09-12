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
  const [snapshot, setSnapshot] = useState<{scope:string;status:GenerationStatus|null;error:string|null;paused:boolean}>({scope,status:null,error:null,paused:false});
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
    const intervalMs = input.intervalMs ?? 30_000;
    setSnapshot({scope,status:null,error:null,paused:false});

    const poll = async (): Promise<void> => {
      if (cancelled || pollCount >= 10) {
        if (!cancelled && pollCount >= 10) setSnapshot(prev=>({...prev,paused:true}));
        return;
      }
      running = true;
      pollCount += 1;
      controller = new AbortController();
      const requestController = controller;
      const deadline = setTimeout(() => requestController.abort(), 15_000);
      try {
        const response = await fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(homeworkId)}/generation-status`, { signal: requestController.signal });
        if (!response.ok) throw new Error(`generation_status_${response.status}`);
        const status = await response.json() as GenerationStatus;
        if (cancelled) return;
        setSnapshot({scope,status,error:null,paused:false});
        if (status.updatedAt !== lastUpdatedAt) {
          if (await input.onStatusChanged(status) === null) throw new Error("generation_board_refresh_unavailable");
        }
        lastUpdatedAt = status.updatedAt;
        if (status.phase === "board_ready" || (status.phase === "needs_attention" && !status.nodes.some(node=>node.status === "preparing"))) return;
      } catch (error: unknown) {
        console.warn(" 🎮 [adaptive-math-status] [poll] [unavailable]", error);
        if (!cancelled) setSnapshot(prev=>({...prev,error:"Progress is temporarily unavailable. Saved work is not lost."}));
      } finally {
        clearTimeout(deadline);
        controller = null;
        running = false;
      }
      if (!cancelled && pollCount >= 10) {
        console.log(" 🎮 [adaptive-math-status] [poll] [bounded-exit]");
        setSnapshot(prev=>({...prev,paused:true}));
      } else if (!cancelled) timer = setTimeout(() => { void poll().catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error)); }, intervalMs);
    };

    const check = () => {
      if (cancelled || running) return;
      if (timer) clearTimeout(timer);
      pollCount = 0;
      void poll().catch(error=>console.error(" 🎮 [adaptive-math-status] [poll] [failed]",error));
    };
    checkRef.current = check;
    check();
    return () => {
      cancelled = true;
      controller?.abort();
      if (checkRef.current === check) checkRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [scope, input.childId, input.enabled, input.homeworkId, input.intervalMs, input.onStatusChanged]);
  return { ...(snapshot.scope === scope ? snapshot : {status:null,error:null,paused:false}), checkNow };
}
