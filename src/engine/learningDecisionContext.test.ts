import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createFreshSM2Track } from "../context/schemas/wordBank";
import type { AIContentCatalogItem } from "../context/schemas/learningProfile";
import type { HomeworkCycle } from "../context/schemas/homeworkCycle";
import {
  appendChildActivityEvidence,
  buildLearningDecisionContext,
  buildHomeworkContentCatalogItems,
  catalogContentItem,
  recordGradedHomeworkCalibration,
  updateContentCatalogFromActivityEvidence,
  upsertProfileContentCatalog,
  validateContentCatalogItem,
} from "./learningDecisionContext";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  rankHomeworkCycleCandidates,
  runUploadGradedHomework,
} from "../scripts/uploadGradedHomework";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-decision-context-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readJson<T>(root: string, rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T;
}

function baseProfile(childId: string) {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [],
  });
  profile.sessionStats.totalSessions = 3;
  profile.pendingHomework = {
    weekOf: "2026-05-01",
    testDate: "2026-05-06",
    wordList: ["erosion", "sediment"],
    homeworkId: "hw-reading-erosion",
    contentProfile: {
      practiceDomain: "reading",
      contentDomain: "science",
      topic: "erosion",
      primarySkill: "reading_comprehension",
      assignmentFormat: "study_guide",
      concepts: ["erosion", "water", "soil"],
      sourceEvidence: ["PDF says water carries soil downhill."],
    },
    capturedContent: {
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water carries soil downhill and changes the landform.",
      words: ["erosion", "sediment"],
      questions: [{ id: 1, question: "What carries soil?", correctAnswer: "water" }],
      sourceDocuments: [{ filename: "Test for May 6.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "water", "soil"],
        sourceEvidence: ["PDF says water carries soil downhill."],
      },
    },
    generatedAt: "2026-05-01T12:00:00.000Z",
    nodes: [],
  };
  return profile;
}

function catalogItem(
  overrides: Partial<AIContentCatalogItem> = {},
): AIContentCatalogItem {
  return {
    contentId: "story-erosion-1",
    homeworkId: "hw-reading-erosion",
    childId: "reina",
    type: "story",
    source: "generated",
    title: "Reina and the Hill That Changed",
    algorithmTargets: ["reading-comprehension", "retrieval-practice"],
    targetSkills: ["reading_comprehension"],
    targetConcepts: ["erosion", "soil"],
    targetWords: ["erosion"],
    engagementHooks: ["challenge", "strategy"],
    inputEvidence: {
      contentFingerprint: "fingerprint-erosion",
    },
    reuseStatus: "candidate",
    reuseReason: "New generated content needs evidence.",
    ...overrides,
  };
}

function erosionCycle(overrides: Partial<HomeworkCycle> = {}): HomeworkCycle {
  return {
    homeworkId: "hw-reading-erosion",
    subject: "reading",
    wordList: ["erosion", "sediment"],
    contentProfile: {
      practiceDomain: "reading",
      contentDomain: "science",
      topic: "erosion",
      primarySkill: "reading_comprehension",
      assignmentFormat: "study_guide",
      concepts: ["erosion", "soil", "water"],
      sourceEvidence: ["PDF says water carries soil downhill."],
    },
    capturedContent: {
      title: "Erosion Study Guide",
      type: "reading",
      rawText: "Water carries soil downhill and changes the landform.",
      words: ["erosion", "sediment"],
      questions: [{ id: 1, question: "What carries soil?", correctAnswer: "water" }],
      sourceDocuments: [{ filename: "Test for May 6.pdf", mediaType: "application/pdf" }],
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "soil", "water"],
        sourceEvidence: ["PDF says water carries soil downhill."],
      },
    },
    contentFingerprint: "fingerprint-erosion",
    calibrationStatus: "unverified",
    ingestedAt: "2026-05-01",
    testDate: "2026-05-06",
    assumptions: null,
    theory: {
      theoryId: "theory-1",
      stage: "pre_quest",
      createdAt: "2026-05-01T12:00:00.000Z",
      hypothesis: "Internal vowels are the likely gap.",
      predictedPattern: "spelling:vowel_omission",
      predictedRiskWords: ["blister", "cluster"],
      intervention: "letter-by-letter construction",
      successCriteria: { minAccuracy: 0.8, minImprovement: 0.15 },
      evidence: ["prior attempts"],
      status: "pending",
      markdown: "## Hypothesis\nInternal vowels are the likely gap.",
    },
    postAnalysis: null,
    scanResult: null,
    delta: null,
    metrics: null,
    ...overrides,
  };
}

