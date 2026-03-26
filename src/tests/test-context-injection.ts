/**
 * Contract: Every call to runAgent must include a canvas state snapshot
 * so Claude knows what the child currently sees.
 */
import { describe, it, expect } from "vitest";
import { buildCanvasContextMessage, createSessionContext } from "../server/session-context";

describe("canvas context injection", () => {
  it("generates a context string describing current canvas state", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    ctx.updateCanvas({
      mode: "teaching",
      content: "Which coin is 25 cents?",
    });

    const injection = buildCanvasContextMessage(ctx);
    expect(injection).toContain("teaching");
    expect(injection).toContain("Which coin is 25 cents?");
    expect(injection).toContain("server");
  });

  it("includes ownership info so Claude knows not to call showCanvas", () => {
    const ctx = createSessionContext({ childName: "Ila", sessionType: "worksheet" });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).toContain("server-driven");
    expect(injection).toContain("Do not call showCanvas");
  });

  it("companion-owned canvas tells Claude she can use showCanvas", () => {
    const ctx = createSessionContext({ childName: "Ila", sessionType: "freeform" });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).not.toContain("Do not call showCanvas");
  });

  it("idle canvas produces a minimal context string", () => {
    const ctx = createSessionContext({ childName: "Ila", sessionType: "freeform" });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).toContain("idle");
  });

  it("includes assignment progress for worksheet sessions", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    ctx.assignment = {
      questions: [
        { index: 0, text: "Q1: 25 cents", answerType: "multiple_choice" },
        { index: 1, text: "Q2: 50 cents", answerType: "multiple_choice" },
      ],
      currentIndex: 1,
      attempts: [{ questionIndex: 0, answer: "quarter", correct: true, timestamp: new Date().toISOString() }],
    };
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).toContain("Question 2 of 2");
  });
});
