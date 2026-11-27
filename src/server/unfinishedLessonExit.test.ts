import { afterEach, expect, it, vi } from "vitest";
import { SessionManager } from "./session-manager";
import { getChildChart } from "../profiles/childChart";
import { buildCurrentBoardSnapshotContext, type CurrentBoardSnapshot } from "./currentBoardSnapshot";
vi.mock("../profiles/childChart", () => ({ getChildChart: vi.fn() }));
afterEach(() => vi.clearAllMocks());

function session() {
  vi.mocked(getChildChart).mockReturnValue({ learningCycle: null } as never);
  return Object.assign(Object.create(SessionManager.prototype), {
    companion: { name: "Elli" }, chartChildId: "lab-child", childName: "Lab", sessionTtsLabel: "Lab", sessionId: "s1", companionPresence: "collapsed", send: vi.fn(),
    debugRecorder: { recordEvent: vi.fn(), recordGameTrace: vi.fn() },
  }) as SessionManager;
}
const elliSees = (s: SessionManager) =>
  buildCurrentBoardSnapshotContext((s as unknown as { currentBoardSnapshot: CurrentBoardSnapshot }).currentBoardSnapshot);

// BUGS.md 2026-11-09 (Ila): she left Word Story Hooks before its last "Done", so the stop stayed ready and
// the board kept sending her back to it; nothing on screen or from Elli said why. The human saw her loop;
// the log showed the launches and the "closed" line but not where she left; the lab only checked that a
// lesson completes. Elli now keeps the fact of where she left it, and says it in her own words.
it("tells Elli she left a lesson before its last Done, and on which page", () => {
  const s = session();
  s.updateCurrentBoardSnapshot({ game: "visual-explainer", nodeId: "hooks", launchToken: "t1", phase: "model", itemIndex: 1, totalItems: 4, progress: "Spelling model shown" });
  s.updateCurrentBoardSnapshot({ phase: "closed", boardState: "map", nodeId: "hooks", launchToken: "t1" });
  expect(elliSees(s)).toMatch(/left this stop before its last Done, on page 2 of 4/);
});

it("says nothing about leaving early when the lesson finished", () => {
  const s = session();
  s.updateCurrentBoardSnapshot({ game: "visual-explainer", nodeId: "hooks", launchToken: "t1", phase: "model", itemIndex: 3, totalItems: 4 });
  s.updateCurrentBoardSnapshot({ nodeId: "hooks", launchToken: "t1", phase: "node_complete", completed: true });
  s.updateCurrentBoardSnapshot({ phase: "closed", boardState: "map", nodeId: "hooks", launchToken: "t1" });
  expect(elliSees(s)).not.toMatch(/before its last Done/);
});
