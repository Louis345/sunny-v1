import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningProfile } from "../context/schemas/learningProfile";
import { getChildChart } from "../profiles/childChart";
import { initializeLearningProfile } from "../utils/learningProfileIO";
import {
  activeSessionPlanRefreshReason,
  buildAdventureMapFromSessionPlan,
  planHomeworkSessionFromChart,
  writeActiveSessionPlan,
} from "./sessionPlanFromChart";

const WORDS = [
  "above",
  "ago",
  "about",
  "ahead",
  "away",
  "alone",
  "alike",
  "awake",
  "along",
  "again",
];
const HIGH_FREQUENCY_WORDS = [
  "ago",
  "government",
  "half",
  "machine",
  "pair",
  "quickly",
  "scientist",
  "thousand",
  "understood",
  "wait",
];
const WORD_RADAR_LETTER_FILL_CONFIG = {
  recallMode: "partial_visual_recall" as const,
  inputMode: "letter-by-letter" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};
const WORD_RADAR_VISIBLE_READ_CONFIG = {
  recallMode: "visible_read" as const,
  inputMode: "whole-word" as const,
  speakStyle: "option-a" as const,
  showTimer: false,
  hideWordDuringResponse: false,
  requiresCapturedResponse: true,
};
const WORD_RADAR_HIDDEN_RECALL_CONFIG = {
  recallMode: "hidden_word_recall" as const,
  inputMode: "whole-word" as const,
  speakStyle: "option-b" as const,
  showTimer: true,
  timerSeconds: 8,
  hideWordDuringResponse: true,
  requiresCapturedResponse: true,
};

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sunny-chart-plan-"));
}

function writeJson(root: string, rel: string, value: unknown): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function profileWithHomework(childId: string): LearningProfile {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: ["spelling"],
  });
  profile.pendingHomework = {
    weekOf: "2026-05-12",
    homeworkId: "hw-spelling_test-bb11de93",
    testDate: "2026-05-15",
    testDateSource: "cli",
    testDateConfirmed: true,
    returnTag: "#sunny_reina_hw_spelling_test_bb11de93",
    wordList: WORDS,
    generatedAt: "2026-05-12T10:00:00.000Z",
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "spelling",
      topic: "Schwa sound and high-frequency words",
      primarySkill: "Spelling recall",
      assignmentFormat: "Spelling test",
      concepts: ["schwa", "high-frequency words"],
      sourceEvidence: ["worksheet"],
    },
    capturedContent: null,
    completedAdventureNodeIds: [
      "n-word-radar-hw-spelling_test-bb11de93",
      "n-spell-check-hw-spelling_test-bb11de93",
      "n-monster-stampede-hw-spelling_test-bb11de93",
      "n-pronunciation-hw-spelling_test-bb11de93",
      "n-mystery-hw-spelling_test-bb11de93",
    ],
    nodes: [
      {
        id: "n-word-radar-hw-spelling_test-bb11de93",
        type: "word-radar",
        words: WORDS.slice(0, 5),
        difficulty: 2,
        gameFile: null,
        storyFile: null,
        wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
      },
      {
        id: "n-spell-check-hw-spelling_test-bb11de93",
        type: "spell-check",
        words: WORDS.slice(5),
        difficulty: 2,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: "n-monster-stampede-hw-spelling_test-bb11de93",
        type: "monster-stampede",
        words: WORDS.slice(0, 5),
        difficulty: 2,
        gameFile: "monster-stampede.html",
        storyFile: null,
      },
      {
        id: "n-pronunciation-hw-spelling_test-bb11de93",
        type: "pronunciation",
        words: WORDS.slice(0, 5),
        difficulty: 2,
        gameFile: null,
        storyFile: null,
      },
      {
        id: "n-quest-hw-spelling_test-bb11de93",
        type: "quest",
        words: WORDS,
        difficulty: 3,
        gameFile: "quest.html",
        storyFile: null,
        adaptiveArtifact: {
          artifactId: "artifact-quest",
          contentId: "content-quest",
          homeworkId: "hw-spelling_test-bb11de93",
          theoryId: "theory-quest",
          generationStage: "quest",
          targetGroupIds: [],
          homeworkWordIds: [],
          baselineEvidenceIds: [],
          generatedPath: "quest.html",
          validationStatus: "failed",
          validationReport: {
            passed: false,
            score: 0.2,
            failures: ["answer leaked"],
            warnings: [],
            attempts: 2,
            validatedAt: "2026-05-12T10:30:00.000Z",
          },
        },
      },
    ],
  };
  profile.adaptiveLoadState = {
    spelling: {
      domain: "spelling",
      currentCohortSize: 10,
      maxRecentSuccessfulCohort: 10,
      challengeRecommendation: "expand_cohort",
      lastLoadEvidence: {
        activityId: "pronunciation",
        completed: true,
        accuracy: 1,
        targetCount: 10,
        frustrationScore: 0.05,
        strongEvidence: true,
        occurredAt: "2026-05-12T23:00:00.000Z",
      },
    },
  };
  return profile;
}

