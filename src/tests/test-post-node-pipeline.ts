import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import type { MapState, NodeResult } from "../shared/adventureTypes";

const appendNodeRatingMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordRewardMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordAttemptMock = vi.hoisted(() => vi.fn().mockReturnValue({}));
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
  return { ...actual, recordAttempt: recordAttemptMock };
});

vi.mock("../utils/wordBankIO", () => ({
  readWordBank: readWordBankMock,
}));

import {
  __resetAdventureMapSessionsForTests,
  applyNodeResult,
  startMapSession,
} from "../server/map-coordinator";
import { buildProfile } from "../profiles/buildProfile";
import { generateTheme } from "../agents/designer/designer";
import { buildNodeList } from "../engine/nodeSelection";

vi.mock("../profiles/buildProfile", () => ({
  buildProfile: vi.fn(),
}));

vi.mock("../agents/designer/designer", () => ({
  generateTheme: vi.fn(),
}));

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
      words: ["one", "two"],
      difficulty: 2,
      timeLimit_ms: 60_000,
      theme: "default",
      isCastle: false,
    },
  ];
}

function mockCastleBoss(): MapState["nodes"] {
  return [
    {
      id: "n-boss",
      type: "boss",
      words: ["zip"],
      difficulty: 3,
      timeLimit_ms: 90_000,
      theme: "default",
      isCastle: true,
    },
  ];
}

describe("post-node pipeline (TASK-014)", () => {
  let appendSpy: ReturnType<typeof vi.spyOn>;
  const pipelineOrder: string[] = [];

  beforeEach(() => {
    __resetAdventureMapSessionsForTests();
    pipelineOrder.length = 0;
    appendSpy = vi.spyOn(fs, "appendFileSync").mockImplementation(() => undefined);
    appendNodeRatingMock.mockImplementation(async () => {
      pipelineOrder.push("appendNodeRating");
    });
    recordRewardMock.mockImplementation(async () => {
      pipelineOrder.push("recordReward");
    });
    recordAttemptMock.mockImplementation(() => {
      pipelineOrder.push("recordAttempt");
      return {};
    });
    vi.mocked(buildProfile).mockResolvedValue({
      childId: "qa_pipeline",
      level: 3,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 240_000,
    });
    vi.mocked(generateTheme).mockResolvedValue(mockTheme() as never);
    vi.mocked(buildNodeList).mockResolvedValue(mockTwoWordNode());
  });

  afterEach(() => {
    appendSpy.mockRestore();
  });

  it("runs appendNodeRating then recordReward then recordAttempt per word then session note", async () => {
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
    const attempts = pipelineOrder.filter((s) => s === "recordAttempt");
    expect(attempts.length).toBe(2);
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
    const next = await applyNodeResult(sessionId, result);
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
    const next = await applyNodeResult(sessionId, result);
    expect(next.xp).toBeGreaterThanOrEqual(5 + 20 + 25);
  });
});
