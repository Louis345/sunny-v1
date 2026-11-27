import { expect, it, vi } from "vitest";

// 2026-11-09 Reina asked Matilda for the sweater numbers; Matilda said "read it off the screen", but they were not
// there. The human caught it; logs showed her turn; the lab never checked whether the companion knows the problem
// on screen. The companion is told the open problem as saved (never its answer): facts for her judgment.
const item = { id: "p11", prompt: "How many more sweaters were sold in January than March?", lineage: { measurementRole: "practice" },
  response: { mode: "numeric", expected: 231 } };
const cycle = { childId: "reina-lab", homeworkId: "hw-math", domain: "math", lifecycle: "baseline_ready", boards: [], observations: [], decisionHistory: [],
  nodes: [{ nodeId: "pin", title: "Borrow and Pin", role: "baseline", state: "ready", evidenceIds: [], openingScreen: { purpose: "Borrowing" }, evidenceContract: { itemContracts: { p11: item } } }] };
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle, homework: { waterfall: { current: { testDate: null } } } }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(), readCompanionCareMemoryForPrompt: () => null }));

it("tells the companion the problem on her screen, as saved, without its answer", async () => {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  const context = buildActivityCompanionContext({ childId: "reina-lab", companionId: "Matilda", presence: "summoned",
    snapshot: { childId: "reina-lab", sessionId: "s", nodeId: "pin", itemId: "p11", game: "generated-game", targetIsSpeakable: true, answerVisibility: "hidden", allowedActivities: [], updatedAt: "2026-11-09T22:17:00.000Z" } as never });
  expect(context).toContain(`[The problem she has open, as Sunny saved it]\n"How many more sweaters were sold in January than March?"`);
  expect(context).not.toContain("231");
});

// 2026-11-10 Ila, "subtract 3" (29, 26, 23, 20 -> 17): the game never said which problem was open, so Elli had no item
// facts, guessed from Ila counting aloud and told her to type 34 three times while the game rejected it. Human caught
// it watching; logs showed currentChallenge "Type where the kappa lands next" and no item; the lab's games always
// report their item. When no problem is bound, the companion is told plainly that it cannot see the problem.
it("tells the companion plainly when it cannot see which problem is on her screen", async () => {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  const blind = buildActivityCompanionContext({ childId: "reina-lab", companionId: "Elli", presence: "summoned",
    snapshot: { childId: "reina-lab", sessionId: "s", nodeId: "pin", game: "generated-game", currentChallenge: "Type where the kappa lands next", targetIsSpeakable: true, answerVisibility: "hidden", allowedActivities: [], updatedAt: "2026-11-10T15:00:00.000Z" } as never });
  expect(blind).toMatch(/cannot see which problem is on her screen/);
  const seeing = buildActivityCompanionContext({ childId: "reina-lab", companionId: "Elli", presence: "summoned",
    snapshot: { childId: "reina-lab", sessionId: "s", nodeId: "pin", itemId: "p11", game: "generated-game", targetIsSpeakable: true, answerVisibility: "hidden", allowedActivities: [], updatedAt: "2026-11-10T15:00:00.000Z" } as never });
  expect(seeing).not.toMatch(/cannot see which problem/);
});
