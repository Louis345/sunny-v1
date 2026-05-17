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
import {
  buildHomeworkSessionStartPrompt,
  buildPendingHomeworkPromptContent,
  resolveSpellingWordListForHomework,
  shouldUsePendingHomeworkChildPrompt,
  shouldLoadLegacyHomeworkFolder,
} from "../server/session-bootstrap";
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

  it("pendingHomeworkToNodeConfigs preserves per-node homework targets", () => {
    const hw = {
      weekOf: "2026-05-11",
      testDate: "2026-05-15",
      wordList: ["above", "ago", "government", "wait"],
      generatedAt: "2026-05-11T00:00:00.000Z",
      nodes: [
        {
          id: "n-spell-check",
          type: "spell-check",
          words: ["above", "ago"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
        {
          id: "n-pronunciation",
          type: "pronunciation",
          words: ["government", "wait"],
          difficulty: 1,
          gameFile: null,
          storyFile: null,
        },
      ],
    } as NonNullable<import("../shared/childProfile").ChildProfile["pendingHomework"]>;

    const configs = pendingHomeworkToNodeConfigs(hw, ["above", "ago"]);

    expect(configs.find((node) => node.type === "spell-check")?.words).toEqual([
      "above",
      "ago",
    ]);
    expect(configs.find((node) => node.type === "pronunciation")?.words).toEqual([
      "government",
      "wait",
    ]);
  });
});

