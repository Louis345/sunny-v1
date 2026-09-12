import { describe, expect, it } from "vitest";
import {
  browserProfileArgs,
  healthMatchesCertificationRun,
  mayReplaceExistingPortOwner,
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
