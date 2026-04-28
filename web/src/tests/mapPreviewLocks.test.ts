import { describe, it, expect } from "vitest";
import type { MapState, NodeConfig } from "../../../src/shared/adventureTypes";
import { applyHomeworkStyleNodeLocks } from "../../../src/shared/mapNodeLocks";
import { buildMapSummaryFromPendingNodes } from "../../../src/shared/mapSummary";
import { applyLocalNodeResult } from "../../../src/shared/mapLocalProgress";

function wr(id: string): NodeConfig {
  return {
    id,
    type: "word-radar",
    isLocked: false,
    isCompleted: false,
    isGoal: false,
    difficulty: 1,
    words: ["a"],
    wordRadarItems: [{ display: "a", acceptedResponses: ["a"] }],
  };
}

function sc(id: string): NodeConfig {
  return {
    id,
    type: "spell-check",
    isLocked: true,
    isCompleted: false,
    isGoal: false,
    difficulty: 1,
    words: ["a"],
  };
}

describe("applyHomeworkStyleNodeLocks", () => {
  it("node 0 is never locked", () => {
    const nodes = [wr("n1"), sc("n2")];
    const out = applyHomeworkStyleNodeLocks(nodes, new Set());
    expect(out[0]?.isLocked).toBe(false);
  });

  it("node 1 stays locked until node 0 completed", () => {
    const nodes = [wr("n1"), sc("n2")];
    let out = applyHomeworkStyleNodeLocks(nodes, new Set());
    expect(out[1]?.isLocked).toBe(true);
    out = applyHomeworkStyleNodeLocks(nodes, new Set(["n1"]));
    expect(out[1]?.isLocked).toBe(false);
  });
});

describe("buildMapSummaryFromPendingNodes", () => {
  it("includes node types and START HERE / BOSS markers", () => {
    const s = buildMapSummaryFromPendingNodes([
      { type: "word-radar" },
      { type: "spell-check" },
      { type: "boss", isGoal: true },
    ]);
    expect(s).toContain("word-radar");
    expect(s).toContain("START HERE");
    expect(s).toContain("BOSS");
  });
});

describe("applyLocalNodeResult (preview client path)", () => {
  it("records completion without HTTP", () => {
    const theme: MapState["theme"] = {
      name: "t",
      palette: { sky: "#1", ground: "#2", accent: "#3", particle: "#4", glow: "#5" },
      ambient: { type: "dots", count: 1, speed: 1, color: "#fff" },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
      mapWaypoints: [],
    };
    const ms: MapState = {
      childId: "ila",
      sessionDate: "2026-01-01",
      nodes: [wr("n1"), sc("n2")],
      currentNodeIndex: 0,
      completedNodes: [],
      theme,
      xp: 0,
      level: 1,
    };
    const next = applyLocalNodeResult(ms, {
      nodeId: "n1",
      completed: true,
      accuracy: 1,
      timeSpent_ms: 1,
      wordsAttempted: 1,
    });
    expect(next.completedNodes).toContain("n1");
    expect(next.nodes[1]?.isLocked).toBe(false);
  });
});
