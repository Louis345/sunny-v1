import { afterEach, describe, expect, it, vi } from "vitest";
import { postCanonicalNodeCompletion } from "../utils/canonicalNodeCompletion";

describe("canonical node completion handoff", () => {
  afterEach(() => vi.unstubAllGlobals());

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
