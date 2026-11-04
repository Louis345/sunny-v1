import { afterEach } from "vitest";

// A timed-out vitest body keeps running after vitest moves on. Its late cleanup (vi.unstubAllEnvs, rmSync)
// then lands inside the next test. Each body is tracked, and afterEach waits for it to settle, so the next
// test starts only after the previous body's own `finally` has run. See timedOutTestCleanup.test.ts.
const running = new Set<Promise<unknown>>();

export function trackedBody<A extends unknown[]>(body: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  return (...args) => {
    const settled = body(...args);
    running.add(settled);
    void settled.catch(() => undefined).finally(() => running.delete(settled));
    return settled;
  };
}

/** Registers the wait; `timeoutMs` bounds it, so a body that never settles fails its hook instead of hanging. */
export function waitForUnfinishedBodies(timeoutMs: number): void {
  afterEach(async () => { await Promise.allSettled([...running]); }, timeoutMs);
}
