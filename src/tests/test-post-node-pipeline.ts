import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import type {
  AIContentCatalogItem,
  LearningProfile,
} from "../context/schemas/learningProfile";
import type { MapState, NodeResult } from "../shared/adventureTypes";
import { initializeLearningProfile } from "../utils/learningProfileIO";

function mockNodeNoWordPool(): MapState["nodes"] {
  return [
    {
      id: "n-k",
      type: "karaoke",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
    },
  ];
}

/** Avoid real Grok in `enrichHomeworkNodeThumbnails` (5s test timeouts). */
vi.mock("../utils/generateStoryImage", () => ({
  generateStoryImage: vi.fn().mockResolvedValue(null),
}));

const appendNodeRatingMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordRewardMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordLearningAttemptMock = vi.hoisted(() => vi.fn().mockReturnValue({}));
const readWordBankMock = vi.hoisted(() => vi.fn().mockReturnValue({ words: [] }));

vi.mock("../utils/nodeRatingIO", () => ({
  appendNodeRating: appendNodeRatingMock,
}));

vi.mock("../engine/bandit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/bandit")>();
  return { ...actual, recordReward: recordRewardMock };
});

vi.mock("../engine/learningEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/learningEngine")>();
  return actual;
});

vi.mock("../server/learningAttemptEvents", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../server/learningAttemptEvents")>();
  return { ...actual, recordLearningAttempt: recordLearningAttemptMock };
});

vi.mock("../utils/wordBankIO", () => ({
  readWordBank: readWordBankMock,
}));

import {
  __resetAdventureMapSessionsForTests,
  applyNodeResult,
  recordExplicitMapRating,
  startMapSession,
} from "../server/map-coordinator";
import { buildProfile } from "../profiles/buildProfile";
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";
import { cloneCompanionDefaults } from "../shared/companionTypes";

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

function mockTwoWordNode(): MapState["nodes"] {
  return [
    {
      id: "n-a",
      type: "word-builder",
      isLocked: false,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      words: ["w1", "w2"],
    },
  ];
}

function mockCastleBoss(): MapState["nodes"] {
  return [
    {
      id: "n-boss",
      type: "boss",
      isLocked: false,
      isCompleted: false,
      isGoal: true,
      difficulty: 3,
    },
  ];
}

function profilePath(childId: string): string {
  return path.join(process.cwd(), "src", "context", childId, "learning_profile.json");
}

function baseLearningProfile(childId: string): LearningProfile {
  const profile = initializeLearningProfile({
    childId,
    age: 8,
    grade: 2,
    diagnoses: [],
    learningGoals: [],
  });
  profile.sessionStats.totalSessions = 4;
  profile.pendingHomework = {
    weekOf: "2026-05-11",
    testDate: "2026-05-15",
    homeworkId: "hw-spelling-test",
    wordList: ["above", "about", "ahead", "away", "ago"],
    contentProfile: {
      practiceDomain: "spelling",
      contentDomain: "spelling",
      topic: "a words",
      primarySkill: "spell_from_memory",
      assignmentFormat: "spelling_test",
      concepts: ["a words"],
      sourceEvidence: ["test fixture"],
    },
    capturedContent: null,
    generatedAt: "2026-05-11T12:00:00.000Z",
    nodes: [],
  };
  profile.aiContentCatalog = [catalogItem(childId)];
  return profile;
}

function catalogItem(childId: string): AIContentCatalogItem {
  return {
    contentId: "content-monster-1",
    homeworkId: "hw-spelling-test",
    childId,
    type: "game",
    source: "generated",
    title: "Monster spelling challenge",
    algorithmTargets: ["retrieval-practice", "activity-affinity"],
    targetSkills: ["spell_from_memory"],
    targetConcepts: ["a words"],
    targetWords: ["above", "about"],
    engagementHooks: ["competition"],
    inputEvidence: { activityEvidenceIds: ["baseline-1"] },
    reuseStatus: "candidate",
    reuseReason: "Needs map evidence.",
  };
}

function writeBaseLearningProfile(childId: string): void {
  const file = profilePath(childId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseLearningProfile(childId), null, 2), "utf8");
}

function readProfile(childId: string): LearningProfile {
  return JSON.parse(fs.readFileSync(profilePath(childId), "utf8")) as LearningProfile;
}

