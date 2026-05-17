import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateGeneratedArtifactRuntime,
  type GeneratedArtifactBrowserSnapshot,
} from "./generatedArtifactRuntimeValidator";

const WORDS = ["above", "ago", "about", "ahead", "away"];

function makeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-runtime-validator-"));
}

describe("generated artifact runtime validator", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails artifacts that render but do not emit real attempt evidence before completion", async () => {
    const dir = makeDir();
    dirs.push(dir);

    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body><button>Finish</button></body></html>",
      childId: "reina",
      stage: "quest",
      homeworkType: "spelling_test",
      words: WORDS,
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
      runBrowser: async (): Promise<GeneratedArtifactBrowserSnapshot> => ({
        screenshotPaths: [path.join(dir, "quest.png")],
        bodyText: "Finish",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: [{ target: "above", correct: true }],
        companionEvents: [],
        completionEvents: [{ completed: true, accuracy: 1, wordsAttempted: 1 }],
        validationHookResult: { used: true },
      }),
    });

    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/attempt event count/i);
    expect(report.runtimeValidation).toMatchObject({
      passed: false,
      attemptedTargets: 1,
      completed: true,
    });
  });

  it("passes when the browser run captures screenshots, attempt events, and completion", async () => {
    const dir = makeDir();
    dirs.push(dir);

    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body><button>Finish</button></body></html>",
      childId: "reina",
      stage: "quest",
      homeworkType: "spelling_test",
      words: WORDS,
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
      runBrowser: async (): Promise<GeneratedArtifactBrowserSnapshot> => ({
        screenshotPaths: [path.join(dir, "quest.png")],
        bodyText: "Quest ready",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: WORDS.map((target) => ({ target, correct: true })),
        companionEvents: [{ trigger: "correct_answer" }],
        completionEvents: [{ completed: true, accuracy: 1, wordsAttempted: WORDS.length }],
        validationHookResult: { used: true },
      }),
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.runtimeValidation).toMatchObject({
      passed: true,
      attemptedTargets: WORDS.length,
      completed: true,
      screenshotPaths: [path.join(dir, "quest.png")],
    });
  });
});
