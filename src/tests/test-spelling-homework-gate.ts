import { describe, it, expect } from "vitest";
import { createSpellingHomeworkGate } from "../server/spelling-homework-gate";
import { buildLaunchGameTool } from "../agents/elli/tools/launchGame";
import { createHomeworkEvidenceGate, filterHomeworkTargets } from "../shared/homeworkEvidenceGate";

describe("createSpellingHomeworkGate", () => {
  it("is permissive when allowlist is empty", () => {
    const g = createSpellingHomeworkGate([]);
    expect(g.allowedNorms.length).toBe(0);
    expect(g.allows("anything")).toBe(true);
    expect(g.allows("  Question  ")).toBe(true);
  });

  it("rejects empty string even when permissive", () => {
    const g = createSpellingHomeworkGate([]);
    expect(g.allows("")).toBe(false);
    expect(g.explainReject("")).toContain("non-empty");
  });

  it("allows only listed words when non-empty", () => {
    const g = createSpellingHomeworkGate(["cat", "dog"]);
    expect(g.allows("cat")).toBe(true);
    expect(g.allows("CAT")).toBe(true);
    expect(g.allows("question")).toBe(false);
    expect(g.explainReject("question")).toContain("question");
  });
});

describe("homework gate in launchGame (model-visible execute)", () => {
  it("launchGame(word-builder) rejects word not on list", async () => {
    const gate = createSpellingHomeworkGate(["only"]);
    const t = buildLaunchGameTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => true,
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
      isHomeworkSpellingWordAllowed: (w) => gate.allows(w),
      getHomeworkSpellingRejectMessage: (w) => gate.explainReject(w),
    });
    const exec = t.execute as (a: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => Promise<unknown>;
    const r = (await exec({
      name: "word-builder",
      type: "tool",
      word: "other",
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.launched).toBe(false);
    expect(String(r.error)).toContain("not on today's extracted");
  });

  it("launchGame(spell-check) rejects word not on list", async () => {
    const gate = createSpellingHomeworkGate(["zip"]);
    const t = buildLaunchGameTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => true,
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
      isHomeworkSpellingWordAllowed: (w) => gate.allows(w),
      getHomeworkSpellingRejectMessage: (w) => gate.explainReject(w),
    });
    const exec = t.execute as (a: {
      name: string;
      type: "tool" | "reward";
      word?: string;
    }) => Promise<unknown>;
    const r = (await exec({
      name: "spell-check",
      type: "tool",
      word: "zap",
    })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain("not on today's extracted");
  });
});

describe("homework evidence source boundary", () => {
  it("uses captured assignment groups and rejects off-assignment extras", () => {
    const gate = createHomeworkEvidenceGate({
      homeworkId: "hw-spelling-fixture",
      wordList: ["sign", "know", "write", "machine"],
      contentProfile: { practiceDomain: "spelling" },
      capturedContent: {
        assignmentInterpretation: {
          selectedTargets: [
            { purpose: "spell_from_memory", words: ["sign", "know", "write"] },
          ],
          heldTargets: [
            { purpose: "read_fluently", words: ["machine"] },
          ],
        },
      },
    });

    const result = filterHomeworkTargets(gate, ["know", "machine", "farmer"]);

    expect(result.accepted).toEqual(["know", "machine"]);
    expect(result.rejected).toEqual([
      { target: "farmer", reason: "not_in_active_homework" },
    ]);
  });
});
