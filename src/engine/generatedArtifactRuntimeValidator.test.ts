import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateGeneratedArtifactRuntime,
  type GeneratedArtifactBrowserSnapshot,
} from "./generatedArtifactRuntimeValidator";
import { resolveSyntheticChildBrowserAvailability } from "./syntheticChildBrowserDriver";

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
      engine: "playwright",
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
      engine: "playwright",
      passed: true,
      attemptedTargets: WORDS.length,
      completed: true,
      screenshotPaths: [path.join(dir, "quest.png")],
    });
  });

  it("fails closed when the Playwright browser run is unavailable", async () => {
    const dir = makeDir();
    dirs.push(dir);

    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body>Quest ready</body></html>",
      childId: "reina",
      stage: "quest",
      homeworkType: "spelling_test",
      words: WORDS,
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
      runBrowser: async () => {
        throw new Error("Playwright unavailable: playwright chromium browser is not installed");
      },
    });

    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toContain("Playwright unavailable");
    expect(report.runtimeValidation).toMatchObject({
      engine: "playwright",
      passed: false,
      screenshotPaths: [],
      attemptedTargets: 0,
      completed: false,
    });
  });

  it("runs the default Playwright validator against a real generated artifact", async () => {
    const availability = await resolveSyntheticChildBrowserAvailability();
    if (!availability.available) {
      expect(availability.reason).toContain("chromium");
      return;
    }
    const dir = makeDir();
    dirs.push(dir);

    const report = await validateGeneratedArtifactRuntime({
      html: `
        <html>
          <body>
            <main>Quest ready</main>
            <script>
              window.SUNNY_VALIDATION_HOOKS = {
                playthrough: async ({ words }) => {
                  for (const target of words) {
                    window.postMessage({ type: "attempt_event", payload: { target, correct: true } }, "*");
                  }
                  window.postMessage({
                    type: "node_complete",
                    payload: { completed: true, accuracy: 1, wordsAttempted: words.length }
                  }, "*");
                }
              };
            </script>
          </body>
        </html>
      `,
      childId: "reina",
      stage: "quest",
      homeworkType: "spelling_test",
      words: WORDS,
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
    });

    expect(report.passed).toBe(true);
    expect(report.runtimeValidation).toMatchObject({
      engine: "playwright",
      attemptedTargets: WORDS.length,
      completed: true,
      usedValidationHook: true,
    });
    expect(report.runtimeValidation?.screenshotPaths.every((file) => fs.existsSync(file))).toBe(true);
  });
});
