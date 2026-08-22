import { useEffect } from "react";

type GenerationStatus = {
  updatedAt: string;
  phase: string;
  nodes: Array<{ nodeId: string; status: string }>;
};

export function useAdaptiveMathGenerationRefresh(input: {
  childId: string | null;
  homeworkId: string | null | undefined;
  enabled: boolean;
  intervalMs?: number;
  onStatusChanged: (status: GenerationStatus) => unknown | Promise<unknown>;
}): void {
  useEffect(() => {
    const childId = input.childId?.trim().toLowerCase() ?? "";
    const homeworkId = input.homeworkId?.trim() ?? "";
    if (!input.enabled || !childId || !homeworkId) return;

    let cancelled = false;
    let pollCount = 0;
    let lastUpdatedAt: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const intervalMs = input.intervalMs ?? 30_000;

    const poll = async (): Promise<void> => {
      if (cancelled || pollCount >= 10) {
        if (pollCount >= 10) console.warn(" 🎮 [adaptive-math-status] [poll] [bounded-exit]");
        return;
      }
      pollCount += 1;
      try {
        const response = await fetch(`/api/learning/${encodeURIComponent(childId)}/assignments/${encodeURIComponent(homeworkId)}/generation-status`);
        if (!response.ok) throw new Error(`generation_status_${response.status}`);
        const status = await response.json() as GenerationStatus;
        if (lastUpdatedAt !== null && status.updatedAt !== lastUpdatedAt) {
          await input.onStatusChanged(status);
        }
        lastUpdatedAt = status.updatedAt;
        if (status.phase === "board_ready" || status.nodes.every((node) => !["preparing", "failed_resumable"].includes(node.status))) return;
      } catch (error: unknown) {
        console.warn(" 🎮 [adaptive-math-status] [poll] [unavailable]", error);
      }
      if (!cancelled) timer = setTimeout(() => { void poll(); }, intervalMs);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [input.childId, input.enabled, input.homeworkId, input.intervalMs, input.onStatusChanged]);
}