describe("LearningDecisionContext", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("centralizes profile, homework, SM2, attempt patterns, and quest threshold evidence", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, {
      childId,
      version: 1,
      lastUpdated: "2026-05-01T00:00:00.000Z",
      words: [
        {
          word: "erosion",
          addedAt: "2026-05-01T00:00:00.000Z",
          source: "homework",
          tracks: { reading: createFreshSM2Track("2026-05-01") },
        },
      ],
    });
    const attemptsDir = path.join(root, "src", "context", childId, "attempts");
    fs.mkdirSync(attemptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(attemptsDir, "2026-05-01.ndjson"),
      [
        {
          word: "blister",
          correct: false,
          domain: "spelling",
          attemptedValue: "blster",
          timestamp: "2026-05-01T10:00:00.000Z",
          sessionId: "s1",
        },
        {
          word: "cluster",
          correct: false,
          domain: "spelling",
          attemptedValue: "clster",
          timestamp: "2026-05-01T10:05:00.000Z",
          sessionId: "s1",
        },
        {
          word: "blister",
          correct: false,
          domain: "spelling",
          attemptedValue: "blster",
          timestamp: "2026-05-02T10:00:00.000Z",
          sessionId: "s2",
        },
      ].map((record) => JSON.stringify(record)).join("\n"),
      "utf8",
    );

    const context = buildLearningDecisionContext(childId, {
      rootDir: root,
      now: new Date("2026-05-02T12:00:00.000Z"),
    });

    expect(context.chart.childId).toBe(childId);
    expect(context.chart.links.learningProfile).toContain("learning_profile.json");
    expect(context.homework?.topic).toBe("erosion");
    expect(context.homework?.urgency).toBe("high");
    expect(context.memory.dueWords).toEqual(["erosion"]);
    expect(context.diagnostics.strongPatterns[0]?.errorType).toBe("spelling:vowel_omission");
    expect(context.diagnostics.questThreshold.unlocked).toBe(true);
    expect(context.algorithmFeeds.map((feed) => feed.id)).toEqual([
      "spaced-repetition",
      "error-pattern-detector",
      "quest-threshold",
      "activity-affinity",
      "attention-vitals",
      "calibration-journal",
    ]);
  });

  it("uses measured attention model instead of treating demographics.attentionSpan as static truth", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    const profile = baseProfile(childId);
    profile.demographics.attentionSpan = "moderate";
    profile.attentionModel = {
      source: "session_vitals",
      status: "measured",
      currentWindow_ms: 150_000,
      bestWindow_ms: 210_000,
      trend: "declining",
      confidence: 0.78,
      lastMeasuredAt: "2026-05-03T12:00:00.000Z",
      evidence: ["idle gap after 2m30s", "abandoned word-builder"],
    };
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);

    const context = buildLearningDecisionContext(childId, {
      rootDir: root,
      now: new Date("2026-05-03T13:00:00.000Z"),
    });

    expect(context.profile.attention.label).toBe("short");
    expect(context.profile.attention.source).toBe("session_vitals");
    expect(context.profile.attention.currentWindow_ms).toBe(150_000);
    expect(context.profile.attention.legacyDemographicLabel).toBe("moderate");
    expect(context.algorithmFeeds.map((feed) => feed.id)).toContain("attention-vitals");
  });

  it("appends activity evidence to the child profile as the current activity model", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));

    const updated = appendChildActivityEvidence(childId, {
      activityId: "countdown-comprehension",
      domain: "reading",
      completed: false,
      accuracy: 0.4,
      engagementScore: 0.8,
      frustrationScore: 0.6,
      missedWords: ["erosion"],
      occurredAt: "2026-05-02T13:00:00.000Z",
    }, { rootDir: root });

    expect(updated.activityModel?.["countdown-comprehension"]?.plays).toBe(1);
    expect(updated.activityModel?.["countdown-comprehension"]?.completionRate).toBe(0);
    expect(updated.activityModel?.["countdown-comprehension"]?.averageAccuracy).toBe(0.4);
    expect(updated.activityModel?.["countdown-comprehension"]?.frustrationScore).toBe(0.6);

    const persisted = readJson<ReturnType<typeof baseProfile> & {
      activityModel?: Record<string, { plays: number }>;
    }>(root, `src/context/${childId}/learning_profile.json`);
    expect(persisted.activityModel?.["countdown-comprehension"]?.plays).toBe(1);
  });

  it("updates bounded adaptive load from strong and weak activity evidence", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));

    const strong = appendChildActivityEvidence(childId, {
      activityId: "monster-stampede",
      domain: "spelling",
      completed: true,
      accuracy: 0.95,
      engagementScore: 0.9,
      frustrationScore: 0.05,
      targetCount: 5,
      timeSpent_ms: 25_000,
      occurredAt: "2026-05-02T13:00:00.000Z",
    }, { rootDir: root });

    expect(strong.adaptiveLoadState?.spelling?.currentCohortSize).toBe(10);
    expect(strong.adaptiveLoadState?.spelling?.challengeRecommendation).toBe("expand_cohort");
    expect(strong.adaptiveLoadState?.spelling?.lastLoadEvidence.activityId).toBe("monster-stampede");

    const weak = appendChildActivityEvidence(childId, {
      activityId: "letter-rush",
      domain: "spelling",
      completed: false,
      accuracy: 0.4,
      engagementScore: 0.3,
      frustrationScore: 0.8,
      targetCount: 10,
      timeSpent_ms: 90_000,
      missedWords: ["above"],
      occurredAt: "2026-05-02T13:10:00.000Z",
    }, { rootDir: root });

    expect(weak.adaptiveLoadState?.spelling?.currentCohortSize).toBe(5);
    expect(weak.adaptiveLoadState?.spelling?.challengeRecommendation).toBe("targeted_support");
    expect(weak.adaptiveLoadState?.spelling?.lastLoadEvidence.strongEvidence).toBe(false);
  });

  it("records graded homework calibration so theory can be supported or falsified by reality", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, {
      homeworkId: "hw-reading-erosion",
      subject: "reading",
      wordList: ["blister", "cluster"],
      ingestedAt: "2026-05-01",
      testDate: "2026-05-06",
      assumptions: null,
      theory: {
        theoryId: "theory-1",
        stage: "pre_quest",
        createdAt: "2026-05-01T12:00:00.000Z",
        hypothesis: "Internal vowels are the likely gap.",
        predictedPattern: "spelling:vowel_omission",
        predictedRiskWords: ["blister", "cluster"],
        intervention: "letter-by-letter construction",
        successCriteria: { minAccuracy: 0.8, minImprovement: 0.15 },
        evidence: ["prior attempts"],
        status: "pending",
        markdown: "## Hypothesis\nInternal vowels are the likely gap.",
      },
      postAnalysis: null,
      scanResult: null,
      delta: null,
      metrics: null,
    });

    const entry = recordGradedHomeworkCalibration(childId, {
      homeworkId: "hw-reading-erosion",
      gradedAt: "2026-05-07T15:00:00.000Z",
      score: 0.7,
      gradedItems: [
        {
          target: "blister",
          correct: false,
          observedErrorType: "spelling:vowel_omission",
          note: "missing internal vowel",
        },
      ],
      teacherNotes: "Still missing internal vowels after practice.",
    }, { rootDir: root });

    expect(entry.status).toBe("supported");
    expect(entry.predictedPattern).toBe("spelling:vowel_omission");
    expect(entry.observedMisses[0]?.target).toBe("blister");

    const profile = readJson<{ learningCalibrationJournal?: Array<{ status: string }> }>(
      root,
      `src/context/${childId}/learning_profile.json`,
    );
    expect(profile.learningCalibrationJournal?.[0]?.status).toBe("supported");

    const cycle = readJson<{ calibrationJournal?: Array<{ status: string }> }>(
      root,
      `src/context/${childId}/homework/cycles/hw-reading-erosion.json`,
    );
    expect(cycle.calibrationJournal?.[0]?.status).toBe("supported");
  });

  it("rejects generated content that has no learning algorithm target", () => {
    const invalid = catalogItem({ algorithmTargets: [] });
    expect(validateContentCatalogItem(invalid)).toEqual({
      ok: false,
      error: "content_missing_algorithm_targets",
    });
  });

  it("catalogs generated story/image and prototype baseline content with algorithm targets", () => {
    const childId = "reina";
    const cycle = erosionCycle();
    const capturedContent = cycle.capturedContent;
    if (!capturedContent || !cycle.contentFingerprint) {
      throw new Error("test fixture missing captured content");
    }

    const items = buildHomeworkContentCatalogItems({
      childId,
      homeworkId: cycle.homeworkId,
      capturedContent,
      contentFingerprint: cycle.contentFingerprint,
      nodes: [
        {
          id: "n-karaoke-hw-reading-erosion",
          type: "karaoke",
          words: ["Reina", "studied", "erosion"],
          storyTitle: "Reina and the Hill That Changed",
          storyImagePrompt: "Reina studies erosion outdoors.",
          rationale: "Build background knowledge for erosion.",
        },
      ],
      baselineActivities: [
        {
          id: "reading-mode",
          sourcePrototype: "Reading Mode Standalone.html",
          reason: "Captured homework has readable passage text.",
        },
        {
          id: "countdown-comprehension",
          sourcePrototype: "Countdown Standalone.html",
          reason: "Captured homework has comprehension questions.",
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "story",
      "image",
      "reading-mode",
      "countdown",
    ]);
    expect(items.every((item) => item.algorithmTargets.length > 0)).toBe(true);
    expect(items.find((item) => item.type === "image")?.algorithmTargets).toContain("variable-reward");
    expect(items.find((item) => item.type === "reading-mode")?.source).toBe("prototype");

    const profile = upsertProfileContentCatalog(baseProfile(childId), items);
    expect(profile.aiContentCatalog?.map((item) => item.contentId)).toEqual(
      items.map((item) => item.contentId),
    );
  });

  it("classifies cataloged content as reuse, revise, or retire from activity evidence", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));

    catalogContentItem(childId, catalogItem({ contentId: "good-story" }), { rootDir: root });
    catalogContentItem(childId, catalogItem({ contentId: "engaging-but-hard" }), { rootDir: root });
    catalogContentItem(childId, catalogItem({ contentId: "frustrating-story" }), { rootDir: root });

    updateContentCatalogFromActivityEvidence(childId, {
      activityId: "reading-mode",
      domain: "reading",
      contentId: "good-story",
      completed: true,
      accuracy: 0.86,
      engagementScore: 0.83,
      frustrationScore: 0.1,
    }, { rootDir: root });
    updateContentCatalogFromActivityEvidence(childId, {
      activityId: "reading-mode",
      domain: "reading",
      contentId: "engaging-but-hard",
      completed: true,
      accuracy: 0.42,
      engagementScore: 0.9,
      frustrationScore: 0.22,
    }, { rootDir: root });
    const profile = updateContentCatalogFromActivityEvidence(childId, {
      activityId: "reading-mode",
      domain: "reading",
      contentId: "frustrating-story",
      completed: false,
      accuracy: 0.2,
      engagementScore: 0.2,
      frustrationScore: 0.88,
    }, { rootDir: root });

    const byId = new Map(profile.aiContentCatalog?.map((item) => [item.contentId, item]));
    expect(byId.get("good-story")?.reuseStatus).toBe("reuse");
    expect(byId.get("engaging-but-hard")?.reuseStatus).toBe("revise");
    expect(byId.get("frustrating-story")?.reuseStatus).toBe("retire");

    const context = buildLearningDecisionContext(childId, { rootDir: root });
    expect(context.contentCatalog.reusable.map((item) => item.contentId)).toContain("good-story");
    expect(context.contentCatalog.needsRevision.map((item) => item.contentId)).toContain("engaging-but-hard");
    expect(context.contentCatalog.retired.map((item) => item.contentId)).toContain("frustrating-story");
  });

  it("lets graded calibration downgrade reused content when transfer evidence falsifies the theory", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = baseProfile(childId);
    profile.aiContentCatalog = [
      catalogItem({
        contentId: "story-erosion-1",
        reuseStatus: "reuse",
        reuseReason: "In-app practice looked strong.",
      }),
    ];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, erosionCycle());

    const entry = recordGradedHomeworkCalibration(childId, {
      homeworkId: "hw-reading-erosion",
      gradedAt: "2026-05-08T10:00:00.000Z",
      score: 0.62,
      gradedItems: [
        {
          target: "cluster",
          correct: false,
          observedErrorType: "spelling:ending_confusion",
        },
      ],
    }, { rootDir: root });

    expect(entry.status).toBe("falsified");
    const updated = readJson<{ aiContentCatalog?: AIContentCatalogItem[] }>(
      root,
      `src/context/${childId}/learning_profile.json`,
    );
    expect(updated.aiContentCatalog?.[0]?.reuseStatus).toBe("revise");
    expect(updated.aiContentCatalog?.[0]?.reuseReason).toContain("Graded evidence falsified");
  });

  it("ranks a graded upload against prior homework cycles by educated evidence", () => {
    const mathCycle = erosionCycle({
      homeworkId: "hw-math-facts",
      subject: "math",
      wordList: ["addition"],
      contentProfile: {
        practiceDomain: "math",
        contentDomain: "math",
        topic: "addition",
        primarySkill: "addition_facts",
        assignmentFormat: "worksheet",
        concepts: ["addition"],
        sourceEvidence: ["math worksheet"],
      },
      capturedContent: null,
      testDate: "2026-05-14",
    });

    const candidates = rankHomeworkCycleCandidates({
      childId: "reina",
      sourceFile: "/Users/jamaltaylor/Downloads/Test for May 6.pdf",
      title: "Test for May 6",
      words: ["erosion", "sediment"],
      concepts: ["erosion", "soil", "water"],
      questions: ["What carries soil?"],
      testDate: "2026-05-06",
      gradedItems: [],
    }, [mathCycle, erosionCycle()]);

    expect(candidates[0]?.homeworkId).toBe("hw-reading-erosion");
    expect(candidates[0]?.confidence).toBeGreaterThan(candidates[1]?.confidence ?? 0);
    expect(candidates[0]?.evidence.join(" ")).toContain("same source filename");
  });

  it("ranks a returned graded upload by homework return tag even when filenames differ", () => {
    const taggedCycle = erosionCycle({
      homeworkId: "hw-spelling_test-bb11de93",
      subject: "spelling_test",
      wordList: ["above", "ago"],
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "schwa words",
        primarySkill: "spelling",
        assignmentFormat: "word_list",
        concepts: ["schwa"],
        sourceEvidence: ["fixture"],
      },
      capturedContent: null,
      testDate: "2026-05-15",
      returnTag: "#sunny_reina_hw_spelling_test_bb11de93",
    });
    const otherCycle = erosionCycle({
      homeworkId: "hw-spelling_test-other",
      subject: "spelling_test",
      wordList: ["above", "ago"],
      capturedContent: null,
      testDate: "2026-05-15",
    });

    const candidates = rankHomeworkCycleCandidates({
      childId: "reina",
      sourceFile: "/Users/jamaltaylor/Downloads/returned-test-photo.txt",
      title: "returned test photo",
      rawText: "Teacher returned #sunny_reina_hw_spelling_test_bb11de93 with one miss.",
      words: [],
      concepts: [],
      questions: [],
      testDate: null,
      gradedItems: [],
    }, [otherCycle, taggedCycle]);

    expect(candidates[0]?.homeworkId).toBe("hw-spelling_test-bb11de93");
    expect(candidates[0]?.evidence.join(" ")).toContain("return tag");
  });

  it("upload dry-run ranks prior assignments and writes no calibration or unmatched file", async () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const uploadFile = path.join(root, "Test for May 6.txt");
    fs.writeFileSync(uploadFile, "erosion sediment soil water", "utf8");
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, erosionCycle());

    await runUploadGradedHomework([
      `--child=${childId}`,
      `--pdf=${uploadFile}`,
      "--dry-run",
    ], {
      rootDir: root,
      logger: { log: () => undefined },
    });

    const cycle = readJson<HomeworkCycle>(
      root,
      `src/context/${childId}/homework/cycles/hw-reading-erosion.json`,
    );
    expect(cycle.calibrationJournal).toBeUndefined();
    expect(fs.existsSync(path.join(root, `src/context/${childId}/homework/unmatched`))).toBe(false);
  });

  it("confirmed upload writes calibration and low-confidence upload goes unmatched", async () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const matchedUpload = path.join(root, "Test for May 6.txt");
    const unmatchedUpload = path.join(root, "Random returned worksheet.txt");
    fs.writeFileSync(matchedUpload, "erosion sediment soil water", "utf8");
    fs.writeFileSync(unmatchedUpload, "unrelated fractions multiplication", "utf8");
    writeJson(root, `src/context/${childId}/learning_profile.json`, baseProfile(childId));
    writeJson(root, `src/context/${childId}/homework/cycles/hw-reading-erosion.json`, erosionCycle());

    await runUploadGradedHomework([
      `--child=${childId}`,
      `--pdf=${matchedUpload}`,
      "--yes",
    ], {
      rootDir: root,
      logger: { log: () => undefined },
      now: new Date("2026-05-08T10:00:00.000Z"),
    });

    const cycle = readJson<HomeworkCycle>(
      root,
      `src/context/${childId}/homework/cycles/hw-reading-erosion.json`,
    );
    expect(cycle.calibrationJournal?.[0]?.homeworkId).toBe("hw-reading-erosion");

    await runUploadGradedHomework([
      `--child=${childId}`,
      `--pdf=${unmatchedUpload}`,
      "--yes",
    ], {
      rootDir: root,
      logger: { log: () => undefined },
      now: new Date("2026-05-09T10:00:00.000Z"),
    });

    const unmatchedDir = path.join(root, `src/context/${childId}/homework/unmatched`);
    expect(fs.readdirSync(unmatchedDir).some((file) => file.endsWith(".json"))).toBe(true);
  });
});
