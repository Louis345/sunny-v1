import { describe, expect, it } from "vitest";
import {
  buildQuestBossDynamicProofReport,
  evaluateQuestBossDynamicProofScenario,
  type QuestBossDynamicProofScenarioInput,
} from "./questBossDynamicProof";

const generatedQuest: QuestBossDynamicProofScenarioInput = {
  scenario: "paid_quest_generation",
  expectedOutcome: "generated",
  stage: "quest",
  model: "claude-sonnet-4-20250514",
  contentId: "content-quest",
  filename: "quest.html",
  generatedPath: "/tmp/quest.html",
  isFallback: false,
  staticValidationPassed: true,
  runtimeValidationPassed: true,
  runtimeEngine: "playwright",
  screenshotPaths: ["/tmp/quest-runtime.png"],
  targetWordCount: 3,
  attemptedTargetCount: 3,
  completionEventCount: 1,
  completionAccuracy: 1,
  failureReasons: [],
  evidenceUsed: ["baseline-spell-check"],
  theoryId: "hw-1:pre_quest:2026-06-24T00:00:00.000Z",
  bossRequiredQuestEvidence: false,
};

describe("quest boss dynamic proof report", () => {
  it("passes a paid generated Quest only when Playwright validates screenshots, attempts, and completion", () => {
    const result = evaluateQuestBossDynamicProofScenario(generatedQuest);

    expect(result).toMatchObject({
      scenario: "paid_quest_generation",
      expectedOutcome: "generated",
      actualOutcome: "generated",
      pass: true,
      runtimeValidationPassed: true,
      runtimeEngine: "playwright",
      attemptedTargetCount: 3,
      completionEventCount: 1,
    });
    expect(result.failureReasons).toEqual([]);
  });

  it("fails generated content when runtime validation is missing", () => {
    const result = evaluateQuestBossDynamicProofScenario({
      ...generatedQuest,
      runtimeValidationPassed: false,
      runtimeEngine: null,
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toContain("runtime_validation_missing");
  });

  it("fails generated content when screenshots are empty", () => {
    const result = evaluateQuestBossDynamicProofScenario({
      ...generatedQuest,
      screenshotPaths: [],
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toContain("runtime_screenshot_missing");
  });

  it("fails generated content when attempted targets are below target words", () => {
    const result = evaluateQuestBossDynamicProofScenario({
      ...generatedQuest,
      attemptedTargetCount: 2,
      targetWordCount: 3,
    });

    expect(result.pass).toBe(false);
    expect(result.failureReasons).toContain("attempted_targets_below_target_count");
  });

  it("passes Boss-before-Quest only when generation is blocked for quest evidence", () => {
    const result = evaluateQuestBossDynamicProofScenario({
      scenario: "boss_blocked_before_quest",
      expectedOutcome: "blocked",
      stage: "boss",
      model: "claude-sonnet-4-20250514",
      contentId: null,
      filename: null,
      generatedPath: null,
      isFallback: false,
      staticValidationPassed: false,
      runtimeValidationPassed: false,
      runtimeEngine: null,
      screenshotPaths: [],
      targetWordCount: 3,
      attemptedTargetCount: 0,
      completionEventCount: 0,
      completionAccuracy: null,
      failureReasons: ["quest_measurement"],
      evidenceUsed: [],
      theoryId: "hw-1:boss:2026-06-24T00:00:00.000Z",
      bossRequiredQuestEvidence: true,
    });

    expect(result.pass).toBe(true);
    expect(result.actualOutcome).toBe("blocked");
  });

  it("passes bad artifact proof only when validation rejects the artifact", () => {
    const result = evaluateQuestBossDynamicProofScenario({
      ...generatedQuest,
      scenario: "bad_artifact_rejected",
      expectedOutcome: "rejected",
      contentId: null,
      filename: null,
      generatedPath: null,
      staticValidationPassed: false,
      runtimeValidationPassed: false,
      runtimeEngine: null,
      screenshotPaths: [],
      attemptedTargetCount: 0,
      completionEventCount: 0,
      completionAccuracy: null,
      failureReasons: ["Quest/Boss artifacts must include #sunny-companion"],
    });

    expect(result.pass).toBe(true);
    expect(result.actualOutcome).toBe("rejected");
  });

  it("builds an overall passing report only when all proof scenarios pass", () => {
    const report = buildQuestBossDynamicProofReport({
      createdAt: "2026-06-24T00:00:00.000Z",
      childId: "reina",
      homeworkId: "hw-proof",
      model: "claude-sonnet-4-20250514",
      outputDir: "/tmp/proof",
      scenarios: [
        evaluateQuestBossDynamicProofScenario(generatedQuest),
        evaluateQuestBossDynamicProofScenario({
          ...generatedQuest,
          scenario: "paid_boss_generation",
          stage: "boss",
          contentId: "content-boss",
          filename: "boss.html",
          generatedPath: "/tmp/boss.html",
          evidenceUsed: ["baseline-spell-check", "quest-destination"],
          bossRequiredQuestEvidence: true,
        }),
      ],
    });

    expect(report.overallPass).toBe(true);
    expect(report.passCount).toBe(2);
    expect(report.scenarioCount).toBe(2);
    expect(report.screenshotPaths).toEqual(["/tmp/quest-runtime.png", "/tmp/quest-runtime.png"]);
  });
});
