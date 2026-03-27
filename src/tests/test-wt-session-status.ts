/**
 * Contract: getSessionStatus returns a complete snapshot of session state.
 * Claude calls this whenever she needs to orient herself.
 * No side effects — pure read.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createWorksheetSession,
  type WorksheetSession,
} from "../server/worksheet-tools";

describe("getSessionStatus", () => {
  let session: WorksheetSession;

  beforeEach(() => {
    session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: [
        {
          id: "1",
          question: "Which student has more money?",
          canonicalAnswer: "right student (75¢ vs 51¢)",
          hint: "Count the quarters",
          facts: { leftCents: 51, rightCents: 75 },
        },
        {
          id: "2",
          question: "Which child on the wagon has more?",
          canonicalAnswer: "right child (35¢ vs 18¢)",
          hint: "Start with the biggest coin",
          facts: { leftCents: 18, rightCents: 35 },
        },
        {
          id: "3",
          question: "Which girl has more money?",
          canonicalAnswer: "left girl (62¢ vs 52¢)",
          hint: "Count carefully",
          facts: { leftCents: 62, rightCents: 52 },
        },
      ],
      rewardThreshold: 3,
      rewardGame: "space-invaders",
    });
  });

  it("returns correct initial state", () => {
    const status = session.getSessionStatus();
    expect(status.sessionType).toBe("worksheet");
    expect(status.childName).toBe("Reina");
    expect(status.problemsTotal).toBe(3);
    expect(status.problemsCompleted).toBe(0);
    expect(status.currentProblemId).toBeNull();
    expect(status.canvasShowing).toBe("idle");
    expect(status.rewardEarned).toBe(false);
    expect(status.rewardThreshold).toBe(3);
  });

  it("reflects state after presenting a problem", () => {
    session.getNextProblem();
    const status = session.getSessionStatus();
    expect(status.currentProblemId).toBe("1");
    expect(status.canvasShowing).toBe("worksheet_pdf");
    expect(status.problemsCompleted).toBe(0);
  });

  it("reflects state after submitting a correct answer", () => {
    session.getNextProblem();
    session.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "seventy five cents",
    });
    const status = session.getSessionStatus();
    expect(status.problemsCompleted).toBe(1);
    expect(status.currentProblemId).toBeNull();
  });

  it("tracks reward earned after threshold", () => {
    session.getNextProblem();
    session.submitAnswer({ problemId: "1", correct: true, childSaid: "right" });
    session.getNextProblem();
    session.submitAnswer({ problemId: "2", correct: true, childSaid: "right" });
    session.getNextProblem();
    session.submitAnswer({ problemId: "3", correct: true, childSaid: "left" });
    const status = session.getSessionStatus();
    expect(status.rewardEarned).toBe(true);
    expect(status.problemsCompleted).toBe(3);
  });

  it("has no side effects — calling it twice returns same state", () => {
    const a = session.getSessionStatus();
    const b = session.getSessionStatus();
    expect(a).toEqual(b);
  });
});