function profileWithGroupedHomework(childId: string): LearningProfile {
  const profile = profileWithHomework(childId);
  profile.pendingHomework!.wordList = [...WORDS, ...HIGH_FREQUENCY_WORDS.slice(1)];
  profile.pendingHomework!.capturedContent = {
    title: "Benchmark Advance Spelling Unit 9 Week 2",
    type: "spelling_test",
    rawText: "",
    words: profile.pendingHomework!.wordList,
    homeworkWords: [
      ...WORDS.map((word, index) => ({
        text: word,
        normalizedText: word,
        wordGroupId: "schwa_words",
        purpose: "spell_from_memory",
        positionIndex: index,
      })),
      ...HIGH_FREQUENCY_WORDS.map((word, index) => ({
        text: word,
        normalizedText: word,
        wordGroupId: "high_frequency_words",
        purpose: "recognize",
        positionIndex: WORDS.length + index,
      })),
    ],
    questions: [],
    wordGroups: [
      {
        id: "schwa_words",
        wordGroupId: "schwa_words",
        label: "Schwa",
        purpose: "spell_from_memory",
        words: WORDS,
        confidence: 0.95,
      },
      {
        id: "high_frequency_words",
        wordGroupId: "high_frequency_words",
        label: "High-Frequency Words",
        purpose: "recognize",
        words: HIGH_FREQUENCY_WORDS,
        confidence: 0.95,
      },
    ],
  } as unknown as NonNullable<LearningProfile["pendingHomework"]>["capturedContent"];
  profile.pendingHomework!.nodes = [
    ...profile.pendingHomework!.nodes.filter((node) => node.type !== "pronunciation"),
    {
      id: "n-pronunciation-hw-spelling_test-bb11de93",
      type: "pronunciation",
      words: WORDS.slice(0, 5),
      difficulty: 2,
      gameFile: null,
      storyFile: null,
    },
  ];
  return profile;
}

