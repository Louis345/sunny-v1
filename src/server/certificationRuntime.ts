export type CertificationEnv = Partial<Record<string, string | undefined>>;

export function browserProfileArgs(env: CertificationEnv = process.env): string[] {
  if (!env.SUNNY_CERTIFICATION_RUN_ID || !env.SUNNY_BROWSER_PROFILE_DIR) return [];
  return [`--user-data-dir=${env.SUNNY_BROWSER_PROFILE_DIR}`];
}

export function mayReplaceExistingPortOwner(env: CertificationEnv = process.env): boolean {
  return !env.SUNNY_CERTIFICATION_RUN_ID;
}

export function healthMatchesCertificationRun(
  health: unknown,
  env: CertificationEnv = process.env,
): boolean {
  const expected = env.SUNNY_CERTIFICATION_RUN_ID;
  if (!expected) return true;
  return Boolean(health && typeof health === "object" && (health as Record<string, unknown>).certificationRunId === expected);
}

export function certificationWorkerScope(env: CertificationEnv = process.env): { childId: string; homeworkId: string } | null {
  if (!env.SUNNY_CERTIFICATION_RUN_ID) return null;
  const childId = env.SUNNY_CERTIFICATION_CHILD_ID?.trim().toLowerCase();
  const homeworkId = env.SUNNY_CERTIFICATION_HOMEWORK_ID?.trim();
  if (!childId || !homeworkId) throw new Error("certification_worker_scope_missing");
  return { childId, homeworkId };
}

export function assertCertificationWorkerScope(
  childId: string,
  homeworkId: string,
  env: CertificationEnv = process.env,
): void {
  const scope = certificationWorkerScope(env);
  if (!scope) return;
  if (scope.childId !== childId.trim().toLowerCase() || scope.homeworkId !== homeworkId) {
    throw new Error("certification_worker_scope_mismatch");
  }
}
