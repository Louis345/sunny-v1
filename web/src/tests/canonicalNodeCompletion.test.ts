import { afterEach, describe, expect, it, vi } from "vitest";
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
          result: { completed: true, accuracy: 1, timeSpent_ms: 1200 },
        }),
      }),
    );
  });
});
