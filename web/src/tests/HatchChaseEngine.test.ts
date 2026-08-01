import { describe, expect, it } from "vitest";
import {
  answerHatchChaseQuestion,
  answerHatchChaseRecovery,
  completeHatchChaseWorkedSupport,
  createHatchChaseSession,
  expireHatchChaseTimer,
  recordHatchChaseThrow,
  type HatchChaseQuestion,
} from "../components/HatchChaseEngine";

const questions: HatchChaseQuestion[] = [
  {
    id: "chase-1",
    prompt: "What is 11 × 6?",
    answers: ["56", "66", "76"],
    correctAnswer: "66",
    seconds: 15,
    recovery: {
      prompt: "Build 11 × 6 from 10 × 6 plus one more 6.",
      answers: ["60 + 6", "60 + 5", "50 + 6"],
      correctAnswer: "60 + 6",
      workedAnswer: "10 groups make 60. One more group adds 6, so 60 + 6 = 66.",
    },
  },
  {
    id: "chase-2",
    prompt: "What is 9 × 8?",
    answers: ["63", "72", "81"],
    correctAnswer: "72",
    seconds: 12,
    recovery: {
      prompt: "Use 10 × 8, then remove one group of 8.",
      answers: ["80 - 8", "80 - 9", "70 + 8"],
      correctAnswer: "80 - 8",
      workedAnswer: "Ten groups make 80. Removing one group gives 80 - 8 = 72.",
    },
  },
  {
    id: "chase-3",
    prompt: "What is 12 × 7?",
    answers: ["74", "84", "94"],
    correctAnswer: "84",
    seconds: 9,
    recovery: {
      prompt: "Combine 10 × 7 and 2 × 7.",
      answers: ["70 + 14", "70 + 12", "60 + 14"],
      correctAnswer: "70 + 14",
      workedAnswer: "Ten groups make 70 and two groups make 14, so the total is 84.",
    },
  },
];

function beginChase() {
  return createHatchChaseSession({
    encounterId: "mossy-demo-1",
    childId: "ila",
    creatureId: "mossback",
    questions,
    orbCount: 3,
  });
}

describe("Hatch chase engine", () => {
  it("charges three orbs from three timed questions", () => {
    let state = beginChase();
    state = answerHatchChaseQuestion(state, { answer: "66", latencyMs: 4_000 });
    state = answerHatchChaseQuestion(state, { answer: "72", latencyMs: 5_000 });
    state = answerHatchChaseQuestion(state, { answer: "84", latencyMs: 6_000 });

    expect(state).toMatchObject({ phase: "capture_ready", chargedOrbs: 3, remainingOrbs: 3 });
    expect(state.events.filter((event) => event.type === "chase_orb_charged")).toHaveLength(3);
    expect(state.events.filter((event) => event.type === "chase_question_answered")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ confounds: ["time_pressure"], masteryClaimAllowed: false }),
      ]),
    );
  });

  it("uses bounded assisted recovery without turning assistance into mastery", () => {
    let state = beginChase();
    state = expireHatchChaseTimer(state);

    expect(state).toMatchObject({ phase: "recovery", chargedOrbs: 0 });
    expect(state.events.at(-1)).toMatchObject({
      type: "chase_recovery_started",
      evidenceClass: "support",
      masteryClaimAllowed: false,
    });

    state = answerHatchChaseRecovery(state, { answer: "60 + 5", latencyMs: 8_000 });
    expect(state).toMatchObject({ phase: "worked_support", chargedOrbs: 0 });
    expect(state.currentQuestion?.recovery.workedAnswer).toContain("60 + 6 = 66");

    state = completeHatchChaseWorkedSupport(state);
    expect(state).toMatchObject({ phase: "questions", chargedOrbs: 1 });
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "chase_orb_charged",
        evidenceClass: "engagement_only",
        assistance: "worked_solution",
        masteryClaimAllowed: false,
      }),
    );
  });

  it("spends finite throws, retreats at zero, and never creates an ownership reward", () => {
    let state = beginChase();
    state = answerHatchChaseQuestion(state, { answer: "66", latencyMs: 4_000 });
    state = answerHatchChaseQuestion(state, { answer: "72", latencyMs: 4_000 });
    state = answerHatchChaseQuestion(state, { answer: "84", latencyMs: 4_000 });

    state = recordHatchChaseThrow(state, { result: "miss", hitDistance: 130 });
    state = recordHatchChaseThrow(state, { result: "miss", hitDistance: 118 });
    state = recordHatchChaseThrow(state, { result: "miss", hitDistance: 102 });

    expect(state).toMatchObject({ phase: "retreated", remainingOrbs: 0, capture: null });
    expect(state).not.toHaveProperty("reward");
    expect(state.events.at(-1)).toMatchObject({
      type: "creature_retreated",
      evidenceClass: "engagement_only",
      masteryClaimAllowed: false,
    });
  });

  it("correlates a successful capture to the original encounter", () => {
    let state = beginChase();
    state = answerHatchChaseQuestion(state, { answer: "66", latencyMs: 4_000 });
    state = answerHatchChaseQuestion(state, { answer: "72", latencyMs: 4_000 });
    state = answerHatchChaseQuestion(state, { answer: "84", latencyMs: 4_000 });
    state = recordHatchChaseThrow(state, { result: "capture", hitDistance: 22 });

    expect(state).toMatchObject({
      phase: "captured",
      capture: {
        encounterId: "mossy-demo-1",
        childId: "ila",
        creatureId: "mossback",
        source: "hatch_hunt_orb_capture",
      },
    });
  });
});
