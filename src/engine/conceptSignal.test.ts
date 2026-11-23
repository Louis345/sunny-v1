import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { conceptSignalSection, observationEvidenceId } from "./conceptSignal";

// Owner + Saori, 11/22: in five minutes both parents saw Ila treats rounding as changing the digit she looks at
// (652 → "60", 247 → 300, 143 → 200), and at 23:23 UTC she said "I don't understand the concept". The Planner saw right /
// wrong counts and its own notes; no section gave it her words, which answers were right only with help, or her wrong
// answers side by side per concept. Why the human caught it: they watched her answer. Why logs did not: each answer was
// logged one by one as "not-right". Why the lab missed it: no lab Planner question was checked for a concept signal.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const item = (id: string, prompt: string, expected: number) => ({ id, prompt, response: { mode: "numeric", expected },
  lineage: { sourceEvidenceIds: [], exposure: "unseen", measurementRole: "fresh_checkpoint" } });
let n = 0;
const answer = (itemId: string, childResponse: string, correct: boolean, help: "unassisted" | "assisted", at: string, confounds: string[] = []) => ({
  observationId: `obs-${++n}`, sourceId: "activity:lab", itemId, childResponse, result: { correct, score: correct ? 1 : 0 },
  assistance: { status: help, scaffolds: help === "assisted" ? ["companion_help_on_item"] : [] }, exposure: "unseen", provenance: "activity",
  observedAt: at, confounds, constructLinks: [] });

function ilaShapedCycle() {
  return {
    childId: "lab-child", homeworkId: "hw-math-lab", domain: "math", createdAt: "2026-11-20T10:00:00.000Z",
    nodes: [{ nodeId: "b1-round", state: "completed", role: "baseline", title: "Fuji Stay or Roll", evidenceContract: { itemContracts: {
      r1: item("r1", "Round 652 to the nearest hundred.", 700), r2: item("r2", "Round 247 to the nearest hundred.", 200),
      r3: item("r3", "Round 143 to the nearest hundred.", 100), r4: item("r4", "Round 865 to the nearest hundred.", 900),
      p1: item("p1", "61, 58, 55, 52, ? (rule -3)", 49) } } }],
    observations: [
      answer("r1", "60", false, "unassisted", "2026-11-22T23:20:00.000Z", ["first_try"]),
      answer("r2", "300", false, "unassisted", "2026-11-22T23:21:00.000Z", ["first_try"]),
      answer("r3", "200", false, "unassisted", "2026-11-22T23:22:00.000Z", ["first_try"]),
      answer("r4", "800", false, "unassisted", "2026-11-22T23:23:00.000Z", ["first_try"]),
      answer("r4", "900", true, "assisted", "2026-11-22T23:24:00.000Z", ["retry"]),
      answer("p1", "52", false, "assisted", "2026-11-23T01:53:00.000Z"),
    ],
    decisionHistory: [{ eventType: "theory_decided", decisionId: "d1", createdAt: "2026-11-21T10:00:00.000Z", reason: "r", evidenceIds: [],
      readyOnPaper: [{ concept: "Rounding to hundreds", chance: 0.3, why: "w", proof: "p", items: ["r1", "r2", "r3", "r4"] }] }],
  } as never;
}

function contextRoot(lines: Array<Record<string, unknown>>) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-concept-")); roots.push(rootDir);
  const dir = path.join(rootDir, "src/context/lab-child/companion_interactions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "2026-11-22.ndjson"), lines.map(line => JSON.stringify(line)).join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "2026-11-01.ndjson"), JSON.stringify({ id: "old", childId: "lab-child", questionText: "I don't understand this one", createdAt: "2026-11-01T10:00:00.000Z" }) + "\n");
  return rootDir;
}

describe("the concept signal: how she thinks, apart from right and wrong counts", () => {
  it("lays out her words about understanding, help-dependence and her actual wrong answers per concept, with citable ids", () => {
    const rootDir = contextRoot([
      { id: "ci-1", childId: "lab-child", callSource: "activity_help", questionText: "I don't understand the concept.", createdAt: "2026-11-22T23:23:36.000Z" },
      { id: "ci-2", childId: "lab-child", callSource: "activity_help", questionText: "Can you help me? Forty five, forty six.", createdAt: "2026-11-22T23:25:00.000Z" },
      { id: "ci-3", childId: "lab-child", callSource: "game_reward", questionText: "I get it now, it goes to the big house!", createdAt: "2026-11-22T23:40:00.000Z" },
    ]);
    const { text, evidenceIds } = conceptSignalSection(ilaShapedCycle(), { rootDir });
    // Her words about understanding, verbatim, dated, citable; other chat and earlier weeks are not this section.
    expect(text).toContain(`[said:ci-1] 2026-11-22 23:23: "I don't understand the concept."`);
    expect(text).toContain(`[said:ci-3] 2026-11-22 23:40: "I get it now, it goes to the big house!"`);
    expect(text).not.toContain("Forty five");
    expect(text).not.toContain("[said:old]");
    // Right only after help: 865 was right only once Elli helped.
    expect(text).toMatch(/Right only with help[^\n]*\n- "Round 865 to the nearest hundred\." \(Rounding to hundreds\): right with help 1 time; on her own she wrote "800"/);
    // Her wrong answers kept as she gave them, grouped by the Planner's own concept tag; untagged problems listed apart.
    expect(text).toContain(`- Rounding to hundreds: "Round 652 to the nearest hundred." → "60" (on her own) [${observationEvidenceId("obs-1")}]; "Round 247 to the nearest hundred." → "300" (on her own)`);
    expect(text).toContain(`"Round 143 to the nearest hundred." → "200" (on her own)`);
    expect(text).toMatch(/- Problems you have not tagged to a concept: "61, 58, 55, 52, \? \(rule -3\)" → "52" \(with help\)/);
    // No misconception is named by code: what the answers mean is the Planner's.
    expect(text).not.toMatch(/misconception|truncat|peak|place value/i);
    expect(evidenceIds).toEqual(expect.arrayContaining(["said:ci-1", "said:ci-3", observationEvidenceId("obs-1"), observationEvidenceId("obs-6")]));
  });

  it("says plainly when there is nothing yet, and never throws on a missing or unreadable folder", () => {
    const empty = { ...ilaShapedCycle() as object, observations: [] } as never;
    const { text, evidenceIds } = conceptSignalSection(empty, { rootDir: path.join(os.tmpdir(), "sunny-concept-missing") });
    expect(text).toContain("- Nothing she said about understanding is recorded on this assignment yet.");
    expect(text).toContain("- No wrong answers recorded yet.");
    expect(evidenceIds).toEqual([]);
  });
});
