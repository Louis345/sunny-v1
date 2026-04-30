import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isWordDrivenHomeworkNodeType,
  pendingHomeworkToNodeConfigs,
} from "../server/map-coordinator";
import { BANDIT_POOL } from "../engine/nodeSelection";
import {
  mergeNormalizedPlan,
  buildHomeworkNodes,
  buildPendingHomeworkPayload,
} from "../scripts/ingestHomework";
import { resolveSpellingWordListForHomework } from "../server/session-bootstrap";
import * as childrenConfig from "../profiles/childrenConfig";
import type { ChildProfileEntry } from "../profiles/childrenConfig";

describe("pipeline audit — word-radar homework wiring", () => {
  it('isWordDrivenHomeworkNodeType("word-radar") returns true', () => {
    expect(isWordDrivenHomeworkNodeType("word-radar")).toBe(true);
  });

  it('BANDIT_POOL includes "word-radar"', () => {
    expect(BANDIT_POOL).toContain("word-radar");
  });

  it("ingestHomework spelling_test merge puts word-radar first with items", () => {
    const words = ["Cat", "dog"];
    const nodes = mergeNormalizedPlan([], words, 2, {
      homeworkType: "spelling_test",
      daysUntilTest: 4,
    });
    expect(nodes[0]?.type).toBe("word-radar");
    expect(nodes[0]?.wordRadarItems).toEqual([
      { display: "Cat", acceptedResponses: ["cat"], label: "Spelling", subject: "spelling" },
      { display: "dog", acceptedResponses: ["dog"], label: "Spelling", subject: "spelling" },
    ]);
  });

  it("pendingHomeworkToNodeConfigs maps word-radar items from profile", () => {
    const hw = {
      weekOf: "2026-04-21",
      testDate: null as string | null,
      wordList: ["sun", "moon"],
      generatedAt: "2026-04-26T00:00:00.000Z",
      nodes: [
        {
          id: "n1",
          type: "word-radar",
          words: ["sun", "moon"],
          difficulty: 2,
          gameFile: null,
          storyFile: null,
          wordRadarItems: [
            { display: "sun", acceptedResponses: ["sun"], label: "Spelling" },
            { display: "moon", acceptedResponses: ["moon"], label: "Spelling" },
          ],
        },
      ],
    };
    const configs = pendingHomeworkToNodeConfigs(hw, ["sun", "moon"]);
    expect(configs[0]?.type).toBe("word-radar");
    expect(configs[0]?.wordRadarItems).toHaveLength(2);
    expect(configs[0]?.wordRadarItems?.[0]).toMatchObject({
      display: "sun",
      acceptedResponses: ["sun"],
    });
  });
});

describe("ingest homework nodes + spelling word list", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buildHomeworkNodes({ type: "spelling_test", ... }) puts word-radar first', () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["farmer", "teacher"],
      homeworkId: "hw-spelling_test-x",
      childId: "ila",
    });
    expect(nodes[0]?.type).toBe("word-radar");
  });

  it("buildHomeworkNodes maps wordRadarItems for every spelling word", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["farmer", "teacher"],
      homeworkId: "x",
      childId: "ila",
    });
    expect(nodes[0]?.wordRadarItems?.length).toBe(2);
  });

  it("buildHomeworkNodes second node is spell-check", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["a", "b"],
      homeworkId: "x",
      childId: "ila",
    });
    expect(nodes[1]?.type).toBe("spell-check");
  });

  it("buildHomeworkNodes spelling_test order: word-radar, spell-check, wheel-of-fortune", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["a", "b"],
      homeworkId: "hw-x",
      childId: "ila",
    });
    expect(nodes.map((n) => n.type)).toEqual([
      "word-radar",
      "spell-check",
      "wheel-of-fortune",
    ]);
  });

  it("buildHomeworkNodes with default maxWords=5 caps spelling nodes at five words", () => {
    const words = ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"];
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-cap",
      childId: "no_profile_child_xyz",
    });
    for (const n of nodes) {
      const items = n.type === "word-radar" ? n.wordRadarItems ?? [] : n.words;
      expect(items.length).toBeLessThanOrEqual(5);
      expect(n.words.length).toBe(5);
    }
  });

  it("buildHomeworkNodes respects maxWords from child profile (spell-check game)", () => {
    vi.spyOn(childrenConfig, "readChildMeta").mockReturnValue({
      games: { "spell-check": { maxWords: 3 } },
    } as ChildProfileEntry);
    const words = ["a", "b", "c", "d", "e"];
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-meta",
      childId: "custom",
    });
    expect(nodes[0]?.words).toHaveLength(3);
    expect(nodes[0]?.wordRadarItems).toHaveLength(3);
    expect(nodes[1]?.words).toHaveLength(3);
  });

  it("buildHomeworkNodes passes childId through to readChildMeta", () => {
    const spy = vi.spyOn(childrenConfig, "readChildMeta").mockReturnValue(undefined);
    buildHomeworkNodes({
      type: "spelling_test",
      words: ["a"],
      homeworkId: "x",
      childId: "reina",
    });
    expect(spy).toHaveBeenCalledWith("reina");
  });

  it("buildPendingHomeworkPayload with buildHomeworkNodes yields three persisted spelling nodes", () => {
    const words = ["farmer", "teacher"];
    const homeworkId = "hw-spelling_test-testid";
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-26",
      testDate: null,
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({ type: "spelling_test", words, homeworkId, childId: "ila" }),
    });
    expect(pending.nodes.length).toBe(3);
    expect(pending.nodes[0]?.type).toBe("word-radar");
    expect(pending.nodes[2]?.type).toBe("wheel-of-fortune");
  });

  it("resolveSpellingWordListForHomework prefers pending wordList over raw extraction", () => {
    const raw = "add, addition, move, movers from old worksheet";
    const fromPending = resolveSpellingWordListForHomework({
      worksheetMode: false,
      extractSpellingWords: true,
      pendingWordList: ["farmer", "teacher", "visitor"],
      rawContent: raw,
    });
    expect(fromPending).toEqual(["farmer", "teacher", "visitor"]);
  });

  it("resolveSpellingWordListForHomework falls back to raw when pending empty", () => {
    const raw = ["cat", "dog", "star"].join("\n");
    const out = resolveSpellingWordListForHomework({
      worksheetMode: false,
      extractSpellingWords: true,
      pendingWordList: [],
      rawContent: raw,
    });
    expect(out).toEqual(["cat", "dog", "star"]);
  });
});
