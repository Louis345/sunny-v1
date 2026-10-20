import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import * as routes from "./routes";

// Saori 2026-10-18: the kiosk was started for the isolated demo-pashley profile, but startup
// recovery looped over every child. Reading Ila's context under the isolated context root hit the
// protected-child guard outside any error handling, and the uncaught error shut Sunny down before
// the evaluation. This Mac never used an isolated context root, so it never happened here.
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
type Scope = (env: NodeJS.ProcessEnv, all: string[]) => string[];
const scope = () => (routes as unknown as { startupRecoveryChildIds: Scope }).startupRecoveryChildIds;

describe("startup recovery stays inside the child the kiosk was started for", () => {
  it("recovers only the selected child", () => {
    expect(routes).toHaveProperty("startupRecoveryChildIds");
    expect(scope()({ SUNNY_CHILD: "demo-pashley" }, ["demo-pashley", "ila", "reina"])).toEqual(["demo-pashley"]);
    expect(scope()({ SUNNY_CHILD: " Demo-Pashley " }, ["demo-pashley", "ila"])).toEqual(["demo-pashley"]);
  });
  it("never reaches a protected child under an isolated context root", () => {
    expect(scope()({ SUNNY_CONTEXT_ROOT: "/tmp/isolated" }, ["demo-pashley", "ila", "reina"])).toEqual(["demo-pashley"]);
    expect(scope()({ SUNNY_CONTEXT_ROOT: "/tmp/isolated", SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT: "true" }, ["ila"])).toEqual(["ila"]);
    expect(scope()({}, ["demo-pashley", "ila"])).toEqual(["demo-pashley", "ila"]);
  });
  it("a problem with one child's data never stops the server", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-startup-"));
    vi.stubEnv("SUNNY_CONTEXT_ROOT", root);
    vi.stubEnv("SUNNY_ALLOW_REAL_CHILD_CONTEXT_ROOT", "");
    vi.stubEnv("SUNNY_CHILD", "ila"); // even a misconfigured selection must not crash startup
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = routes as unknown as { resumeAdaptiveMathWorkers: (o?: { force?: boolean }) => void; resumeSuccessorBoards: (o?: { force?: boolean }) => void };
    try {
      expect(() => run.resumeAdaptiveMathWorkers({ force: true })).not.toThrow();
      expect(() => run.resumeSuccessorBoards({ force: true })).not.toThrow();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
