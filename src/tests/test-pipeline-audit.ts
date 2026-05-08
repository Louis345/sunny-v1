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

describe("pipeline audit — spelling activity wiring", () => {
  it('isWordDrivenHomeworkNodeType("word-radar") returns true', () => {
    expect(isWordDrivenHomeworkNodeType("word-radar")).toBe(true);
  });

  it('isWordDrivenHomeworkNodeType("letter-rush") returns true', () => {
    expect(isWordDrivenHomeworkNodeType("letter-rush")).toBe(true);
  });

  it('BANDIT_POOL includes "word-radar"', () => {
    expect(BANDIT_POOL).toContain("word-radar");
  });

  it("ingestHomework spelling_test merge puts evaluator Letter Rush first with config", () => {
    const words = ["Cat", "dog"];
    const nodes = mergeNormalizedPlan([], words, 2, {
      homeworkType: "spelling_test",
      daysUntilTest: 4,
    });
    expect(nodes[0]?.type).toBe("letter-rush");
    expect((nodes[0]?.activityConfig as { mode?: string } | undefined)?.mode).toBe(
      "type-and-spell",
    );
    expect((nodes[0]?.activityConfig as { words?: unknown[] } | undefined)?.words).toHaveLength(2);
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

  it('buildHomeworkNodes({ type: "spelling_test", ... }) puts evaluator Letter Rush first', () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["farmer", "teacher"],
      homeworkId: "hw-spelling_test-x",
      childId: "ila",
    });
    expect(nodes[0]?.type).toBe("letter-rush");
    expect((nodes[0]?.activityConfig as { mode?: string } | undefined)?.mode).toBe(
      "type-and-spell",
    );
  });

  it("buildHomeworkNodes maps Letter Rush config words for every selected spelling word", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["farmer", "teacher"],
      homeworkId: "x",
      childId: "ila",
    });
    expect((nodes[0]?.activityConfig as { words?: unknown[] } | undefined)?.words).toHaveLength(2);
  });

  it("buildHomeworkNodes second node is trap-the-imposter practice", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["a", "b"],
      homeworkId: "x",
      childId: "ila",
    });
    expect(nodes[1]?.type).toBe("letter-rush");
    expect((nodes[1]?.activityConfig as { mode?: string } | undefined)?.mode).toBe(
      "trap-the-imposter",
    );
  });

  it("buildHomeworkNodes spelling_test order: baseline, practice, mastery Letter Rush", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["a", "b"],
      homeworkId: "hw-x",
      childId: "ila",
    });
    expect(nodes.map((n) => n.type)).toEqual([
      "letter-rush",
      "letter-rush",
      "letter-rush",
    ]);
    expect(nodes.map((n) => (n.activityConfig as { mode?: string } | undefined)?.mode)).toEqual([
      "type-and-spell",
      "trap-the-imposter",
      "mastery-run",
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
      expect(n.words.length).toBe(5);
      expect((n.activityConfig as { words?: unknown[] } | undefined)?.words).toHaveLength(5);
    }
  });

  it("buildHomeworkNodes respects maxWords from child profile spelling games", () => {
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
    expect((nodes[0]?.activityConfig as { words?: unknown[] } | undefined)?.words).toHaveLength(3);
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
    expect(pending.nodes[0]?.type).toBe("letter-rush");
    expect(pending.nodes[0]?.activityConfigPath).toContain("letter-rush-baseline.json");
    expect(pending.nodes[2]?.activityConfigPath).toContain("letter-rush-mastery-check.json");
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

  it("resolveSpellingWordListForHomework prefers the planned spelling chunk over the full captured list", () => {
    const raw = "shiny slowly lucky neatly sunny able behind carefully common easy";
    const selectedChunk = resolveSpellingWordListForHomework({
      worksheetMode: false,
      extractSpellingWords: true,
      pendingWordList: ["shiny", "slowly", "lucky", "neatly", "sunny", "able", "behind"],
      pendingNodes: [
        {
          type: "letter-rush",
          words: ["shiny", "slowly", "lucky", "neatly", "sunny"],
        },
      ],
      rawContent: raw,
    });

    expect(selectedChunk).toEqual(["shiny", "slowly", "lucky", "neatly", "sunny"]);
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
