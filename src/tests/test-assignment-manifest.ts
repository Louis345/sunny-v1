/**
 * Contract: A homework PDF or structured input produces an AssignmentManifest
 * with typed questions the session-manager can drive.
 */
import { describe, it, expect } from "vitest";
import type { AssignmentManifest, AssignmentQuestion } from "../server/session-context";

describe("assignment manifest structure", () => {
  it("has required fields", () => {
    const manifest: AssignmentManifest = {
      childName: "Reina",
      title: "Matilda Worksheet — March 25",
      questions: [
        { index: 0, text: "Which coin is worth 25 cents?", answerType: "multiple_choice", options: ["Penny", "Nickel", "Dime", "Quarter"], correctAnswer: "Quarter" },
        { index: 1, text: "Which coin is worth 10 cents?", answerType: "multiple_choice", options: ["Penny", "Nickel", "Dime", "Quarter"], correctAnswer: "Dime" },
      ],
      source: "worksheet_pdf",
      createdAt: new Date().toISOString(),
    };
    expect(manifest.questions.length).toBeGreaterThan(0);
    expect(manifest.questions[0].index).toBe(0);
    expect(manifest.questions[0].answerType).toBeDefined();
  });

  it("questions have sequential indices starting at 0", () => {
    const questions: AssignmentQuestion[] = [
      { index: 0, text: "Q1", answerType: "open" },
      { index: 1, text: "Q2", answerType: "open" },
      { index: 2, text: "Q3", answerType: "multiple_choice", options: ["A", "B"], correctAnswer: "A" },
    ];
    questions.forEach((q, i) => {
      expect(q.index).toBe(i);
    });
  });

  it("supports multiple answer types", () => {
    const types: AssignmentQuestion["answerType"][] = ["multiple_choice", "open", "numeric", "syllable_division"];
    expect(types.length).toBe(4);
  });
});
