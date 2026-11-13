import { describe, expect, it } from "vitest";
import {
  answerHatchQuestion,
  createHatchHuntSession,
  expireHatchTimer,
  selectHatchEgg,
  type HatchHuntQuestion,
} from "../components/HatchHuntEngine";

const questions: HatchHuntQuestion[] = [
  {
    id: "guardian",
    prompt: "Which product equals 42?",
    answers: ["6 × 7", "5 × 8", "9 × 4"],
    correctAnswer: "6 × 7",
    difficulty: "guardian",
    seconds: null,
  },
  {
    id: "crack-1",
    prompt: "What is 8 × 7?",
    answers: ["54", "56", "64"],
    correctAnswer: "56",
    difficulty: "stretch",
    seconds: 15,
  },
  {
    id: "crack-2",
    prompt: "What is 9 × 6?",
    answers: ["45", "54", "63"],
    correctAnswer: "54",
    difficulty: "stretch",
    seconds: 12,
  },
  {
    id: "crack-3",
    prompt: "What is 12 × 4?",
    answers: ["44", "46", "48"],
    correctAnswer: "48",
    difficulty: "challenge",
    seconds: 9,
  },
  {
    id: "rescue",
    prompt: "Build 8 × 7 from 7 groups.",
    answers: ["49 + 7", "48 + 7", "42 + 7"],
    correctAnswer: "49 + 7",
    difficulty: "recovery",
    seconds: null,
  },
];

function beginHunt() {
  const created = createHatchHuntSession({
    encounterId: "mossy-demo-1",
    childId: "ila",
    creatureId: "mossback",
    eggIds: ["fern", "moon", "ember"],
    questions,
  });
  return selectHatchEgg(created, "fern");
}

describe("Hatch Hunt engine", () => {
  it("uses the matching Planner-authored recovery after a missed guardian item", () => {
    const targetedQuestions: HatchHuntQuestion[] = questions.map((question) => ({
      ...question,
      targetId: question.id === "guardian" || question.id === "rescue" ? "fact:6x7" : question.id,
    }));
    let state = selectHatchEgg(createHatchHuntSession({
      encounterId: "planner-encounter",
      childId: "reina",
      creatureId: "mossback",
      eggIds: ["fern"],
      questions: targetedQuestions,
    }), "fern");

    state = answerHatchQuestion(state, { answer: "5 × 8", latencyMs: 1_200 });
    expect(state).toMatchObject({
      phase: "rescue",
      recoveryFromPhase: "guardian",
      currentQuestion: { id: "rescue", targetId: "fact:6x7" },
    });

    state = answerHatchQuestion(state, { answer: "49 + 7", latencyMs: 900 });
    expect(state).toMatchObject({
      phase: "cracking",
      crackCount: 0,
      currentQuestion: { id: "crack-1" },
      recoveryFromPhase: null,
    });
  });

  it("counts an assisted crack once and still presents the next independent item", () => {
    const assistedQuestions: HatchHuntQuestion[] = questions.map((question) => ({
      ...question,
      targetId: question.id === "crack-1" || question.id === "rescue" ? "fact:8x7" : question.id,
    }));
    let state = selectHatchEgg(createHatchHuntSession({
      encounterId: "planner-encounter",
      childId: "reina",
      creatureId: "mossback",
      eggIds: ["fern"],
      questions: assistedQuestions,
    }), "fern");
    state = answerHatchQuestion(state, { answer: "6 × 7", latencyMs: 1_000 });
    state = answerHatchQuestion(state, { answer: "54", latencyMs: 1_000 });
    state = answerHatchQuestion(state, { answer: "49 + 7", latencyMs: 1_000 });

    expect(state).toMatchObject({
      phase: "cracking",
      crackCount: 1,
      currentQuestion: { id: "crack-2" },
    });
  });

  it("discovers Mossy for the orb chase without creating a Farm reward", () => {
    let state = beginHunt();

    expect(state).toMatchObject({
      phase: "guardian",
      selectedEggId: "fern",
      crackCount: 0,
    });
    expect(state.currentQuestion?.seconds).toBeNull();

    state = answerHatchQuestion(state, {
      answer: "6 × 7",
      latencyMs: 6_200,
    });
    expect(state).toMatchObject({ phase: "cracking", crackCount: 0 });
    expect(state.currentQuestion?.seconds).toBe(15);

    state = answerHatchQuestion(state, { answer: "56", latencyMs: 4_100 });
    state = answerHatchQuestion(state, { answer: "54", latencyMs: 5_300 });
    state = answerHatchQuestion(state, { answer: "48", latencyMs: 7_800 });

    expect(state).toMatchObject({
      phase: "hatched",
      crackCount: 3,
      discovery: {
        encounterId: "mossy-demo-1",
        childId: "ila",
        creatureId: "mossback",
        selectedEggId: "fern",
        crackCount: 3,
        next: "orb_chase",
      },
    });
    expect(state).not.toHaveProperty("reward");
    expect(state.events.at(-1)).toMatchObject({
      type: "egg_hatched",
      evidenceClass: "engagement_only",
      masteryClaimAllowed: false,
    });
  });

  it("reseals a crack and offers one recovery question before the egg is lost", () => {
    let state = beginHunt();
    state = answerHatchQuestion(state, {
      answer: "6 × 7",
      latencyMs: 5_000,
    });
    state = answerHatchQuestion(state, { answer: "56", latencyMs: 4_000 });
    state = answerHatchQuestion(state, { answer: "63", latencyMs: 3_200 });

    expect(state).toMatchObject({
      phase: "rescue",
      crackCount: 0,
      recoveryUsed: true,
    });
    expect(state.events.slice(-2)).toMatchObject([
      { type: "shell_resealed", evidenceClass: "engagement_only" },
      { type: "rescue_started", evidenceClass: "engagement_only" },
    ]);

    state = answerHatchQuestion(state, {
      answer: "48 + 7",
      latencyMs: 8_000,
    });
    expect(state).toMatchObject({
      phase: "lost",
      discovery: null,
    });
    expect(state.events.at(-1)).toMatchObject({
      type: "egg_attempt_lost",
      evidenceClass: "engagement_only",
      masteryClaimAllowed: false,
    });
  });

  it("treats timer expiry as a confounded observation and never a mastery claim", () => {
    let state = beginHunt();
    state = answerHatchQuestion(state, {
      answer: "6 × 7",
      latencyMs: 5_000,
    });
    state = expireHatchTimer(state);

    expect(state.phase).toBe("rescue");
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "timer_expired",
        evidenceClass: "academic_observation",
        confounds: ["time_pressure"],
        masteryClaimAllowed: false,
      }),
    );
  });

  it("records answers and egg behavior as separate evidence streams", () => {
    let state = beginHunt();
    expect(state.events.at(-1)).toMatchObject({
      type: "egg_selected",
      evidenceClass: "engagement_only",
    });

    state = answerHatchQuestion(state, {
      answer: "6 × 7",
      latencyMs: 5_500,
    });
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "guardian_answered",
        questionId: "guardian",
        correct: true,
        latencyMs: 5_500,
        evidenceClass: "academic_observation",
        masteryClaimAllowed: false,
      }),
    );
  });
});
