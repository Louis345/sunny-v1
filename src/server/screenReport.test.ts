import { expect, it } from "vitest";
import { describeScreenForCompanion, normalizeScreenReport } from "./screenReport";

// 2026-10-22 human catch: Elli described an "independent evaluation" while the kiosk showed "Planning your
// map". Startup guessed the screen from the voice wake setting, and the server kept whichever activity event
// arrived last. Logs never compared Elli's request with the visible screen, so every test of emitted events
// passed. One rule: the kiosk's own report is the only screen description, checked against the server board.
const activity = "[Internal live board state]\nCurrent activity: word-radar\nCurrent item: word-3";
// The homework's published boards, oldest first; the last one is the newest.
const boards = { published: ["b1", "b2"], newest: "b2" };

it("says the screen is unknown, and describes nothing, before the kiosk has reported", () => {
  const text = describeScreenForCompanion({ report: null, boards, activityContext: activity, activityNodeId: "radar" });
  expect(text).toMatch(/screen is unknown/i);
  expect(text).not.toContain("word-radar");
});

it("says the screen is updating when the kiosk shows a board this homework does not have", () => {
  const report = normalizeScreenReport({ screen: "board", boardId: "other-homework:board:1" })!;
  const text = describeScreenForCompanion({ report, boards, activityContext: activity, activityNodeId: "radar" });
  expect(text).toMatch(/updating/i);
  expect(text).not.toContain("word-radar");
});

it("describes the finished board the kiosk shows and says the next board is ready for the next visit", () => {
  const report = normalizeScreenReport({ screen: "board", boardId: "b1", boardTitle: "Long i Adventure" })!;
  const text = describeScreenForCompanion({ report, boards, activityContext: activity, activityNodeId: "radar" });
  expect(text).toContain("Long i Adventure");
  expect(text).toMatch(/next board is ready for the next visit/i);
});

it("describes the board without any leftover activity state when no activity is open", () => {
  const report = normalizeScreenReport({ screen: "board", boardId: "b2", boardTitle: "Long i Rescue" })!;
  const text = describeScreenForCompanion({ report, boards, activityContext: activity, activityNodeId: "radar" });
  expect(text).toContain("Long i Rescue");
  expect(text).toMatch(/no activity is open/i);
  expect(text).not.toContain("word-radar");
});

it("includes an activity's live state only when that exact activity is the one on screen", () => {
  const open = normalizeScreenReport({ screen: "activity", boardId: "b2", nodeId: "radar", activityTitle: "Final Radar" })!;
  expect(describeScreenForCompanion({ report: open, boards, activityContext: activity, activityNodeId: "radar" })).toContain("Current item: word-3");
  const opening = describeScreenForCompanion({ report: open, boards, activityContext: activity, activityNodeId: "letter-rush" });
  expect(opening).toMatch(/Final Radar is opening/);
  expect(opening).not.toContain("Current item");
});

it("describes the waiting screen from the kiosk's own words", () => {
  const report = normalizeScreenReport({ screen: "waiting", boardId: "b2", waiting: { step: "Your map is ready!", ready: 3, total: 3 } })!;
  const text = describeScreenForCompanion({ report, boards, activityContext: "", activityNodeId: undefined });
  expect(text).toContain("Your map is ready!");
  expect(text).toContain("3 of 3");
});

it("rejects a malformed report instead of guessing", () => {
  expect(normalizeScreenReport({ screen: "dance-party" })).toBeNull();
  expect(normalizeScreenReport("board")).toBeNull();
});

it("feeds Elli's real per-turn context: activity details appear only while the kiosk shows that activity", async () => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const { vi } = await import("vitest");
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-screen-report-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", root);
  try {
    const snapshot = { childId: "screen-lab", sessionId: "s", nodeId: "radar", itemId: "word-3", activityId: "word-radar", targetIsSpeakable: false,
      answerVisibility: "hidden" as const, allowedActivities: [], updatedAt: "now" };
    const turn = (report: unknown) => buildActivityCompanionContext({ snapshot, childId: "screen-lab", companionId: "Elli", presence: "summoned",
      screenReport: report === undefined ? null : normalizeScreenReport(report) });
    const onBoard = turn({ screen: "board", boardTitle: "Long i Rescue" });
    expect(onBoard).toContain("No activity is open");
    expect(onBoard).not.toMatch(/word-radar|word-3|Activity-help objective/);
    const inActivity = turn({ screen: "activity", nodeId: "radar", activityTitle: "Final Radar" });
    expect(inActivity).toContain("Final Radar is open");
    expect(inActivity).toContain("Current item: word-3");
    expect(inActivity).toContain("Activity-help objective");
    expect(turn(undefined)).toMatch(/screen is unknown/i);
  } finally {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
