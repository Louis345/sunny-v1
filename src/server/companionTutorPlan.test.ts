import { expect, it, vi } from "vitest";

/**
 * 2026-11-09 Ila: the Planner decided "stop re-teaching; make her produce the words herself", and Elli, who never
 * saw that plan, spelled carnivore letter by letter for her all morning. The owner caught it reading the journal
 * beside the session ("the teacher and the aide must be in sync"); the logs had both halves but nothing joined
 * them; the lab tested Elli's context for the board and the test date, never for the Planner's plan.
 * Elli now hears the Planner's current plan and what this stop is for, in the Planner's words: facts, no script.
 */
const cycle = {
  childId: "ila-lab", homeworkId: "hw-lab", domain: "spelling", lifecycle: "baseline_ready", createdAt: "2026-11-06T00:00:00.000Z", boards: [],
  nodes: [{ nodeId: "rush", title: "Type It Fast", role: "baseline", state: "ready", evidenceIds: [], focus: "the n in carnivore",
    openingScreen: { title: "Type It Fast", purpose: "Typed production of her six stuck words" }, evidenceContract: { spellingItems: {} } }],
  observations: [],
  decisionHistory: [
    { eventType: "theory_decided", decisionId: "d1", createdAt: "2026-11-05T00:00:00.000Z", reason: "older", selfReview: { whatIChangeNow: "Old plan." } },
    { eventType: "theory_decided", decisionId: "d2", createdAt: "2026-11-08T23:34:48.000Z", reason: "dormant failed four times on her own",
      change: ["Replace explainers with typed production."], selfReview: { whatITried: "x", whatHappened: "y", why: "z", whatIChangeNow: "Make her produce the words herself, no re-teaching." } },
  ],
};
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle, homework: { waterfall: { current: { testDate: null } } } }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(), readCompanionCareMemoryForPrompt: () => null }));

it("tells Elli the Planner's current plan and what this stop is for, in the Planner's words", async () => {
  const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
  const context = buildActivityCompanionContext({ childId: "ila-lab", companionId: "Elli", presence: "summoned",
    snapshot: { childId: "ila-lab", sessionId: "s", nodeId: "rush", game: "letter-rush", targetIsSpeakable: true, answerVisibility: "hidden",
      allowedActivities: [], updatedAt: "2026-11-09T12:45:00.000Z" } as never });
  expect(context).toContain("[Her tutor's plan (the Planner, in its own words)]");
  expect(context).toContain(`What the tutor changes now: "Make her produce the words herself, no re-teaching."`);
  expect(context).toContain(`- Replace explainers with typed production.`);
  expect(context).toContain(`This stop, "Type It Fast", is for: Typed production of her six stuck words. Aimed at: the n in carnivore.`);
  expect(context).not.toContain("Old plan.");
  const block = context.slice(context.indexOf("[Her tutor's plan"));
  expect(block.split("\n").filter(line => /\b(do not|don't|never|must not)\b/i.test(line))).toEqual([]);
});
