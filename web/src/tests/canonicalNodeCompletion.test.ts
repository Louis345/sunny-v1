import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import {
  DiscoveryAcademicCompletionCoordinator,
  flushDiscoveryAttemptWrites,
  hasCanonicalLearningCycle,
  postCanonicalNodeCompletion,
  postDiscoveryAttempt,
  postDiscoveryComplete,
  runDiscoveryAcademicCompletion,
} from "../utils/canonicalNodeCompletion";

describe("canonical node completion handoff", () => {
  it("sends native recall attempts with the same required factual envelope as generated activities", async () => {
    const fetch = vi.fn(async (_url: string, _request: RequestInit) => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetch);
    await postDiscoveryAttempt({ childId: "lab", homeworkId: "hw", attempt: { itemId: "frozen", attemptId: "once", attemptedValue: "nite", observedAt: "2026-09-08T12:00:00Z" } });
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({ itemId: "frozen", supportEventIds: [], instrumentSignals: [] });
  });
  it("flushes a pause without completing or sealing the evaluation", async () => {
    const coordinator = new DiscoveryAcademicCompletionCoordinator();
    const write = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true });
    await expect(coordinator.recordAttempt(write)).rejects.toThrow("offline");
    await coordinator.flushForExit();
    expect(write).toHaveBeenCalledTimes(2);
    await expect(coordinator.recordAttempt(async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });
  it("waits for every Discovery attempt before allowing evaluation completion", async () => {
    let releaseFinalAttempt!: () => void;
    const finalAttempt = new Promise<void>((resolve) => {
      releaseFinalAttempt = resolve;
    });
    let flushed = false;
    const flush = flushDiscoveryAttemptWrites([Promise.resolve(), finalAttempt]).then(() => {
      flushed = true;
    });

    await Promise.resolve();
    expect(flushed).toBe(false);
    releaseFinalAttempt();
    await flush;
    expect(flushed).toBe(true);
  });

  it("commits academic completion after factual attempts without requiring engagement evidence", async () => {
    const completeAcademic = vi.fn(async () => ({ targetedGenerationQueued: true }));

    const completion = await runDiscoveryAcademicCompletion({
      attemptWrites: [Promise.resolve()],
      completeAcademic,
    });

    expect(completion).toEqual({ targetedGenerationQueued: true });
    expect(completeAcademic).toHaveBeenCalledOnce();
  });

  it("waits for every factual attempt to settle and rejects completion when any attempt failed", async () => {
    let releaseFinalAttempt!: () => void;
    const finalAttempt = new Promise<void>((resolve) => {
      releaseFinalAttempt = resolve;
    });
    const completeAcademic = vi.fn(async () => ({ targetedGenerationQueued: true }));
    let settled = false;

    const completion = runDiscoveryAcademicCompletion({
      attemptWrites: [Promise.reject(new Error("attempt store unavailable")), finalAttempt],
      completeAcademic,
    }).finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    releaseFinalAttempt();
    await expect(completion).rejects.toThrow("discovery_attempt_writes_failed:1");
    expect(completeAcademic).not.toHaveBeenCalled();
  });

  it("retries a failed attempt write without permanently poisoning completion", async () => {
    const coordinator = new DiscoveryAcademicCompletionCoordinator();
    const writeAttempt = vi.fn()
      .mockRejectedValueOnce(new Error("temporary store failure"))
      .mockResolvedValueOnce({ ok: true });
    const completeAcademic = vi.fn(async () => ({ targetedGenerationQueued: true }));

    void coordinator.recordAttempt(writeAttempt).catch(() => undefined);

    await expect(coordinator.complete(completeAcademic)).resolves.toEqual({
      targetedGenerationQueued: true,
    });
    expect(writeAttempt).toHaveBeenCalledTimes(2);
    expect(completeAcademic).toHaveBeenCalledOnce();
  });

  it("rejects and does not write attempts received after completion has started", async () => {
    const coordinator = new DiscoveryAcademicCompletionCoordinator();
    let releaseAttempt!: () => void;
    const firstAttempt = coordinator.recordAttempt(() => new Promise<void>((resolve) => {
      releaseAttempt = resolve;
    }));
    const completeAcademic = vi.fn(async () => ({ targetedGenerationQueued: true }));
    const completion = coordinator.complete(completeAcademic);
    const lateWrite = vi.fn(async () => ({ ok: true }));

    await expect(coordinator.recordAttempt(lateWrite)).rejects.toThrow(
      "discovery_attempt_after_completion",
    );
    expect(lateWrite).not.toHaveBeenCalled();
    releaseAttempt();
    await firstAttempt;
    await completion;
  });

  it("keeps completion single-flight and permits a bounded retry after persistence remains unavailable", async () => {
    const coordinator = new DiscoveryAcademicCompletionCoordinator();
    const writeAttempt = vi.fn().mockRejectedValue(new Error("store unavailable"));
    void coordinator.recordAttempt(writeAttempt).catch(() => undefined);
    const completeAcademic = vi.fn(async () => ({ targetedGenerationQueued: true }));

    const first = coordinator.complete(completeAcademic);
    expect(coordinator.complete(completeAcademic)).toBe(first);
    await expect(first).rejects.toThrow("discovery_attempt_writes_failed:1");
    await expect(coordinator.complete(completeAcademic)).rejects.toThrow(
      "discovery_attempt_writes_failed:1",
    );
    expect(completeAcademic).not.toHaveBeenCalled();
    expect(writeAttempt).toHaveBeenCalledTimes(3);
  });

  it("keeps direct full-board practice completion out of the canonical mastery path", () => {
    expect(hasCanonicalLearningCycle({ childChart: {}, activeSessionPlan: { activeHomeworkId: "direct-hw" } } as never)).toBe(false);
    expect(hasCanonicalLearningCycle({ childChart: { learningCycle: { homeworkId: "cycle-hw" } } } as never)).toBe(true);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { nodeState: "completed", claimed: false, expected: true },
    { nodeState: "ready", claimed: true, expected: false },
    { nodeState: "active", claimed: true, expected: false },
    { nodeState: undefined, claimed: true, expected: false },
  ])("uses saved node state $nodeState instead of renderer completion $claimed", async ({ nodeState, claimed, expected }) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ lifecycle: "baseline_active", revision: 3, nodeState }), { status: 200 })));
    const completion = await postCanonicalNodeCompletion({ childId: "lab", homeworkId: "hw", nodeId: "native", completionId: "host-launch", result: { completed: claimed, ended: true, won: false } });
    expect(completion.outcome).toMatchObject({ completed: expected, ended: true, won: false });
  });

  it.each(["completed", "ready", "active", undefined])("App only locally completes canonical node state %s", async nodeState => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const block = source.slice(source.indexOf("const completePlannerBoardActivity ="), source.indexOf("const handlePlannerBoardPostActivityAction ="));
    const handler = block.slice(block.indexOf("void write().then(") + "void write().then(".length, block.indexOf(").catch("));
    let local: string[] = [];
    await vm.runInNewContext(`(${handler})(completion)`, {
      completion: { nodeState, outcome: { completed: nodeState === "completed" } },
      launch: { node: { id: "native" } }, plannerBoardPacket: { childChart: { learningCycle: {} } }, hasCanonicalLearningCycle,
      refreshPlannerBoardPacket: async () => {}, setLocallyCompletedPlannerNodeIds: (update: (current: string[]) => string[]) => { local = update(local); },
      setProfileCompanionCurrency: vi.fn(), showPlannerBoardEngagementOverlay: vi.fn(), console,
    });
    expect(local).toEqual(nodeState === "completed" ? ["native"] : []);
  });

  it("uses one host launch identity for retries and a different one for genuine replay", async () => {
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({lifecycle:"baseline_active",revision:3}),{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    const input={childId:"lab",homeworkId:"graph",nodeId:"logbook",completionId:"host-launch-1",result:{completed:true,sessionId:"untrusted-renderer-id"}};
    await postCanonicalNodeCompletion(input);
    await postCanonicalNodeCompletion(input);
    await postCanonicalNodeCompletion({...input,completionId:"host-launch-2"});
    expect(fetchMock.mock.calls.map(call=>JSON.parse((call as unknown as [string,{body:string}])[1].body).result.sessionId)).toEqual(["host-launch-1","host-launch-1","host-launch-2"]);
  });

  it.each([0.4, null, undefined])("uses only server-verified accuracy %s in the completion display", async (academicAccuracy) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({lifecycle: "baseline_active",revision: 3,nodeState: "completed",academicAccuracy}), {status: 200})));
    const completion=await postCanonicalNodeCompletion({childId: "lab",homeworkId: "graph",nodeId: "logbook",completionId:"launch-1",result: {completed: true,accuracy: 0.83,timeSpent_ms: 1000}});
    expect(completion).toHaveProperty("outcome", {completed: true,accuracy: academicAccuracy ?? undefined,timeSpent_ms: 1000});
  });

  it("posts Discovery facts and completion to the assignment endpoints", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await postDiscoveryAttempt({ childId: "reina", homeworkId: "hw-1", attempt: { attemptId: "a1" } });
    await postDiscoveryComplete({ childId: "reina", homeworkId: "hw-1" });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/learning/reina/assignments/hw-1/discovery/attempt",
      "/api/learning/reina/assignments/hw-1/discovery/complete",
    ]);
  });

  it("posts the actual node identity and completion payload before showing post-activity UI", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ lifecycle: "baseline_active", revision: 3 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await postCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: "hw-math",
      nodeId: "fact-blaster",
      completionId: "launch-1",
      result: { completed: true, accuracy: 1, timeSpent_ms: 1200 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learning-cycle/node-complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          childId: "reina",
          homeworkId: "hw-math",
          nodeId: "fact-blaster",
          result: { completed: true, accuracy: 1, timeSpent_ms: 1200, sessionId: "launch-1" },
        }),
      }),
    );
  });
});


it("joins separately reported instrument friction to its canonical attempt", () => {
  const coordinator = new DiscoveryAcademicCompletionCoordinator();
  coordinator.recordInstrumentSignals("graph", ["reading_friction"]);
  expect(coordinator.prepareAttempt({ itemId: "graph", instrumentSignals: [] })).toMatchObject({ instrumentSignals: ["reading_friction"] });
  expect(coordinator.prepareAttempt({ itemId: "other", instrumentSignals: [] })).toMatchObject({ instrumentSignals: [] });
});


it("keeps an explicit Skip unscored while satisfying the attempt transport contract", () => {
  const coordinator=new DiscoveryAcademicCompletionCoordinator();
  expect(coordinator.prepareAttempt({itemId:"one",attemptedValue:null,instrumentSignals:["response_not_captured"]})).toMatchObject({attemptedValue:"",instrumentSignals:["response_not_captured"]});
  expect(coordinator.prepareAttempt({itemId:"one",attemptedValue:null,instrumentSignals:[]})).toMatchObject({attemptedValue:null});
});
