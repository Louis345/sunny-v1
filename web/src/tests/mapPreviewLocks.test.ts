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

  it("boss teaser without a game remains locked even after prior nodes are completed", () => {
    const boss: NodeConfig = {
      id: "boss",
      type: "boss",
      isLocked: false,
      isCompleted: false,
      isGoal: true,
      difficulty: 3,
    };
    const out = applyHomeworkStyleNodeLocks(
      [wr("n1"), sc("n2"), boss],
      new Set(["n1", "n2"]),
    );
    expect(out[2]?.isLocked).toBe(true);
    expect(out[2]?.isCompleted).toBe(false);
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

  it("reveals a pending quest ceremony after a valid preview node completion", () => {
    const theme: MapState["theme"] = {
      name: "t",
      palette: { sky: "#1", ground: "#2", accent: "#3", particle: "#4", glow: "#5" },
      ambient: { type: "dots", count: 1, speed: 1, color: "#fff" },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
      mapWaypoints: [],
    };
    const quest: NodeConfig = {
      id: "quest",
      type: "quest",
      isLocked: true,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      gameFile: "quest.html",
      masteryUnlockState: "pending_ceremony",
      adaptiveArtifact: {
        artifactId: "artifact-1",
        contentId: "content-1",
        homeworkId: "hw-1",
        theoryId: "theory-1",
        generationStage: "quest",
        targetGroupIds: ["g1"],
        homeworkWordIds: ["w1"],
        baselineEvidenceIds: ["n1"],
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
    };
    const ms: MapState = {
      childId: "reina",
      sessionDate: "2026-05-12",
      nodes: [wr("n1"), quest],
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

    expect(next.nodes[1]?.masteryUnlockState).toBe("unlocked");
    expect(next.nodes[1]?.isLocked).toBe(false);
  });

  it("does not reveal a quest ceremony when the adaptive artifact failed validation", () => {
    const theme: MapState["theme"] = {
      name: "t",
      palette: { sky: "#1", ground: "#2", accent: "#3", particle: "#4", glow: "#5" },
      ambient: { type: "dots", count: 1, speed: 1, color: "#fff" },
      nodeStyle: "rounded",
      pathStyle: "curve",
      castleVariant: "stone",
      mapWaypoints: [],
    };
    const quest: NodeConfig = {
      id: "quest",
      type: "quest",
      isLocked: true,
      isCompleted: false,
      isGoal: false,
      difficulty: 2,
      gameFile: "quest.html",
      masteryUnlockState: "pending_ceremony",
      adaptiveArtifact: {
        artifactId: "artifact-1",
        contentId: "content-1",
        homeworkId: "hw-1",
        theoryId: "theory-1",
        generationStage: "quest",
        targetGroupIds: ["g1"],
        homeworkWordIds: ["w1"],
        baselineEvidenceIds: ["n1"],
        validationStatus: "failed",
        validationReport: {
          passed: false,
          score: 20,
          failures: ["Missing fireAttemptEvent call for assessable interactions"],
          warnings: [],
          attempts: 2,
          validatedAt: "2026-05-12T20:12:00.000Z",
        },
      },
    };
    const ms: MapState = {
      childId: "reina",
      sessionDate: "2026-05-12",
      nodes: [wr("n1"), quest],
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

    expect(next.nodes[1]?.masteryUnlockState).toBe("pending_ceremony");
    expect(next.nodes[1]?.isLocked).toBe(true);
  });
});
