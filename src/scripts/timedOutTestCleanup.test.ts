import { expect, it, vi } from "vitest";
import { trackedBody, waitForUnfinishedBodies } from "../tests/unfinishedTestBodies";

// Nov 4 catch: the 1365×768 browser lab timed out at 180 s; vitest started the next scenario while the
// timed-out body was still running. Its late `finally` called vi.unstubAllEnvs() mid-way through the next
// scenario, which then wrote to the repo's src/context/ila (and got a 409 on submit). The real-child guard
// caught it; no test checked that a timed-out body is finished before the next test begins.
const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
waitForUnfinishedBodies(5000);

it.fails("times out while its cleanup is still pending", trackedBody(async () => {
  vi.stubEnv("TIMED_OUT_LAB_ROOT", "first");
  try { await later(300); } finally { vi.unstubAllEnvs(); }
}), 50);

it("starts only after the timed-out test has cleaned up", async () => {
  vi.stubEnv("TIMED_OUT_LAB_ROOT", "second");
  try {
    await later(500);
    expect(process.env.TIMED_OUT_LAB_ROOT).toBe("second");
  } finally { vi.unstubAllEnvs(); }
});
