/**
 * Contract: getNextProblem returns the next unfinished problem and
 * signals the canvas to render it. Claude decides WHEN to call this.
 */
import { describe, it, expect } from "vitest";
import { createWorksheetSession } from "../server/worksheet-tools";

describe("getNextProblem", () => {
  it("returns first problem with all required fields", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Which student has more?",
          canonicalAnswer: "right (75\u00a2)",
          hint: "Count quarters",
          facts: { leftCents: 51, rightCents: 75 },
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    const result = session.getNextProblem();
    expect(result.ok).toBe(true);
    expect(result.problemId).toBe("1");
    expect(result.question).toBe("Which student has more?");
    expect(result.hint).toBe("Count quarters");
    expect(result.facts).toBeDefined();
    if (result.facts) {
      expect(result.facts.leftCents).toBe(51);
      expect(result.facts.rightCents).toBe(75);
    }
    expect(result.canvasRendered).toBe(true);
  });

  it("advances to next problem after submitAnswer", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 10, rightCents: 20 },
        },
        {
          id: "2",
          question: "Q2",
          canonicalAnswer: "A2",
          hint: "H2",
          facts: { leftCents: 30, rightCents: 40 },
        },
      ],
      rewardThreshold: 2,
      rewardGame: "space-invaders",
    });

    session.getNextProblem();
    session.submitAnswer({ problemId: "1", correct: true, childSaid: "twenty" });

    const result = session.getNextProblem();
    expect(result.ok).toBe(true);
    expect(result.problemId).toBe("2");
    expect(result.question).toBe("Q2");
  });

  it("returns error when all problems are done", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 10, rightCents: 20 },
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    session.getNextProblem();
    session.submitAnswer({ problemId: "1", correct: true, childSaid: "done" });

    const result = session.getNextProblem();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no more problems");
    expect(result.completed).toBe(true);
  });

  it("returns error when canvas is occupied by a game", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 10, rightCents: 20 },
        },
      ],
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    session.launchGame({ name: "store-game", type: "tool" });

    const result = session.getNextProblem();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("canvas occupied");
  });

  it("re-presents current problem if called again without submitAnswer", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 10, rightCents: 20 },
        },
        {
          id: "2",
          question: "Q2",
          canonicalAnswer: "A2",
          hint: "H2",
          facts: { leftCents: 30, rightCents: 40 },
        },
      ],
      rewardThreshold: 2,
      rewardGame: "space-invaders",
    });

    const first = session.getNextProblem();
    const second = session.getNextProblem();
    expect(first.problemId).toBe("1");
    expect(second.problemId).toBe("1");
  });
});
