export type RuntimeEnv = Partial<Record<string, string | undefined>>;

export function isDemoMode(env: RuntimeEnv = process.env): boolean {
  return env.DEMO_MODE === "true";
}

export function isSunnyTestMode(env: RuntimeEnv = process.env): boolean {
  return env.SUNNY_TEST_MODE === "true";
}

export function isExplicitStatelessMode(env: RuntimeEnv = process.env): boolean {
  return env.SUNNY_STATELESS === "true";
}

export function isStatelessRun(env: RuntimeEnv = process.env): boolean {
  return isDemoMode(env) || isSunnyTestMode(env) || isExplicitStatelessMode(env);
}

/** Homework map free / go-live preview: no SM-2, word bank, session notes, or attempt logs. */
export function sunnyPreviewBlocksPersistence(env: RuntimeEnv = process.env): boolean {
  const v = env.SUNNY_PREVIEW_MODE?.trim().toLowerCase();
  return v === "free" || v === "go-live";
}

export function shouldPersistSessionData(env: RuntimeEnv = process.env): boolean {
  return (
    !isStatelessRun(env) &&
    !sunnyPreviewBlocksPersistence(env) &&
    getSunnyMode(env) === "real"
  );
}

export function isHomeworkMode(env: RuntimeEnv = process.env): boolean {
  return env.HOMEWORK_MODE === "true";
}

/** Log full Claude turn input + tool I/O to the terminal (homework / kiosk debugging). */
export const isDebugClaude = () => process.env.DEBUG_CLAUDE === "true";

export function shouldLoadPersistedHistory(env: RuntimeEnv = process.env): boolean {
  return !isStatelessRun(env);
}

export type SunnyMode = "real" | "diag" | "as-child";

export function getSunnyMode(env: RuntimeEnv = process.env): SunnyMode {
  const v = env.SUNNY_MODE?.trim().toLowerCase();
  if (v === "diag") return "diag";
  if (v === "as-child") return "as-child";
  return "real";
}

export function isSunnyDiagMode(env: RuntimeEnv = process.env): boolean {
  return getSunnyMode(env) === "diag";
}

/**
 * Adventure map + Grok spend gates: diagnostic kiosk when `SUNNY_MODE=diag`
 * or legacy `SUNNY_SUBJECT=diag` static map.
 */
export function isDiagMapMode(env: RuntimeEnv = process.env): boolean {
  return (
    getSunnyMode(env) === "diag" ||
    env.SUNNY_SUBJECT?.trim().toLowerCase() === "diag"
  );
}

export function isSunnyAsChildMode(env: RuntimeEnv = process.env): boolean {
  return getSunnyMode(env) === "as-child";
}
