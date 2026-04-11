import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MapState, NodeResult } from "../shared/adventureTypes";
import {
  __resetAdventureMapSessionsForTests,
  applyNodeResult,
  getMapState,
  handleMapClientMessage,
  MapSessionError,
  startMapSession,
} from "../server/map-coordinator";

vi.mock("../profiles/buildProfile", () => ({
  buildProfile: vi.fn(),
}));

vi.mock("../agents/designer/designer", () => ({
  generateTheme: vi.fn(),
}));

vi.mock("../engine/nodeSelection", () => ({
  buildNodeList: vi.fn(),
}));

vi.mock("../utils/nodeRatingIO", () => ({
  appendNodeRating: vi.fn().mockResolvedValue(undefined),
}));

import { buildProfile } from "../profiles/buildProfile";
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
      words: [],
      difficulty: 1,
      timeLimit_ms: 40_000,
      theme: "default",
      isCastle: false,
    },
    {
      id: "n-wb",
      type: "word-builder",
      words: ["alpha"],
      difficulty: 2,
      timeLimit_ms: 60_000,
      theme: "default",
      isCastle: false,
    },
  ];
}

describe("map coordinator (TASK-010)", () => {
  beforeEach(() => {
    __resetAdventureMapSessionsForTests();
    vi.mocked(buildProfile).mockResolvedValue({
      childId: "qa_map",
      level: 2,
      interests: { tags: [] },
      ui: { accentColor: "#00f" },
      unlockedThemes: ["default"],
      attentionWindow_ms: 200_000,
    });
    vi.mocked(generateTheme).mockResolvedValue(mockTheme() as never);
    vi.mocked(buildNodeList).mockResolvedValue(mockNodes());
  });

  it("startMapSession returns mapState with nodes from buildNodeList", async () => {
    const { mapState } = await startMapSession("qa_map");
    expect(mapState.nodes[0]?.type).toBe("riddle");
    expect(vi.mocked(buildNodeList).mock.calls.length).toBeGreaterThan(0);
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
    const next = await applyNodeResult(sessionId, result);
    expect(next.xp).toBeGreaterThan(0);
    expect(vi.mocked(appendNodeRating).mock.calls.length).toBeGreaterThan(0);
  });

  it("getMapState returns updated session", async () => {
    const { sessionId } = await startMapSession("qa_map");
    const st = getMapState(sessionId);
    expect(st?.childId).toBe("qa_map");
  });
});