describe("patient-chart session plan", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes an active session plan onto the chart and exposes it through getChildChart", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    expect(chart.homework.selectedDomain).toBe("spelling");
    expect(chart.homework.activeByDomain.spelling?.homeworkId).toBe("hw-spelling_test-bb11de93");
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
      parentNote: "Keep spelling active, but stop replaying the same five words.",
    });
    writeActiveSessionPlan(childId, plan, { rootDir: root });

    const updated = getChildChart(childId, { rootDir: root });

    expect(updated.activeSessionPlan?.planId).toBe(plan.planId);
    expect(updated.activeSessionPlan?.source).toBe("ingest_human_loop");
    expect(updated.activeSessionPlan?.activeHomeworkId).toBe("hw-spelling_test-bb11de93");
    expect(updated.activeSessionPlan?.companionPolicy.openingLinePolicy).toBe("context_start_short");
  });

  it("writes active session plans into domain lanes without overwriting another selected lane", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.selectedHomeworkDomain = "spelling";
    profile.activeHomeworkByDomain = {
      spelling: profile.pendingHomework!,
      reading: {
        weekOf: "2026-05-13",
        homeworkId: "hw-reading-erosion",
        testDate: "2026-05-20",
        wordList: ["erosion"],
        generatedAt: "2026-05-13T10:00:00.000Z",
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading comprehension",
          assignmentFormat: "study guide",
          concepts: ["erosion"],
          sourceEvidence: ["worksheet"],
        },
        capturedContent: null,
        nodes: [
          {
            id: "n-karaoke-hw-reading-erosion",
            type: "karaoke",
            words: ["erosion"],
            difficulty: 1,
            gameFile: null,
            storyFile: null,
          },
        ],
      },
    };
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const spellingChart = getChildChart(childId, { rootDir: root });
    const spellingPlan = planHomeworkSessionFromChart(spellingChart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    writeActiveSessionPlan(childId, spellingPlan, { rootDir: root });

    const readingPlan = {
      ...spellingPlan,
      planId: "session_plan_reina_hw-reading-erosion_test",
      activeHomeworkId: "hw-reading-erosion",
      domain: "reading",
      testDate: "2026-05-20",
    };
    writeActiveSessionPlan(childId, readingPlan, { rootDir: root });

    const raw = JSON.parse(
      fs.readFileSync(path.join(root, `src/context/${childId}/learning_profile.json`), "utf8"),
    ) as LearningProfile;
    expect(raw.activeSessionPlan?.planId).toBe(spellingPlan.planId);
    expect(raw.activeSessionPlanByDomain?.spelling?.planId).toBe(spellingPlan.planId);
    expect(raw.activeSessionPlanByDomain?.reading?.planId).toBe(readingPlan.planId);
    expect(getChildChart(childId, { rootDir: root }).activeSessionPlan?.planId).toBe(spellingPlan.planId);
  });

  it("keeps strong spelling evidence in node config without emitting a global word plan", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect("wordPlan" in plan).toBe(false);
    expect(plan.variationPolicy.avoidExactPreviousNodeOrder).toBe(true);
    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_LETTER_FILL_CONFIG);
    expect(plan.nodePlan.find((node) => node.type === "pronunciation")?.pronunciationConfig).toMatchObject({
      baseWordCount: 5,
      targetFlowWordCount: 5,
      maxWordCount: 5,
      expansionPolicy: "on_mastery_or_child_replay",
      masteryGate: {
        accuracyAtLeast: 0.85,
        minStreak: 5,
        noFrustrationSignal: true,
      },
      supportPolicy: "slow_on_help_or_repeated_miss",
    });
    expect(plan.nodePlan.map((node) => node.type).slice(0, 4)).toEqual([
      "word-radar",
      "monster-stampede",
      "spell-check",
      "pronunciation",
    ]);
  });

  it("uses chart-attached adaptive interventions instead of replaying stale pending node shells", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.pendingHomework!.completedAdventureNodeIds = [];
    profile.pendingHomework!.nodes[0] = {
      ...profile.pendingHomework!.nodes[0]!,
      adaptivePlan: {
        schemaVersion: 1,
        childId,
        homeworkId: "hw-spelling_test-bb11de93",
        domain: "spelling",
        topic: "Schwa sound and high-frequency words",
        nodeBudget: 3,
        assertions: [
          {
            id: "baseline-before-practice",
            claim: "Start with hidden spelling recall before scaffolded practice.",
            confidence: 0.95,
            evidence: ["captured homework words"],
            falsifiedBy: ["word-radar visible scan launches first"],
          },
        ],
        nodes: [
          {
            id: "letter-rush-baseline",
            activityId: "letter-rush",
            nodeType: "letter-rush",
            mode: "type-and-spell",
            purpose: "evaluate",
            configFilename: "letter-rush-baseline.json",
            evidenceNeeded: ["per_word_accuracy"],
            rationale: "Measure independent recall first.",
          },
          {
            id: "letter-rush-pattern-practice",
            activityId: "letter-rush",
            nodeType: "letter-rush",
            mode: "trap-the-imposter",
            purpose: "practice",
            configFilename: "letter-rush-pattern-practice.json",
            evidenceNeeded: ["pattern_discrimination"],
            rationale: "Practice the error pattern after measurement.",
          },
          {
            id: "letter-rush-mastery-check",
            activityId: "letter-rush",
            nodeType: "letter-rush",
            mode: "mastery-run",
            purpose: "evaluate",
            configFilename: "letter-rush-mastery-check.json",
            evidenceNeeded: ["per_word_accuracy"],
            rationale: "Recheck recall after practice.",
          },
        ],
        dopamineBreak: {
          status: "eligible-after-evidence",
          reason: "Reward only after measurement.",
          candidateToolIds: ["mystery"],
        },
        questGate: {
          status: "eligible-after-evidence",
          contentGenerationConfidenceThreshold: 0.8,
          requires: ["baseline_per_word_results"],
          reason: "Quest generation waits for measured evidence.",
        },
      },
    } as NonNullable<LearningProfile["pendingHomework"]>["nodes"][number];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(plan.nodePlan.map((node) => node.id).slice(0, 3)).toEqual([
      "n-letter-rush-baseline-hw-spelling_test-bb11de93",
      "n-letter-rush-pattern-practice-hw-spelling_test-bb11de93",
      "n-letter-rush-mastery-check-hw-spelling_test-bb11de93",
    ]);
    expect(plan.nodePlan.map((node) => node.type).slice(0, 3)).toEqual([
      "letter-rush",
      "letter-rush",
      "letter-rush",
    ]);
    expect(plan.evidenceUsed.map((item) => item.type)).toContain("adaptive_homework_plan");
  });

  it("filters stale reinforce words out of active spelling-test plans", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.pendingHomework!.reinforceWords = ["figure", "slowly", "coldest", "above"];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan);
    const allTargets = [
      ...nodes.flatMap((node) => [
        ...(node.words ?? []),
        ...(node.wordRadarItems ?? []).map((item) => item.display),
        ...(node.choiceOptions ?? []).map((option) => option.label),
      ]),
    ];

    expect(allTargets).toContain("above");
    expect(allTargets).not.toContain("figure");
    expect(allTargets).not.toContain("coldest");
  });

  it("keeps reading homework plan targets inside captured reading evidence", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.selectedHomeworkDomain = "reading";
    profile.pendingHomework = {
      weekOf: "2026-05-13",
      homeworkId: "hw-reading-erosion",
      testDate: "2026-05-20",
      wordList: ["erosion", "soil"],
      reinforceWords: ["figure", "erosion"],
      generatedAt: "2026-05-13T10:00:00.000Z",
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "erosion",
        primarySkill: "reading comprehension",
        assignmentFormat: "study guide",
        concepts: ["erosion", "deposition"],
        sourceEvidence: ["worksheet"],
      },
      capturedContent: {
        title: "Erosion Study Guide",
        type: "reading",
        rawText: "Erosion moves soil.",
        words: ["erosion", "soil"],
        questions: [{ id: 1, question: "What moves soil?", correctAnswer: "erosion" }],
        sourceDocuments: [],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "erosion",
          primarySkill: "reading comprehension",
          assignmentFormat: "study guide",
          concepts: ["erosion", "deposition"],
          sourceEvidence: ["worksheet"],
        },
      },
      completedAdventureNodeIds: [],
      nodes: [
        {
          id: "n-karaoke-hw-reading-erosion",
          type: "karaoke",
          words: ["Erosion", "moves", "soil"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
          storyText: "Erosion moves soil.",
        },
        {
          id: "n-pronunciation-hw-reading-erosion",
          type: "pronunciation",
          words: ["erosion", "figure"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
    };
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan);

    expect(nodes.find((node) => node.type === "karaoke")?.storyText).toBe("Erosion moves soil.");
    expect(nodes.flatMap((node) => node.words ?? [])).toContain("erosion");
    expect(nodes.flatMap((node) => node.words ?? [])).not.toContain("figure");
  });

  it("starts weak or unknown Word Radar evidence with flash-then-slot recall", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    delete profile.adaptiveLoadState;
    profile.pendingHomework!.completedAdventureNodeIds = [];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.targets).toHaveLength(5);
    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_LETTER_FILL_CONFIG);
    expect(plan.nodePlan.find((node) => node.type === "pronunciation")?.pronunciationConfig).toMatchObject({
      baseWordCount: 5,
      targetFlowWordCount: 5,
      maxWordCount: 5,
      expansionPolicy: "on_mastery_or_child_replay",
      supportPolicy: "slow_on_help_or_repeated_miss",
    });
  });

  it("preserves planned visible-read Word Radar configs when launching the map", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    delete profile.adaptiveLoadState;
    profile.pendingHomework!.completedAdventureNodeIds = [];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const legacyPlan = {
      ...plan,
      nodePlan: plan.nodePlan.map((node) =>
        node.type === "word-radar"
          ? {
              ...node,
              wordRadarConfig: WORD_RADAR_VISIBLE_READ_CONFIG,
            }
          : node,
      ),
    };

    const nodes = buildAdventureMapFromSessionPlan(chart, legacyPlan);
    expect(nodes.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_VISIBLE_READ_CONFIG);
  });

  it("does not append Quest or Boss when the planner omitted them", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const plannerOmittedDestinations = {
      ...plan,
      nodePlan: plan.nodePlan.filter((node) => node.type !== "quest" && node.type !== "boss"),
    };

    const nodes = buildAdventureMapFromSessionPlan(chart, plannerOmittedDestinations);

    expect(nodes.some((node) => node.type === "quest")).toBe(false);
    expect(nodes.some((node) => node.type === "boss")).toBe(false);
  });

  it("preserves planner-authored Word Radar config from pending homework exactly", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    const sourceNode = profile.pendingHomework!.nodes.find((node) => node.type === "word-radar")!;
    sourceNode.wordRadarConfig = WORD_RADAR_HIDDEN_RECALL_CONFIG;
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan);

    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_HIDDEN_RECALL_CONFIG);
    expect(nodes.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_HIDDEN_RECALL_CONFIG);
  });

  it("does not escalate Word Radar to hidden recall solely because the test is near", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    delete profile.adaptiveLoadState;
    profile.pendingHomework!.completedAdventureNodeIds = [
      "n-word-radar-hw-spelling_test-bb11de93",
      "n-spell-check-hw-spelling_test-bb11de93",
    ];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-14T12:00:00.000Z"),
    });

    const wordRadar = plan.nodePlan.find((node) => node.type === "word-radar");
    expect(wordRadar?.wordRadarConfig)
      .toEqual(WORD_RADAR_LETTER_FILL_CONFIG);
    expect(plan.variationPolicy.avoidExactPreviousWordOrder).toBe(true);
    expect("wordPlan" in plan).toBe(false);
  });

  it("keeps Word Radar visual after recent frustration even when spelling load evidence is strong", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.activityModel = {
      "word-radar": {
        activityId: "word-radar",
        plays: 3,
        completions: 1,
        completionRate: 0.33,
        averageAccuracy: 0.42,
        engagementScore: 0.2,
        frustrationScore: 0.85,
        lastPlayed: "2026-05-13T11:00:00.000Z",
        domains: { spelling: 3 },
        missedWords: ["among"],
      },
    };
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_LETTER_FILL_CONFIG);
  });

  it("does not duplicate Word Radar runtime config outside the activity catalog", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/engine/sessionPlanFromChart.ts"), "utf8");

    expect(source).not.toContain("wordRadarModeForEvidence");
    expect(source).not.toContain('getActivityCapabilityModeConfig("word-radar"');
    expect(source).not.toContain('getActivityCapabilityMode("word-radar"');
    expect(source).not.toContain("function wordRadarConfigForEvidence");
    expect(source).not.toContain("function safeWordRadarConfigForLaunch");
  });

  it("marks Word Radar plans without planner config stale before launch", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    plan.planTheory = {
      hypothesis: "Word Radar config comes from the planner.",
      evidenceSummary: ["fixture"],
      intervention: "word radar",
      supportCriteria: ["config present"],
      reviseCriteria: ["config missing"],
      falsifyCriteria: ["runtime invents config"],
    };
    const wordRadar = plan.nodePlan.find((node) => node.type === "word-radar")!;
    const missingConfigPlan = {
      ...plan,
      nodePlan: plan.nodePlan.map((node) =>
        node.id === wordRadar.id ? { ...node, wordRadarConfig: undefined } : node,
      ),
    };

    expect(activeSessionPlanRefreshReason(
      missingConfigPlan,
      chart.homework.pending!,
      new Date("2026-05-13T13:00:00.000Z"),
    )).toBe(`missing_word_radar_config:${wordRadar.id}`);
  });

  it("marks approved plans stale after node progress or the planning day changes", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.pendingHomework!.completedAdventureNodeIds = [];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    plan.planTheory = {
      hypothesis: "A fresh plan should remain active until evidence changes.",
      evidenceSummary: ["homework pending"],
      intervention: "baseline spelling practice",
      supportCriteria: ["stable node progress"],
      reviseCriteria: ["node progress changes"],
      falsifyCriteria: ["homework changes"],
    };
    const pending = chart.homework.pending!;

    expect(activeSessionPlanRefreshReason(plan, pending, new Date("2026-05-13T13:00:00.000Z"))).toBeNull();

    expect(
      activeSessionPlanRefreshReason(
        plan,
        { ...pending, completedAdventureNodeIds: ["n-word-radar-hw-spelling_test-bb11de93"] },
        new Date("2026-05-13T13:00:00.000Z"),
      ),
    ).toBe("node_progress_changed:0->1");

    expect(
      activeSessionPlanRefreshReason(plan, pending, new Date("2026-05-14T09:00:00.000Z")),
    ).toBe("plan_day_changed:2026-05-13->2026-05-14");
  });

  it("does not discard parent-approved constraints when node progress changes", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    profile.pendingHomework!.completedAdventureNodeIds = [];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-13T12:00:00.000Z"),
      parentNote: "require pronunciation first and use 10 words",
    });
    plan.approvalStatus = "approved";
    plan.planTheory = {
      hypothesis: "Parent-approved pronunciation-first plan should stay active.",
      evidenceSummary: ["parent instruction"],
      intervention: "pronunciation first",
      supportCriteria: ["child starts pronunciation"],
      reviseCriteria: ["parent revises plan"],
      falsifyCriteria: ["homework changes"],
    };
    const pending = chart.homework.pending!;

    expect(plan.nodePlan[0]?.type).toBe("pronunciation");
    expect(plan.nodePlan[0]?.targets.length).toBe(10);
    expect(
      activeSessionPlanRefreshReason(
        plan,
        { ...pending, completedAdventureNodeIds: ["n-word-radar-hw-spelling_test-bb11de93"] },
        new Date("2026-05-14T09:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("honors parent requests for high-frequency pronunciation targets", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithGroupedHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-16T17:00:00.000Z"),
      parentNote: "Ila loves pronunication give her all the high frequency words.",
    });
    plan.planTheory = {
      hypothesis: "High-frequency words should be practiced in pronunciation first.",
      evidenceSummary: ["parent note", "captured high-frequency lane"],
      intervention: "pronunciation first",
      supportCriteria: ["pronunciation uses high-frequency lane"],
      reviseCriteria: ["wrong lane launches"],
      falsifyCriteria: ["child cannot access pronunciation"],
    };
    const pronunciation = plan.nodePlan[0];
    const nodes = buildAdventureMapFromSessionPlan(chart, plan);
    const mapPronunciation = nodes[0];

    expect(pronunciation?.type).toBe("pronunciation");
    expect(pronunciation?.targetLane).toBe("high_frequency_words");
    expect(pronunciation?.targets).toEqual(HIGH_FREQUENCY_WORDS);
    expect(pronunciation?.pronunciationConfig?.baseWordCount).toBe(HIGH_FREQUENCY_WORDS.length);
    expect(mapPronunciation).toMatchObject({
      type: "pronunciation",
      targetLane: "high_frequency_words",
      words: HIGH_FREQUENCY_WORDS,
    });
    expect(activeSessionPlanRefreshReason(
      plan,
      chart.homework.pending!,
      new Date("2026-05-16T17:30:00.000Z"),
    )).toBeNull();
  });

  it("preserves captured planner target lanes instead of restamping one global cohort onto every node", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithGroupedHomework(childId);
    profile.pendingHomework!.nodes = [
      {
        id: "node-1-schwa-baseline",
        type: "spell-check",
        words: WORDS,
        difficulty: 2,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: "node-2-highfreq-recognition",
        type: "word-radar",
        words: HIGH_FREQUENCY_WORDS,
        difficulty: 1,
        gameFile: null,
        storyFile: null,
        wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
      },
      {
        id: "node-3-highfreq-fluency",
        type: "pronunciation",
        words: HIGH_FREQUENCY_WORDS,
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
      {
        id: "node-4-schwa-mastery",
        type: "letter-rush",
        words: WORDS,
        difficulty: 3,
        gameFile: "letter-rush.html",
        storyFile: null,
      },
    ];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-16T17:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan);

    expect(plan.nodePlan.find((node) => node.type === "spell-check")?.targets).toEqual(WORDS);
    expect(plan.nodePlan.find((node) => node.type === "letter-rush")?.targets).toEqual(WORDS);
    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.targets).toEqual(HIGH_FREQUENCY_WORDS);
    expect(plan.nodePlan.find((node) => node.type === "pronunciation")?.targets).toEqual(HIGH_FREQUENCY_WORDS);
    expect(plan.nodePlan.find((node) => node.type === "spell-check")?.targetLane).toBe("schwa_words");
    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.targetLane).toBe("high_frequency_words");
    expect(plan.nodePlan.find((node) => node.type === "word-radar")?.wordRadarConfig)
      .toEqual(WORD_RADAR_LETTER_FILL_CONFIG);

    expect(nodes.find((node) => node.type === "spell-check")?.words).toEqual(WORDS);
    expect(nodes.find((node) => node.type === "letter-rush")?.words).toEqual(WORDS);
    expect(nodes.find((node) => node.type === "word-radar")?.words).toEqual(HIGH_FREQUENCY_WORDS);
    expect(nodes.find((node) => node.type === "pronunciation")?.words).toEqual(HIGH_FREQUENCY_WORDS);
  });

  it("does not let broad spelling strength upgrade recognition-lane Word Radar into hidden recall", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithGroupedHomework(childId);
    profile.pendingHomework!.completedAdventureNodeIds = [
      "node-1-schwa-baseline",
      "node-3-highfreq-fluency",
      "n-spell-check-hw-spelling_test-perfect",
      "n-word-radar-hw-spelling_test-adaptive",
    ];
    profile.pendingHomework!.nodes = [
      {
        id: "node-1-schwa-baseline",
        type: "spell-check",
        words: WORDS,
        difficulty: 2,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: "node-2-highfreq-recognition",
        type: "word-radar",
        words: HIGH_FREQUENCY_WORDS,
        difficulty: 1,
        gameFile: null,
        storyFile: null,
        wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
      },
      {
        id: "node-3-highfreq-fluency",
        type: "pronunciation",
        words: HIGH_FREQUENCY_WORDS,
        difficulty: 1,
        gameFile: null,
        storyFile: null,
      },
      {
        id: "node-4-schwa-mastery",
        type: "letter-rush",
        words: WORDS,
        difficulty: 3,
        gameFile: "letter-rush.html",
        storyFile: null,
      },
    ];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-22T19:00:00.000Z"),
    });

    const wordRadar = plan.nodePlan.find((node) => node.type === "word-radar");
    expect(wordRadar?.targetLane).toBe("high_frequency_words");
    expect(wordRadar?.targets).toEqual(HIGH_FREQUENCY_WORDS);
    expect(wordRadar?.wordRadarConfig)
      .toEqual(WORD_RADAR_LETTER_FILL_CONFIG);
  });

  it("does not emit a global wordPlan alongside node target contracts", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithGroupedHomework(childId);
    profile.pendingHomework!.nodes = profile.pendingHomework!.nodes.map((node) =>
      node.type === "pronunciation" ? { ...node, words: HIGH_FREQUENCY_WORDS } : node,
    );
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-16T17:00:00.000Z"),
    });

    expect("wordPlan" in plan).toBe(false);
    expect(plan.nodePlan.find((node) => node.type === "pronunciation")?.targets).toEqual(HIGH_FREQUENCY_WORDS);
  });

  it("refreshes a persisted plan whose node targets collapsed away from captured planner lanes", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithGroupedHomework(childId);
    profile.pendingHomework!.completedAdventureNodeIds = [];
    profile.pendingHomework!.nodes = [
      {
        id: "node-1-schwa-baseline",
        type: "spell-check",
        words: WORDS,
        difficulty: 2,
        gameFile: "spell-check.html",
        storyFile: null,
      },
      {
        id: "node-2-highfreq-recognition",
        type: "word-radar",
        words: HIGH_FREQUENCY_WORDS,
        difficulty: 1,
        gameFile: null,
        storyFile: null,
        wordRadarConfig: WORD_RADAR_LETTER_FILL_CONFIG,
      },
    ];
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-16T17:00:00.000Z"),
    });
    const collapsedTargets = [...HIGH_FREQUENCY_WORDS.slice(0, 2), ...WORDS.slice(0, 3)];
    const collapsedPlan = {
      ...plan,
      planTheory: {
        hypothesis: "Persisted plan should match captured planner lanes.",
        evidenceSummary: ["captured grouped homework"],
        intervention: "lane-specific spelling and recognition nodes",
        supportCriteria: ["node targets match source lanes"],
        reviseCriteria: ["node targets collapse across lanes"],
        falsifyCriteria: ["off-source targets launch"],
      },
      nodePlan: plan.nodePlan.map((node) =>
        node.type === "spell-check" || node.type === "word-radar"
          ? { ...node, targets: collapsedTargets, targetLane: undefined }
          : node,
      ),
    };

    expect(
      activeSessionPlanRefreshReason(
        collapsedPlan,
        chart.homework.pending!,
        new Date("2026-05-16T17:30:00.000Z"),
      ),
    ).toBe("target_lane_mismatch:word-radar");
  });

  it("refreshes an approved plan when it violates an explicit high-frequency pronunciation note", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "ila";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithGroupedHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const badPlan = planHomeworkSessionFromChart(chart, {
      source: "ingest_human_loop",
      now: new Date("2026-05-16T17:00:00.000Z"),
      parentNote: "Ila loves pronunication give her all the high frequency words.",
    });
    badPlan.approvalStatus = "approved";
    badPlan.planTheory = {
      hypothesis: "Parent-approved pronunciation-first plan should stay active.",
      evidenceSummary: ["parent instruction"],
      intervention: "pronunciation first",
      supportCriteria: ["child starts pronunciation"],
      reviseCriteria: ["parent revises plan"],
      falsifyCriteria: ["homework changes"],
    };
    badPlan.nodePlan[0] = {
      ...badPlan.nodePlan[0]!,
      targets: WORDS.slice(0, 5),
      targetLane: "schwa_words",
    };

    expect(activeSessionPlanRefreshReason(badPlan, chart.homework.pending!))
      .toBe("parent_constraint_mismatch:pronunciation_high_frequency");
  });

  it("renders the adventure map from the chart plan without making failed quest artifacts playable", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan, {
      dopamineGames: ["space-frogger"],
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodesAgain = buildAdventureMapFromSessionPlan(chart, plan, {
      dopamineGames: ["space-frogger"],
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(nodesAgain).toEqual(nodes);
    expect(nodes.find((node) => node.type === "pronunciation")?.words).toHaveLength(5);
    expect(nodes.find((node) => node.type === "pronunciation")?.pronunciationConfig).toMatchObject({
      baseWordCount: 5,
      targetFlowWordCount: 5,
      maxWordCount: 5,
    });
    expect(nodes.map((node) => node.type)).toEqual(expect.arrayContaining(["quest", "boss"]));
    expect(nodes.find((node) => node.type === "mystery")?.choiceOptions).toHaveLength(3);
    expect(
      nodes.find((node) => node.type === "mystery")?.choiceOptions?.map((option) => option.activityId),
    ).toContain("wheel-of-fortune");
    const quest = nodes.find((node) => node.type === "quest");
    expect(quest?.isLocked).toBe(true);
    expect(quest?.artifactStatus).toBe("preparing");
    expect(quest?.gameFile).toBeUndefined();
    expect(nodes.find((node) => node.type === "boss")?.isLocked).toBe(true);
  });

  it("keeps a statically-passed quest locked until runtime browser validation also passes", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    const profile = profileWithHomework(childId);
    const quest = profile.pendingHomework?.nodes.find((node) => node.type === "quest");
    if (!quest?.adaptiveArtifact) throw new Error("missing quest fixture");
    quest.adaptiveArtifact.validationStatus = "passed";
    quest.adaptiveArtifact.validationReport = {
      passed: true,
      score: 100,
      failures: [],
      warnings: [],
      attempts: 1,
      validatedAt: "2026-05-12T10:30:00.000Z",
      staticValidation: {
        passed: true,
        score: 100,
        failures: [],
        warnings: [],
      },
    };
    writeJson(root, `src/context/${childId}/learning_profile.json`, profile);
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const nodes = buildAdventureMapFromSessionPlan(chart, plan);
    const mapQuest = nodes.find((node) => node.type === "quest");

    expect(mapQuest).toMatchObject({
      type: "quest",
      artifactStatus: "preparing",
      gameFile: undefined,
      isLocked: true,
    });
  });

  it("leaves Quest and Boss missing when a custom plan omits them", () => {
    const root = makeRoot();
    roots.push(root);
    const childId = "reina";
    writeJson(root, `src/context/${childId}/learning_profile.json`, profileWithHomework(childId));
    writeJson(root, `src/context/${childId}/word_bank.json`, { childId, words: [] });

    const chart = getChildChart(childId, { rootDir: root });
    const plan = planHomeworkSessionFromChart(chart, {
      source: "runtime_fallback",
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const customPlan = {
      ...plan,
      nodePlan: plan.nodePlan.filter((node) => node.type !== "quest" && node.type !== "boss"),
    };
    const nodes = buildAdventureMapFromSessionPlan(chart, customPlan, {
      dopamineGames: ["space-frogger"],
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(nodes.some((node) => node.type === "quest")).toBe(false);
    expect(nodes.some((node) => node.type === "boss")).toBe(false);
  });
});
