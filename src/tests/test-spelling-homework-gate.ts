import { describe, it, expect } from "vitest";
import { createSpellingHomeworkGate } from "../server/spelling-homework-gate";
import {
  createStartWordBuilderTool,
} from "../agents/elli/tools/startWordBuilder";
import { createStartSpellCheckTool } from "../agents/elli/tools/startSpellCheck";

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

describe("homework gate in tools (model-visible execute)", () => {
  it("startWordBuilder rejects word not on list", async () => {
    const gate = createSpellingHomeworkGate(["only"]);
    const t = createStartWordBuilderTool({
      isWordBuilderSessionActive: () => false,
      tryClaimWordBuilderToolSlot: () => true,
      isHomeworkSpellingWordAllowed: (w) => gate.allows(w),
      getHomeworkSpellingRejectMessage: (w) => gate.explainReject(w),
    });
    const exec = t.execute as (a: { word: string }) => Promise<unknown>;
    const r = (await exec({ word: "other" })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(r.launched).toBe(false);
    expect(String(r.error)).toContain("not on today's extracted");
  });

  it("startSpellCheck rejects word not on list", async () => {
    const gate = createSpellingHomeworkGate(["zip"]);
    const t = createStartSpellCheckTool({
      isSpellCheckSessionActive: () => false,
      tryClaimSpellCheckToolSlot: () => true,
      isHomeworkSpellingWordAllowed: (w) => gate.allows(w),
      getHomeworkSpellingRejectMessage: (w) => gate.explainReject(w),
    });
    const exec = t.execute as (a: { word: string }) => Promise<unknown>;
    const r = (await exec({ word: "zap" })) as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect(String(r.error)).toContain("not on today's extracted");
  });
});
