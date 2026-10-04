import {
  resolveSunnyRuntimeConfig as resolveSunnyRuntimeConfigShared,
  type RuntimeEnv,
  type SunnyRuntimeConfig,
  type SunnySessionMode,
} from "../shared/runtimeConfig";

export type { RuntimeEnv, SunnyRuntimeConfig };

export function resolveSunnyRuntimeConfig(
  env: RuntimeEnv = process.env,
): SunnyRuntimeConfig {
  return resolveSunnyRuntimeConfigShared(env);
}

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
  return resolveSunnyRuntimeConfig(env).previewMode !== "off";
}

export function shouldPersistSessionData(env: RuntimeEnv = process.env): boolean {
  return (
    !isStatelessRun(env) &&
    resolveSunnyRuntimeConfig(env).persistenceMode === "live"
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

export type SunnyMode = SunnySessionMode;

export function getSunnyMode(env: RuntimeEnv = process.env): SunnyMode {
  return resolveSunnyRuntimeConfig(env).sessionMode;
}

export function isSunnyDiagMode(env: RuntimeEnv = process.env): boolean {
  return getSunnyMode(env) === "diag";
}

/**
 * Adventure map + Grok spend gates: diagnostic kiosk when `SUNNY_MODE=diag`
 * or legacy `SUNNY_SUBJECT=diag` static map.
 */
export function isDiagMapMode(env: RuntimeEnv = process.env): boolean {
  const runtime = resolveSunnyRuntimeConfig(env);
  return runtime.sessionMode === "diag" || runtime.subject === "diag";
}

export function isSunnyAsChildMode(env: RuntimeEnv = process.env): boolean {
  return getSunnyMode(env) === "as-child";
}

/** Homework / adventure map kiosk: voice client drives activities; server sets `ADVENTURE_MAP=true`. */
export function isAdventureMapEnv(env: RuntimeEnv = process.env): boolean {
  return env.ADVENTURE_MAP === "true";
}