describe("ingest homework nodes + spelling word list", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buildHomeworkNodes({ type: "spelling_test", ... }) puts Spell Check first', () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["farmer", "teacher"],
      homeworkId: "hw-spelling_test-x",
      childId: "ila",
    });
    expect(nodes[0]?.type).toBe("spell-check");
    expect(nodes[0]?.words).toEqual(["farmer", "teacher"]);
  });

  it("buildHomeworkNodes maps selected spelling words onto Spell Check", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["farmer", "teacher"],
      homeworkId: "x",
      childId: "ila",
    });
    expect(nodes[0]?.words).toHaveLength(2);
  });

  it("buildHomeworkNodes spelling_test avoids repeated drill nodes", () => {
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words: ["a", "b"],
      homeworkId: "hw-x",
      childId: "ila",
    });
    expect(nodes.map((n) => n.type)).toEqual(["spell-check"]);
  });

  it("buildHomeworkNodes with default maxWords=5 builds a measured spelling cohort", () => {
    const words = ["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"];
    const nodes = buildHomeworkNodes({
      type: "spelling_test",
      words,
      homeworkId: "hw-cap",
      childId: "no_profile_child_xyz",
    });
    expect(nodes.map((node) => node.type)).toEqual([
      "word-radar",
      "spell-check",
      "monster-stampede",
    ]);
    expect(nodes.find((node) => node.type === "word-radar")?.words).toEqual([
      "w1",
      "w2",
      "w3",
      "w4",
      "w5",
    ]);
    expect(nodes.find((node) => node.type === "spell-check")?.words).toEqual([
      "w6",
      "w7",
      "w8",
    ]);
    expect(nodes.find((node) => node.type === "monster-stampede")?.words).toEqual(words);
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

  it("buildPendingHomeworkPayload with buildHomeworkNodes yields one persisted spelling baseline", () => {
    const words = ["farmer", "teacher"];
    const homeworkId = "hw-spelling_test-testid";
    const pending = buildPendingHomeworkPayload({
      weekOf: "2026-04-26",
      testDate: null,
      wordList: words,
      homeworkId,
      nodes: buildHomeworkNodes({ type: "spelling_test", words, homeworkId, childId: "ila" }),
    });
    expect(pending.nodes.length).toBe(1);
    expect(pending.nodes[0]?.type).toBe("spell-check");
    expect(pending.nodes[0]?.words).toEqual(["farmer", "teacher"]);
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

  it("homework sessions prefer active pending homework over legacy root folders", () => {
    expect(
      shouldLoadLegacyHomeworkFolder({
        diagKioskFast: false,
        homeworkMode: false,
        subject: "homework",
        pendingHomework: {
          homeworkId: "hw-spelling_test-current",
          wordList: ["above"],
          nodes: [{ type: "letter-rush", words: ["above"] }],
        },
      }),
    ).toBe(false);
  });

  it("parent homework review mode can still load legacy worksheet folders", () => {
    expect(
      shouldLoadLegacyHomeworkFolder({
        diagKioskFast: false,
        homeworkMode: true,
        subject: "homework",
        pendingHomework: {
          homeworkId: "hw-spelling_test-current",
          wordList: ["above"],
          nodes: [{ type: "letter-rush", words: ["above"] }],
        },
      }),
    ).toBe(true);
  });

  it("active pending homework without a legacy worksheet still uses the child homework prompt", () => {
    const pendingHomework = {
      homeworkId: "hw-spelling_test-current",
      wordList: ["above", "ago"],
      nodes: [{ type: "spell-check", words: ["above", "ago"] }],
    };

    expect(
      shouldUsePendingHomeworkChildPrompt({
        subject: "homework",
        homeworkPayloadPresent: false,
        pendingHomework,
      }),
    ).toBe(true);
    expect(
      shouldUsePendingHomeworkChildPrompt({
        subject: "diag",
        homeworkPayloadPresent: false,
        pendingHomework,
      }),
    ).toBe(false);
  });

  it("active pending homework prompt content carries assignment-scoped context", () => {
    const content = buildPendingHomeworkPromptContent({
      homeworkId: "hw-spelling_test-current",
      testDate: "2026-05-15",
      returnTag: "#sunny_reina_hw_spelling_test_current",
      wordList: ["above", "ago"],
      nodes: [{ type: "spell-check", words: ["above", "ago"] }],
    });

    expect(content).toContain("## Active homework cycle");
    expect(content).toContain("homeworkId: hw-spelling_test-current");
    expect(content).toContain("testDate: 2026-05-15");
    expect(content).toContain("spell-check: above, ago");
    expect(content).not.toMatch(/demonstrate any capability/i);
  });

  it("homework session start prompt is context-aware instead of a random greeting", () => {
    const prompt = buildHomeworkSessionStartPrompt({
      childName: "Reina",
      pendingHomework: {
        homeworkId: "hw-spelling_test-current",
        testDate: "2026-05-15",
        contentProfile: {
          topic: "Schwa sound and high-frequency words",
          primarySkill: "spelling recall",
          practiceDomain: "spelling",
          assignmentFormat: "spelling test",
          concepts: ["schwa"],
        },
        nodes: [{ type: "word-radar", words: ["above", "ago"] }],
      },
    });

    expect(prompt).toContain("Speak to Reina");
    expect(prompt).toContain("hw-spelling_test-current");
    expect(prompt).toContain("2026-05-15");
    expect(prompt).toContain("First map node: word-radar");
    expect(prompt).toContain("Do not address the parent or caregiver.");
    expect(prompt).not.toContain("Jamal");
  });

  it("homework session start prompt uses active map context over raw pending node order", () => {
    const prompt = buildHomeworkSessionStartPrompt({
      childName: "Ila",
      pendingHomework: {
        homeworkId: "hw-spelling_test-current",
        testDate: "2026-05-22",
        contentProfile: {
          topic: "Spelling patterns and high-frequency words",
          primarySkill: "spelling recall",
          practiceDomain: "spelling",
          assignmentFormat: "spelling test",
          concepts: ["suffixes"],
        },
        nodes: [{ type: "word-radar", words: ["shiny", "slowly"] }],
      },
      activeMapFirstNode: {
        type: "pronunciation",
        words: ["shiny", "slowly", "lucky", "neatly", "sunny"],
      },
    });

    expect(prompt).toContain("First map node: pronunciation");
    expect(prompt).toContain("First node words: shiny, slowly, lucky, neatly, sunny");
    expect(prompt).not.toContain("First map node: word-radar");
  });

  it("homework session start prompt uses the real high-frequency pronunciation first node", () => {
    const prompt = buildHomeworkSessionStartPrompt({
      childName: "Ila",
      pendingHomework: {
        homeworkId: "hw-spelling_test-current",
        testDate: "2026-05-22",
        contentProfile: {
          topic: "Schwa sounds and high-frequency words",
          primarySkill: "spelling recall",
          practiceDomain: "spelling",
          assignmentFormat: "spelling test",
          concepts: ["schwa", "high-frequency words"],
        },
        nodes: [
          { type: "spell-check", words: ["above", "ago", "about"] },
          { type: "pronunciation", words: ["ago", "government", "half"] },
        ],
      },
      activeMapFirstNode: {
        type: "pronunciation",
        words: ["ago", "government", "half", "machine", "pair"],
      },
    });

    expect(prompt).toContain("First map node: pronunciation");
    expect(prompt).toContain("First node words: ago, government, half, machine, pair");
    expect(prompt).not.toContain("First map node: spell-check");
  });

  it("homework session start prompt announces repaired spelling recall before scaffolded practice", () => {
    const prompt = buildHomeworkSessionStartPrompt({
      childName: "Ila",
      pendingHomework: {
        homeworkId: "hw-spelling_test-current",
        testDate: "2026-05-22",
        contentProfile: {
          topic: "Schwa sounds",
          primarySkill: "spelling recall",
          practiceDomain: "spelling",
          assignmentFormat: "spelling test",
          concepts: ["schwa"],
        },
        nodes: [
          { type: "word-radar", words: ["above", "ago"] },
          { type: "spell-check", words: ["above", "ago", "about"] },
        ],
      },
    });

    expect(prompt).toContain("First map node: spell-check");
    expect(prompt).toContain("First node words: above, ago, about");
    expect(prompt).not.toContain("First map node: word-radar");
  });
});
