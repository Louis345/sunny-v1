import { describe, expect, it } from "vitest";
import {
  buildKioskAppUrl,
  findStaleSunnyKioskPids,
  browserProfileArgs,
  healthMatchesCertificationRun,
  kioskReadyMatches,
  mayReplaceExistingPortOwner,
  acceptOrStopKioskCandidate,
  ownedKioskShutdownTargets,
  terminateProcessTargets,
  certificationWorkerScope,
  assertCertificationWorkerScope,
} from "./certificationRuntime";

describe("certification browser and server ownership", () => {
  it("uses an isolated browser profile for certification", () => {
    expect(browserProfileArgs({ SUNNY_CERTIFICATION_RUN_ID: "cert-1", SUNNY_BROWSER_PROFILE_DIR: "/tmp/cert-1/browser" }))
      .toEqual(["--user-data-dir=/tmp/cert-1/browser"]);
    expect(browserProfileArgs({})).toEqual([]);
  });

  it("never kills an existing port owner during certification", () => {
    expect(mayReplaceExistingPortOwner({ SUNNY_CERTIFICATION_RUN_ID: "cert-1" })).toBe(false);
    expect(mayReplaceExistingPortOwner({})).toBe(true);
  });

  it("accepts health only from the same certification run", () => {
    const env = { SUNNY_CERTIFICATION_RUN_ID: "cert-1" };
    expect(healthMatchesCertificationRun({ status: "ok", certificationRunId: "cert-1" }, env)).toBe(true);
    expect(healthMatchesCertificationRun({ status: "ok", certificationRunId: "cert-2" }, env)).toBe(false);
    expect(healthMatchesCertificationRun({ status: "ok" }, env)).toBe(false);
    expect(healthMatchesCertificationRun({ status: "ok" }, {})).toBe(true);
  });

  it("accepts certification health only from the expected build", () => {
    const env = { SUNNY_CERTIFICATION_RUN_ID: "cert-1", SUNNY_BUILD_ID: "build-new" };
    expect(healthMatchesCertificationRun({
      status: "ok",
      certificationRunId: "cert-1",
      buildId: "build-new",
    }, env)).toBe(true);
    expect(healthMatchesCertificationRun({
      status: "ok",
      certificationRunId: "cert-1",
      buildId: "build-old",
    }, env)).toBe(false);
  });

  it("identifies only the stale Sunny kiosk that owns the certification profile", () => {
    // Human-caught invariant: Saori could see the old 3001 board after the
    // server restarted on 4432. Logs only proved that 4432 was healthy, and
    // the lab never checked the surviving browser process or visible page.
    const processes = [
      "101 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --kiosk --user-data-dir=/tmp/cert/browser --app=http://localhost:3001",
      "102 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper --user-data-dir=/tmp/cert/browser",
      "103 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --kiosk --user-data-dir=/tmp/other/browser --app=http://localhost:3001",
      "104 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --app=https://example.com",
      "105 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --kiosk --user-data-dir=/tmp/cert/browser-old --app=http://localhost:3001",
    ].join("\n");

    expect(findStaleSunnyKioskPids(processes, "/tmp/cert/browser")).toEqual([101]);
  });

  it("terminates owned processes with a bounded TERM then KILL sequence", async () => {
    const alive = new Set([11, 22]);
    const signals: Array<[number, NodeJS.Signals]> = [];
    const result = await terminateProcessTargets([11, 22], {
      sendSignal(target, signal) {
        signals.push([target, signal]);
        if (target === 11 || signal === "SIGKILL") alive.delete(target);
      },
      isAlive: (target) => alive.has(target),
      wait: async () => undefined,
    }, { maxChecks: 1, intervalMs: 0 });

    expect(result).toEqual({ forceKilled: [22] });
    expect(signals).toEqual([
      [11, "SIGTERM"],
      [22, "SIGTERM"],
      [22, "SIGKILL"],
    ]);
  });

  it("fails rather than claiming cleanup when an owned process survives", async () => {
    await expect(terminateProcessTargets([33], {
      sendSignal: () => undefined,
      isAlive: () => true,
      wait: async () => undefined,
    }, { maxChecks: 1, intervalMs: 0 })).rejects.toThrow("owned_process_did_not_stop:33");
  });

  it("never accepts an unverified browser and surfaces failed candidate cleanup", async () => {
    const stop = async () => undefined;
    await expect(acceptOrStopKioskCandidate(44, async () => true, stop)).resolves.toBe(true);
    await expect(acceptOrStopKioskCandidate(44, async () => false, stop)).resolves.toBe(false);
    await expect(acceptOrStopKioskCandidate(
      44,
      async () => false,
      async () => { throw new Error("candidate_still_alive"); },
    )).rejects.toThrow("candidate_still_alive");
  });

  it("owns a browser candidate even while visible readiness is still pending", () => {
    expect(ownedKioskShutdownTargets(10, undefined, 20)).toEqual([-20, 10]);
    expect(ownedKioskShutdownTargets(10, 30, undefined)).toEqual([-30, 10]);
  });

  it("binds the kiosk URL and ready acknowledgment to one launch token", () => {
    expect(buildKioskAppUrl(4432, "launch token")).toBe(
      "http://localhost:4432/?sunnyKioskToken=launch%20token",
    );
    expect(kioskReadyMatches({ ready: true, token: "token-1" }, "token-1")).toBe(true);
    expect(kioskReadyMatches({ ready: true, token: "old-token" }, "token-1")).toBe(false);
    expect(kioskReadyMatches({ ready: false, token: "token-1" }, "token-1")).toBe(false);
  });

  it("binds background work to exactly one certification child and assignment", () => {
    const env = {
      SUNNY_CERTIFICATION_RUN_ID: "cert-1",
      SUNNY_CERTIFICATION_CHILD_ID: "ila",
      SUNNY_CERTIFICATION_HOMEWORK_ID: "hw-1",
    };
    expect(certificationWorkerScope(env)).toEqual({ childId: "ila", homeworkId: "hw-1" });
    expect(() => assertCertificationWorkerScope("ila", "hw-1", env)).not.toThrow();
    expect(() => assertCertificationWorkerScope("ila", "hw-2", env)).toThrow("certification_worker_scope_mismatch");
    expect(certificationWorkerScope({})).toBeNull();
  });
});
