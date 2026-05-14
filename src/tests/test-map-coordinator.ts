import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { LearningProfile } from "../context/schemas/learningProfile";
import type { MapState, NodeResult, NodeConfig } from "../shared/adventureTypes";
import * as learningProfileIO from "../utils/learningProfileIO";
import * as runtimeMode from "../utils/runtimeMode";

/** Avoid real Grok in `enrichHomeworkNodeThumbnails` (flaky 5s timeouts). */
vi.mock("../utils/generateStoryImage", () => ({
  generateStoryImage: vi.fn().mockResolvedValue(null),
}));

vi.mock("../profiles/buildProfile", () => ({
  buildProfile: vi.fn(),
}));

vi.mock("../agents/designer/designer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/designer/designer")>();
  return { ...actual, generateTheme: vi.fn() };
});

vi.mock("../engine/nodeSelection", () => ({
  buildNodeList: vi.fn(),
}));

vi.mock("../engine/attentionVitals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/attentionVitals")>();
  return { ...actual, recordAttentionSignal: vi.fn() };
});

vi.mock("../server/learningAttemptEvents", () => ({
  recordLearningAttempt: vi.fn(),
}));

vi.mock("../utils/nodeRatingIO", () => ({
  appendNodeRating: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../engine/bandit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/bandit")>();
  return { ...actual, recordReward: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/learningEngine")>();
  return {
    ...actual,
    recordAttempt: vi.fn().mockReturnValue({}),
    planSession: vi.fn((childId: string, mode: string, opts?: unknown) => {
      if (mode === "homework") {
        return {
          childId,
          mode,
          activities: [],
          newWords: [],
          reviewWords: [],
          focusWords: [],
          totalWordCount: 0,
          estimatedMinutes: 0,
          bondContext: "",
          difficultyParams: {
            targetAccuracy: 0.7,
            easyThreshold: 0.85,
            hardThreshold: 0.5,
            breakThreshold: 0.4,
            windowSize: 8,
          },
          moodAdjustment: false,
          wilsonStep: 1,
          dueWords: [],
        };
      }
      return actual.planSession(childId, mode, opts as never);
    }),
  };
});

import {
  __resetAdventureMapSessionsForTests,
  applyNodeResult,
  firstIncompleteNodeIndex,
  getMapState,
  handleMapClientMessage,
  hydrateHomeworkCompletedNodeIds,
  MapSessionError,
  startMapSession,
  buildMapSummary,
} from "../server/map-coordinator";
import { inferEmoteFromSlug } from "../scripts/ingestAnimations";
import {
  __resetVoiceSessionRegistryForTests,
  registerActiveVoiceSessionManager,
  unregisterActiveVoiceSessionManager,
} from "../server/voice-session-registry";

import { buildProfile } from "../profiles/buildProfile";
import { cloneCompanionDefaults } from "../shared/companionTypes";
import {
  buildHomeworkNodes,
  buildPendingHomeworkPayload,
} from "../scripts/ingestHomework";
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { planSession } from "../engine/learningEngine";
import { appendNodeRating } from "../utils/nodeRatingIO";
import { recordAttentionSignal } from "../engine/attentionVitals";
import { recordLearningAttempt } from "../server/learningAttemptEvents";

function mockTheme() {
  return {
    name: "default",
    palette: {
      sky: "#a",
      ground: "#b",
      accent: "#c",
      particle: "#d",
      glow: "#e",
    },
    ambient: { type: "dots", count: 20, speed: 1, color: "#fff" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
  };
}

function mockNodes(): MapState["nodes"] {
  return [
    {
      id: "n-riddle",
      type: "riddle",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 1,
    },
    {
      id: "n-wb",
      type: "word-builder",
      isLocked: true,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
    },
  ];
}

function mockProfileWithPendingHomework(
  childId: string,
  pendingHomework: NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>,
): import("../shared/childProfile").ChildProfile {
  return {
    childId,
    ttsName: childId.charAt(0).toUpperCase() + childId.slice(1),
    level: 2,
    xp: 0,
    interests: { tags: [] },
    ui: { accentColor: "#00f" },
    unlockedThemes: ["default"],
    attentionWindow_ms: 200_000,
    childContext: "",
    companion: cloneCompanionDefaults(),
    companionContext: "",
    dueWords: [],
    sm2Stats: {} as never,
    currentDifficulty: 2,
    masteryGating: {} as never,
    mathRotation: [],
    retrievalPractice: { nextScaffoldWords: [] },
    games: {} as never,
    wordRadar: {
      showTimer: true,
      timerSeconds: 20,
      showKeyboard: false,
      personalBests: {},
      inputMode: "whole-word",
    },
    dyslexiaMode: false,
    companionColor: "#00f",
    avatarImagePath: null,
    pendingHomework,
  };
}

describe("map coordinator (TASK-010)", () => {
  const cleanupPaths: string[] = [];

  beforeEach(() => {
    vi.unstubAllEnvs();
    __resetAdventureMapSessionsForTests();
    __resetVoiceSessionRegistryForTests();
    vi.mocked(buildProfile).mockResolvedValue({
      childId: "qa_map",
      ttsName: "Qa map",
      level: 2,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
    });
    vi.mocked(generateTheme).mockResolvedValue(mockTheme() as never);
    vi.mocked(generateTheme).mockClear();
    vi.mocked(buildNodeList).mockResolvedValue(mockNodes());
    vi.mocked(recordAttentionSignal).mockClear();
    vi.mocked(recordLearningAttempt).mockClear();
  });

  afterEach(() => {
    for (const p of cleanupPaths.splice(0)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  });

  it("startMapSession returns mapState with nodes from buildNodeList", async () => {
    const { mapState } = await startMapSession("qa_map");
    expect(mapState.nodes[0]?.type).toBe("riddle");
    expect(vi.mocked(buildNodeList).mock.calls.length).toBeGreaterThan(0);
  });

  it("startMapSession uses pending homework nodes when profile.pendingHomework has nodes", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["farmer", "teacher"];
    const homeworkId = "hw-spelling_test-qa";
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "qa_map",
      ttsName: "Qa map",
      level: 2,
      xp: 0,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
      dueWords: [],
      sm2Stats: {} as never,
      currentDifficulty: 2,
      masteryGating: {} as never,
      mathRotation: [],
      retrievalPractice: { nextScaffoldWords: [] },
      games: {} as never,
      wordRadar: {
        showTimer: true,
        timerSeconds: 20,
        showKeyboard: false,
        personalBests: {},
        inputMode: "whole-word",
      },
      dyslexiaMode: false,
      companionColor: "#00f",
      avatarImagePath: null,
      pendingHomework: buildPendingHomeworkPayload({
        weekOf: "2026-04-26",
        testDate: null,
        wordList: words,
        homeworkId,
        nodes: buildHomeworkNodes({ type: "spelling_test", words, homeworkId, childId: "ila" }),
      }) as import("../shared/childProfile").ChildProfile["pendingHomework"],
    });
    const { mapState } = await startMapSession("qa_map");
    expect(mapState.nodes[0]?.type).toBe("spell-check");
    expect(mapState.nodes[0]?.words).toEqual(words.slice(0, 5));
    expect(mapState.nodes.map((n) => n.type)).not.toContain("karaoke");
    expect(mapState.nodes.some((n) => n.type === "riddle")).toBe(false);
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);
  });

  it("starts a fresh organic homework map instead of hydrating prior completions as locks", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["above", "ago", "about", "ahead", "away"];
    const homeworkId = "hw-spelling_test-organic";
    const pendingHomework = buildPendingHomeworkPayload({
      weekOf: "2026-05-12",
      testDate: "2026-05-15",
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({
        type: "spelling_test",
        words,
        homeworkId,
        childId: "reina",
      }),
    }) as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;
    pendingHomework.completedAdventureNodeIds = pendingHomework.nodes.map((node) => node.id);
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("reina", pendingHomework),
    );

    const { mapState } = await startMapSession("reina");

    expect(mapState.completedNodes).toEqual([]);
    expect(mapState.currentNodeIndex).toBe(0);
    expect(mapState.nodes.every((node) => node.isCompleted === false)).toBe(true);
    expect(mapState.nodes[0]?.isLocked).toBe(false);
  });

  it("skips empty spelling practice nodes after a perfect typed baseline", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["shiny", "slowly", "lucky", "neatly", "sunny"];
    const homeworkId = "hw-spelling_test-perfect";
    const pendingHomework = buildPendingHomeworkPayload({
      weekOf: "2026-05-07",
      testDate: "2026-05-08",
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({
        type: "spelling_test",
        words,
        homeworkId,
        childId: "reina",
      }),
    }) as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("reina", pendingHomework) as never,
    );
    const lpBase = learningProfileIO.initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      ...lpBase,
      pendingHomework,
    });
    vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {});

    const { sessionId, mapState } = await startMapSession("reina");
    expect(mapState.nodes[0]?.type).toBe("spell-check");

    await applyNodeResult(sessionId, {
      nodeId: mapState.nodes[0]!.id,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 8_000,
      wordsAttempted: words.length,
      activityId: "spell-check",
      mode: "type-and-spell",
      purpose: "evaluate",
      correctWords: words,
      missedWords: [],
      targetResults: words.map((word) => ({
        target: word,
        correct: true,
        attempts: 1,
        responseTime_ms: 850,
        scaffoldLevel: 0,
      })),
    });

    expect(mapState.completedNodes).toEqual([
      mapState.nodes[0]!.id,
    ]);
    expect(mapState.currentNodeIndex).toBeGreaterThanOrEqual(1);
    expect(mapState.nodes[mapState.currentNodeIndex]?.type).not.toBe("spell-check");
  });

  it("startMapSession preserves content-aware karaoke homework nodes", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["faster", "fastest"];
    const storyText = "Rain made a river move faster. Erosion changed the hill.";
    const storyWords = storyText.replace(/[^\w\s]/g, "").split(/\s+/);
    const homeworkId = "hw-spelling_test-content-aware";
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "qa_map",
      ttsName: "Qa map",
      level: 2,
      xp: 0,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
      dueWords: [],
      sm2Stats: {} as never,
      currentDifficulty: 2,
      masteryGating: {} as never,
      mathRotation: [],
      retrievalPractice: { nextScaffoldWords: [] },
      games: {} as never,
      wordRadar: {
        showTimer: true,
        timerSeconds: 20,
        showKeyboard: false,
        personalBests: {},
        inputMode: "whole-word",
      },
      dyslexiaMode: false,
      companionColor: "#00f",
      avatarImagePath: null,
      pendingHomework: buildPendingHomeworkPayload({
        weekOf: "2026-05-01",
        testDate: "2026-05-06",
        wordList: words,
        homeworkId,
        nodes: [
          {
            id: "n-karaoke-content",
            type: "karaoke",
            words: storyWords,
            difficulty: 1,
            rationale: "Build erosion context before spelling.",
            gameFile: null,
            storyFile: null,
            storyText,
          },
          {
            id: "n-concept-builder",
            type: "word-builder",
            words: ["erosion", "water", "soil"],
            difficulty: 2,
            rationale: "Build erosion academic vocabulary.",
            gameFile: null,
            storyFile: null,
          },
          ...buildHomeworkNodes({
            type: "spelling_test",
            words,
            homeworkId,
            childId: "reina",
            testDate: "2026-05-06",
          }),
        ],
      }) as import("../shared/childProfile").ChildProfile["pendingHomework"],
    });

    const { mapState } = await startMapSession("qa_map");

    expect(mapState.nodes[0]?.type).toBe("spell-check");
    const karaokeNode = mapState.nodes.find((node) => node.type === "karaoke");
    expect(karaokeNode?.storyText).toBe(storyText);
    expect(karaokeNode?.words).toEqual(storyWords);
    expect(mapState.nodes.map((n) => n.type)).toContain("word-builder");
    expect(mapState.nodes.map((n) => n.type)).toContain("spell-check");
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);
  });

  it("rejects high-confidence science homework when it starts with scaffolded Word Radar", async () => {
    vi.mocked(buildNodeList).mockClear();
    const pendingHomework: NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]> = {
      weekOf: "2026-05-05",
      testDate: "2026-05-07",
      wordList: ["erosion", "soil", "wear away"],
      homeworkId: "hw-reading-erosion",
      contentProfile: {
        practiceDomain: "reading",
        contentDomain: "science",
        topic: "Erosion",
        primarySkill: "reading_comprehension",
        assignmentFormat: "study_guide",
        concepts: ["erosion", "weathering", "deposition"],
        sourceEvidence: ["Captured from erosion study guide."],
      },
      capturedContent: {
        title: "Erosion Study Guide",
        type: "reading",
        rawText: "Water and wind wear away rocks and soil.",
        words: ["erosion", "soil", "wear away"],
        questions: [{ id: 1, question: "What causes erosion?", correctAnswer: "water and wind" }],
        sourceDocuments: [{ filename: "erosions.pdf", mediaType: "application/pdf" }],
        contentProfile: {
          practiceDomain: "reading",
          contentDomain: "science",
          topic: "Erosion",
          primarySkill: "reading_comprehension",
          assignmentFormat: "study_guide",
          concepts: ["erosion", "weathering", "deposition"],
          sourceEvidence: ["Captured from erosion study guide."],
        },
      },
      generatedAt: "2026-05-05T00:00:00.000Z",
      nodes: [
        {
          id: "n-word-radar-erosion",
          type: "word-radar",
          words: ["erosion", "soil", "wear away"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n-karaoke-erosion",
          type: "karaoke",
          words: ["Erosion", "moves", "soil"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
          storyText: "Erosion moves soil.",
        },
      ],
    };
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("qa_map", pendingHomework) as never,
    );

    await expect(startMapSession("qa_map")).rejects.toMatchObject({
      name: "MapSessionError",
      statusCode: 422,
      message: expect.stringContaining("activity_plan_blocked"),
    });
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);
  });

  it("starts high-confidence spelling homework with one Spell Check baseline", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["shiny", "slowly", "lucky", "neatly"];
    const homeworkId = "hw-spelling_test-repair";
    const pendingHomework = buildPendingHomeworkPayload({
      weekOf: "2026-05-05",
      testDate: "2026-05-09",
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({
        type: "spelling_test",
        words,
        homeworkId,
        childId: "reina",
        testDate: "2026-05-09",
      }),
    }) as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("qa_map", pendingHomework) as never,
    );

    const { mapState } = await startMapSession("qa_map");

    expect(mapState.nodes[0]?.type).toBe("spell-check");
    expect(mapState.nodes[0]?.words).toEqual(words);
    expect(mapState.nodes.some((node) => node.type === "riddle")).toBe(false);
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);
  });

  it("allows recognition-only spelling homework to start with pronunciation", async () => {
    vi.mocked(buildNodeList).mockClear();
    const pendingHomework = {
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: ["above", "ago", "government"],
      homeworkId: "hw-spelling_test-recognition",
      generatedAt: "2026-05-11T22:00:00.000Z",
      contentProfile: {
        practiceDomain: "spelling",
        contentDomain: "language_arts",
        topic: "Schwa Sounds and High-Frequency Words",
        primarySkill: "recognizing schwa and reading high-frequency words",
        assignmentFormat: "two-column word list",
        concepts: ["Schwa", "High-frequency words"],
        sourceEvidence: ["Worksheet groups are recognition targets."],
      },
      capturedContent: {
        title: "Benchmark Advance Spelling Unit 9 Week 2",
        type: "spelling_test",
        rawText: "",
        words: ["above", "ago", "government"],
        questions: [],
        sourceDocuments: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "Schwa Sounds and High-Frequency Words",
          primarySkill: "recognizing schwa and reading high-frequency words",
          assignmentFormat: "two-column word list",
          concepts: ["Schwa", "High-frequency words"],
          sourceEvidence: ["Worksheet groups are recognition targets."],
        },
        assignmentInterpretation: {
          schemaVersion: 1,
          status: "ready",
          wordGroups: [
            {
              id: "schwa_words",
              label: "Schwa Words",
              purpose: "recognize",
              words: ["above", "ago"],
              confidence: 0.95,
              evidence: ["Schwa column"],
            },
            {
              id: "high_frequency_words",
              label: "High-Frequency Words",
              purpose: "recognize",
              words: ["ago", "government"],
              confidence: 0.95,
              evidence: ["High-frequency column"],
            },
          ],
          selectedTargets: [],
          heldTargets: [
            {
              id: "schwa_words",
              label: "Schwa Words",
              purpose: "recognize",
              words: ["above", "ago"],
              confidence: 0.95,
              evidence: ["Schwa column"],
            },
            {
              id: "high_frequency_words",
              label: "High-Frequency Words",
              purpose: "recognize",
              words: ["ago", "government"],
              confidence: 0.95,
              evidence: ["High-frequency column"],
            },
          ],
          assertions: [],
          clarificationQuestions: [],
          humanAnswers: [],
          memoryMatches: [],
        },
      },
      nodes: [
        {
          id: "n-pronunciation-hw-spelling_test-recognition",
          type: "pronunciation",
          words: ["above", "ago", "government"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
    } as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("qa_map", pendingHomework) as never,
    );

    const { mapState } = await startMapSession("qa_map");

    expect(mapState.nodes[0]?.type).toBe("pronunciation");
    expect(mapState.nodes.some((node) => node.type === "riddle")).toBe(false);
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);
  });

  it("adaptive load expands the next spelling homework cohort to 10 after strong evidence", async () => {
    const words = [
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
    const homeworkId = "hw-spelling_test-adaptive-load";
    const pendingHomework = buildPendingHomeworkPayload({
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({
        type: "spelling_test",
        words,
        homeworkId,
        childId: "reina",
      }),
    }) as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("reina", pendingHomework) as never,
    );
    const profile = learningProfileIO.initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    profile.pendingHomework = pendingHomework;
    profile.adaptiveLoadState = {
      spelling: {
        domain: "spelling",
        currentCohortSize: 10,
        maxRecentSuccessfulCohort: 10,
        challengeRecommendation: "expand_cohort",
        lastLoadEvidence: {
          activityId: "monster-stampede",
          completed: true,
          accuracy: 1,
          targetCount: 5,
          frustrationScore: 0.05,
          strongEvidence: true,
          occurredAt: "2026-05-11T12:00:00.000Z",
        },
      },
    };
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue(profile);
    try {
      const { mapState } = await startMapSession("reina");
      const radar = mapState.nodes.find((node) => node.type === "word-radar");
      const spellCheck = mapState.nodes.find((node) => node.type === "spell-check");

      expect(radar?.wordRadarItems).toHaveLength(10);
      expect(spellCheck?.words).toHaveLength(10);
    } finally {
      readSpy.mockRestore();
    }
  });

  it("quest threshold without an adaptive artifact stays locked/preparing", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["farmer", "teacher"];
    const reinforceWords = ["zigzag", "inventor"];
    const homeworkId = "hw-spelling_test-quest-words";
    const pendingHomework = {
      ...(buildPendingHomeworkPayload({
        weekOf: "2026-04-26",
        testDate: null,
        wordList: words,
        homeworkId,
        nodes: buildHomeworkNodes({
          type: "spelling_test",
          words,
          homeworkId,
          childId: "ila",
        }),
      }) as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>),
      reinforceWords,
    };
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "ila",
      ttsName: "Ila",
      level: 2,
      xp: 0,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
      dueWords: [],
      sm2Stats: {} as never,
      currentDifficulty: 2,
      masteryGating: {} as never,
      mathRotation: [],
      retrievalPractice: { nextScaffoldWords: [] },
      games: {} as never,
      wordRadar: {
        showTimer: true,
        timerSeconds: 20,
        showKeyboard: false,
        personalBests: {},
        inputMode: "whole-word",
      },
      dyslexiaMode: false,
      companionColor: "#00f",
      avatarImagePath: null,
      pendingHomework,
    });
    const writeSpy = vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {});
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue(null);

    const { mapState } = await startMapSession("ila");
    const questNode = mapState.nodes.find((n) => n.type === "quest");
    const bossNode = mapState.nodes.at(-1);

    expect(questNode?.words).toEqual(reinforceWords);
    expect(questNode?.isLocked).toBe(true);
    expect(questNode?.gameFile).toBeUndefined();
    expect(questNode?.gameHtmlPath).toBeUndefined();
    expect(bossNode?.type).toBe("boss");
    expect(bossNode?.isGoal).toBe(true);
    expect(bossNode?.isLocked).toBe(true);
    expect(bossNode?.gameHtmlPath).toBeUndefined();
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);

    writeSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("quest artifact readiness waits for ceremony before becoming playable", async () => {
    const words = ["above", "about", "ahead", "away", "ago"];
    const homeworkId = "hw-spelling_test-quest-artifact";
    const pendingHomework = buildPendingHomeworkPayload({
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: words,
      homeworkId,
      nodes: [
        ...buildHomeworkNodes({
          type: "spelling_test",
          words,
          homeworkId,
          childId: "reina",
        }).filter((node) => node.type !== "quest" && node.type !== "boss"),
        {
          id: `n-quest-${homeworkId}`,
          type: "quest",
          words: ["above", "about"],
          difficulty: 2,
          rationale: "generated adaptive quest",
          gameFile: "quest-generated.html",
          storyFile: null,
          date: "2026-05-11",
          adaptiveArtifact: {
            artifactId: "artifact-1",
            contentId: "content-quest-1",
            homeworkId,
            theoryId: "theory-1",
            generationStage: "quest",
            targetGroupIds: ["g-spelling"],
            homeworkWordIds: ["w-1", "w-2"],
            baselineEvidenceIds: ["n-word-radar"],
            generatedPath: "quest-generated.html",
            validationStatus: "passed",
            validationReport: {
              passed: true,
              score: 100,
              failures: [],
              warnings: [],
              attempts: 1,
              validatedAt: "2026-05-12T20:12:00.000Z",
            },
          },
        },
      ],
    }) as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("reina", pendingHomework) as never,
    );

    const { sessionId, mapState } = await startMapSession("reina", {
      nodeAccess: "inspect-all",
    });
    const questNode = mapState.nodes.find((n) => n.type === "quest");

    expect(questNode?.isLocked).toBe(true);
    expect(questNode?.masteryUnlockState).toBe("pending_ceremony");
    expect(questNode?.gameFile).toBe("quest-generated.html");
    expect(questNode?.contentId).toBe("content-quest-1");
    expect(questNode?.adaptiveArtifact?.baselineEvidenceIds).toEqual(["n-word-radar"]);

    const blocked = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: questNode!.id },
    });
    expect(blocked[0]).toEqual({
      type: "map_error",
      payload: { reason: "locked_node" },
    });

    const firstPractice = mapState.nodes.find((n) => n.type !== "quest" && n.type !== "boss");
    expect(firstPractice).toBeTruthy();
    const afterPractice = await applyNodeResult(sessionId, {
      nodeId: firstPractice!.id,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 1000,
      wordsAttempted: 5,
    });
    const revealedQuest = afterPractice.mapState.nodes.find((n) => n.type === "quest");
    expect(revealedQuest?.masteryUnlockState).toBe("unlocked");
    expect(revealedQuest?.isLocked).toBe(false);

    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: revealedQuest!.id },
    });
    expect(events[0]?.type).toBe("node_launched");
  });

  it("reinforceWords persists even when sunnyPreviewBlocksPersistence returns true", async () => {
    const sunnySpy = vi
      .spyOn(runtimeMode, "sunnyPreviewBlocksPersistence")
      .mockReturnValue(true);
    const writeSpy = vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {});

    const words = ["farmer", "teacher"];
    const homeworkId = "hw-spelling_test-reinforce-qa";
    const pendingHw = buildPendingHomeworkPayload({
      weekOf: "2026-04-26",
      testDate: null,
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({ type: "spelling_test", words, homeworkId, childId: "ila" }),
    }) as LearningProfile["pendingHomework"];

    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "ila",
      ttsName: "Ila",
      level: 2,
      xp: 0,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
      dueWords: [],
      sm2Stats: {} as never,
      currentDifficulty: 2,
      masteryGating: {} as never,
      mathRotation: [],
      retrievalPractice: { nextScaffoldWords: [] },
      games: {} as never,
      wordRadar: {
        showTimer: true,
        timerSeconds: 20,
        showKeyboard: false,
        personalBests: {},
        inputMode: "whole-word",
      },
      dyslexiaMode: false,
      companionColor: "#00f",
      avatarImagePath: null,
      pendingHomework: pendingHw,
    });

    const lpBase = learningProfileIO.initializeLearningProfile({
      childId: "ila",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      ...lpBase,
      pendingHomework: pendingHw,
    });

    const { sessionId, mapState } = await startMapSession("ila");
    const spellingNode = mapState.nodes.find((n) => n.type === "spell-check");
    expect(spellingNode).toBeDefined();
    await applyNodeResult(sessionId, {
      nodeId: spellingNode!.id,
      completed: true,
      accuracy: 0.3,
      timeSpent_ms: 2000,
      wordsAttempted: 2,
      missedWords: ["zigzag"],
    });
    const reinforceWrite = writeSpy.mock.calls.find((call) =>
      (call[1] as LearningProfile).pendingHomework?.reinforceWords?.includes("zigzag"),
    );
    expect(reinforceWrite).toBeDefined();
    const questNode = mapState.nodes.find((n) => n.type === "quest");
    expect(questNode?.words).toContain("zigzag");
    sunnySpy.mockRestore();
    writeSpy.mockRestore();
    readSpy.mockRestore();
  });

  it("retargets future homework practice nodes to only non-mastered evaluator targets", async () => {
    const words = [
      "shiny",
      "slowly",
      "lucky",
      "neatly",
      "sunny",
      "likely",
      "messy",
      "quickly",
      "rainy",
      "friendly",
    ];
    const homeworkId = "hw-spelling_test-adaptive";
    const wordRadarItems = words.map((word) => ({
      display: word,
      acceptedResponses: [word],
      label: "Spelling",
    }));
    const pendingHw: NonNullable<LearningProfile["pendingHomework"]> = {
      weekOf: "2026-05-05",
      testDate: "2026-05-09",
      wordList: words,
      homeworkId,
      generatedAt: "2026-05-05T00:00:00.000Z",
      reinforceWords: [],
      completedAdventureNodeIds: [],
      nodes: [
        {
          id: `n-word-radar-${homeworkId}`,
          type: "word-radar",
          words,
          wordRadarItems,
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: `n-spell-check-${homeworkId}`,
          type: "spell-check",
          words,
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
        {
          id: `n-wheel-${homeworkId}`,
          type: "wheel-of-fortune",
          words,
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
        {
          id: `n-pronunciation-${homeworkId}`,
          type: "pronunciation",
          words,
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
    };

    vi.mocked(planSession).mockReturnValueOnce({
      childId: "reina",
      mode: "spelling",
      activities: [],
      newWords: [],
      reviewWords: words,
      focusWords: words,
      totalWordCount: words.length,
      estimatedMinutes: 10,
      bondContext: "",
      difficultyParams: {
        targetAccuracy: 0.7,
        easyThreshold: 0.85,
        hardThreshold: 0.5,
        breakThreshold: 0.4,
        windowSize: 8,
      },
      moodAdjustment: false,
      wilsonStep: 1,
      dueWords: words,
    });
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "reina",
      ttsName: "Reina",
      level: 2,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
      games: { "word-radar": { maxWords: 10 } } as never,
      pendingHomework: pendingHw,
    });

    const lpBase = learningProfileIO.initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      ...lpBase,
      pendingHomework: pendingHw,
    });

    const { sessionId, mapState } = await startMapSession("reina");
    const radar = mapState.nodes.find((node) => node.type === "word-radar");
    expect(radar?.words).toEqual(words);

    await applyNodeResult(sessionId, {
      nodeId: radar!.id,
      completed: true,
      accuracy: 0.5,
      timeSpent_ms: 12_000,
      wordsAttempted: 10,
      correctWords: ["shiny", "neatly", "sunny", "likely", "quickly"],
      missedWords: ["slowly", "lucky", "messy", "rainy", "friendly"],
      targetResults: [
        { target: "shiny", correct: true, attempts: 1, responseTime_ms: 900 },
        { target: "slowly", correct: false, attempts: 2, attemptedValue: "sloly" },
        { target: "lucky", correct: false, attempts: 1 },
        { target: "neatly", correct: true, attempts: 1, responseTime_ms: 880 },
        { target: "sunny", correct: true, attempts: 1, responseTime_ms: 920 },
        { target: "likely", correct: true, attempts: 1, responseTime_ms: 940 },
        { target: "messy", correct: false, attempts: 1, attemptedValue: "mesy" },
        { target: "quickly", correct: true, attempts: 1, responseTime_ms: 990 },
        { target: "rainy", correct: false, attempts: 1 },
        { target: "friendly", correct: false, attempts: 2, attemptedValue: "frendly" },
      ],
    });

    const expectedNext = ["slowly", "lucky", "messy", "rainy", "friendly"];
    expect(mapState.nodes.find((node) => node.type === "wheel-of-fortune")?.words).toEqual(
      expectedNext,
    );
    expect(mapState.nodes.find((node) => node.type === "pronunciation")?.words).toEqual(
      words,
    );

    readSpy.mockRestore();
  });

  it("keeps Spell Check on its planned cohort when Word Radar retargets reinforcement", async () => {
    const firstCohort = ["above", "ago", "about", "ahead", "away"];
    const secondCohort = ["alone", "alike", "awake", "along", "again"];
    const allWords = [...firstCohort, ...secondCohort];
    const homeworkId = "hw-spelling_test-cohort-split";
    const pendingHw: NonNullable<LearningProfile["pendingHomework"]> = {
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: allWords,
      homeworkId,
      generatedAt: "2026-05-11T00:00:00.000Z",
      reinforceWords: [],
      completedAdventureNodeIds: [],
      nodes: [
        {
          id: `n-word-radar-${homeworkId}`,
          type: "word-radar",
          words: firstCohort,
          wordRadarItems: firstCohort.map((word) => ({
            display: word,
            acceptedResponses: [word],
            label: "Spelling",
          })),
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: `n-spell-check-${homeworkId}`,
          type: "spell-check",
          words: secondCohort,
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: `n-monster-stampede-${homeworkId}`,
          type: "monster-stampede",
          words: allWords,
          difficulty: 2,
          gameFile: null,
          storyFile: null,
        },
      ],
    };
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("reina", pendingHw) as never,
    );
    const lpBase = learningProfileIO.initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      ...lpBase,
      pendingHomework: pendingHw,
    });
    const writeSpy = vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {});

    const { sessionId, mapState } = await startMapSession("reina");
    const radar = mapState.nodes.find((node) => node.type === "word-radar");

    await applyNodeResult(sessionId, {
      nodeId: radar!.id,
      completed: true,
      accuracy: 0.8,
      timeSpent_ms: 12_000,
      wordsAttempted: firstCohort.length,
      correctWords: ["ago", "about", "ahead", "away"],
      missedWords: ["above"],
      targetResults: [
        { target: "above", correct: false, attempts: 1 },
        { target: "ago", correct: true, attempts: 1 },
        { target: "about", correct: true, attempts: 1 },
        { target: "ahead", correct: true, attempts: 1 },
        { target: "away", correct: true, attempts: 1 },
      ],
    });

    expect(mapState.nodes.find((node) => node.type === "spell-check")?.words).toEqual(
      secondCohort,
    );
    expect(mapState.nodes.find((node) => node.type === "monster-stampede")?.words).toContain(
      "above",
    );

    readSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("expands held fluency pronunciation targets after strong spelling evidence", async () => {
    const spellingWords = ["above", "ago", "about", "ahead", "away"];
    const fluencyWords = [
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
    const homeworkId = "hw-spelling_test-pronunciation-expand";
    const pendingHw: NonNullable<LearningProfile["pendingHomework"]> = {
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: [...spellingWords, ...fluencyWords],
      homeworkId,
      generatedAt: "2026-05-11T00:00:00.000Z",
      reinforceWords: [],
      completedAdventureNodeIds: [],
      capturedContent: {
        title: "Benchmark Advance Spelling Unit 9 Week 2",
        type: "spelling_test",
        rawText: "",
        words: [...spellingWords, ...fluencyWords],
        questions: [],
        sourceDocuments: [],
        contentProfile: {
          practiceDomain: "spelling",
          contentDomain: "language_arts",
          topic: "Schwa Sounds and High-Frequency Words",
          primarySkill: "spelling_recall",
          assignmentFormat: "two-column word list",
          concepts: ["Schwa", "High-frequency words"],
          sourceEvidence: ["Test fixture"],
        },
        assignmentInterpretation: {
          schemaVersion: 1,
          status: "ready",
          wordGroups: [
            {
              id: "schwa_words",
              label: "Schwa Words",
              purpose: "spell_from_memory",
              words: spellingWords,
              confidence: 0.95,
              evidence: ["Spelling column"],
            },
            {
              id: "high_frequency_words",
              label: "High-Frequency Words",
              purpose: "recognize",
              words: fluencyWords,
              confidence: 0.95,
              evidence: ["Recognition column"],
            },
          ],
          selectedTargets: [
            {
              id: "schwa_words",
              label: "Schwa Words",
              purpose: "spell_from_memory",
              words: spellingWords,
              confidence: 0.95,
              evidence: ["Spelling column"],
            },
          ],
          heldTargets: [
            {
              id: "high_frequency_words",
              label: "High-Frequency Words",
              purpose: "recognize",
              words: fluencyWords,
              confidence: 0.95,
              evidence: ["Recognition column"],
            },
          ],
          assertions: [],
          clarificationQuestions: [],
          humanAnswers: [],
          memoryMatches: [],
        },
      },
      nodes: [
        {
          id: `n-spell-check-${homeworkId}`,
          type: "spell-check",
          words: spellingWords,
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: `n-pronunciation-${homeworkId}`,
          type: "pronunciation",
          words: fluencyWords.slice(0, 5),
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
    };
    vi.mocked(buildProfile).mockResolvedValueOnce(
      mockProfileWithPendingHomework("reina", pendingHw) as never,
    );
    const lpBase = learningProfileIO.initializeLearningProfile({
      childId: "reina",
      age: 8,
      grade: 2,
      diagnoses: [],
      learningGoals: [],
    });
    const readSpy = vi.spyOn(learningProfileIO, "readLearningProfile").mockReturnValue({
      ...lpBase,
      pendingHomework: pendingHw,
    });
    const writeSpy = vi.spyOn(learningProfileIO, "writeLearningProfile").mockImplementation(() => {});

    const { sessionId, mapState } = await startMapSession("reina");
    expect(mapState.nodes.find((node) => node.type === "pronunciation")?.words).toEqual(
      fluencyWords.slice(0, 5),
    );

    await applyNodeResult(sessionId, {
      nodeId: `n-spell-check-${homeworkId}`,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 45_000,
      wordsAttempted: spellingWords.length,
      correctWords: spellingWords,
      missedWords: [],
      targetResults: spellingWords.map((word) => ({
        target: word,
        correct: true,
        attempts: 1,
        responseTime_ms: 900,
      })),
    });

    expect(mapState.nodes.find((node) => node.type === "pronunciation")?.words).toEqual(
      fluencyWords,
    );

    readSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("does not synthesize per-word attempts from aggregate node accuracy", async () => {
    vi.mocked(buildNodeList).mockResolvedValueOnce([
      {
        id: "n-radar",
        type: "word-radar",
        words: ["shiny", "slowly"],
        wordRadarItems: [
          { display: "shiny", acceptedResponses: ["shiny"] },
          { display: "slowly", acceptedResponses: ["slowly"] },
        ],
        isLocked: false,
        isCompleted: false,
        isGoal: false,
        difficulty: 1,
      },
    ]);

    const { sessionId } = await startMapSession("qa_map");

    await applyNodeResult(sessionId, {
      nodeId: "n-radar",
      completed: true,
      accuracy: 1,
      timeSpent_ms: 10_000,
      wordsAttempted: 2,
    });

    expect(recordLearningAttempt).not.toHaveBeenCalled();
  });

  it("startMapSession throws for unknown child", async () => {
    vi.mocked(buildProfile).mockResolvedValueOnce(null);
    await expect(startMapSession("missing_xyz")).rejects.toBeInstanceOf(
      MapSessionError,
    );
  });

  it("node_click returns node_launched for current node", async () => {
    const { sessionId, mapState } = await startMapSession("qa_map");
    const firstId = mapState.nodes[0].id;
    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: firstId },
    });
    expect(events[0]?.type).toBe("node_launched");
  });

  it("node_click allows replaying a completed node after the map advances", async () => {
    const { sessionId, mapState } = await startMapSession("qa_map");
    const firstId = mapState.nodes[0].id;

    await applyNodeResult(sessionId, {
      nodeId: firstId,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 5_000,
      wordsAttempted: 0,
    });

    expect(getMapState(sessionId)?.currentNodeIndex).toBeGreaterThan(0);
    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: firstId },
    });

    expect(events[0]).toMatchObject({
      type: "node_launched",
      payload: { id: firstId },
    });
  });

  it("manual quest without artifact refuses launch even in diag unlock", async () => {
    vi.mocked(buildNodeList).mockClear();
    const words = ["farmer", "teacher"];
    const homeworkId = "hw-spelling_test-quest-random";
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "ila",
      ttsName: "Ila",
      level: 2,
      xp: 0,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
      dueWords: [],
      sm2Stats: {} as never,
      currentDifficulty: 2,
      masteryGating: {} as never,
      mathRotation: [],
      retrievalPractice: { nextScaffoldWords: [] },
      games: {} as never,
      wordRadar: {
        showTimer: true,
        timerSeconds: 20,
        showKeyboard: false,
        personalBests: {},
        inputMode: "whole-word",
      },
      dyslexiaMode: false,
      companionColor: "#00f",
      avatarImagePath: null,
      pendingHomework: buildPendingHomeworkPayload({
        weekOf: "2026-04-26",
        testDate: null,
        wordList: words,
        homeworkId,
        nodes: buildHomeworkNodes({
          type: "spelling_test",
          words,
          homeworkId,
          childId: "ila",
        }),
      }) as import("../shared/childProfile").ChildProfile["pendingHomework"],
    });
    vi.stubEnv("DIAG_UNLOCK_MAP", "true");
    const { sessionId, mapState } = await startMapSession("ila");
    const quest = mapState.nodes.find((n) => n.type === "quest");
    expect(quest).toBeDefined();
    expect(quest?.gameFile).toBeUndefined();
    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: quest!.id },
    });
    expect(events[0]).toEqual({
      type: "map_error",
      payload: { reason: "locked_node" },
    });
  });

  it("game_state_update calls noteExternalEvent on active voice session manager", async () => {
    const { sessionId: sid, mapState } = await startMapSession("qa_map");
    const sm = { noteExternalEvent: vi.fn() };
    registerActiveVoiceSessionManager(mapState.childId, sm);
    const events = handleMapClientMessage(sid, {
      type: "game_state_update",
      payload: { progress: "Spelling — 2 blanks left" },
    });
    expect(events).toEqual([]);
    expect(sm.noteExternalEvent).toHaveBeenCalledWith({
      source: "game_state_update",
      summary: "Spelling — 2 blanks left",
      occurredAt: expect.any(Number),
    });
    unregisterActiveVoiceSessionManager(mapState.childId, sm);
  });

  it("game_state_update injects structured state into the active voice session", async () => {
    const { sessionId: sid, mapState } = await startMapSession("qa_map");
    const sm = {
      injectGameContext: vi.fn(),
      noteExternalEvent: vi.fn(),
    };
    registerActiveVoiceSessionManager(mapState.childId, sm);
    const payload = {
      progress: 'Spelling "inventor" — N N visible',
      phase: "playing",
      currentWord: "inventor",
      boardState: "I N V E N _ O R",
      letter: "N",
    };

    const events = handleMapClientMessage(sid, {
      type: "game_state_update",
      payload,
    });

    expect(events).toEqual([]);
    expect(sm.injectGameContext).toHaveBeenCalledTimes(1);
    expect(sm.injectGameContext).toHaveBeenCalledWith(payload);
    unregisterActiveVoiceSessionManager(mapState.childId, sm);
  });

  it("applyNodeResult increments XP and appends NodeRating", async () => {
    const { sessionId, mapState } = await startMapSession("qa_map");
    const firstId = mapState.nodes[0].id;
    const result: NodeResult = {
      nodeId: firstId,
      completed: true,
      accuracy: 0.9,
      timeSpent_ms: 12_000,
      wordsAttempted: 2,
    };
    const { mapState: next } = await applyNodeResult(sessionId, result);
    expect(next.xp).toBeGreaterThan(0);
    expect(vi.mocked(appendNodeRating).mock.calls.length).toBeGreaterThan(0);
  });

  it("applyNodeResult writes a full activity result flight-recorder row", async () => {
    const childId = "qa_map";
    const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-activity-results-"));
    const activityResultsDir = path.join(
      logRoot,
      childId,
      "activity_results",
    );
    cleanupPaths.push(logRoot);
    vi.stubEnv("SUNNY_ACTIVITY_RESULT_LOG_ROOT", logRoot);
    const { sessionId, mapState } = await startMapSession(childId);
    const firstId = mapState.nodes[0].id;

    await applyNodeResult(sessionId, {
      nodeId: firstId,
      completed: true,
      accuracy: 0.5,
      timeSpent_ms: 12_000,
      wordsAttempted: 2,
      activityId: "letter-rush",
      purpose: "independent-retrieval",
      missedWords: ["farmer"],
      correctWords: ["sailor"],
      targetResults: [
        {
          target: "farmer",
          correct: false,
          attempts: 2,
          attemptedValue: "far",
          responseTime_ms: 8_400,
          scaffoldLevel: 0,
          concept: "spelling:farmer",
          misconception: "timeout",
          mode: "mastery-run",
          masteryEligible: true,
        },
      ],
    });

    const files = fs.readdirSync(activityResultsDir);
    expect(files).toHaveLength(1);
    const rows = fs
      .readFileSync(path.join(activityResultsDir, files[0]!), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(rows[0]).toMatchObject({
      type: "activity_node_result",
      childId,
      sessionId,
      nodeId: firstId,
      nodeType: "riddle",
      activityId: "letter-rush",
      purpose: "independent-retrieval",
      completed: true,
      accuracy: 0.5,
      missedWords: ["farmer"],
      correctWords: ["sailor"],
      targetResults: [
        expect.objectContaining({
          target: "farmer",
          correct: false,
          attemptedValue: "far",
          scaffoldLevel: 0,
          concept: "spelling:farmer",
          misconception: "timeout",
          mode: "mastery-run",
          masteryEligible: true,
        }),
      ],
    });
  });

  it("getMapState returns updated session", async () => {
    const { sessionId } = await startMapSession("qa_map");
    const st = getMapState(sessionId);
    expect(st?.childId).toBe("qa_map");
  });

  it("SUNNY_MODE=real (default) sync locks nodes after the current index", async () => {
    vi.stubEnv("SUNNY_MODE", "real");
    const { mapState } = await startMapSession("qa_map");
    expect(mapState.nodes[0]?.isLocked).toBe(false);
    expect(mapState.nodes.slice(1).every((n) => n.isLocked)).toBe(true);
  });

  it("SUNNY_MODE=diag no longer unlocks map nodes unless inspect-all is requested", async () => {
    vi.stubEnv("SUNNY_MODE", "diag");
    const { mapState } = await startMapSession("qa_map");
    expect(mapState.nodes.length).toBeGreaterThan(0);
    expect(mapState.nodes[0]?.isLocked).toBe(false);
    expect(mapState.nodes.slice(1).every((n) => n.isLocked)).toBe(true);
  });

  it("inspect-all runtime leaves nodes launchable without marking them completed", async () => {
    vi.mocked(buildNodeList).mockResolvedValueOnce([
      ...mockNodes(),
      {
        id: "n-quest",
        type: "quest",
        isLocked: false,
        isCompleted: false,
        isGoal: false,
        difficulty: 2,
        gameFile: "monster-stampede.html",
      },
      {
        id: "n-boss",
        type: "boss",
        isLocked: false,
        isCompleted: false,
        isGoal: true,
        difficulty: 3,
        gameHtmlPath: "/tmp/generated-boss.html",
      },
    ]);
    const { mapState } = await startMapSession("qa_map", {
      previewMode: "free",
      nodeAccess: "inspect-all",
    });
    expect(mapState.nodes.length).toBeGreaterThan(0);
    expect(mapState.completedNodes).toEqual([]);
    expect(mapState.nodes.every((n) => !n.isCompleted)).toBe(true);
    expect(mapState.nodes.find((n) => n.type === "riddle")?.isLocked).toBe(false);
    expect(mapState.nodes.find((n) => n.type === "word-builder")?.isLocked).toBe(false);
    expect(mapState.nodes.find((n) => n.type === "quest")?.isLocked).toBe(true);
    expect(mapState.nodes.find((n) => n.type === "boss")?.isLocked).toBe(true);
  });

  it("inspect-all runtime refuses to launch locked mastery nodes", async () => {
    vi.mocked(buildNodeList).mockResolvedValueOnce([
      ...mockNodes(),
      {
        id: "n-quest",
        type: "quest",
        isLocked: false,
        isCompleted: false,
        isGoal: false,
        difficulty: 2,
        gameFile: "monster-stampede.html",
      },
    ]);
    const { sessionId, mapState } = await startMapSession("qa_map", {
      previewMode: "free",
      nodeAccess: "inspect-all",
    });
    const quest = mapState.nodes.find((n) => n.type === "quest");
    expect(quest?.isLocked).toBe(true);

    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: quest!.id },
    });
    expect(events[0]).toEqual({
      type: "map_error",
      payload: { reason: "locked_node" },
    });
  });

  it("onboarding preview builds board nodes from the onboarding plan without completing them", async () => {
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "reina",
      ttsName: "Reina",
      level: 2,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
    });
    const { mapState } = await startMapSession("reina", {
      subject: "onboarding",
      sessionMode: "as-child",
      previewMode: "free",
      nodeAccess: "inspect-all",
      voiceMode: "muted",
    });

    expect(mapState.nodes.map((node) => node.id)).toEqual([
      "onboarding-bubble-pop",
      "onboarding-dopamine-break",
      "onboarding-academic-load-check",
    ]);
    expect(mapState.nodes.map((node) => node.type)).toEqual([
      "bubble-pop",
      "mystery",
      "karaoke",
    ]);
    expect(mapState.nodes.every((node) => !node.isCompleted)).toBe(true);
    expect(mapState.completedNodes).toEqual([]);
    expect(mapState.nodes.every((node) => !node.isLocked)).toBe(true);
  });

  it("attention screening completion records vitals without creating learning attempts", async () => {
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId: "reina",
      ttsName: "Reina",
      level: 2,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
    });
    const { sessionId, mapState } = await startMapSession("reina", {
      subject: "onboarding",
      sessionMode: "real",
      previewMode: "off",
      nodeAccess: "inspect-all",
    });
    const node = mapState.nodes[0]!;

    await applyNodeResult(sessionId, {
      nodeId: node.id,
      completed: true,
      accuracy: 0.82,
      timeSpent_ms: 64_000,
      wordsAttempted: 12,
      activityId: node.type,
      purpose: "attention_screening",
      vitalSigns: {
        startedAt: "2026-05-03T18:00:00.000Z",
        endedAt: "2026-05-03T18:01:04.000Z",
        activeDuration_ms: 64_000,
        idleEvents: 0,
        abandonments: 0,
        reengagements: 0,
        omissions: 1,
        commissions: 0,
        frustrationSignals: [],
        flowSignals: ["target_hit"],
        practiceGate: { passed: true, accuracy: 0.82 },
      },
    });

    expect(recordAttentionSignal).toHaveBeenCalledWith(
      "reina",
      expect.objectContaining({
        activityId: node.type,
        purpose: "attention_screening",
        activeDuration_ms: 64_000,
      }),
    );
    expect(recordLearningAttempt).not.toHaveBeenCalled();
  });

  it("preview reuses saved Grok themes instead of generating a new theme", async () => {
    const childId = "qa_preview_theme";
    const childDir = path.join(process.cwd(), "src", "context", childId);
    const themeDir = path.join(childDir, "themes");
    cleanupPaths.push(childDir);
    fs.mkdirSync(themeDir, { recursive: true });
    fs.writeFileSync(
      path.join(themeDir, "saved.json"),
      JSON.stringify({
        id: "saved",
        name: "saved-preview-world",
        generatedAt: "2026-05-03T12:00:00.000Z",
        worldBackgroundUrl: "https://example.com/saved-world.jpeg",
        palette: {
          sky: "#6ec8ff",
          ground: "#228b5c",
          accent: "#2563eb",
          particle: "#e0f2fe",
          glow: "#fde68a",
          cardBackground: "#f0f9ff",
        },
        thumbnails: {
          "bubble-pop": "https://example.com/bubble.jpeg",
          mystery: "https://example.com/mystery.jpeg",
          karaoke: "https://example.com/karaoke.jpeg",
        },
        savedBy: "test",
      }),
      "utf8",
    );
    vi.mocked(buildProfile).mockResolvedValueOnce({
      childId,
      ttsName: "Qa",
      level: 2,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
    });

    const { mapState } = await startMapSession(childId, {
      subject: "review",
      sessionMode: "as-child",
      previewMode: "free",
      nodeAccess: "inspect-all",
    });

    expect(mapState.theme.source).toBe("saved");
    expect(mapState.theme.backgroundUrl).toBe("https://example.com/saved-world.jpeg");
    expect(vi.mocked(generateTheme)).not.toHaveBeenCalled();
  });
});

