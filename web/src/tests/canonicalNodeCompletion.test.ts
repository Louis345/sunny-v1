import { afterEach, describe, expect, it, vi } from "vitest";
import { hasCanonicalLearningCycle, postCanonicalNodeCompletion, postDiscoveryAttempt, postDiscoveryComplete } from "../utils/canonicalNodeCompletion";

describe("canonical node completion handoff", () => {
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
