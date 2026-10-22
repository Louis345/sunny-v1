import type { GenerationStatus } from "../../hooks/useAdaptiveMathGenerationRefresh";
import type { PreparationEvent, PreparationStop } from "./adventurePreparationMachine";

// A not-ready activity is finished preparation: its portal publishes as not ready and is passed over.
const PREPARED = new Set(["ready", "completed", "evidence_locked", "not_ready"]);
const FAILED = new Set(["needs_attention", "failed_resumable"]);
const PLANNING = new Set(["evidence_ready", "targeted_planning"]);
const PUBLISHED = new Set(["board_ready", "successor_published"]);

/** The server published the board: that fact, not the waiting screen's history, decides readiness. */
export function isPublishedStatus(status: GenerationStatus | null): boolean {
  return Boolean(status && PUBLISHED.has(status.phase));
}

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
  if (PUBLISHED.has(status.phase) && status.nodes.length === 0) {
    // A next board's status lists no activities; the published board's own portals are its stops.
    const stops: PreparationStop[] = [...activityTypes.values()].map(activityType => ({ activityType }));
    return [{ type: "PLAN_DONE", stops }, { type: "ACTIVITY_READY", n: Math.max(stops.length, 1), total: Math.max(stops.length, 1), published: true }];
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

export type PreparationPhase = "planning" | "designing" | "building" | "ready";

/** The real stage of generation, read from the job, so the waiting screen never invents progress. */
export function preparationPhaseFromStatus(status: GenerationStatus | null): PreparationPhase | undefined {
  if (!status) return undefined;
  if (PLANNING.has(status.phase)) return "planning";
  if (status.phase === "board_designing") return "designing";
  if (status.phase === "board_generating") return "building";
  return status.phase === "board_ready" ? "ready" : undefined;
}
