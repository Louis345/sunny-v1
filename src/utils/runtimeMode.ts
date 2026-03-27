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

export function shouldPersistSessionData(env: RuntimeEnv = process.env): boolean {
  return !isStatelessRun(env);
}

export function isHomeworkMode(env: RuntimeEnv = process.env): boolean {
  return env.HOMEWORK_MODE === "true";
}

export function shouldLoadPersistedHistory(env: RuntimeEnv = process.env): boolean {
  return !isStatelessRun(env);
}
