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
/** One look a minute, so a stuck preparation still ends the session after half an hour. */
export const MAX_BOARD_WAITS = 30;
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
  let waits = 0;
  let timeout: ReturnType<typeof setTimeout>;
  const fire = (): void => {
    if (waits < MAX_BOARD_WAITS && boardBeingPrepared()) {
      waits += 1;
      console.log(` 🎮 [session-limit] [waiting-for-board] look=${waits}`);
      timeout = setTimeout(fire, BOARD_WAIT_MS);
    } else if (waits > 0 && waits < MAX_BOARD_WAITS) {
      // Waiting was not playing: the board she waited for gets a full session.
      waits = 0;
      console.log(" 🎮 [session-limit] [board-opened] full-session");
      timeout = setTimeout(fire, ms);
    } else onExpired();
  };
  timeout = setTimeout(fire, ms);
  return () => clearTimeout(timeout);
}