describe("buildMapSummary", () => {
  const theme: MapState["theme"] = {
    name: "t",
    palette: { sky: "#1", ground: "#2", accent: "#3", particle: "#4", glow: "#5" },
    ambient: { type: "dots", count: 1, speed: 1, color: "#fff" },
    nodeStyle: "rounded",
    pathStyle: "curve",
    castleVariant: "stone",
    mapWaypoints: [],
  };

  function node(
    id: string,
    type: NodeConfig["type"],
    isGoal: boolean,
  ): NodeConfig {
    return {
      id,
      type,
      isLocked: false,
      isCompleted: false,
      isGoal,
      difficulty: 1,
      words: ["x"],
    };
  }

  it("returns string containing node types", () => {
    const mapState: MapState = {
      childId: "ila",
      sessionDate: "2026-01-01",
      nodes: [node("n1", "word-radar", false), node("n2", "spell-check", false)],
      currentNodeIndex: 0,
      completedNodes: [],
      theme,
      xp: 0,
      level: 1,
    };
    const s = buildMapSummary(mapState);
    expect(s).toContain("word-radar");
    expect(s).toContain("spell-check");
  });

  it("marks first node with START HERE and last with BOSS", () => {
    const mapState: MapState = {
      childId: "ila",
      sessionDate: "2026-01-01",
      nodes: [
        node("n1", "word-radar", false),
        node("n2", "spell-check", false),
        node("n3", "boss", true),
      ],
      currentNodeIndex: 0,
      completedNodes: [],
      theme,
      xp: 0,
      level: 1,
    };
    const s = buildMapSummary(mapState);
    expect(s).toContain("START HERE");
    expect(s).toContain("BOSS");
  });
});

