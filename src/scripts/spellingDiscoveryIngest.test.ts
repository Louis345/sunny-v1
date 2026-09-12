import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSpellingDiscoveryIntake, applyPlannedHomeworkIngest } from "./ingestHomework";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { buildAssignmentPlanningPacket, type SpellingIntake } from "../engine/assignmentPlanner";
import { hashDiscoveryContract, resolveAdaptiveMathDraftDir } from "../engine/adaptiveMathDiscovery";
import { getChildChart } from "../profiles/childChart";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-intake-")); roots.push(rootDir);
  const child = path.join(rootDir, "src/context/lab-child");
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(child, "learning_profile.json"), JSON.stringify({ childId: "lab-child", name: "Lab child", age: 8, grade: 3, totalSessions: 0, sessionHistory: [], preferences: {}, strengths: [], challenges: [], notes: [], diagnoses: [], learningGoals: [] }));
  fs.writeFileSync(path.join(rootDir, "children.config.json"), JSON.stringify({ childProfiles: { "lab-child": {} }, companions: { elli: { dopamineGames: [], faceCamera: { position: [0, 0, 1], target: [0, 0, 0] } } }, defaultCompanionId: "elli" }));
  const sourceFile = path.join(rootDir, "school.txt"); fs.writeFileSync(sourceFile, "Spelling words\nnight\nlight\ncan't");
  return { rootDir, sourceFile, childId: "lab-child" };
}
describe("production spelling intake phases", () => {
  it("resumes legacy prose warnings only after explicit review, without rewriting or recapturing them", async () => {
    const input = fixture();
    const extraction = await extractAssignmentSource(input.sourceFile);
    const packet = buildAssignmentPlanningPacket({ childId: input.childId, extraction, childChart: getChildChart(input.childId, input) });
    const homeworkId = `hw-spelling-${packet.sourceDocument.fileHash.slice(0, 8)}`;
    const draft = resolveAdaptiveMathDraftDir(input.childId, homeworkId, input);
    fs.mkdirSync(draft, { recursive: true });
    const result = { output: { title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: ["All assigned words are clearly legible; the name header is unreadable."] }, telemetry: { model: "recorded-legacy", latencyMs: 10 } };
    fs.writeFileSync(path.join(draft, "spelling-intake-request.json"), JSON.stringify(packet));
    const responseFile = path.join(draft, "spelling-intake-response.json");
    const original = JSON.stringify({ ...result, requestHash: hashDiscoveryContract(packet), outputHash: hashDiscoveryContract(result) });
    fs.writeFileSync(responseFile, original);
    const callPlannerModel = vi.fn(async (): Promise<never> => { throw new Error("must reuse legacy capture"); });
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("confirmation_required");
    const confirmCapture = vi.fn(async (capture: SpellingIntake) => {
      expect(capture).toEqual(result.output);
      // The UI receives a copy, not authority to modify the frozen provider response.
      capture.words[0].word = "invented";
      return true;
    });
    await runSpellingDiscoveryIntake(input, { callPlannerModel, confirmCapture, reviewer: "lab-legacy-review" });
    await runSpellingDiscoveryIntake(input, { callPlannerModel, confirmCapture });
    expect(callPlannerModel).not.toHaveBeenCalled();
    expect(confirmCapture).toHaveBeenCalledOnce();
    expect(fs.readFileSync(responseFile, "utf8")).toBe(original);
    expect(getLearningCycle(input.childId, homeworkId, input)!.assignment.targets).toEqual(["night"]);
  });
  it("publishes clear words with source notes and preserves the captured notes on resume", async () => {
    const input = fixture();
    const sourceNotes = ["Handwritten header is unclear; all assigned words are legible.", "Practice page repeats the assigned words."];
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: [], sourceNotes } }));
    const first = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const saved = JSON.parse(fs.readFileSync(path.join(input.rootDir, "src/context/lab-child/homework/direct-drafts", first.homeworkId, "spelling-intake-response.json"), "utf8"));
    expect(saved.output.sourceNotes).toEqual(sourceNotes);
    expect(callPlannerModel).toHaveBeenCalledOnce();
    expect(getLearningCycle(input.childId, first.homeworkId, input)!.lifecycle).toBe("evaluation_ready");
  });
  it("offers confirmation for saved uncertainty, preserving the provider receipt and paying only once", async () => {
    const input = fixture();
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: [{ kind: "ambiguous_word", pageNumber: 1, detail: "Verify night against the source." }] } }));
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("confirmation_required");
    const drafts = path.join(input.rootDir, "src/context/lab-child/homework/direct-drafts");
    const homeworkId = fs.readdirSync(drafts).find(name => name.startsWith("hw-spelling-"))!;
    const receiptFile = path.join(drafts, homeworkId, "spelling-intake-response.json");
    const before = fs.readFileSync(receiptFile, "utf8");
    const decline = vi.fn(async () => false);
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel, confirmCapture: decline })).rejects.toThrow("confirmation_required");
    expect(decline).toHaveBeenCalledOnce();
    expect(getLearningCycle(input.childId, homeworkId, input)).toBeNull();
    const approve = vi.fn(async () => true);
    await runSpellingDiscoveryIntake(input, { callPlannerModel, confirmCapture: approve, reviewer: "lab-source-review" });
    await runSpellingDiscoveryIntake(input, { callPlannerModel, confirmCapture: approve });
    expect(approve).toHaveBeenCalledOnce();
    expect(callPlannerModel).toHaveBeenCalledOnce();
    expect(fs.readFileSync(receiptFile, "utf8")).toBe(before);
    const confirmation = JSON.parse(fs.readFileSync(path.join(drafts, homeworkId, "spelling-intake-confirmation.json"), "utf8"));
    expect(confirmation).toMatchObject({ reviewer: "lab-source-review", capture: { uncertainty: [], words: [{ word: "night", pageNumber: 1 }] } });
    expect(getLearningCycle(input.childId, homeworkId, input)!.nodes.map(node => node.role)).toEqual(["evaluation"]);
  });
  it("publishes only Discovery when the existing parent confirmation applies a spelling capture", async () => {
    const input = fixture();
    const assignmentSource = await extractAssignmentSource(input.sourceFile);
    await applyPlannedHomeworkIngest({ ...input, assignmentSource, assignmentPlanningPacket: {} as never, assignmentPlannerOutput: { capturedContent: { title: "School words", words: ["night", "light"] }, homeworkWords: [{ text: "night", purpose: "spell_from_memory" }, { text: "light", purpose: "spell_from_memory" }], activeSessionPlan: { domain: "spelling" } } as never, homeworkDomain: "spelling", reviewer: "lab-adult", approvedAt: "2026-09-08T12:00:00Z" } as never);
    const profile = JSON.parse(fs.readFileSync(path.join(input.rootDir, "src/context/lab-child/learning_profile.json"), "utf8"));
    expect(profile.activeSessionPlan.planId).toMatch(/^discovery:/);
    expect(profile.activeSessionPlan.nodePlan).toHaveLength(1);
  });
  it("freezes prior exposure from the child chart across assignments and restart", async () => {
    const input = fixture();
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: [] } }));
    const first = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const oldItem = Object.values(getLearningCycle(input.childId, first.homeworkId, input)!.nodes[0].evidenceContract.spellingItems!)[0];
    recordSpellingDiscoveryAttempt({ ...input, homeworkId: first.homeworkId, attempt: { attemptId: "old", itemId: oldItem.id, attemptedValue: "nite", observedAt: "2026-09-08T10:00:00Z" }, support: { status: "unassisted", scaffolds: [] } }, input);
    fs.writeFileSync(input.sourceFile, "Next school assignment: night");
    const next = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const item = Object.values(getLearningCycle(input.childId, next.homeworkId, input)!.nodes[0].evidenceContract.spellingItems!)[0];
    expect(item.lineage.exposure).toBe("practiced");
    recordSpellingDiscoveryAttempt({ ...input, homeworkId: next.homeworkId, attempt: { attemptId: "new", itemId: item.id, attemptedValue: "night", observedAt: "2026-09-08T12:00:00Z" }, support: { status: "unassisted", scaffolds: [] } }, input);
    await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const after = getLearningCycle(input.childId, next.homeworkId, input)!;
    expect(after.observations[0]).toMatchObject({ exposure: "previously_practiced", provenance: "practice" });
    expect(callPlannerModel).toHaveBeenCalledTimes(2);
  });
  it("captures once, publishes only Word Radar, and reuses completed provider work on restart", async () => {
    const input = fixture();
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: ["night", "light", "can't"].map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }));
    const first = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const second = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    expect(first.homeworkId).toBe(second.homeworkId);
    expect(callPlannerModel).toHaveBeenCalledOnce();
    const cycle = getLearningCycle(input.childId, first.homeworkId, { rootDir: input.rootDir })!;
    expect(cycle.assignment.targets).toEqual(["night", "light", "can't"]);
    expect(cycle.nodes.map(node => node.role)).toEqual(["evaluation"]);
    expect(cycle.observations).toEqual([]);
    const profile = JSON.parse(fs.readFileSync(path.join(input.rootDir, "src/context/lab-child/learning_profile.json"), "utf8"));
    expect(profile.pendingHomework.homeworkId).toBe(first.homeworkId);
    expect(profile.activeSessionPlan.planId).toBe(`discovery:${first.homeworkId}`);
  });
  it("keeps uncertain extraction pending without publishing or repeating the call", async () => {
    const input = fixture();
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: [{ kind: "unreadable_word", pageNumber: 1, detail: "Second word is unreadable." }] } }));
    for (let run = 0; run < 2; run++) await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("spelling_intake_confirmation_required");
    expect(callPlannerModel).toHaveBeenCalledOnce();
    expect(fs.existsSync(path.join(input.rootDir, "src/context/lab-child/plans/active_session_plan.json"))).toBe(false);
  });
  it("resumes a human-confirmed uncertain capture without another provider call or a speculative board", async () => {
    const input = fixture();
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: [{ kind: "unreadable_word", pageNumber: 1, detail: "Second word unclear" }] } }));
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("confirmation_required");
    const confirmedCapture = { capture: { diagnostic: recordedSpellingDiagnostic(callPlannerModel.mock.calls[0][0]), title: "School words", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), uncertainty: [] }, reviewer: "lab-adult", approvedAt: "2026-09-08T12:00:00Z" };
    const result = await runSpellingDiscoveryIntake({ ...input, confirmedCapture } as never, { callPlannerModel });
    await runSpellingDiscoveryIntake(input, { callPlannerModel });
    expect(callPlannerModel).toHaveBeenCalledOnce();
    expect(getLearningCycle(input.childId, result.homeworkId, input)!.assignment.targets).toEqual(["night", "light"]);
    expect(getLearningCycle(input.childId, result.homeworkId, input)!.nodes.map(node => node.role)).toEqual(["evaluation"]);
  });
  it("rejects a modified completed intake checkpoint rather than using invented words", async () => {
    const input = fixture();
    const callPlannerModel = vi.fn(async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: [{ word: "night", pageNumber: 1 }], uncertainty: [] } }));
    const result = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const file = path.join(input.rootDir, "src/context/lab-child/homework/direct-drafts", result.homeworkId, "spelling-intake-response.json");
    const saved = JSON.parse(fs.readFileSync(file, "utf8")); saved.output.words[0].word = "invented"; fs.writeFileSync(file, JSON.stringify(saved));
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("spelling_intake_checkpoint_hash_mismatch");
    expect(callPlannerModel).toHaveBeenCalledOnce();
  });
});
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
