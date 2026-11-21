import { expect, it, vi } from "vitest";

/**
 * 2026-11-10 evening, Ila (BUGS.md "Elli repeats one check in a loop"): the Planner's plan said to check her keyboard
 * shows ABC; Elli asked four times in about 40 seconds while Ila talked about other things, delaying play.
 * Why the human caught it: he heard the same question again and again while his daughter waited to play.
 * Why the logs did not: each reply was a normal completed turn; nothing recorded that the plan line had already
 * been said, so a repeat looked like any other turn.
 * Why the lab missed it: the tutor-plan lab only checked that Elli receives the plan; it never played a second turn
 * to see that the same plan line arrives every turn as if new.
 * Now code tracks when Elli's reply carried a plan line and tells her that as a fact on later turns.
 */
const cycle = {
  childId: "ila-lab", homeworkId: "hw-lab", domain: "spelling", lifecycle: "baseline_ready", createdAt: "2026-11-10T00:00:00.000Z", boards: [],
  nodes: [{ nodeId: "rush", title: "Type It Fast", role: "baseline", state: "ready", evidenceIds: [], openingScreen: { title: "Type It Fast", purpose: "Typed words" }, evidenceContract: { spellingItems: {} } }],
  observations: [],
  decisionHistory: [{ eventType: "theory_decided", decisionId: "d9", createdAt: "2026-11-10T22:00:00.000Z", reason: "kana answers",
    change: ["Before play, check her keyboard shows ABC, not the Japanese input.", "Keep the typed production stops."],
    selfReview: { whatITried: "x", whatHappened: "y", why: "z", whatIChangeNow: "Typed production with an English keyboard." } }],
};
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle, homework: { waterfall: { current: { testDate: null } } } }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(), readCompanionCareMemoryForPrompt: () => null }));

const turn = async () => {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  const context = buildActivityCompanionContext({ childId: "ila-lab", companionId: "Elli", presence: "summoned",
    snapshot: { childId: "ila-lab", sessionId: "s", nodeId: "rush", game: "letter-rush", targetIsSpeakable: true, answerVisibility: "hidden",
      allowedActivities: [], updatedAt: "2026-11-10T22:01:00.000Z" } as never });
  return context.slice(context.indexOf("[Her tutor's plan"));
};

it("once Elli's reply carries a plan line, later turns tell her she already said it (and only that line)", async () => {
  const { noteCompanionReplyForTutorPlan } = await import("./urgentLearningSupport");
  expect(await turn()).not.toContain("already said");
  noteCompanionReplyForTutorPlan("ila-lab", "Hi Ila! I love your bow today.");
  expect(await turn()).not.toContain("already said");
  noteCompanionReplyForTutorPlan("ila-lab", "Quick check: does your keyboard show ABC up in the corner?");
  const block = await turn();
  const keyboardLine = block.split("\n").find(line => line.includes("keyboard shows ABC"))!;
  expect(keyboardLine).toContain(`You already said this to her: "Quick check: does your keyboard show ABC up in the corner?"`);
  expect(block.split("\n").find(line => line.includes("Keep the typed production"))).not.toContain("already said");
  expect(block.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
});

it("a new Planner decision starts its lines fresh", async () => {
  const { noteCompanionReplyForTutorPlan } = await import("./urgentLearningSupport");
  noteCompanionReplyForTutorPlan("ila-lab", "Does your keyboard show ABC?");
  expect(await turn()).toContain("already said");
  cycle.decisionHistory.push({ ...cycle.decisionHistory[0], decisionId: "d10" });
  expect(await turn()).not.toContain("already said");
});
