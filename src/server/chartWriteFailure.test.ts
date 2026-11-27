import { afterEach, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { getChildChart } from "../profiles/childChart";
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn() }));
vi.mock("../chart/spelling/originalResponses", async original => ({
  ...await original<typeof import("../chart/spelling/originalResponses")>(),
  withOriginalSpellingChart: vi.fn(() => { throw new Error("chart_assignment_missing"); }),
}));
afterEach(() => vi.clearAllMocks());

function session() {
  vi.mocked(getChildChart).mockReturnValue({ learningCycle: { homeworkId: "hw-words", domain: "spelling", nodes: [{ nodeId: "opening", state: "ready", role: "evaluation", artifactBinding: { contractFingerprint: "frozen" }, evidenceContract: { spellingItems: { i1: { id: "i1", word: "night" } } } }] } } as never);
  const s = Object.assign(Object.create(SessionManager.prototype), {
    companion: { name: "Elli" }, chartChildId: "lab-child", childName: "Lab", sessionTtsLabel: "Lab", sessionId: "s1", companionPresence: "collapsed", send: vi.fn(),
    debugRecorder: { recordEvent: vi.fn(), recordGameTrace: vi.fn() },
  }) as SessionManager;
  s.updateCurrentBoardSnapshot({ phase: "launched", nodeId: "opening" });
  return s;
}

// BUGS.md 2026-11-07 (AI-caught in the demo): a chart write that throws took the whole kiosk down.
// A failed write must cost that one record, never the session or Elli's view of the current word.
it("keeps the session and the current word when saving a presented word fails", () => {
  const s = session();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => s.updateCurrentBoardSnapshot({ assessmentMode: true, nodeId: "opening", itemId: "i1", phase: "response", answerVisibility: "hidden" })).not.toThrow();
  expect((s as unknown as { currentBoardSnapshot?: { itemId?: string } }).currentBoardSnapshot?.itemId).toBe("i1");
  expect(error).toHaveBeenCalledWith(expect.stringContaining("[spelling-presentation] [chart-write] [failed]"), expect.any(Error));
  error.mockRestore();
});