describe("post-node pipeline (TASK-014)", () => {
  let appendSpy: ReturnType<typeof vi.spyOn>;
  const pipelineOrder: string[] = [];

  beforeEach(() => {
    __resetAdventureMapSessionsForTests();
    pipelineOrder.length = 0;
    writeBaseLearningProfile("qa_pipeline");
    appendSpy = vi.spyOn(fs, "appendFileSync").mockImplementation(() => undefined);
    appendNodeRatingMock.mockImplementation(async () => {
      pipelineOrder.push("appendNodeRating");
    });
    appendNodeRatingMock.mockClear();
    recordRewardMock.mockImplementation(async () => {
      pipelineOrder.push("recordReward");
    });
    recordRewardMock.mockClear();
    recordLearningAttemptMock.mockImplementation(() => {
      pipelineOrder.push("recordAttempt");
      return {};
    });
    vi.mocked(buildProfile).mockResolvedValue({
      childId: "qa_pipeline",
      ttsName: "Qa pipeline",
      level: 3,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 240_000,
      childContext: "",
      companion: cloneCompanionDefaults(),
      companionContext: "",
    });
    vi.mocked(generateTheme).mockResolvedValue(mockTheme() as never);
    vi.mocked(buildNodeList).mockResolvedValue(mockTwoWordNode());
  });

  afterEach(() => {
    appendSpy.mockRestore();
    try {
      fs.unlinkSync(profilePath("qa_pipeline"));
    } catch {
      // best-effort test cleanup
    }
  });

  it("runs appendNodeRating then recordReward without synthesizing per-word attempts", async () => {
    const { sessionId, mapState } = await startMapSession("qa_pipeline");
    const nodeId = mapState.nodes[0].id;
    const result: NodeResult = {
      nodeId,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 8000,
      wordsAttempted: 2,
    };
    await applyNodeResult(sessionId, result);
    expect(pipelineOrder[0]).toBe("appendNodeRating");
    expect(pipelineOrder[1]).toBe("recordReward");
    expect(recordLearningAttemptMock).not.toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(recordRewardMock).toHaveBeenCalledWith(
      "qa_pipeline",
      "word-builder",
      true,
      true,
      1,
    );
  });

  it("castle node adds 50 XP bonus on top of completion XP", async () => {
    vi.mocked(buildNodeList).mockResolvedValue(mockCastleBoss());
    const { sessionId, mapState } = await startMapSession("qa_pipeline");
    const nodeId = mapState.nodes[0].id;
    const result: NodeResult = {
      nodeId,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 10_000,
      wordsAttempted: 1,
    };
    const { mapState: next } = await applyNodeResult(sessionId, result);
    expect(next.xp).toBeGreaterThanOrEqual(5 + 10 + 50);
  });

  it("adds +25 XP per mastered word after completion", async () => {
    readWordBankMock.mockReturnValue({
      words: [
        {
          word: "one",
          tracks: { spelling: { mastered: true } },
        },
        {
          word: "two",
          tracks: { spelling: { mastered: false } },
        },
      ],
    });
    const { sessionId, mapState } = await startMapSession("qa_pipeline");
    const nodeId = mapState.nodes[0].id;
    const result: NodeResult = {
      nodeId,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 5000,
      wordsAttempted: 2,
    };
    const { mapState: next } = await applyNodeResult(sessionId, result);
    expect(next.xp).toBeGreaterThanOrEqual(5 + 20 + 25);
  });

  it("does not call recordAttempt when node has no word pool but wordsAttempted > 0", async () => {
    vi.mocked(buildNodeList).mockResolvedValue(mockNodeNoWordPool());
    recordLearningAttemptMock.mockClear();
    const { sessionId, mapState } = await startMapSession("qa_pipeline");
    const nodeId = mapState.nodes[0].id;
    const result: NodeResult = {
      nodeId,
      completed: true,
      accuracy: 1,
      timeSpent_ms: 3000,
      wordsAttempted: 5,
    };
    await applyNodeResult(sessionId, result);
    expect(recordLearningAttemptMock).not.toHaveBeenCalled();
  });

  it("writes node evidence into activity model, bounded load, and linked content catalog", async () => {
    vi.mocked(buildNodeList).mockResolvedValue([
      {
        id: "n-monster",
        type: "monster-stampede",
        isLocked: false,
        isCompleted: false,
        isGoal: false,
        difficulty: 2,
        words: ["above", "about", "ahead", "away", "ago"],
        contentId: "content-monster-1",
      },
    ]);

    const { sessionId, mapState } = await startMapSession("qa_pipeline");
    await applyNodeResult(sessionId, {
      nodeId: mapState.nodes[0]!.id,
      completed: true,
      accuracy: 0.96,
      timeSpent_ms: 25_000,
      wordsAttempted: 5,
      targetResults: [
        { target: "above", correct: true },
        { target: "about", correct: true },
        { target: "ahead", correct: true },
        { target: "away", correct: true },
        { target: "ago", correct: true },
      ],
    });

    const profile = readProfile("qa_pipeline");
    expect(profile.activityModel?.["monster-stampede"]?.plays).toBe(1);
    expect(profile.activityModel?.["monster-stampede"]?.averageAccuracy).toBe(0.96);
    expect(profile.adaptiveLoadState?.spelling?.currentCohortSize).toBe(10);
    expect(profile.adaptiveLoadState?.spelling?.challengeRecommendation).toBe("expand_cohort");
    const catalog = profile.aiContentCatalog?.find((item) => item.contentId === "content-monster-1");
    expect(catalog?.performanceSummary?.plays).toBe(1);
    expect(catalog?.reuseStatus).toBe("reuse");
  });

  it("explicit like and dislike feed the same child-scoped bandit loop", async () => {
    const { sessionId, mapState } = await startMapSession("qa_pipeline");
    const node = mapState.nodes[0]!;

    await recordExplicitMapRating(sessionId, node.id, "like");
    await recordExplicitMapRating(sessionId, node.id, "dislike");

    expect(recordRewardMock).toHaveBeenCalledWith(
      "qa_pipeline",
      node.type,
      true,
      true,
      1,
    );
    expect(recordRewardMock).toHaveBeenCalledWith(
      "qa_pipeline",
      node.type,
      false,
      false,
      0,
    );
  });
});
