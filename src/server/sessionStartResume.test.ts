import { afterEach, describe, expect, it, vi } from "vitest";

const { advance, prepare } = vi.hoisted(() => ({
  advance: vi.fn(async () => ({}) as never),
  prepare: vi.fn(async () => ({ lifecycle: "quest_ready" }) as never),
}));
vi.mock("../engine/learningCycleRuntime", async (original) => ({ ...(await original<object>()), advanceCanonicalCycleFromEvidence: advance }));
vi.mock("../engine/canonicalProgressionGenerator", async (original) => ({ ...(await original<object>()), prepareSuccessorBoard: prepare }));
import { resumeSuccessorAtSessionStart } from "./session-bootstrap";

// 11/22 18:27 UTC: Sunny ran out of Anthropic credit while Ila's Quest→Boss decision was being bought. The refused
// request was never billed, but the decision waited for a server restart; her next session at 18:30, after the owner
// added credit, did not retry it, because session start resumed only a retry a person had approved. Why the human
// caught it: no Boss board the day before her test. Why the logs missed it: "[next-session] [deferred]" said nothing
// about when. Why the lab missed it: no test opened a session on an evaluating board without an approval.
const cycle = (lifecycle: string, extra: object = {}) => ({ childId: "ila", homeworkId: "hw", lifecycle, boards: [{ boardId: "b1", publishedAt: "x", nodeIds: [] }], nodes: [], decisionHistory: [], ...extra }) as never;
afterEach(() => vi.clearAllMocks());

describe("her next session finishes a decision that was left waiting", () => {
  it("decides and prepares the next board when her board is evaluating, approved or not", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await resumeSuccessorAtSessionStart(cycle("quest_evaluating"));
    expect(advance).toHaveBeenCalledWith({ childId: "ila", homeworkId: "hw" });
    expect(prepare).toHaveBeenCalledWith({ childId: "ila", homeworkId: "hw" });
  });

  it("leaves a board a person must unblock, and a board in play, alone", () => {
    expect(resumeSuccessorAtSessionStart(cycle("blocked"))).toBeNull();
    expect(resumeSuccessorAtSessionStart(cycle("quest_ready"))).toBeNull();
    expect(advance).not.toHaveBeenCalled();
  });
});
