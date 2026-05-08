import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { AttemptLogRecord } from "../algorithms/types";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  buildAdaptiveEvidenceSnapshot,
  questGateFromSnapshot,
} from "./adaptiveEvidenceSnapshot";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-adaptive-evidence-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function writeText(root: string, rel: string, value: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, "utf8");
}

function writeNdjson(root: string, rel: string, records: unknown[]): void {
  writeText(root, rel, records.map((record) => JSON.stringify(record)).join("\n"));
}

function baseProfile(childId: string): LearningProfile {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [],
  });
  profile.attentionModel = undefined;
  profile.sessionStats.totalSessions = 8;
  profile.pendingHomework = {
    weekOf: "2026-05-05",
    testDate: "2026-05-07",
    wordList: ["erosion", "soil", "water"],
    homeworkId: "hw-reading-erosion",
    contentProfile: {
      practiceDomain: "reading",
      contentDomain: "science",
      topic: "Erosion",
      primarySkill: "reading_comprehension",
      assignmentFormat: "study_guide",
      concepts: ["erosion", "weathering", "rivers"],
      sourceEvidence: ["The study guide asks what causes erosion."],
    },
    capturedContent: {
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water and wind can wear away rocks and soil.",
      words: ["erosion", "wear away", "soil", "wind"],
      questions: [{ id: 1, question: "What causes erosion?", correctAnswer: "water and wind" }],
      sourceDocuments: [{ filename: "erosions.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "Erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "weathering", "rivers"],
        sourceEvidence: ["The study guide asks what causes erosion."],
      },
    },
    generatedAt: "2026-05-05T00:00:00.000Z",
    nodes: [],
  };
  return profile;
}

function writeChild(root: string, childId: string, profile = baseProfile(childId)): void {
  writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
  writeJson(root, `src/context/${childId}/word_bank.json`, {
    childId,
    version: 1,
    lastUpdated: "2026-05-05T00:00:00.000Z",
    words: [],
  });
}

function erosionCycle(overrides: Partial<HomeworkCycle> = {}): HomeworkCycle {
  return {
    homeworkId: "hw-reading-erosion",
    subject: "reading",
    wordList: ["erosion", "soil", "water"],
    contentProfile: {
      practiceDomain: "reading",
      contentDomain: "science",
      topic: "Erosion",
      primarySkill: "reading_comprehension",
      assignmentFormat: "study_guide",
      concepts: ["erosion", "weathering", "rivers"],
      sourceEvidence: ["The study guide asks what causes erosion."],
    },
    capturedContent: baseProfile("ila").pendingHomework!.capturedContent!,
    contentFingerprint: "fingerprint-erosion",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-05T00:00:00.000Z",
    testDate: "2026-05-07",
    assumptions: "Pre-quest assumption should be written before quest unlock.",
    theory: {
      theoryId: "hw-reading-erosion:pre_quest:test",
      stage: "pre_quest",
      createdAt: "2026-05-05T00:00:00.000Z",
      hypothesis: "The child knows the word erosion but may struggle to explain cause and effect.",
      predictedPattern: "concept_transfer_gap",
      predictedRiskWords: ["wear away", "soil"],
      intervention: "Short quest with cause/effect production.",
      successCriteria: { minAccuracy: 0.8, minImprovement: 0.15 },
      evidence: ["captured homework", "baseline activity misses"],
      status: "pending",
      markdown: "## Hypothesis\nConcept transfer may be the gap.",
    },
    interventionHistory: [
      {
        nodeId: "n-baseline-word-radar",
        nodeType: "word-radar",
        measuredAt: "2026-05-05T00:10:00.000Z",
        baselineAccuracy: 0.5,
        interventionAccuracy: 0.72,
        improvement: 0.22,
        predictionMet: false,
        status: "inconclusive",
      },
    ],
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
    ...overrides,
  };
}

