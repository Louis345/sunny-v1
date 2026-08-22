import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordDiscoveryAttempt, completeDiscoveryEvaluation, queueTargetedMathGeneration } = vi.hoisted(() => ({
  recordDiscoveryAttempt: vi.fn(),
  completeDiscoveryEvaluation: vi.fn(),
  queueTargetedMathGeneration: vi.fn(),
}));

vi.mock("../engine/adaptiveMathDiscovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/adaptiveMathDiscovery")>()),
  recordDiscoveryAttempt,
  completeDiscoveryEvaluation,
  queueTargetedMathGeneration,
}));
vi.mock("../shared/childRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/childRegistry")>()),
  listChildProfileIds: () => ["lab-child"],
}));

import { setupRoutes } from "./routes";

describe("adaptive math discovery routes", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    process.env.SUNNY_MODE = "child";
    process.env.SUNNY_STATELESS = "false";
    recordDiscoveryAttempt.mockReset().mockReturnValue({ lifecycle: "evaluation_active", revision: 2 });
    completeDiscoveryEvaluation.mockReset().mockReturnValue({ lifecycle: "evidence_ready", revision: 3 });
    queueTargetedMathGeneration.mockReset().mockReturnValue({ phase: "targeted_planning" });
    const app = express();
    app.use(express.json());
    setupRoutes(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address missing");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    delete process.env.SUNNY_MODE;
    delete process.env.SUNNY_STATELESS;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("commits factual attempts and finalizes evidence before targeted planning", async () => {
    const attempt = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/attempt`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        attemptId: "a1", itemId: "i1", constructId: "groups", result: "incorrect",
        assistance: "unassisted", exposure: "unseen", responseMode: "tap", possibleConfounds: [], observedAt: "2026-08-22T12:00:00.000Z",
      }),
    });
    const complete = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, { method: "POST" });

    expect(attempt.status).toBe(200);
    expect(recordDiscoveryAttempt).toHaveBeenCalledWith(expect.objectContaining({ childId: "lab-child", homeworkId: "hw-1", attempt: expect.objectContaining({ result: "incorrect" }) }));
    expect(complete.status).toBe(202);
    expect(await complete.json()).toMatchObject({ lifecycle: "evidence_ready", targetedGenerationQueued: true });
  });

  it("allows preview interaction but writes no Discovery evidence", async () => {
    process.env.SUNNY_MODE = "as-child";
    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, { method: "POST" });
    expect(await response.json()).toMatchObject({ skippedPersistence: true });
    expect(completeDiscoveryEvaluation).not.toHaveBeenCalled();
  });
});
