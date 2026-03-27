/**
 * Contract: submitAnswer logs the attempt and returns remaining count.
 */
import { describe, it, expect } from "vitest";
import { createWorksheetSession } from "../server/worksheet-tools";

describe("submitAnswer", () => {
  it("logs a correct answer and returns remaining count", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 51, rightCents: 75 },
        },
        {
          id: "2",
          question: "Q2",
          canonicalAnswer: "A2",
          hint: "H2",
          facts: { leftCents: 18, rightCents: 35 },
        },
      ],
      rewardThreshold: 2,
      rewardGame: "space-invaders",
    });

    session.getNextProblem();
    const result = session.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "seventy five cents",
    });

    expect(result.ok).toBe(true);
    expect(result.logged).toBe(true);
    expect(result.problemsRemaining).toBe(1);
    expect(result.rewardEarned).toBe(false);
  });

  it("logs an incorrect answer", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Q1",
          canonicalAnswer: "A1",
          hint: "H1",
          facts: { leftCents: 51, rightCents: 75 },
        },
        {
          id: "2",
          question: "Q2",
          canonicalAnswer: "A2",
          hint: "H2",
          facts: { leftCents: 18, rightCents: 35 },
        },
      ],
      rewardThreshold: 2,
      rewardGame: "space-invaders",
    });

    session.getNextProblem();
    const result = session.submitAnswer({
      problemId: "1",
      correct: false,
      childSaid: "fifty cents",
    });

    expect(result.ok).toBe(true);
    expect(result.logged).toBe(true);
    expect(result.problemsRemaining).toBe(2);
  });

  it("rejects submitAnswer when no problem is active", () => {
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

    const result = session.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no active problem");
  });

  it("rejects submitAnswer with wrong problemId", () => {
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
    const result = session.submitAnswer({
      problemId: "2",
      correct: true,
      childSaid: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("problemId mismatch");
  });

  it("signals reward earned when threshold is met", () => {
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
    const result = session.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "right",
    });

    expect(result.rewardEarned).toBe(true);
    expect(result.rewardGame).toBe("space-invaders");
    expect(result.problemsRemaining).toBe(0);
  });

  it("allows correct after multiple wrong", () => {
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
    session.submitAnswer({ problemId: "1", correct: false, childSaid: "wrong" });
    session.submitAnswer({
      problemId: "1",
      correct: false,
      childSaid: "wrong again",
    });
    const result = session.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "oh seventy five",
    });

    expect(result.ok).toBe(true);
    expect(result.problemsRemaining).toBe(1);
  });

  it("records all attempts in order", () => {
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
    session.submitAnswer({ problemId: "1", correct: false, childSaid: "ten" });
    session.submitAnswer({
      problemId: "1",
      correct: false,
      childSaid: "fifteen",
    });
    session.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "twenty",
    });

    const attempts = session.getAttemptLog();
    expect(attempts).toHaveLength(3);
    expect(attempts[0].correct).toBe(false);
    expect(attempts[0].childSaid).toBe("ten");
    expect(attempts[1].correct).toBe(false);
    expect(attempts[2].correct).toBe(true);
    expect(attempts[2].childSaid).toBe("twenty");
  });
});
