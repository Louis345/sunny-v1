import type { SessionType } from "../server/session-context";
import { isAdventureMapEnv, type RuntimeEnv } from "./runtimeMode";

/**
 * When true, the voice companion should not receive canvas driver tools; the
 * adventure map / worksheet host owns the canvas. Reading and diag keep full tools.
 */
export function shouldUseAdventureMapVoiceSlimToolkit(options: {
  env?: RuntimeEnv;
  worksheetMode: boolean;
  sessionType: SessionType | null | undefined;
}): boolean {
  if (!isAdventureMapEnv(options.env)) return false;
  if (options.worksheetMode) return false;
  if (options.sessionType === "reading" || options.sessionType === "diag") {
    return false;
  }
  return true;
}
