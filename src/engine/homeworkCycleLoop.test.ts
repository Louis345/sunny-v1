import { describe, expect, it } from "vitest";
import type { ErrorSignal } from "../algorithms/types";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import {
  buildBossTheory,
  buildPreQuestTheory,
  evaluateNodeIntervention,
  recordNodeMeasurement,
} from "./homeworkCycleLoop";

function cycle(overrides: Partial<HomeworkCycle> = {}): HomeworkCycle {
  return {
    homeworkId: "hw-spelling_test-loop001",
    subject: "spelling_test",
    wordList: ["faster", "fastest", "slower", "slowest"],
    ingestedAt: "2026-05-01",
    testDate: "2026-05-06",
    assumptions: null,
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
    ...overrides,
  };
}

const endingConfusion: ErrorSignal = {
  errorType: "ending_confusion",
  frequency: 4,
  consistency: 0.5,
  confidence: 0.82,
  sessionCount: 2,
  lastSeen: "2026-05-01T12:00:00.000Z",
  exampleTargets: ["faster", "slower"],
  positions: [4, 5],
  domain: "spelling",
};

describe("homework cycle loop", () => {
  it("writes a pre-quest theory from detected patterns and homework words", () => {
    const theory = buildPreQuestTheory({
      cycle: cycle(),
      patterns: [endingConfusion],
      nowIso: "2026-05-01T12:00:00.000Z",
    });

    expect(theory.stage).toBe("pre_quest");
    expect(theory.predictedPattern).toBe("ending_confusion");
    expect(theory.predictedRiskWords).toEqual(["faster", "slower"]);
    expect(theory.intervention).toContain("suffix");
    expect(theory.markdown).toContain("## Prediction");
    expect(theory.markdown).toContain("ending_confusion");
  });

  it("uses a content-fit theory when no confirmed pattern exists yet", () => {
    const theory = buildPreQuestTheory({
      cycle: cycle({ subject: "math", wordList: ["place value"] }),
      patterns: [],
      nowIso: "2026-05-01T12:00:00.000Z",
    });

    expect(theory.predictedPattern).toBe("content_fit_gap");
    expect(theory.predictedRiskWords).toEqual(["place value"]);
    expect(theory.markdown).toContain("No confirmed diagnostic pattern yet");
  });

  it("marks a quest prediction supported when accuracy improves enough", () => {
    const result = evaluateNodeIntervention({
      nodeType: "quest",
      baselineAccuracy: 0.45,
      interventionAccuracy: 0.75,
      completedAt: "2026-05-01T13:00:00.000Z",
      nodeId: "n-quest-hw-spelling_test-loop001",
    });

    expect(result.predictionMet).toBe(true);
    expect(result.improvement).toBeCloseTo(0.3);
    expect(result.status).toBe("supported");
  });

  it("marks a quest prediction falsified when the targeted mechanic underperforms", () => {
    const result = evaluateNodeIntervention({
      nodeType: "quest",
      baselineAccuracy: 0.6,
      interventionAccuracy: 0.55,
      completedAt: "2026-05-01T13:00:00.000Z",
      nodeId: "n-quest-hw-spelling_test-loop001",
    });

    expect(result.predictionMet).toBe(false);
    expect(result.status).toBe("falsified");
  });

  it("records baseline and quest evidence, then creates a boss fallback theory on quest failure", () => {
    const withBaseline = recordNodeMeasurement({
      cycle: cycle({
        theory: buildPreQuestTheory({
          cycle: cycle(),
          patterns: [endingConfusion],
          nowIso: "2026-05-01T12:00:00.000Z",
        }),
      }),
      nodeId: "n-spell-check-hw-spelling_test-loop001",
      nodeType: "spell-check",
      accuracy: 0.6,
      completedAt: "2026-05-01T12:30:00.000Z",
    });

    const afterQuest = recordNodeMeasurement({
      cycle: withBaseline,
      nodeId: "n-quest-hw-spelling_test-loop001",
      nodeType: "quest",
      accuracy: 0.55,
      completedAt: "2026-05-01T13:00:00.000Z",
    });

    expect(afterQuest.questMeasurement?.status).toBe("falsified");
    expect(afterQuest.bossTheory?.stage).toBe("boss");
    expect(afterQuest.bossTheory?.markdown).toContain("Second-chance theory");
  });

  it("builds a boss theory from a failed quest measurement", () => {
    const pre = buildPreQuestTheory({
      cycle: cycle(),
      patterns: [endingConfusion],
      nowIso: "2026-05-01T12:00:00.000Z",
    });
    const measurement = evaluateNodeIntervention({
      nodeType: "quest",
      baselineAccuracy: 0.6,
      interventionAccuracy: 0.55,
      completedAt: "2026-05-01T13:00:00.000Z",
      nodeId: "n-quest-hw-spelling_test-loop001",
    });

    const boss = buildBossTheory({
      previousTheory: pre,
      measurement,
      patterns: [endingConfusion],
      nowIso: "2026-05-01T13:01:00.000Z",
    });

    expect(boss.stage).toBe("boss");
    expect(boss.status).toBe("pending");
    expect(boss.evidence.join(" ")).toContain("quest accuracy");
  });
});