describe("homework map completion hydration helpers", () => {
  function node(
    id: string,
    type: NodeConfig["type"],
    isGoal: boolean,
  ): NodeConfig {
    return {
      id,
      type,
      isLocked: false,
      isCompleted: false,
      isGoal,
      difficulty: 1,
      words: [],
    };
  }

  const nodes: NodeConfig[] = [
    node("n1", "word-radar", false),
    node("n-mystery-hw1", "mystery", false),
    node("n2", "karaoke", true),
  ];

  it("hydrateHomeworkCompletedNodeIds keeps only ids on current map", () => {
    expect(
      hydrateHomeworkCompletedNodeIds(nodes, ["n-mystery-hw1", "stale-id", "n1"]),
    ).toEqual(["n1", "n-mystery-hw1"]);
  });

  it("firstIncompleteNodeIndex skips completed prefix", () => {
    const done = new Set(["n1", "n-mystery-hw1"]);
    expect(firstIncompleteNodeIndex(nodes, done)).toBe(2);
  });

  it("firstIncompleteNodeIndex returns last index when all complete", () => {
    const done = new Set(nodes.map((n) => n.id));
    expect(firstIncompleteNodeIndex(nodes, done)).toBe(2);
  });

  it("inferEmoteFromSlug maps excited and cheer to celebrating", () => {
    expect(inferEmoteFromSlug("excited_jump").emote).toBe("celebrating");
    expect(inferEmoteFromSlug("excited_jump").heuristicHit).toBe(true);
    expect(inferEmoteFromSlug("crowd_cheer").emote).toBe("celebrating");
    expect(inferEmoteFromSlug("crowd_cheer").heuristicHit).toBe(true);
  });
});
