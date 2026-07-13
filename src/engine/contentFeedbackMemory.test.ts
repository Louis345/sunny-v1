import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendContentFeedbackLesson,
  distillContentFeedbackSummary,
  pickBaselineBriefIndexFromFeedback,
  readContentFeedbackLessons,
} from "./contentFeedbackMemory";

describe("contentFeedbackMemory", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-feedback-"));
  const childId = "demo-pashley";
  const childDir = path.join(rootDir, "src", "context", childId);
  fs.mkdirSync(childDir, { recursive: true });

  afterEach(() => {
    const file = path.join(rootDir, "src", "context", childId, "content_feedback.ndjson");
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  it("appends and distills lessons", () => {
    appendContentFeedbackLesson(rootDir, childId, {
      mechanic: "timer rush",
      theme: "space",
      decision: "reject",
      reason: "timer stressed Reina",
      source: "human_review",
    });
    appendContentFeedbackLesson(rootDir, childId, {
      mechanic: "array builder",
      theme: "monster",
      decision: "approve",
      reason: "fun and clear",
      source: "human_review",
    });
    const lessons = readContentFeedbackLessons(rootDir, childId);
    const summary = distillContentFeedbackSummary(lessons);
    expect(lessons).toHaveLength(2);
    expect(summary).toContain("Avoid mechanics");
    expect(summary).toContain("array builder");
  });

  it("distills board route picks from child_choice lessons", () => {
    appendContentFeedbackLesson(rootDir, childId, {
      mechanic: "Fraction Forge",
      theme: "challenge, visual",
      decision: "approve",
      reason: "Child chose route Fraction Forge over Puzzle Path",
      source: "child_choice",
    });
    const summary = distillContentFeedbackSummary(readContentFeedbackLessons(rootDir, childId));
    expect(summary).toContain("Board route picks");
    expect(summary).toContain("Fraction Forge");
  });

  it("pickBaselineBriefIndexFromFeedback prefers child route picks and avoids rejected mechanics", () => {
    const briefs = [
      { mechanic: "Falling targets show products; blast the one that matches the spoken fact.", theme: "space arcade" },
      { mechanic: "Drag items into rows and columns to build the fact before the timer fills.", theme: "builder puzzle" },
    ];
    const lessons = [
      {
        ts: "2026-07-10T00:00:00.000Z",
        childId,
        mechanic: "Falling targets show products; blast the one that matches the spoken fact.",
        decision: "reject" as const,
        reason: "Timer pressure felt stressful",
        source: "human_review" as const,
      },
      {
        ts: "2026-07-10T00:01:00.000Z",
        childId,
        mechanic: "Array Builder",
        theme: "builder, control",
        decision: "approve" as const,
        reason: "Child chose builder route",
        source: "child_choice" as const,
      },
    ];
    expect(pickBaselineBriefIndexFromFeedback(briefs, lessons)).toBe(1);
  });
});
