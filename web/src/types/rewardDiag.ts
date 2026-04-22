/**
 * Kiosk WebSocket events surfaced by RewardDiag (dev / diag builds only).
 */
export type RewardDiagEvent = {
  timestamp: number;
  type: "reward" | "progression" | "progression_end";
  payload: Record<string, unknown>;
  /** Set by the diag bridge for stable list keys (not from the server). */
  diagId?: string;
};

/** `true` when the Vite build set `VITE_REWARD_DIAG=true` (same gate as `App`). */
export function isRewardDiagEnabled(): boolean {
  return import.meta.env.VITE_REWARD_DIAG === "true";
}
