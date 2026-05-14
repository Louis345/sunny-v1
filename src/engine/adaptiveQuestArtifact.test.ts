import { describe, expect, it } from "vitest";
import type { AIContentCatalogItem } from "../context/schemas/learningProfile";
import type { HomeworkCycle, LearningTheory } from "../context/schemas/homeworkCycle";
import {
  attachArtifactToHomeworkNode,
  catalogAdaptiveQuestArtifact,
  generateAdaptiveQuestArtifact,
  markAdaptiveArtifactValidation,
  validateAdaptiveQuestArtifact,
} from "./adaptiveQuestArtifact";

const theory: LearningTheory = {
  theoryId: "hw-1:pre_quest:2026-05-11T12:00:00.000Z",
  stage: "pre_quest",
  createdAt: "2026-05-11T12:00:00.000Z",
  hypothesis: "Pattern words need production but high-frequency words need fluency.",
  predictedPattern: "assignment_purpose_split",
  predictedRiskWords: ["shiny"],
  intervention: "targeted production and fluency split",
  successCriteria: { minAccuracy: 0.8, minImprovement: 0.15 },
  evidence: ["baseline showed mixed purpose risk"],
  status: "pending",
  markdown: "## Hypothesis\nPattern words need production but high-frequency words need fluency.",
};

