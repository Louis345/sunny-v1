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

  it("includes scene description so companion knows what child sees", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    ctx.updateCanvas({
      mode: "teaching",
      content: "How much money do I need to buy these cookies?",
      sceneDescription: "Cookie shop. Oatmeal cookie 10¢, Chocolate chip cookie 15¢, Sugar cookie 10¢.",
      svg: "<svg>...</svg>",
    });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).toContain("Cookie shop");
    expect(injection).toContain("Oatmeal cookie 10¢");
    expect(injection).toContain("Scene on screen");
  });

  it("includes answer and hint so companion can grade and help", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    ctx.updateCanvas({
      mode: "teaching",
      content: "How much money do I need to buy these cookies?",
      sceneDescription: "Cookie shop. Oatmeal 10¢, Chocolate chip 15¢.",
      problemAnswer: "25 cents",
      problemHint: "Add the price of the oatmeal cookie and the chocolate chip cookie.",
    });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).toContain("Correct answer: 25 cents");
    expect(injection).toContain("Hint");
    expect(injection).toContain("Add the price");
  });

  it("scene description is absent when canvas has no scene set", () => {
    const ctx = createSessionContext({ childName: "Ila", sessionType: "freeform" });
    ctx.updateCanvas({ mode: "teaching", content: "cat" });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).not.toContain("Scene on screen");
    expect(injection).not.toContain("Correct answer");
  });

  it("showCanvas from companion clears problem-specific fields", () => {
    const ctx = createSessionContext({ childName: "Reina", sessionType: "worksheet" });
    ctx.updateCanvas({
      mode: "teaching",
      content: "Old question",
      sceneDescription: "Old scene",
      problemAnswer: "Old answer",
      problemHint: "Old hint",
    });
    // Companion-driven canvas update clears problem fields
    ctx.updateCanvas({
      mode: "teaching",
      content: "New content",
      sceneDescription: undefined,
      problemAnswer: undefined,
      problemHint: undefined,
    });
    const injection = buildCanvasContextMessage(ctx);
    expect(injection).not.toContain("Old scene");
    expect(injection).not.toContain("Old answer");
    expect(injection).not.toContain("Old hint");
  });
});
