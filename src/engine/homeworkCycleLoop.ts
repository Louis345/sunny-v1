import fs from "fs";
import path from "path";
import type { ErrorSignal } from "../algorithms/types";
import type {
  HomeworkCycle,
  InterventionMeasurement,
  LearningTheory,
} from "../context/schemas/homeworkCycle";

type BuildTheoryInput = {
  cycle: HomeworkCycle;
  patterns: ErrorSignal[];
  nowIso?: string;
};

type EvaluateInput = {
  nodeId: string;
  nodeType: string;
  baselineAccuracy: number;
  interventionAccuracy: number;
  completedAt?: string;
  minAccuracy?: number;
  minImprovement?: number;
};

type RecordMeasurementInput = {
  cycle: HomeworkCycle;
  nodeId: string;
  nodeType: string;
  accuracy: number;
  completedAt?: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function strongestPattern(patterns: ErrorSignal[]): ErrorSignal | null {
  return [...patterns].sort(
    (a, b) => b.confidence - a.confidence || b.frequency - a.frequency,
  )[0] ?? null;
}

function riskWordsForPattern(
  cycle: HomeworkCycle,
  pattern: ErrorSignal | null,
): string[] {
  const wordSet = new Set(cycle.wordList.map((w) => w.toLowerCase()));
  const fromExamples =
    pattern?.exampleTargets
      .map((w) => w.trim())
      .filter((w) => wordSet.has(w.toLowerCase())) ?? [];
  const risk = fromExamples.length > 0 ? fromExamples : cycle.wordList.slice(0, 5);
  return [...new Set(risk.map((w) => w.trim()).filter(Boolean))];
}

function interventionForPattern(patternType: string, subject: string): string {
  if (subject === "spelling_test") {
    if (patternType === "ending_confusion") {
      return "suffix contrast with forced final-letter commitment";
    }
    if (patternType === "vowel_omission") {
      return "letter-by-letter commitment with vowel checkpoints";
    }
    if (patternType === "consonant_doubling") {
      return "double-letter checkpoint before submit";
    }
    if (patternType === "transposition") {
      return "ordered tile placement with immediate sequence feedback";
    }
    return "active word production from memory";
  }
  return "content-fit challenge that requires producing the answer, not recognition";
}

function theoryId(stage: LearningTheory["stage"], cycle: HomeworkCycle, nowIso: string): string {
  return `${cycle.homeworkId}:${stage}:${nowIso}`;
}

function theoryMarkdown(theory: Omit<LearningTheory, "markdown">): string {
  return `## Hypothesis
${theory.hypothesis}

## Prediction
Pattern: ${theory.predictedPattern}
Risk words/items: ${theory.predictedRiskWords.join(", ") || "none"}

## Intervention
${theory.intervention}

## Success criteria
- Accuracy at least ${(theory.successCriteria.minAccuracy * 100).toFixed(0)}%
- Improvement at least ${(theory.successCriteria.minImprovement * 100).toFixed(0)} percentage points

## Evidence
${theory.evidence.map((line) => `- ${line}`).join("\n") || "- No prior evidence."}`;
}

export function buildPreQuestTheory(input: BuildTheoryInput): LearningTheory {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const pattern = strongestPattern(input.patterns);
  const predictedPattern = pattern?.errorType ?? "content_fit_gap";
  const predictedRiskWords = riskWordsForPattern(input.cycle, pattern);
  const intervention = interventionForPattern(predictedPattern, input.cycle.subject);
  const hypothesis = pattern
    ? `The child is most likely struggling with ${predictedPattern}; a targeted quest should improve transfer on ${predictedRiskWords.join(", ")}.`
    : `No confirmed diagnostic pattern yet; the quest should probe whether the homework format itself creates the gap.`;
  const base: Omit<LearningTheory, "markdown"> = {
    theoryId: theoryId("pre_quest", input.cycle, nowIso),
    stage: "pre_quest",
    createdAt: nowIso,
    hypothesis,
    predictedPattern,
    predictedRiskWords,
    intervention,
    successCriteria: {
      minAccuracy: 0.8,
      minImprovement: 0.15,
    },
    evidence: pattern
      ? [
          `${pattern.errorType} confidence=${pattern.confidence}`,
          `${pattern.frequency} occurrences across ${pattern.sessionCount} sessions`,
        ]
      : ["No confirmed diagnostic pattern yet."],
    status: "pending",
  };
  return { ...base, markdown: theoryMarkdown(base) };
}

export function evaluateNodeIntervention(input: EvaluateInput): InterventionMeasurement {
  const baselineAccuracy = clamp01(input.baselineAccuracy);
  const interventionAccuracy = clamp01(input.interventionAccuracy);
  const minAccuracy = input.minAccuracy ?? 0.8;
  const minImprovement = input.minImprovement ?? 0.15;
  const improvement = round(interventionAccuracy - baselineAccuracy);
  const predictionMet =
    interventionAccuracy >= minAccuracy || improvement >= minImprovement;
  const hasEvidence =
    Number.isFinite(input.baselineAccuracy) && Number.isFinite(input.interventionAccuracy);

  return {
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    measuredAt: input.completedAt ?? new Date().toISOString(),
    baselineAccuracy,
    interventionAccuracy,
    improvement,
    predictionMet,
    status: hasEvidence ? (predictionMet ? "supported" : "falsified") : "inconclusive",
  };
}

function averageAccuracy(measurements: InterventionMeasurement[]): number {
  if (measurements.length === 0) return 0;
  return round(
    measurements.reduce((sum, item) => sum + item.interventionAccuracy, 0) /
      measurements.length,
  );
}

export function buildBossTheory(input: {
  previousTheory: LearningTheory;
  measurement: InterventionMeasurement;
  patterns: ErrorSignal[];
  nowIso?: string;
}): LearningTheory {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const pattern = strongestPattern(input.patterns);
  const predictedPattern = pattern?.errorType ?? input.previousTheory.predictedPattern;
  const base: Omit<LearningTheory, "markdown"> = {
    theoryId: `${input.previousTheory.theoryId}:boss:${nowIso}`,
    stage: "boss",
    createdAt: nowIso,
    hypothesis:
      `Second-chance theory: the first quest did not produce enough transfer, so the boss should test ${predictedPattern} with slower, higher-commitment production.`,
    predictedPattern,
    predictedRiskWords: input.previousTheory.predictedRiskWords,
    intervention: `boss retry: ${interventionForPattern(predictedPattern, "spelling_test")} plus mixed review`,
    successCriteria: {
      minAccuracy: 0.85,
      minImprovement: 0.1,
    },
    evidence: [
      `quest accuracy=${input.measurement.interventionAccuracy}`,
      `baseline accuracy=${input.measurement.baselineAccuracy}`,
      `improvement=${input.measurement.improvement}`,
    ],
    status: "pending",
  };
  return { ...base, markdown: theoryMarkdown(base) };
}

export function recordNodeMeasurement(input: RecordMeasurementInput): HomeworkCycle {
  const existing = input.cycle.interventionHistory ?? [];
  const baselineNodes = existing.filter(
    (item) => item.nodeType !== "quest" && item.nodeType !== "boss",
  );
  const baselineAccuracy =
    input.nodeType === "quest" || input.nodeType === "boss"
      ? averageAccuracy(baselineNodes)
      : input.accuracy;
  const measurement = evaluateNodeIntervention({
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    baselineAccuracy,
    interventionAccuracy: input.accuracy,
    completedAt: input.completedAt,
  });
  const interventionHistory = [...existing, measurement];
  const next: HomeworkCycle = {
    ...input.cycle,
    interventionHistory,
  };

  if (input.nodeType === "quest") {
    next.questMeasurement = measurement;
    if (
      measurement.status === "falsified" &&
      input.cycle.theory &&
      !input.cycle.bossTheory
    ) {
      next.bossTheory = buildBossTheory({
        previousTheory: input.cycle.theory,
        measurement,
        patterns: [],
        nowIso: input.completedAt,
      });
    }
  }

  return next;
}

function cyclesDirFor(childId: string): string {
  return path.join(process.cwd(), "src", "context", childId, "homework", "cycles");
}

export function readHomeworkCycle(
  childId: string,
  homeworkId: string,
): HomeworkCycle | null {
  const file = path.join(cyclesDirFor(childId), `${homeworkId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as HomeworkCycle;
}

export function writeHomeworkCycle(childId: string, cycle: HomeworkCycle): void {
  const dir = cyclesDirFor(childId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${cycle.homeworkId}.json`),
    JSON.stringify(cycle, null, 2),
    "utf8",
  );
}

export function recordHomeworkNodeMeasurement(input: {
  childId: string;
  homeworkId: string;
  nodeId: string;
  nodeType: string;
  accuracy: number;
  completedAt?: string;
}): HomeworkCycle | null {
  const cycle = readHomeworkCycle(input.childId, input.homeworkId);
  if (!cycle) return null;
  const updated = recordNodeMeasurement({
    cycle,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    accuracy: input.accuracy,
    completedAt: input.completedAt,
  });
  writeHomeworkCycle(input.childId, updated);
  return updated;
}
