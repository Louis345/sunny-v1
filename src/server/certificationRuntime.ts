export type CertificationEnv = Partial<Record<string, string | undefined>>;

export function buildKioskAppUrl(port: number, token: string): string {
  return `http://localhost:${port}/?sunnyKioskToken=${encodeURIComponent(token)}`;
}

export function kioskReadyMatches(value: unknown, token: string): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.ready === true && record.token === token;
}

export function findStaleSunnyKioskPids(processTable: string, profileDir?: string): number[] {
  if (!profileDir) throw new Error("sunny_kiosk_profile_required");
  const hasExactArg = (command: string, arg: string): boolean => {
    const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(command);
  };
  const profileArg = `--user-data-dir=${profileDir}`;
  return processTable.split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) return [];
    const command = match[2] ?? "";
    const isSunnyKiosk = hasExactArg(command, "--kiosk")
      && /(?:^|\s)--app=http:\/\/localhost:\d+(?:\/[^\s]*)?(?=\s|$)/.test(command)
      && !command.includes("Google Chrome Helper");
    if (!isSunnyKiosk || !hasExactArg(command, profileArg)) return [];
    return [Number(match[1])];
  });
}

export type ProcessTargetOps = {
  sendSignal: (target: number, signal: NodeJS.Signals) => void;
  isAlive: (target: number) => boolean;
  wait: (milliseconds: number) => Promise<void>;
};

export async function terminateProcessTargets(
  targets: number[],
  ops: ProcessTargetOps,
  options: { maxChecks?: number; intervalMs?: number } = {},
): Promise<{ forceKilled: number[] }> {
  const uniqueTargets = [...new Set(targets.filter((target) => Number.isInteger(target) && target !== 0))];
  const maxChecks = options.maxChecks ?? 50;
  const intervalMs = options.intervalMs ?? 100;
  for (const target of uniqueTargets) {
    try {
      ops.sendSignal(target, "SIGTERM");
    } catch {
      // The owned process may already have exited.
    }
  }
  let remaining = uniqueTargets.filter(ops.isAlive);
  for (let check = 0; remaining.length > 0 && check < maxChecks; check += 1) {
    await ops.wait(intervalMs);
    remaining = remaining.filter(ops.isAlive);
  }
  const forceKilled = [...remaining];
  for (const target of forceKilled) {
    try {
      ops.sendSignal(target, "SIGKILL");
    } catch {
      // The owned process may have exited between the liveness check and signal.
    }
  }
  if (forceKilled.length > 0) await ops.wait(Math.max(intervalMs, 25));
  const stubborn = forceKilled.filter(ops.isAlive);
  if (stubborn.length > 0) throw new Error(`owned_process_did_not_stop:${stubborn.join(",")}`);
  return { forceKilled };
}

export async function acceptOrStopKioskCandidate(
  pid: number | undefined,
  waitForReady: () => Promise<boolean>,
  stopOwnedTarget: (target: number) => Promise<void>,
): Promise<boolean> {
  if (!pid) return false;
  if (await waitForReady()) return true;
  await stopOwnedTarget(-pid);
  return false;
}

export function ownedKioskShutdownTargets(
  serverPid: number | undefined,
  browserPid: number | undefined,
  pendingBrowserPid: number | undefined,
): number[] {
  const ownedBrowserPid = browserPid ?? pendingBrowserPid;
  return [
    ...(ownedBrowserPid ? [-ownedBrowserPid] : []),
    ...(serverPid ? [serverPid] : []),
  ];
}

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
  const expectedRun = env.SUNNY_CERTIFICATION_RUN_ID;
  const expectedBuild = env.SUNNY_BUILD_ID;
  if (!expectedRun && !expectedBuild) return true;
  if (!health || typeof health !== "object") return false;
  const record = health as Record<string, unknown>;
  return (!expectedRun || record.certificationRunId === expectedRun)
    && (!expectedBuild || record.buildId === expectedBuild);
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
