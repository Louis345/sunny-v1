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
  return !isStatelessRun(env) && !sunnyPreviewBlocksPersistence(env);
}

export function isHomeworkMode(env: RuntimeEnv = process.env): boolean {
  return env.HOMEWORK_MODE === "true";
}

/** Log full Claude turn input + tool I/O to the terminal (homework / kiosk debugging). */
export const isDebugClaude = () => process.env.DEBUG_CLAUDE === "true";

export function shouldLoadPersistedHistory(env: RuntimeEnv = process.env): boolean {
  return !isStatelessRun(env);
}
