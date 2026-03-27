/**
 * Contract: Canvas traffic light. Only one thing on screen at a time.
 */
import { describe, it, expect } from "vitest";
import { createWorksheetSession } from "../server/worksheet-tools";

const oneProblem = [
  {
    id: "1",
    question: "Q1",
    canonicalAnswer: "A1",
    hint: "H1",
    facts: { leftCents: 10, rightCents: 20 },
  },
];

describe("canvas mutex (traffic light)", () => {
  it("starts with canvas idle", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });
    expect(session.getSessionStatus().canvasShowing).toBe("idle");
  });

  it("getNextProblem locks canvas to worksheet_pdf", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });
    session.getNextProblem();
    expect(session.getSessionStatus().canvasShowing).toBe("worksheet_pdf");
  });

  it("launchGame rejects when worksheet is showing", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });
    session.getNextProblem();

    const result = session.launchGame({ name: "store-game", type: "tool" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("canvas occupied");
  });

  it("launchGame succeeds after clearCanvas", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });
    session.getNextProblem();
    session.clearCanvas();

    expect(session.getSessionStatus().canvasShowing).toBe("idle");

    const result = session.launchGame({ name: "store-game", type: "tool" });
    expect(result.ok).toBe(true);
    expect(session.getSessionStatus().canvasShowing).toBe("store-game");
  });

  it("getNextProblem rejects when game is showing", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });
    session.launchGame({ name: "store-game", type: "tool" });

    const result = session.getNextProblem();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("canvas occupied");
  });

  it("clearCanvas resets to idle from any state", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    session.launchGame({ name: "space-invaders", type: "reward" });
    expect(session.getSessionStatus().canvasShowing).toBe("space-invaders");

    session.clearCanvas();
    expect(session.getSessionStatus().canvasShowing).toBe("idle");
  });

  it("clearCanvas on idle is a no-op (not an error)", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    const result = session.clearCanvas();
    expect(result.ok).toBe(true);
    expect(session.getSessionStatus().canvasShowing).toBe("idle");
  });

  it("getNextProblem succeeds on idle canvas", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    const result = session.getNextProblem();
    expect(result.ok).toBe(true);
  });

  it("getNextProblem succeeds when canvas already shows worksheet_pdf", () => {
    const session = createWorksheetSession({
      childName: "Reina",
      companionName: "Matilda",
      problems: oneProblem,
      rewardThreshold: 1,
      rewardGame: "space-invaders",
    });

    session.getNextProblem();
    const result = session.getNextProblem();
    expect(result.ok).toBe(true);
    expect(result.problemId).toBe("1");
  });
});
