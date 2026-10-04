import express from "express";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordDiscoveryAttempt, completeDiscoveryEvaluation, queueTargetedMathGeneration, launchAdaptiveMathWorker, getLearningCycle } = vi.hoisted(() => ({
  recordDiscoveryAttempt: vi.fn(),
  completeDiscoveryEvaluation: vi.fn(),
  queueTargetedMathGeneration: vi.fn(),
  launchAdaptiveMathWorker: vi.fn(),
  getLearningCycle: vi.fn(),
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
vi.mock("../engine/learningCycleRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/learningCycleRepository")>()),
  getLearningCycle,
}));

import { adaptiveMathWorkerCommand, setupRoutes } from "./routes";
import {
  __resetVoiceSessionRegistryForTests,
  registerActiveVoiceSessionManager,
} from "./voice-session-registry";

describe("adaptive math discovery routes", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl = "";

  it("launches background generation with Sunny's pinned Node and workspace-local tsx", () => {
    const root = "/tmp/sunny-workspace";

    expect(adaptiveMathWorkerCommand(root, "lab-child", "hw-1")).toEqual({
      executable: process.execPath,
      args: [
        path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(root, "src", "scripts", "runAdaptiveMathGeneration.ts"),
        "--child=lab-child",
        "--homework=hw-1",
      ],
    });
  });

  beforeEach(async () => {
    process.env.SUNNY_MODE = "child";
    process.env.SUNNY_STATELESS = "false";
    recordDiscoveryAttempt.mockReset().mockReturnValue({ lifecycle: "evaluation_active", revision: 2 });
    completeDiscoveryEvaluation.mockReset().mockReturnValue({ lifecycle: "evidence_ready", revision: 3 });
    queueTargetedMathGeneration.mockReset().mockReturnValue({ phase: "targeted_planning" });
    launchAdaptiveMathWorker.mockReset();
    getLearningCycle.mockReset().mockReturnValue(null);
    __resetVoiceSessionRegistryForTests();
    const app = express();
    app.use(express.json());
    setupRoutes(app, { launchAdaptiveMathWorker });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address missing");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    delete process.env.SUNNY_MODE;
    delete process.env.SUNNY_STATELESS;
    __resetVoiceSessionRegistryForTests();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("commits factual attempts and finalizes evidence before targeted planning", async () => {
    const attempt = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/attempt`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        attemptId: "a1", itemId: "i1", attemptedValue: "4",
        supportEventIds: [], instrumentSignals: [], observedAt: "2026-08-22T12:00:00.000Z",
        constructId: "client-invented", result: "correct", assistance: "unassisted", responseMode: "typed_text",
      }),
    });
    const complete = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, { method: "POST" });

    expect(attempt.status).toBe(200);
    expect(recordDiscoveryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      childId: "lab-child",
      homeworkId: "hw-1",
      attempt: {
        attemptId: "a1",
        itemId: "i1",
        attemptedValue: "4",
        supportEventIds: [],
        instrumentSignals: [],
        observedAt: "2026-08-22T12:00:00.000Z",
      },
    }));
    expect(complete.status).toBe(202);
    expect(await complete.json()).toMatchObject({ lifecycle: "evidence_ready", targetedGenerationQueued: true });
    expect(launchAdaptiveMathWorker).toHaveBeenCalledWith("lab-child", "hw-1");
  });

  it("uses live math support authority instead of trusting the browser's empty help list", async () => {
    getLearningCycle.mockReturnValue({
      domain: "math",
      nodes: [{
        nodeId: "probe-arrays",
        role: "evaluation",
        artifactBinding: { contractFingerprint: "math-frozen" },
        evidenceContract: {},
      }],
    });
    registerActiveVoiceSessionManager("lab-child", {
      noteExternalEvent() {},
      getSessionId: () => "voice-session",
      getDiscoveryAttemptContext: () => ({
        support: { status: "assisted", scaffolds: ["support:voice:item-1"] },
        instrumentSignals: [],
        artifactHash: "math-frozen",
        sessionId: "voice-session",
      }),
    });

    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: "a-live",
        sessionId: "voice-session",
        itemId: "item-1",
        attemptedValue: "4",
        supportEventIds: [],
        instrumentSignals: [],
        observedAt: "2026-08-22T12:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    expect(recordDiscoveryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      support: {
        status: "assisted",
        scaffolds: ["support:voice:item-1"],
      },
    }));
  });

  it("binds support to the submitting voice session instead of the newest tab", async () => {
    getLearningCycle.mockReturnValue({
      domain: "math",
      nodes: [{
        nodeId: "probe-arrays",
        role: "evaluation",
        artifactBinding: { contractFingerprint: "math-frozen" },
        evidenceContract: {},
      }],
    });
    registerActiveVoiceSessionManager("lab-child", {
      noteExternalEvent() {},
      getSessionId: () => "session-with-help",
      getDiscoveryAttemptContext: () => ({
        support: { status: "assisted", scaffolds: ["support:session-with-help:item-1"] },
        instrumentSignals: [], artifactHash: "math-frozen", sessionId: "session-with-help",
      }),
    });
    registerActiveVoiceSessionManager("lab-child", {
      noteExternalEvent() {},
      getSessionId: () => "newer-unassisted-tab",
      getDiscoveryAttemptContext: () => ({
        support: { status: "unassisted", scaffolds: [] },
        instrumentSignals: [], artifactHash: "math-frozen", sessionId: "newer-unassisted-tab",
      }),
    });

    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: "a-session-bound",
        sessionId: "session-with-help",
        itemId: "item-1",
        attemptedValue: "4",
        supportEventIds: [],
        instrumentSignals: [],
        observedAt: "2026-08-22T12:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    expect(recordDiscoveryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      support: { status: "assisted", scaffolds: ["support:session-with-help:item-1"] },
    }));
  });

  it("does not infer independence when the submitting voice session is unknown", async () => {
    getLearningCycle.mockReturnValue({
      domain: "math",
      nodes: [{
        nodeId: "probe-arrays",
        role: "evaluation",
        artifactBinding: { contractFingerprint: "math-frozen" },
        evidenceContract: {},
      }],
    });
    registerActiveVoiceSessionManager("lab-child", {
      noteExternalEvent() {},
      getSessionId: () => "different-session",
      getDiscoveryAttemptContext: () => ({
        support: { status: "unassisted", scaffolds: [] },
        instrumentSignals: [], artifactHash: "math-frozen", sessionId: "different-session",
      }),
    });

    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attemptId: "a-unknown-session",
        sessionId: "stale-browser-session",
        itemId: "item-1",
        attemptedValue: "4",
        supportEventIds: [],
        instrumentSignals: [],
        observedAt: "2026-08-22T12:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    expect(recordDiscoveryAttempt).toHaveBeenCalledWith(expect.objectContaining({ support: undefined }));
  });

  it("keeps the Probe chapter open between nodes and queues teaching only after the final node", async () => {
    completeDiscoveryEvaluation
      .mockReturnValueOnce({ lifecycle: "evaluation_active", revision: 3 })
      .mockReturnValueOnce({ lifecycle: "evidence_ready", revision: 4 });

    const first = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId: "probe-groups" }),
    });
    const final = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId: "probe-arrays" }),
    });

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      lifecycle: "evaluation_active",
      probeChapterComplete: false,
      targetedGenerationQueued: false,
    });
    expect(queueTargetedMathGeneration).not.toHaveBeenCalledTimes(2);
    expect(final.status).toBe(202);
    expect(await final.json()).toMatchObject({
      lifecycle: "evidence_ready",
      probeChapterComplete: true,
      targetedGenerationQueued: true,
      returnNextSession: true,
    });
    expect(completeDiscoveryEvaluation).toHaveBeenNthCalledWith(1, expect.objectContaining({ nodeId: "probe-groups" }));
    expect(completeDiscoveryEvaluation).toHaveBeenNthCalledWith(2, expect.objectContaining({ nodeId: "probe-arrays" }));
    expect(queueTargetedMathGeneration).toHaveBeenCalledTimes(1);
  });

  it("returns the final handoff idempotently after generation already advanced", async () => {
    completeDiscoveryEvaluation.mockReturnValueOnce({
      lifecycle: "targeted_planning",
      revision: 5,
      nodes: [
        { role: "evaluation", state: "completed" },
        { role: "evaluation", state: "completed" },
      ],
    });

    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId: "probe-arrays" }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      lifecycle: "targeted_planning",
      probeChapterComplete: true,
      returnNextSession: true,
    });
  });

  it("allows preview interaction but writes no Discovery evidence", async () => {
    process.env.SUNNY_MODE = "as-child";
    const response = await fetch(`${baseUrl}/api/learning/lab-child/assignments/hw-1/discovery/complete`, { method: "POST" });
    expect(await response.json()).toMatchObject({ skippedPersistence: true });
    expect(completeDiscoveryEvaluation).not.toHaveBeenCalled();
  });
});
