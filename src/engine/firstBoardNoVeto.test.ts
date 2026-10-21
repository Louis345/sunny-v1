import fs from "fs";
import os from "os";
import path from "path";
import { expect, it, vi } from "vitest";
import { linearJourneyFixture } from "../scripts/fixtures/authoredJourney";
import { buildSpellingRecallItems, buildSpellingTargetedCycleInput } from "./learningCycleIngest";
import { withInitialBoard } from "./learningBoardInstances";
import { createLearningCycle, projectLearningCycle, type LearningCycleRecordV2 } from "./learningCycleRepository";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";

// 2026-10-21 human catch: a first Teaching board was rejected for drawing bookkeeping
// (a missing connection, no single-path explanation) after successor boards had stopped
// vetoing. Logs showed board_definition_invalid; the lab asserted each rejection as correct.
// The successor half of the loop is proven in successorCanvasDecoupling.test.ts.
it("turns a Planner plan with drawing bookkeeping issues into a first Teaching board instead of rejecting it", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-first-board-"));
  try {
    const items = buildSpellingRecallItems({ homeworkId: "hw", words: ["night", "light"], evidenceIds: ["source"], measurementRole: "fresh_checkpoint" });
    const cycle = { childId: "lab", homeworkId: "hw", domain: "spelling", assignment: { title: "School words", contentFingerprint: "source", targets: ["night", "light"], capturedEvidenceIds: ["source"] }, observations: [{ observationId: "attempt-night", itemId: items[0].id }, { observationId: "attempt-light", itemId: items[1].id }], nodes: [{ role: "evaluation", evidenceContract: { spellingItems: Object.fromEntries(items.map(item => [item.id, item])) } }] } as unknown as LearningCycleRecordV2;
    const boardDefinition = linearJourneyFixture(["practice", "check"]) as any;
    boardDefinition.edges.pop();              // a missing drawn connection
    delete boardDefinition.singlePathReason;  // no explanation sentence
    const plan = { boardDefinition, planId: "targeted:hw", childId: "lab", domain: "spelling", activeHomeworkId: "hw", nodePlan: [{ id: "practice", type: "word-radar", activityId: "word-radar", targets: ["light"], title: "Practice" }, { id: "check", type: "word-radar", activityId: "word-radar", targets: ["night", "light"], title: "Check", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } }], planTheory: { hypothesis: "Practice may improve the missed spelling.", supportCriteria: ["Recall improves"], reviseCriteria: ["Mixed"], falsifyCriteria: ["No change"] }, plannedMeasurements: [
      { id: "measure-practice", activityId: "word-radar", target: "light", evidenceType: "practice", supportCriteria: "Response captured", reviseCriteria: "Support needed", falsifyCriteria: "Instrument fails", spelling: { role: "practice", evidenceIds: ["attempt-light"], interventionNodeIds: [], reason: "Current gap", uncertainty: "One attempt", finalCheck: false, expectedAccuracy: { min: 0, max: 1 }, confidence: 0.5, maxDelayDays: 7 } },
      { id: "measure-check", activityId: "word-radar", target: "both", evidenceType: "recall", supportCriteria: "Improvement", reviseCriteria: "Mixed", falsifyCriteria: "No change", spelling: { role: "fresh_checkpoint", evidenceIds: ["attempt-night", "attempt-light"], interventionNodeIds: ["practice"], reason: "Check both words", uncertainty: "Immediate performance only", finalCheck: true, expectedAccuracy: { min: 0.7, max: 1 }, confidence: 0.6, maxDelayDays: 7 } },
    ] } as unknown as ActiveSessionPlan;

    const input = buildSpellingTargetedCycleInput({ cycle, plan, now: "2026-10-21T15:00:00Z" });
    const persisted = createLearningCycle(withInitialBoard(input, "teaching", "2026-10-21T15:00:00Z"), { rootDir });
    expect(persisted.boards?.[0]?.definition).toBeDefined();
    expect(projectLearningCycle(persisted).activeSessionPlan.nodePlan.map(node => node.id)).toEqual(["practice", "check"]);
    const text = log.mock.calls.flat().join("\n");
    expect(text).toContain("[board] [bookkeeping] [path_edge_missing]");
    expect(text).toContain("[board] [bookkeeping] [single_path_reason_missing]");
  } finally {
    log.mockRestore();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
