import { describe, expect, it, vi } from "vitest";

// 2026-11-10 Ila (impulsive, answers fast): on "29, 26, 23, 20, ?" she typed 34 three times. Elli did not know she had
// already tried, what she typed, or that the game said it was wrong, so it could not judge whether to wait or help.
// Human caught it watching; logs held the answers but nothing gave them to the companion; the lab's children answer
// once. The companion now gets the attempt facts for the open problem and pace facts from her chart. Facts only.
const item = { id: "p1", prompt: "29, 26, 23, 20, ?", lineage: { measurementRole: "practice" }, response: { mode: "numeric", expected: 17 } };
const retry = (id: string, itemId: string, childResponse: string, correct: boolean, first: boolean) => ({ observationId: id, itemId, childResponse, result: { correct }, assistance: { status: "unassisted", scaffolds: [] }, provenance: "practice", observedAt: "2026-11-10T15:00:00Z", constructLinks: [], confounds: [first ? "first_try" : "retry"] });
const cycle = { childId: "lab-kid", homeworkId: "hw-math", domain: "math", lifecycle: "baseline_ready", boards: [], decisionHistory: [],
  observations: [retry("o1", "q1", "9", false, true), retry("o2", "q1", "9", false, false), retry("o3", "q1", "8", true, false), retry("o4", "q2", "5", true, true)],
  nodes: [{ nodeId: "kappa", title: "Kappa Hop", role: "baseline", state: "ready", evidenceIds: [], openingScreen: { purpose: "Patterns" }, evidenceContract: { itemContracts: { p1: item } } }] };
vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({ learningCycle: cycle, homework: { waterfall: { current: { testDate: null } } },
  demographics: { age: 8, grade: 3, diagnoses: ["ADHD"], attentionSpan: "short", learningStyle: "mixed" } }) }));
vi.mock("./companionInteractionMemory", () => ({ maybeCompactCompanionInteractionMemory: vi.fn(), recordCompanionInteractionEvent: vi.fn(), readCompanionCareMemoryForPrompt: () => null }));

describe("attempt facts for the open problem", () => {
  it("scores each answer by code as it arrives and reports tries, answers and time", async () => {
    const { noteItemOpened, noteItemAnswer, itemAttemptFacts } = await import("./itemAttemptFacts");
    const t0 = Date.parse("2026-11-10T15:00:00Z");
    noteItemOpened("lab-kid", "kappa", "p1", t0);
    expect(itemAttemptFacts("lab-kid", "kappa", "p1", t0 + 20_000)).toBe("This problem: on her screen 20 seconds; she has not answered it yet.");
    for (const [index, value] of ["34", "34", "34"].entries()) noteItemAnswer("lab-kid", "kappa", "p1", value, cycle as never, t0 + 25_000 + index * 3000);
    expect(itemAttemptFacts("lab-kid", "kappa", "p1", t0 + 40_000)).toBe(
      "This problem: on her screen 40 seconds; her answers so far: 34 (not right), 34 (not right), 34 (not right); her last answer 9 seconds ago, 3 seconds after the one before.");
  });

  it("gives the companion her attempts and her chart's pace facts while a problem is open", async () => {
    const { noteItemOpened, noteItemAnswer } = await import("./itemAttemptFacts");
    const { buildActivityCompanionContext } = await import("./urgentLearningSupport");
    noteItemOpened("lab-kid", "kappa", "p1", Date.now() - 30_000);
    noteItemAnswer("lab-kid", "kappa", "p1", "17", cycle as never, Date.now() - 5_000);
    const context = buildActivityCompanionContext({ childId: "lab-kid", companionId: "Elli", presence: "summoned",
      snapshot: { childId: "lab-kid", sessionId: "s", nodeId: "kappa", itemId: "p1", game: "generated-game", targetIsSpeakable: true, answerVisibility: "hidden", allowedActivities: [], updatedAt: new Date().toISOString() } as never });
    expect(context).toContain("17 (right)");
    expect(context).toContain("Her chart: diagnoses ADHD; attention span short");
    expect(context).toContain("first tries 2, right 1; she tried again after her first try on 1 problem; the same wrong answer twice in a row on 1 problem");
  });

  // 2026-11-13 Reina (AI-caught: 22 answers given, 18 saved): on problem 2 she typed 6, 6, then 8. Code logged
  // not-right, not-right, right, but her built game's summary at completion listed only one try, so she was saved as
  // right on her first try and two tries were lost. Why the logs did not stop it: the alert fired after the fact.
  // Why the lab missed it: its games summarize every try honestly. Code's own record of her tries now wins.
  it("saves every try code saw, in order, even when the game's summary lists fewer", async () => {
    const { finishItemAttempts, noteItemOpened, noteItemAnswer, takeServerTries, withServerTries } = await import("./itemAttemptFacts");
    noteItemOpened("lab-kid", "duel", "p2");
    for (const value of ["6", "6", "8"]) noteItemAnswer("lab-kid", "duel", "p2", value, cycle as never);
    noteItemAnswer("lab-kid", "duel", "p5", "9", cycle as never);
    finishItemAttempts("lab-kid", "duel"); // game_complete can arrive before the completion that saves the tries
    const tries = takeServerTries("lab-kid", "duel");
    expect(withServerTries([{ target: "p2", correct: true, attemptedValue: "8" }, { target: "p5", correct: true, attemptedValue: "9" }], tries)).toEqual([
      { target: "p2", correct: true, attemptedValue: "8", tries: [{ attemptedValue: "6" }, { attemptedValue: "6" }, { attemptedValue: "8" }] },
      { target: "p5", correct: true, attemptedValue: "9" },
    ]);
    expect(takeServerTries("lab-kid", "duel").size).toBe(0);
  });

  it("keeps the game's tries when the game saw more than code did", async () => {
    const { withServerTries } = await import("./itemAttemptFacts");
    const row = { target: "p3", correct: true, attemptedValue: "8", tries: [{ attemptedValue: "7" }, { attemptedValue: "8" }] };
    expect(withServerTries([row], new Map([["p3", [{ attemptedValue: "8" }]]]))).toEqual([row]);
  });

  it("marks only the tries made after a hint was shown on that problem", async () => {
    const { noteItemAnswer, noteItemHint, takeServerTries, withServerTries } = await import("./itemAttemptFacts");
    noteItemAnswer("lab-kid", "hinted", "p1", "34", cycle as never);
    noteItemHint("lab-kid", "hinted", "p1");
    noteItemAnswer("lab-kid", "hinted", "p1", "17", cycle as never);
    expect((withServerTries([{ target: "p1", correct: true, attemptedValue: "17" }], takeServerTries("lab-kid", "hinted"))[0] as { tries?: unknown }).tries)
      .toEqual([{ attemptedValue: "34" }, { attemptedValue: "17", hinted: true }]);
  });
});
