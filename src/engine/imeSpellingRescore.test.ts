/**
 * 2026-11-10: answers Ila typed with the kiosk in Japanese input mode were already saved as kana misspellings
 * ("フォrゴt" for forgot). The capture fix stops new ones; this re-scores the saved ones through the repository.
 * Why the human caught it: the parent read the saved answers. Why logs did not: they never printed the characters.
 * Why the lab missed it: no lab child ever types through an IME, so no saved record had kana to repair.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSpellingRecallItems, createSpellingDiscoveryCycle, buildSpellingDiscoveryPlan } from "./learningCycleIngest";
import { publishDiscoveryExperience } from "./adaptiveMathDiscovery";
import { getLearningCycle, transitionLatestLearningCycle } from "./learningCycleRepository";
import { rescoreImeSpellingObservations, parseRescoreImeArgs } from "./imeSpellingRescore";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";

async function savedKanaFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-ime-rescore-"));
  const items = buildSpellingRecallItems({ homeworkId: "hw-ime", words: ["forgot", "import", "charge"], evidenceIds: ["s"], measurementRole: "fresh_checkpoint" });
  const cycle = createSpellingDiscoveryCycle({ childId: "lab-child", homeworkId: "hw-ime", title: "Words", contentFingerprint: "fp", items, boardDefinition: linearJourneyFixture(["hw-ime:discovery"]) }, { rootDir });
  await publishDiscoveryExperience({ rootDir, childId: "lab-child", homeworkId: "hw-ime", spellingItems: items, assignment: cycle.assignment,
    activeSessionPlan: buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } }) });
  const nodeId = getLearningCycle("lab-child", "hw-ime", { rootDir })!.nodes[0].nodeId;
  // What the pre-fix code saved: the kana, scored wrong.
  const saved = (id: string, itemId: string, childResponse: string, observedAt: string, correct: boolean) => ({ observationId: id, sourceId: `evaluation:${nodeId}`, itemId, childResponse,
    constructLinks: [{ constructId: "c", role: "primary" as const, confidence: 1 }], result: { correct, score: correct ? 1 : 0 },
    assistance: { status: "unassisted" as const, scaffolds: [] }, exposure: "unseen" as const, provenance: "independent_probe" as const, observedAt, confounds: ["first_response"] });
  transitionLatestLearningCycle("lab-child", "hw-ime", { type: "evaluation_started", evaluationId: nodeId }, { rootDir });
  transitionLatestLearningCycle("lab-child", "hw-ime", { type: "evaluation_attempted", evaluationId: nodeId, nodeId,
    observations: [saved("o1", items[0].id, "フォrゴt", "2026-11-10T15:00:00Z", false), saved("o2", items[1].id, "イmポrー", "2026-11-10T15:01:00Z", false),
      saved("o3", items[2].id, "charj", "2026-11-10T15:02:00Z", false), saved("o0", items[2].id, "チャrゲ", "2026-11-09T15:00:00Z", false)],
    academicEvidence: [], engagementEvidence: [], companionObservations: [] }, { rootDir });
  return { rootDir };
}

describe("re-scoring saved Japanese-keyboard spelling answers", () => {
  it("re-scores only kana answers since the given time, keeps the old answer, and logs old and new", async () => {
    const { rootDir } = await savedKanaFixture();
    try {
      const report = rescoreImeSpellingObservations({ childId: "lab-child", homeworkId: "hw-ime", since: "2026-11-10T00:00:00Z", source: "owner 11/10" }, { rootDir });
      expect(report.rescored.map(row => [row.observationId, row.to.childResponse, row.to.result])).toEqual([
        ["o1", "forgot", { correct: true, score: 1 }],
        ["o2", "イmポrー", { observedErrorType: "keyboard_ime_unscorable" }],
      ]);
      const cycle = getLearningCycle("lab-child", "hw-ime", { rootDir })!;
      const byId = new Map(cycle.observations.map(row => [row.observationId, row]));
      expect(byId.get("o1")).toMatchObject({ childResponse: "forgot", result: { correct: true } });
      expect(byId.get("o1")!.confounds).toEqual(expect.arrayContaining(["keyboard_ime_input", "ime_raw:フォrゴt"]));
      expect(byId.get("o3")!.result).toEqual({ correct: false, score: 0 });
      expect(byId.get("o0")!.childResponse).toBe("チャrゲ"); // before --since
      expect(cycle.observationRescores!.map(row => row.from)).toEqual([
        { childResponse: "フォrゴt", result: { correct: false, score: 0 } }, { childResponse: "イmポrー", result: { correct: false, score: 0 } }]);
      expect(cycle.decisionHistory.at(-1)).toMatchObject({ eventType: "observation_rescored", fromLifecycle: cycle.lifecycle, toLifecycle: cycle.lifecycle });
      // Running it again finds nothing left to re-score.
      expect(rescoreImeSpellingObservations({ childId: "lab-child", homeworkId: "hw-ime", since: "2026-11-10T00:00:00Z", source: "again" }, { rootDir }).rescored).toEqual([]);
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("refuses when a published board's seal is broken instead of writing around it", async () => {
    const { rootDir } = await savedKanaFixture();
    try {
      const file = path.join(rootDir, "src/context/lab-child/homework/cycles/hw-ime.json");
      const cycle = JSON.parse(fs.readFileSync(file, "utf8"));
      cycle.boards[0].topologyHash = "hand-edited";
      fs.writeFileSync(file, JSON.stringify(cycle));
      expect(() => rescoreImeSpellingObservations({ childId: "lab-child", homeworkId: "hw-ime", since: "2026-11-10T00:00:00Z", source: "owner" }, { rootDir })).toThrow(/seal/);
      expect(JSON.parse(fs.readFileSync(file, "utf8")).observations[0].childResponse).toBe("フォrゴt");
    } finally { fs.rmSync(rootDir, { recursive: true, force: true }); }
  });

  it("requires child, homework, since and source on the command line", () => {
    expect(parseRescoreImeArgs(["--child", "ila", "--homework", "hw", "--since", "2026-11-10T00:00:00Z", "--source", "owner"]))
      .toEqual({ childId: "ila", homeworkId: "hw", since: "2026-11-10T00:00:00Z", source: "owner", dryRun: false });
    expect(parseRescoreImeArgs(["--child", "ila", "--homework", "hw", "--since", "yesterday", "--source", "owner"])).toBeNull();
    expect(parseRescoreImeArgs(["--child", "ila", "--homework", "hw", "--since", "2026-11-10T00:00:00Z"])).toBeNull();
  });
});
