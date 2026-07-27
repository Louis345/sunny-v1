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
        screenshotPaths: [
          path.join(dir, "quest-load.png"),
          path.join(dir, "quest-recovery.png"),
          path.join(dir, "quest-midplay.png"),
          path.join(dir, "quest-completion.png"),
        ],
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

  it("expects three gameplay screenshots for baseline stage", async () => {
    const dir = makeDir();
    dirs.push(dir);

    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body>Baseline ready</body></html>",
      childId: "demo-pashley",
      stage: "baseline",
      homeworkType: "math",
      words: ["f1", "f2"],
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
      runBrowser: async (): Promise<GeneratedArtifactBrowserSnapshot> => ({
        screenshotPaths: [
          path.join(dir, "baseline-load.png"),
          path.join(dir, "baseline-midplay.png"),
        ],
        bodyText: "Baseline ready",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: [{ target: "f1", correct: true }, { target: "f2", correct: true }],
        companionEvents: [],
        completionEvents: [{ completed: true }],
        validationHookResult: { used: true },
      }),
    });

    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/3 gameplay screenshots/i);
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
        screenshotPaths: [
          path.join(dir, "quest-load.png"),
          path.join(dir, "quest-recovery.png"),
          path.join(dir, "quest-midplay.png"),
          path.join(dir, "quest-completion.png"),
        ],
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
      screenshotPaths: [
        path.join(dir, "quest-load.png"),
        path.join(dir, "quest-recovery.png"),
        path.join(dir, "quest-midplay.png"),
        path.join(dir, "quest-completion.png"),
      ],
    });
  });

  it("captures opening, mid-play, and completion screenshots for Quest human review", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-runtime-quest-frames-"));
    const report = await validateGeneratedArtifactRuntime({
      html: "<!doctype html><html><body><h1>Quest</h1></body></html>",
      childId: "reina",
      stage: "quest",
      homeworkType: "math",
      words: ["transfer"],
      outputDir: dir,
      runBrowser: async () => ({
        screenshotPaths: [
          path.join(dir, "quest-load.png"),
          path.join(dir, "quest-recovery.png"),
          path.join(dir, "quest-midplay.png"),
          path.join(dir, "quest-completion.png"),
        ],
        bodyText: "Quest",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: [{ domain: "math", target: "transfer", correct: true }],
        companionEvents: [],
        completionEvents: [{ nodeId: "quest", completed: true, accuracy: 1 }],
        validationHookResult: { used: true },
      }),
    });

    expect(report.passed).toBe(true);
    expect(report.runtimeValidation?.screenshotPaths).toHaveLength(4);
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/generatedArtifactRuntimeValidator.ts"), "utf8");
    expect(source).not.toContain('input.stage === "baseline" ? 3 : 1');
  });

  it("requires a real validation hook and four review states for Quest and Boss", async () => {
    const dir = makeDir();
    dirs.push(dir);
    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body>Quest ready</body></html>",
      childId: "reina",
      stage: "quest",
      homeworkType: "math",
      words: ["transfer"],
      outputDir: dir,
      runBrowser: async () => ({
        screenshotPaths: [
          path.join(dir, "quest-load.png"),
          path.join(dir, "quest-midplay.png"),
          path.join(dir, "quest-completion.png"),
        ],
        bodyText: "Quest ready",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: [{ target: "transfer", correct: true }],
        companionEvents: [],
        completionEvents: [{ completed: true }],
        validationHookResult: { used: false },
      }),
    });
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/SUNNY_VALIDATION_HOOKS/i);
    expect(report.failures.join(" ")).toMatch(/4 gameplay screenshots/i);
  });

  it("preserves the ordered runtime event timeline for the evaluator", async () => {
    const dir = makeDir();
    dirs.push(dir);
    const eventTimeline = [
      { type: "attempt_event", timestampMs: 100, payload: { target: "transfer", correct: false } },
      { type: "progress_event", timestampMs: 250, payload: { completedItems: 1 } },
      { type: "node_complete", timestampMs: 500, payload: { completed: true } },
    ];
    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body>Quest ready</body></html>",
      childId: "reina",
      stage: "quest",
      homeworkType: "math",
      words: ["transfer"],
      outputDir: dir,
      runBrowser: async () => ({
        screenshotPaths: [
          path.join(dir, "quest-load.png"),
          path.join(dir, "quest-recovery.png"),
          path.join(dir, "quest-midplay.png"),
          path.join(dir, "quest-completion.png"),
        ],
        bodyText: "Quest ready",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: [{ target: "transfer", correct: true }],
        companionEvents: [],
        completionEvents: [{ completed: true }],
        validationHookResult: { used: true },
        eventTimeline,
      }),
    });
    expect(report.passed).toBe(true);
    expect((report.runtimeValidation as any)?.eventTimeline).toEqual(eventTimeline);
  });

  it("passes baseline stage when three screenshots and evidence are captured", async () => {
    const dir = makeDir();
    dirs.push(dir);

    const report = await validateGeneratedArtifactRuntime({
      html: "<html><body>Baseline ready</body></html>",
      childId: "demo-pashley",
      stage: "baseline",
      homeworkType: "math",
      words: ["f1", "f2"],
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
      runBrowser: async (): Promise<GeneratedArtifactBrowserSnapshot> => ({
        screenshotPaths: [
          path.join(dir, "baseline-load.png"),
          path.join(dir, "baseline-midplay.png"),
          path.join(dir, "baseline-completion.png"),
        ],
        bodyText: "Baseline ready",
        consoleErrors: [],
        pageErrors: [],
        attemptEvents: [{ target: "f1", correct: true }, { target: "f2", correct: true }],
        companionEvents: [],
        completionEvents: [{ completed: true }],
        validationHookResult: { used: true },
      }),
    });

    expect(report.passed).toBe(true);
    expect(report.runtimeValidation?.screenshotPaths).toHaveLength(3);
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

  it("waits for delayed completion after a custom validation hook resolves", async () => {
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
            <main>Quest waits for delayed completion</main>
            <script>
              window.SUNNY_VALIDATION_HOOKS = {
                playthrough: async ({ words }) => {
                  for (const target of words) {
                    window.postMessage({ type: "attempt_event", payload: { target, correct: true } }, "*");
                  }
                  setTimeout(() => {
                    window.postMessage({
                      type: "node_complete",
                      payload: { completed: true, accuracy: 1, wordsAttempted: words.length }
                    }, "*");
                  }, 650);
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
  });

  it("serves assigned generated artwork during the real browser validation", async () => {
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
            <main>Quest with generated artwork</main>
            <img src="/generated/adventure-board-demo/quest.jpeg" alt="Quest world">
            <script>
              fetch("/generated/adventure-board-demo/quest.jpeg").then((response) => {
                if (!response.ok) throw new Error("generated artwork unavailable:" + response.status);
              });
              window.SUNNY_VALIDATION_HOOKS = {
                playthrough: async ({ words }) => {
                  for (const target of words) {
                    window.postMessage({ type: "attempt_event", payload: { target, correct: true } }, "*");
                  }
                  window.postMessage({ type: "node_complete", payload: { completed: true } }, "*");
                }
              };
            </script>
          </body>
        </html>
      `,
      childId: "reina",
      stage: "quest",
      homeworkType: "math",
      words: ["transfer"],
      outputDir: dir,
      now: new Date("2026-05-14T12:00:00.000Z"),
    });

    expect(report.passed).toBe(true);
    expect(report.runtimeValidation?.pageErrors).toEqual([]);
  });
});
