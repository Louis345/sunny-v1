import { describe, it, expect } from "vitest";
import type { NodeConfig, NodeResult, NodeType } from "../shared/adventureTypes";
import { ALL_NODE_TYPES } from "../shared/adventureTypes";
import {
  formatNodeResultForCompanion,
} from "../server/companion-context/nodeResultFormatter";

function makeNode(type: NodeType, extra?: Partial<NodeConfig>): NodeConfig {
  return {
    id: `node-${type}`,
    type,
    isLocked: false,
    isCompleted: false,
    isGoal: false,
    difficulty: 2,
    words: ["cat", "dog"],
    ...extra,
  };
}

function makeResult(override?: Partial<NodeResult>): NodeResult {
  return {
    nodeId: "node-test",
    completed: true,
    accuracy: 0.85,
    timeSpent_ms: 45_000,
    wordsAttempted: 5,
    ...override,
  };
}

// NodeTypes that are in FORMATTERS (from design spec)
const HANDLED_NODE_TYPES: NodeType[] = [
  "spell-check",
  "word-builder",
  "karaoke",
  "clock-game",
  "coin-counter",
  "riddle",
  "boss",
  "space-invaders",
  "asteroid",
  "space-frogger",
];

describe("formatNodeResultForCompanion (GAME-EVENT-001)", () => {
  it("1. returns non-empty summary for each handled NodeType", () => {
    for (const type of HANDLED_NODE_TYPES) {
      const event = formatNodeResultForCompanion(makeNode(type), makeResult());
      expect(event.summary.length, `summary empty for ${type}`).toBeGreaterThan(0);
    }
  });

  it("2. unknown node type uses fallback — summary contains type name and does not throw", () => {
    const unknownType = "unknown-activity" as NodeType;
    const node = makeNode(unknownType);
    const result = makeResult();
    expect(() => formatNodeResultForCompanion(node, result)).not.toThrow();
    const event = formatNodeResultForCompanion(node, result);
    expect(event.summary).toContain(unknownType);
  });

  it("3. summary.length <= 500 for all NodeTypes including fallback", () => {
    for (const type of ALL_NODE_TYPES) {
      const event = formatNodeResultForCompanion(makeNode(type), makeResult());
      expect(event.summary.length, `summary too long for ${type}`).toBeLessThanOrEqual(500);
    }
    // also check fallback
    const fallbackEvent = formatNodeResultForCompanion(
      makeNode("unknown-zz" as NodeType),
      makeResult(),
    );
    expect(fallbackEvent.summary.length).toBeLessThanOrEqual(500);
  });

  it("4. source === 'map_node_complete' and occurredAt is recent epoch ms", () => {
    const before = Date.now();
    const event = formatNodeResultForCompanion(makeNode("spell-check"), makeResult());
    const after = Date.now();
    expect(event.source).toBe("map_node_complete");
    expect(event.occurredAt).toBeGreaterThanOrEqual(before);
    expect(event.occurredAt).toBeLessThanOrEqual(after);
  });

  it("5. spell-check and space-invaders produce different non-empty summaries", () => {
    const scEvent = formatNodeResultForCompanion(makeNode("spell-check"), makeResult());
    const siEvent = formatNodeResultForCompanion(makeNode("space-invaders"), makeResult());
    expect(scEvent.summary.length).toBeGreaterThan(0);
    expect(siEvent.summary.length).toBeGreaterThan(0);
    expect(scEvent.summary).not.toBe(siEvent.summary);
  });
});
