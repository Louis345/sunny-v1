/**
 * Worksheet session: submitAnswer when model calls sessionLog before the next canvasShow
 * (activeProblemId cleared after correct answer, but host index already points at next problem).
 */
import { describe, it, expect } from "vitest";
import { createWorksheetSession } from "../server/worksheet-tools";

const P1 = {
  id: "1",
  question: "q1",
  hint: "h1",
  page: 1,
  linkedGames: [] as string[],
};
const P2 = {
  id: "2",
  question: "q2",
  hint: "h2",
  page: 1,
  linkedGames: [] as string[],
};

function makeSession() {
  return createWorksheetSession({
    childName: "Test",
    companionName: "Sunny",
    problems: [P1, P2],
    rewardThreshold: 2,
    rewardGame: "space-invaders",
  });
}

describe("worksheet submitAnswer (implicit next problem)", () => {
  it("logs next problem without showProblemById after prior correct (Option C ordering bug)", () => {
    const s = makeSession();
    expect(s.showProblemById("1").ok).toBe(true);
    const r1 = s.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "twenty eight cents",
    });
    expect(r1.ok).toBe(true);
    expect(s.getSessionStatus().currentProblemId).toBe(null);

    const r2 = s.submitAnswer({
      problemId: "2",
      correct: true,
      childSaid: "seventy cents",
    });
    expect(r2.ok).toBe(true);
    expect(r2.logged).toBe(true);
    expect(r2.rewardEarned).toBe(true);
    expect(s.getAttemptLog()).toHaveLength(2);
  });

  it("rejects implicit submit when problemId does not match next pending", () => {
    const s = makeSession();
    s.showProblemById("1");
    s.submitAnswer({ problemId: "1", correct: true, childSaid: "ok" });

    const bad = s.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "stale",
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/no active problem|mismatch/);
  });

  it("rejects implicit submit when no pending problem remains", () => {
    const s = makeSession();
    s.showProblemById("1");
    s.submitAnswer({ problemId: "1", correct: true, childSaid: "a" });
    s.submitAnswer({ problemId: "2", correct: true, childSaid: "b" });

    const again = s.submitAnswer({
      problemId: "2",
      correct: true,
      childSaid: "repeat",
    });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already completed|no active problem/);
  });

  it("rejects implicit correct when childSaid recycles prior problem (Ila ordering bug)", () => {
    const s = makeSession();
    s.showProblemById("1");
    expect(
      s.submitAnswer({
        problemId: "1",
        correct: true,
        childSaid: "twenty eight cents",
      }).ok,
    ).toBe(true);
    const bad = s.submitAnswer({
      problemId: "2",
      correct: true,
      childSaid: "twenty eight cents",
    });
    expect(bad.ok).toBe(false);
    expect(bad.logged).toBe(false);
    expect(String(bad.error)).toMatch(/prior problem|childSaid/i);
    expect(s.getAttemptLog()).toHaveLength(1);
  });

  it("rejects second correct sessionLog for the same problemId", () => {
    const s = makeSession();
    s.showProblemById("1");
    expect(
      s.submitAnswer({
        problemId: "1",
        correct: true,
        childSaid: "twenty eight cents",
      }).ok,
    ).toBe(true);
    expect(s.showProblemById("1").ok).toBe(true);
    const dup = s.submitAnswer({
      problemId: "1",
      correct: true,
      childSaid: "twenty eight cents",
    });
    expect(dup.ok).toBe(false);
    expect(dup.logged).toBe(false);
    expect(dup.error).toBe("already completed");
    expect(s.getAttemptLog()).toHaveLength(1);
  });

  it("rejects worksheet log while canvas shows a game", () => {
    const s = makeSession();
    s.showProblemById("1");
    s.submitAnswer({ problemId: "1", correct: true, childSaid: "a" });
    expect(s.clearCanvas().ok).toBe(true);
    expect(s.launchGame({ name: "space-invaders", type: "reward" }).ok).toBe(
      true,
    );

    const r = s.submitAnswer({
      problemId: "2",
      correct: true,
      childSaid: "b",
    });
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/canvas/i);
  });
});
