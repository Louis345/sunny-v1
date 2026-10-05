import type { GenerationStatus } from "../../hooks/useAdaptiveMathGenerationRefresh";
import type { PreparationEvent, PreparationStop } from "./adventurePreparationMachine";

const PREPARED = new Set(["ready", "completed", "evidence_locked"]);
const FAILED = new Set(["needs_attention", "failed_resumable"]);
const PLANNING = new Set(["evidence_ready", "targeted_planning"]);

/**
 * Turns one real generation status into the events it proves. The machine ignores
 * duplicates and stale counts, so the full set can be sent on every poll.
 */
export function preparationEventsFromStatus(status: GenerationStatus | null, activityTypes: ReadonlyMap<string, string>): PreparationEvent[] {
  if (!status) return [];
  const failedNodes = status.nodes.filter(node => FAILED.has(node.status));
  if (status.phase === "needs_attention" || failedNodes.length > 0) {
    return [{ type: "FAILED", reason: status.error ?? failedNodes[0]?.status ?? "needs_attention", retryable: failedNodes.some(node => node.status === "failed_resumable") }];
  }
  if (PLANNING.has(status.phase) || status.nodes.length === 0) return [];
  const stops: PreparationStop[] = status.nodes.map(node => ({ activityType: activityTypes.get(node.nodeId) ?? "" }));
  const ready = status.nodes.filter(node => PREPARED.has(node.status)).length;
  const events: PreparationEvent[] = [{ type: "PLAN_DONE", stops }];
  if (ready > 0) events.push({ type: "ACTIVITY_READY", n: ready, total: stops.length });
  return events;
}

/** Real elapsed time since the job started; never an estimate. */
export function preparationElapsedLabel(startedAt: string | undefined, now: number, finished: boolean): string | undefined {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start) || now < start) return undefined;
  const totalSeconds = Math.floor((now - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (finished) return minutes > 0 ? `${minutes} min ${totalSeconds % 60} s` : `${totalSeconds} s`;
  return minutes < 1 ? "under 1 min so far" : `${minutes} min so far`;
}

/** Fixed until typical times are measured: the design's "taking longer" copy says 6 min. */
export const PREPARATION_SLOW_AFTER_MS = 6 * 60_000;

export function isPreparationSlow(startedAt: string | undefined, now: number): boolean {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(start) && now - start >= PREPARATION_SLOW_AFTER_MS;
}
