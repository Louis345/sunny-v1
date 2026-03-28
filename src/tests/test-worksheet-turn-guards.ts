import { describe, expect, it } from "vitest";
import {
  classifyWorksheetNonAnswerTranscript,
  isLikelyQuestionEcho,
} from "../server/worksheet-turn-guards";

const WAGON_Q =
  "Which child on the wagon has more money between the two children?";

describe("isLikelyQuestionEcho", () => {
  it("detects near-full repeat of the question", () => {
    expect(
      isLikelyQuestionEcho(
        "Which child on the wagon has more money between the two children",
        WAGON_Q,
      ),
    ).toBe(true);
  });

  it("is false when child adds an answer with amounts", () => {
    expect(
      isLikelyQuestionEcho(
        "The one with sixty two cents has more than fifty two",
        WAGON_Q,
      ),
    ).toBe(false);
  });
});

describe("classifyWorksheetNonAnswerTranscript", () => {
  it("rejects question echo without amount-like content", () => {
    const r = classifyWorksheetNonAnswerTranscript(WAGON_Q, WAGON_Q);
    expect(r).toEqual({
      nonAnswer: true,
      reason: "question_echo_not_answer",
    });
  });

  it("allows echo that also states amounts (real attempt)", () => {
    const r = classifyWorksheetNonAnswerTranscript(
      `${WAGON_Q} I think it's 62 cents.`,
      WAGON_Q,
    );
    expect(r.nonAnswer).toBe(false);
  });

  it("rejects clarification-only turns", () => {
    expect(
      classifyWorksheetNonAnswerTranscript("Which one?", WAGON_Q).nonAnswer,
    ).toBe(true);
    expect(
      classifyWorksheetNonAnswerTranscript("Which problem?", WAGON_Q).nonAnswer,
    ).toBe(true);
  });

  it("rejects wh-question shape about more money without numbers", () => {
    const r = classifyWorksheetNonAnswerTranscript(
      "Which girl has more money?",
      WAGON_Q,
    );
    expect(r).toEqual({
      nonAnswer: true,
      reason: "unanswered_question_shape",
    });
  });

  it("allows answer that includes amount words", () => {
    const r = classifyWorksheetNonAnswerTranscript(
      "The girl with sixty two cents",
      WAGON_Q,
    );
    expect(r.nonAnswer).toBe(false);
  });

  it("does not treat 'Yeah, so I counted eighteen cents' as standalone yeah", () => {
    const r = classifyWorksheetNonAnswerTranscript(
      "Yeah, so I wrote eighteen cents in the box.",
      WAGON_Q,
    );
    expect(r.nonAnswer).toBe(false);
  });

  it("treats standalone yeah as non-answer", () => {
    const r = classifyWorksheetNonAnswerTranscript("Yeah.", WAGON_Q);
    expect(r.nonAnswer).toBe(true);
  });
});