describe("AdaptiveEvidenceSnapshot", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("makes optional raw sources explicit while keeping resolved attention mandatory", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    writeChild(root, childId);
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, erosionCycle());

    const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
      rootDir: root,
      homeworkId: "hw-reading-erosion",
      now: new Date("2026-05-05T12:00:00.000Z"),
    });

    expect(snapshot.childId).toBe(childId);
    expect(snapshot.homeworkId).toBe("hw-reading-erosion");
    expect(snapshot.attention.currentWindow_ms).toBeGreaterThan(0);
    expect(snapshot.attention.source).toBe("legacy_demographic");
    expect(snapshot.sources.capturedHomework.status).toBe("ready");
    expect(snapshot.sources.baselineActivities.status).toBe("ready");
    expect(snapshot.sources.attention.status).toBe("provisional");
    expect(snapshot.sources.tutoringContext.status).toBe("missing");
    expect(snapshot.sources.companionSignals.status).toBe("missing");
    expect(snapshot.questReadiness.level).toBe("medium");
    expect(snapshot.questReadiness.blockers).toEqual([]);
    expect(snapshot.preQuestTheory?.theoryId).toBe("hw-reading-erosion:pre_quest:test");
  });

  it("raises confidence when attention, tutoring, and companion signals are ready", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    const profile = baseProfile(childId);
    profile.attentionModel = {
      source: "onboarding_baseline",
      status: "measured",
      currentWindow_ms: 140_000,
      bestWindow_ms: 160_000,
      trend: "stable",
      confidence: 0.72,
      lastMeasuredAt: "2026-05-05T09:00:00.000Z",
      evidence: ["activity=bubble-pop", "practiceGate=passed"],
    };
    writeChild(root, childId, profile);
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, erosionCycle());
    writeText(
      root,
      `src/context/${childId}/tutoring/processed/2026-05-05-summary.md`,
      [
        "## Tutoring Session 2026-05-05",
        "- Covered: erosion, soil",
        "- Struggled: wear away",
        "- Strategies used: cause/effect drawing",
      ].join("\n"),
    );
    writeText(
      root,
      `src/context/${childId}/session_notes/2026-05-05.md`,
      "- Companion observed fatigue after reading but strong engagement during pronunciation.\n",
    );

    const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
      rootDir: root,
      homeworkId: "hw-reading-erosion",
    });

    expect(snapshot.sources.attention.status).toBe("ready");
    expect(snapshot.sources.tutoringContext.status).toBe("ready");
    expect(snapshot.sources.companionSignals.status).toBe("ready");
    expect(snapshot.questReadiness.level).toBe("high");
    expect(snapshot.questReadiness.reason).toContain("captured homework");
    expect(snapshot.evidenceIds).toEqual(
      expect.arrayContaining([
        "homework:hw-reading-erosion",
        "baseline:n-baseline-word-radar",
        "attention:onboarding_baseline",
        expect.stringMatching(/^tutoring:/),
        expect.stringMatching(/^companion:/),
      ]),
    );
  });

  it("blocks quest opening until captured homework, baseline measurements, and theory are present", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    writeChild(root, childId);
    writeJson(
      root,
      `src/context/${childId}/homework/cycles/hw-reading-erosion.json`,
      erosionCycle({ theory: null, interventionHistory: [] }),
    );

    const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
      rootDir: root,
      homeworkId: "hw-reading-erosion",
    });
    const gate = questGateFromSnapshot(snapshot);

    expect(gate.canOpenQuest).toBe(false);
    expect(gate.needsHumanReview).toBe(true);
    expect(gate.reason).toContain("Quest gate blocked");
    expect(gate.requiredMissingEvidence).toEqual([
      "baseline_measurements",
      "pre_quest_theory",
    ]);
  });

  it("allows quest opening but keeps human review when optional evidence is still provisional", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    writeChild(root, childId);
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, erosionCycle());

    const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
      rootDir: root,
      homeworkId: "hw-reading-erosion",
    });
    const gate = questGateFromSnapshot(snapshot);

    expect(gate.canOpenQuest).toBe(true);
    expect(gate.needsHumanReview).toBe(true);
    expect(gate.requiredMissingEvidence).toEqual([]);
    expect(gate.reason).toContain("human review");
  });

  it("aggregates evaluator buckets from current homework targets, attempts, and word bank tracks", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    const profile = baseProfile(childId);
    profile.pendingHomework = {
      ...profile.pendingHomework!,
      wordList: ["sunny", "neatly", "shiny", "carrying"],
      homeworkId: "hw-spelling-week",
      capturedContent: {
        ...profile.pendingHomework!.capturedContent!,
        title: "Spelling Week",
        type: "spelling_test",
        words: ["sunny", "neatly", "shiny", "carrying"],
        questions: [],
      },
    };
    writeChild(root, childId, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, {
      childId,
      version: 1,
      lastUpdated: "2026-05-05T00:00:00.000Z",
      words: [
        {
          word: "sunny",
          addedAt: "2026-05-05",
          source: "homework",
          wordRadarBestTime_ms: 900,
          tracks: {
            spelling: {
              quality: 5,
              easinessFactor: 2.6,
              interval: 4,
              repetition: 3,
              nextReviewDate: "2026-05-10",
              lastReviewDate: "2026-05-05",
              scaffoldLevel: 0,
              history: [
                { date: "2026-05-05", quality: 5, scaffoldLevel: 0, correct: true },
                { date: "2026-05-05", quality: 5, scaffoldLevel: 0, correct: true },
              ],
              mastered: true,
              masteredDate: "2026-05-05",
              regressionCount: 0,
            },
          },
        },
        {
          word: "neatly",
          addedAt: "2026-05-05",
          source: "homework",
          wordRadarBestTime_ms: 4800,
          tracks: {
            spelling: {
              quality: 4,
              easinessFactor: 2.4,
              interval: 1,
              repetition: 1,
              nextReviewDate: "2026-05-06",
              lastReviewDate: "2026-05-05",
              scaffoldLevel: 0,
              history: [
                { date: "2026-05-05", quality: 4, scaffoldLevel: 0, correct: true },
              ],
              mastered: false,
              regressionCount: 0,
            },
          },
        },
        {
          word: "shiny",
          addedAt: "2026-05-05",
          source: "homework",
          tracks: {
            spelling: {
              quality: 4,
              easinessFactor: 2.2,
              interval: 1,
              repetition: 1,
              nextReviewDate: "2026-05-06",
              lastReviewDate: "2026-05-05",
              scaffoldLevel: 0,
              history: [
                { date: "2026-05-05", quality: 1, scaffoldLevel: 0, correct: false, attemptedValue: "shiney" },
                { date: "2026-05-05", quality: 4, scaffoldLevel: 0, correct: true },
              ],
              mastered: false,
              regressionCount: 0,
            },
          },
        },
      ],
    });
    writeNdjson(root, `src/context/${childId}/attempts/2026-05-05.ndjson`, [
      {
        word: "shiny",
        domain: "spelling",
        correct: false,
        attemptedValue: "shiney",
        timestamp: "2026-05-05T10:00:00.000Z",
        sessionId: "s1",
      } satisfies AttemptLogRecord,
      {
        word: "shiny",
        domain: "spelling",
        correct: true,
        timestamp: "2026-05-05T10:01:00.000Z",
        sessionId: "s1",
      } satisfies AttemptLogRecord,
    ]);
    writeJson(
      root,
      `src/context/${childId}/homework/cycles/hw-spelling-week.json`,
      erosionCycle({
        homeworkId: "hw-spelling-week",
        subject: "spelling_test",
        wordList: ["sunny", "neatly", "shiny", "carrying"],
        capturedContent: profile.pendingHomework!.capturedContent!,
      }),
    );

    const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
      rootDir: root,
      homeworkId: "hw-spelling-week",
    });

    expect(snapshot.evaluator.status).toBe("ready");
    expect(snapshot.evaluator.buckets.mastered_now).toEqual(["sunny"]);
    expect(snapshot.evaluator.buckets.known_but_slow).toEqual(["neatly"]);
    expect(snapshot.evaluator.buckets.fragile).toEqual(["shiny"]);
    expect(snapshot.evaluator.buckets.unknown).toEqual(["carrying"]);
    expect(snapshot.evaluator.items.find((item) => item.target === "shiny")?.reasons)
      .toContain("mixed_correct_and_incorrect");
    expect(snapshot.evidenceIds).toEqual(
      expect.arrayContaining([
        "evaluator:sunny:word_bank",
        "evaluator:shiny:attempt_log",
      ]),
    );
  });

  it("uses the selected homework cycle targets instead of blending in pending homework words", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = baseProfile(childId);
    profile.pendingHomework = {
      ...profile.pendingHomework!,
      wordList: ["erosion", "rocks"],
      homeworkId: "hw-reading-current",
      capturedContent: {
        ...profile.pendingHomework!.capturedContent!,
        words: ["erosion", "rocks"],
      },
    };
    writeChild(root, childId, profile);
    writeJson(
      root,
      `src/context/${childId}/homework/cycles/hw-spelling-week.json`,
      erosionCycle({
        homeworkId: "hw-spelling-week",
        subject: "spelling_test",
        wordList: ["sunny", "neatly"],
        capturedContent: {
          ...profile.pendingHomework!.capturedContent!,
          title: "Spelling Week",
          type: "spelling_test",
          words: ["sunny", "neatly"],
          questions: [],
        },
      }),
    );

    const snapshot = buildAdaptiveEvidenceSnapshot(childId, {
      rootDir: root,
      homeworkId: "hw-spelling-week",
    });

    expect(snapshot.evaluator.items.map((item) => item.target)).toEqual([
      "sunny",
      "neatly",
    ]);
    expect(snapshot.evaluator.buckets.unknown).toEqual(["sunny", "neatly"]);
  });
});
