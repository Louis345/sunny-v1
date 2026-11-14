/**
 * Session end logic for the web path.
 * Three triggers — whichever fires first ends the session:
 * 1. User says goodbye (isGoodbye)
 * 2. Max session duration (configurable), which never ends a session while her board is being prepared
 * 3. Companion detects disengagement and says goodbye (triggers #1)
 */

import path from "path";
import fs from "fs";
import { isGoodbye, isAssistantGoodbye } from "../utils/goodbye";

export type ChildName = "Ila" | "Reina" | "creator";

export interface SessionConfig {
  maxDurationMinutes: number;
  ila?: {
    maxDurationMinutes?: number;
    rewardFlashDuration_ms?: number;
    rewardTakeoverDuration_ms?: number;
  };
  reina?: {
    maxDurationMinutes?: number;
    rewardFlashDuration_ms?: number;
    rewardTakeoverDuration_ms?: number;
  };
}

let configCache: SessionConfig | null = null;

function loadConfig(): SessionConfig {
  if (configCache) return configCache;
  const configPath = path.resolve(
    process.cwd(),
    "src",
    "config",
    "session_config.json"
  );
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    configCache = JSON.parse(raw);
    return configCache!;
  } catch {
    configCache = {
      maxDurationMinutes: 15,
      ila: { maxDurationMinutes: 15 },
      reina: { maxDurationMinutes: 15 },
    };
    return configCache;
  }
}

function getMaxDurationMs(childName: ChildName): number {
  const env = process.env.SUNNY_SESSION_MAX_MINUTES?.trim();
  if (env && /^\d+$/.test(env)) {
    return Math.min(120, Math.max(5, parseInt(env, 10))) * 60 * 1000;
  }
  const config = loadConfig();
  const childConfig =
    childName === "Ila" || childName === "creator"
      ? config.ila
      : config.reina;
  const minutes =
    childConfig?.maxDurationMinutes ?? config.maxDurationMinutes;
  return minutes * 60 * 1000;
}

export interface RewardDurations {
  flash_ms: number;
  takeover_ms: number;
}

export function getRewardDurations(childName: ChildName): RewardDurations {
  const config = loadConfig();
  const childConfig =
    childName === "Ila" || childName === "creator"
      ? config.ila
      : config.reina;
  const ilaLike = childName === "Ila" || childName === "creator";
  return {
    flash_ms: childConfig?.rewardFlashDuration_ms ?? (ilaLike ? 1500 : 2000),
    takeover_ms: childConfig?.rewardTakeoverDuration_ms ?? (ilaLike ? 3000 : 6000),
  };
}

/**
 * Trigger 1: User says goodbye.
 * When true, session-manager ends the session immediately — the transcript never
 * reaches Claude, so the model cannot misfire endSession.
 */
export function checkUserGoodbye(transcript: string): boolean {
  return isGoodbye(transcript);
}

/**
 * Trigger 3: Companion says goodbye (e.g. after detecting disengagement).
 * When Claude wraps up and says "Bye!" or "See you next time!", this fires.
 */
export function checkAssistantGoodbye(assistantText: string): boolean {
  return isAssistantGoodbye(assistantText);
}

/**
 * Trigger 2: Max session duration.
 * Call when session starts. Returns a cleanup function.
 * The callback fires once when the timer expires.
 */
/** The older session counters see nothing of a board: her answers and decisions live in the learning cycle. */
export function finalizeStatus(decisionStatus: string | undefined, hasLearningCycle: boolean): string {
  return decisionStatus ?? (hasLearningCycle ? "learning_cycle_owns_this_session" : "not_a_learning_session");
}
export function legacyAttemptsNote(attempts: number, hasLearningCycle: boolean): string {
  return hasLearningCycle ? `${attempts} attempts (older counter; her answers are in the learning cycle)` : `${attempts} attempts`;
}

/** One look a minute. Minutes spent waiting for a board are not session time (2026-11-12: the wall clock ended
 * Ila's session while her board was built). Law 2 guard: after this many waiting minutes, waiting counts again,
 * so a stuck preparation still ends the session.
 */
export const MAX_BOARD_WAITS = 45;
const BOARD_WAIT_MS = 60_000;
const PREPARING_PHASES = new Set(["evidence_ready", "targeted_planning", "board_designing", "board_generating"]);

export function isBoardBeingPrepared(phase: string | null | undefined): boolean {
  return PREPARING_PHASES.has(phase ?? "");
}

export function startMaxDurationTimer(
  childName: ChildName,
  onExpired: () => void,
  boardBeingPrepared: () => boolean = () => false,
): () => void {
  const ms = getMaxDurationMs(childName);
  let activeMs = 0;
  let waits = 0;
  let waiting = false;
  let timeout: ReturnType<typeof setTimeout>;
  // Each look decides how the next minute counts: waiting for a board, or session time.
  const look = (): void => {
    const nowWaiting = waits < MAX_BOARD_WAITS && boardBeingPrepared();
    if (nowWaiting !== waiting) {
      const state = nowWaiting ? "[waiting-for-board] [paused]" : waits >= MAX_BOARD_WAITS ? "[waiting-for-board] [cap-reached] counting" : "[board-opened] [counting]";
      console.log(` 🎮 [session-limit] ${state} activeMin=${Math.round(activeMs / 60_000)} waitedMin=${waits}`);
      waiting = nowWaiting;
    }
    const step = nowWaiting ? BOARD_WAIT_MS : Math.min(BOARD_WAIT_MS, ms - activeMs);
    timeout = setTimeout(() => {
      if (nowWaiting) waits += 1;
      else activeMs += step;
      if (activeMs >= ms) {
        console.log(` 🎮 [session-limit] [reached] activeMin=${Math.round(activeMs / 60_000)} waitedMin=${waits}`);
        return onExpired();
      }
      look();
    }, step);
  };
  look();
  return () => clearTimeout(timeout);
}