function cycle(overrides: Partial<HomeworkCycle> = {}): HomeworkCycle {
  return {
    homeworkId: "hw-1",
    subject: "spelling_test",
    wordList: ["shiny", "whole"],
    capturedContent: {
      title: "Benchmark Advance Spelling",
      type: "spelling_test",
      rawText: "",
      words: ["shiny", "whole"],
      questions: [],
      homeworkWords: [
        {
          homeworkWordId: "hw-1:y-ly-spelling:shiny:0",
          text: "shiny",
          normalizedText: "shiny",
          wordGroupId: "y-ly-spelling",
          purpose: "spell_from_memory",
          positionIndex: 0,
        },
        {
          homeworkWordId: "hw-1:high-frequency:whole:1",
          text: "whole",
          normalizedText: "whole",
          wordGroupId: "high-frequency",
          purpose: "read_fluently",
          positionIndex: 1,
        },
      ],
      wordGroups: [
        {
          id: "y-ly-spelling",
          wordGroupId: "y-ly-spelling",
          label: "Words with -y or -ly Endings",
          purpose: "spell_from_memory",
          words: ["shiny"],
          homeworkWordIds: ["hw-1:y-ly-spelling:shiny:0"],
          confidence: 0.92,
          evidence: ["Pattern heading."],
        },
        {
          id: "high-frequency",
          wordGroupId: "high-frequency",
          label: "High-Frequency Words",
          purpose: "read_fluently",
          words: ["whole"],
          homeworkWordIds: ["hw-1:high-frequency:whole:1"],
          confidence: 0.86,
          evidence: ["Fluency heading."],
          scheduleAfter: "spelling_measured",
        },
      ],
      assignmentInterpretation: {
        schemaVersion: 1,
        status: "ready",
        wordGroups: [
          {
            id: "y-ly-spelling",
            wordGroupId: "y-ly-spelling",
            label: "Words with -y or -ly Endings",
            purpose: "spell_from_memory",
            words: ["shiny"],
            homeworkWordIds: ["hw-1:y-ly-spelling:shiny:0"],
            confidence: 0.92,
            evidence: ["Pattern heading."],
          },
          {
            id: "high-frequency",
            wordGroupId: "high-frequency",
            label: "High-Frequency Words",
            purpose: "read_fluently",
            words: ["whole"],
            homeworkWordIds: ["hw-1:high-frequency:whole:1"],
            confidence: 0.86,
            evidence: ["Fluency heading."],
            scheduleAfter: "spelling_measured",
          },
        ],
        assertions: [],
        selectedTargets: [],
        heldTargets: [],
        clarificationQuestions: [],
        humanAnswers: [],
        memoryMatches: [],
      },
      sourceDocuments: [{ filename: "spelling.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Words with -y or -ly Endings and High-Frequency Words",
        primarySkill: "assignment-purpose-aware practice",
        assignmentFormat: "two-column word list",
        concepts: ["Word spelling patterns", "High-frequency sight words"],
        sourceEvidence: ["Two groups extracted by AI."],
      },
    },
    contentFingerprint: "fingerprint-1",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-11",
    testDate: "2026-05-15",
    assumptions: theory.markdown,
    theory,
    interventionHistory: [
      {
        nodeId: "n-letter-rush-baseline-hw-1",
        nodeType: "letter-rush",
        measuredAt: "2026-05-11T12:10:00.000Z",
        baselineAccuracy: 0.6,
        interventionAccuracy: 0.6,
        improvement: 0,
        predictionMet: false,
        status: "falsified",
      },
    ],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
    ...overrides,
  };
}

describe("adaptive quest artifact", () => {
  it("refuses quest generation without captured homework, interpretation, theory, and baseline evidence", () => {
    const base = cycle();
    expect(() =>
      generateAdaptiveQuestArtifact({
        childChart: { childId: "reina" },
        homeworkCycle: { ...base, capturedContent: null },
        assignmentInterpretation: base.capturedContent?.assignmentInterpretation,
        carePlan: null,
        theory,
        baselineEvidence: base.interventionHistory ?? [],
        contentCatalogMemory: [],
        generationStage: "quest",
        generatedPath: "quest.html",
      }),
    ).toThrow(/captured_homework/);
    expect(() =>
      generateAdaptiveQuestArtifact({
        childChart: { childId: "reina" },
        homeworkCycle: base,
        assignmentInterpretation: base.capturedContent?.assignmentInterpretation,
        carePlan: null,
        theory,
        baselineEvidence: [],
        contentCatalogMemory: [],
        generationStage: "quest",
        generatedPath: "quest.html",
      }),
    ).toThrow(/baseline_evidence/);
  });

  it("refuses boss generation until quest evidence exists", () => {
    const base = cycle();
    expect(() =>
      generateAdaptiveQuestArtifact({
        childChart: { childId: "reina" },
        homeworkCycle: base,
        assignmentInterpretation: base.capturedContent?.assignmentInterpretation,
        carePlan: null,
        theory,
        baselineEvidence: base.interventionHistory ?? [],
        contentCatalogMemory: [],
        generationStage: "boss",
        generatedPath: "boss.html",
      }),
    ).toThrow(/quest_measurement/);
  });

  it("creates a validated quest artifact and catalog item bound to theory and assignment word ids", () => {
    const base = cycle();
    const artifact = generateAdaptiveQuestArtifact({
      childChart: { childId: "reina" },
      homeworkCycle: base,
      assignmentInterpretation: base.capturedContent?.assignmentInterpretation,
      carePlan: null,
      theory,
      baselineEvidence: base.interventionHistory ?? [],
      contentCatalogMemory: [],
      generationStage: "quest",
      generatedPath: "quest.html",
    });

    expect(validateAdaptiveQuestArtifact(artifact).ok).toBe(true);
    expect(artifact).toMatchObject({
      homeworkId: "hw-1",
      theoryId: theory.theoryId,
      generationStage: "quest",
      targetGroupIds: ["y-ly-spelling"],
      homeworkWordIds: ["hw-1:y-ly-spelling:shiny:0"],
      baselineEvidenceIds: ["n-letter-rush-baseline-hw-1"],
    });

    const catalogItem = catalogAdaptiveQuestArtifact(artifact, {
      childId: "reina",
      title: "Quest",
    });
    expect(catalogItem).toMatchObject<Partial<AIContentCatalogItem>>({
      contentId: artifact.contentId,
      homeworkId: "hw-1",
      childId: "reina",
      type: "game",
      source: "generated",
      algorithmTargets: ["error-pattern-remediation", "retrieval-practice", "desirable-difficulty"],
      inputEvidence: {
        contentFingerprint: "fingerprint-1",
        activityEvidenceIds: ["n-letter-rush-baseline-hw-1"],
      },
    });
    expect(catalogItem.inputEvidence.patternIds).toContain(theory.theoryId);

    const node = attachArtifactToHomeworkNode(
      {
        id: "n-quest-hw-1",
        type: "quest",
        words: ["whole"],
        difficulty: 2,
        rationale: "old",
        gameFile: null,
      },
      artifact,
    );
    expect(node.words).toEqual(["shiny"]);
    expect(node.gameFile).toBe("quest.html");
    expect(node.adaptiveArtifact).toMatchObject({ artifactId: artifact.artifactId });
  });

  it("carries validation status into attached nodes and catalog items", () => {
    const base = cycle();
    const artifact = markAdaptiveArtifactValidation(
      generateAdaptiveQuestArtifact({
        childChart: { childId: "reina" },
        homeworkCycle: base,
        assignmentInterpretation: base.capturedContent?.assignmentInterpretation,
        carePlan: null,
        theory,
        baselineEvidence: base.interventionHistory ?? [],
        contentCatalogMemory: [],
        generationStage: "quest",
        generatedPath: "quest.html",
      }),
      {
        passed: true,
        status: "passed",
        score: 100,
        failures: [],
        warnings: [],
        attempts: 1,
        validatedAt: "2026-05-12T20:10:00.000Z",
      },
    );

    const catalogItem = catalogAdaptiveQuestArtifact(artifact, {
      childId: "reina",
      title: "Validated Quest",
    });
    expect(catalogItem.validationStatus).toBe("passed");
    expect(catalogItem.validationReport?.attempts).toBe(1);

    const node = attachArtifactToHomeworkNode(
      {
        id: "n-quest-hw-1",
        type: "quest",
        words: [],
        difficulty: 2,
        rationale: "old",
        gameFile: null,
      },
      artifact,
    );
    expect(node.adaptiveArtifact?.validationStatus).toBe("passed");
    expect(node.adaptiveArtifact?.validationReport?.score).toBe(100);
  });
});
