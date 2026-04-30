import { describe, it, expect, vi, beforeEach } from "vitest";
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
  getMapState,
  handleMapClientMessage,
  MapSessionError,
  startMapSession,
  buildMapSummary,
} from "../server/map-coordinator";
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
import { appendNodeRating } from "../utils/nodeRatingIO";

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

describe("map coordinator (TASK-010)", () => {
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
    vi.mocked(buildNodeList).mockResolvedValue(mockNodes());
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
    expect(mapState.nodes[0]?.type).toBe("word-radar");
    expect(mapState.nodes.map((n) => n.type)).not.toContain("karaoke");
    expect(mapState.nodes.some((n) => n.type === "riddle")).toBe(false);
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);
  });

  it("manual questUnlocked child gets quest words and a final locked boss teaser", async () => {
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
    expect(["monster-stampede.html", "speed-catcher.html"]).toContain(
      questNode?.gameFile,
    );
    expect(questNode?.gameHtmlPath).toBeUndefined();
    expect(bossNode?.type).toBe("boss");
    expect(bossNode?.isGoal).toBe(true);
    expect(bossNode?.isLocked).toBe(true);
    expect(bossNode?.gameHtmlPath).toBeUndefined();
    expect(vi.mocked(buildNodeList).mock.calls.length).toBe(0);

    writeSpy.mockRestore();
    readSpy.mockRestore();
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
    const wrNode = mapState.nodes.find((n) => n.type === "word-radar");
    expect(wrNode).toBeDefined();
    await applyNodeResult(sessionId, {
      nodeId: wrNode!.id,
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

  it("manual quest node launches the game assigned at map-session start", async () => {
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
    expect(["monster-stampede.html", "speed-catcher.html"]).toContain(
      quest?.gameFile,
    );
    const events = handleMapClientMessage(sessionId, {
      type: "node_click",
      payload: { nodeId: quest!.id },
    });
    expect(events[0]?.type).toBe("node_launched");
    const payload = events[0]?.payload as { gameFile?: string } | undefined;
    expect(payload?.gameFile).toBe(quest?.gameFile);
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

  it("SUNNY_MODE=diag leaves every map node unlocked after buildNodeList path", async () => {
    vi.stubEnv("SUNNY_MODE", "diag");
    const { mapState } = await startMapSession("qa_map");
    expect(mapState.nodes.length).toBeGreaterThan(0);
    expect(mapState.nodes.every((n) => !n.isLocked)).toBe(true);
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
