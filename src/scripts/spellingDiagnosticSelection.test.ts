import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedSpellingLab } from "./fixtures/spellingEvidenceFirst";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { buildAssignmentPlanningPacket, prepareSpellingDiagnosticPacket, parseSpellingIntake, buildSpellingIntakePrompt, type AssignmentPlanningPacket } from "../engine/assignmentPlanner";
import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import { getChildChart } from "../profiles/childChart";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { buildSpellingDiscoveryPlan, createSpellingDiscoveryCycle } from "../engine/learningCycleIngest";
import { attachSpellingDiscoveryEvidence } from "../engine/assignmentPlanner";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { completeDiscoveryEvaluation } from "../engine/adaptiveMathDiscovery";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
async function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-diagnostic-")); roots.push(rootDir);
  const sourceFile = seedSpellingLab(rootDir), childId = "lab-child";
  const chart = getChildChart(childId, { rootDir });
  const raw = buildAssignmentPlanningPacket({ childId, childChart: chart, extraction: await extractAssignmentSource(sourceFile) });
  return { rootDir, sourceFile, childId, raw, packet: prepareSpellingDiagnosticPacket(raw, chart) };
}
function capture(packet: AssignmentPlanningPacket) {
  return { title: "School spelling", words: [{ word: "night", pageNumber: 1 }, { word: "light", pageNumber: 1 }], uncertainty: [],
    diagnostic: { action: "select", activityId: "word-radar", modeId: "independent_spelling_discovery", reason: "Audio elicits the assigned word without showing its letters; captured letters can measure recall.", evidenceIds: [`assignment:${packet.sourceDocument.fileHash}`], uncertainty: ["No current device observation or independent recall evidence."], nextEvidenceNeeded: ["Observe successful audio playback and response capture for every assigned word."] } };
}

describe("Planner-owned opening spelling diagnostic", () => {
  it("exposes only explicitly validated diagnostic capabilities, with limits and device uncertainty", async () => {
    const { packet } = await fixture();
    expect(packet.spellingDiagnostics!.instruments.map(row => `${row.activityId}/${row.modeId}`)).toEqual(["word-radar/independent_spelling_discovery"]);
    expect(packet.spellingDiagnostics!.instruments[0]).toMatchObject({ protocol: "spelling-recall-v1", config: { inputMode: "keyboard", showTimer: false, hideWordDuringResponse: true } });
    expect(packet.spellingDiagnostics!.device).toEqual({ status: "unknown" });
    const prompt = buildSpellingIntakePrompt(packet);
    expect(prompt).toContain("needs_instrument");
    expect(prompt).toContain("independent_spelling_discovery");
    expect(prompt).not.toContain("The existing hidden-word recall instrument will offer every captured word");
  });
  it("requires a decision for new requests while legacy saved captures remain readable", async () => {
    const { packet, raw } = await fixture();
    const { diagnostic: _, ...legacy } = capture(packet);
    expect(() => parseSpellingIntake(legacy, packet)).toThrow("spelling_diagnostic_decision_required");
    expect(parseSpellingIntake(legacy, raw)).toEqual(legacy);
  });
  it("does not promote practice modes when no certified instrument is launchable", async () => {
    const { raw } = await fixture();
    const packet = prepareSpellingDiagnosticPacket({ ...raw, activityCatalog: raw.activityCatalog.map(card => ({ ...card, launchable: false })) });
    expect(packet.spellingDiagnostics!.instruments).toEqual([]);
    expect(() => parseSpellingIntake(capture(packet), packet)).toThrow("spelling_diagnostic_instrument_unavailable");
    const { activityId: _, modeId: __, ...reason } = capture(packet).diagnostic;
    expect(parseSpellingIntake({ ...capture(packet), diagnostic: { ...reason, action: "needs_instrument" } }, packet).diagnostic?.action).toBe("needs_instrument");
  });
  it.each([
    { activityId: "wheel-of-fortune" },
    { modeId: "hidden_word_recall" },
    { evidenceIds: ["invented-observation"] },
    { config: { showTimer: true } },
  ])("rejects unsupported or invented diagnostic authority: %j", async change => {
    const { packet } = await fixture(), draft = capture(packet);
    expect(() => parseSpellingIntake({ ...draft, diagnostic: { ...draft.diagnostic, ...change } }, packet)).toThrow();
  });
  it("commits the Planner's decision and frozen capability once, projects it, and reuses on restart", async () => {
    const input = await fixture();
    const callPlannerModel = vi.fn(async (packet: AssignmentPlanningPacket) => ({ draft: capture(packet) }));
    const first = await runSpellingDiscoveryIntake(input, { callPlannerModel });
    const cycle = getLearningCycle(input.childId, first.homeworkId, input)!;
    const selected = cycle.nodes[0].evidenceContract.diagnosticSelection!;
    expect(selected.decision).toEqual(capture(input.packet).diagnostic);
    expect(selected.instrument).toMatchObject({ activityId: "word-radar", modeId: "independent_spelling_discovery", protocol: "spelling-recall-v1" });
    const plan = buildSpellingDiscoveryPlan({ cycle, companion: { id: "elli", name: "Elli" } });
    expect(plan.nodePlan[0]).toMatchObject({ activityId: selected.instrument.activityId, wordRadarConfig: selected.instrument.config });
    await runSpellingDiscoveryIntake(input, { callPlannerModel });
    expect(getLearningCycle(input.childId, first.homeworkId, input)!.nodes[0].evidenceContract.diagnosticSelection).toEqual(selected);
    expect(callPlannerModel).toHaveBeenCalledOnce();
    const modified = structuredClone(cycle);
    modified.nodes[0].evidenceContract.diagnosticSelection!.instrument.config.showTimer = true;
    expect(() => buildSpellingDiscoveryPlan({ cycle: modified, companion: { id: "elli", name: "Elli" } })).toThrow("spelling_diagnostic_selection_invalid");
    expect(() => createSpellingDiscoveryCycle({ childId: input.childId, homeworkId: first.homeworkId, title: cycle.assignment.title, contentFingerprint: cycle.assignment.contentFingerprint, items: Object.values(cycle.nodes[0].evidenceContract.spellingItems!), diagnosticSelection: modified.nodes[0].evidenceContract.diagnosticSelection }, input)).toThrow("spelling_diagnostic_selection_changed");
  });
  it("persists an unsuitable-instrument decision without fallback, publication, or another call on resume", async () => {
    const input = await fixture();
    const callPlannerModel = vi.fn(async (packet: AssignmentPlanningPacket) => {
      const draft = capture(packet), { activityId: _, modeId: __, ...diagnostic } = draft.diagnostic;
      return { draft: { ...draft, diagnostic: { ...diagnostic, action: "needs_instrument", reason: "Available capture cannot establish the requested construct with known conditions." } } };
    });
    for (let i = 0; i < 2; i++) await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("spelling_diagnostic_needs_instrument");
    const homeworkId = `hw-spelling-${input.packet.sourceDocument.fileHash.slice(0, 8)}`;
    expect(getLearningCycle(input.childId, homeworkId, input)).toBeNull();
    const saved = JSON.parse(fs.readFileSync(path.join(input.rootDir, "src/context/lab-child/homework/direct-drafts", homeworkId, "spelling-intake-response.json"), "utf8"));
    expect(saved.output.diagnostic.action).toBe("needs_instrument");
    expect(callPlannerModel).toHaveBeenCalledOnce();
  });
  it("passes the recorded diagnostic rationale forward with actual outcomes, without raw responses", async () => {
    const input = await fixture();
    const { homeworkId } = await runSpellingDiscoveryIntake(input, { callPlannerModel: async packet => ({ draft: capture(packet) }) });
    const opening = getLearningCycle(input.childId, homeworkId, input)!;
    Object.values(opening.nodes[0].evidenceContract.spellingItems!).forEach((item, index) => recordSpellingDiscoveryAttempt({ childId: input.childId, homeworkId,
      attempt: { attemptId: `observation-${index}`, itemId: item.id, attemptedValue: index ? "wrong-private-response" : item.word, observedAt: "2026-09-09T12:00:00Z" }, support: { status: "unassisted", scaffolds: [] } }, input));
    completeDiscoveryEvaluation({ ...input, homeworkId, completedAt: "2026-09-09T12:01:00Z" });
    const chart = getChildChart(input.childId, input);
    const targeted = attachSpellingDiscoveryEvidence(input.packet, chart);
    expect(targeted.discoveryEvidence!.diagnosticSelection).toEqual(opening.nodes[0].evidenceContract.diagnosticSelection);
    expect(targeted.discoveryEvidence!.observations).toHaveLength(2);
    const next = prepareSpellingDiagnosticPacket(input.raw, chart);
    expect(next.spellingDiagnostics!.evidenceIds).toEqual(expect.arrayContaining(["observation-0", "observation-1"]));
    expect(JSON.stringify(next.spellingDiagnostics)).not.toContain("wrong-private-response");
  });
  it("retains a malformed response before validation so restart cannot repeat completed provider work", async () => {
    const input = await fixture();
    const callPlannerModel = vi.fn(async (packet: AssignmentPlanningPacket) => ({ draft: { ...capture(packet), diagnostic: { ...capture(packet).diagnostic, activityId: "unavailable-game" } } }));
    for (let i = 0; i < 2; i++) await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("spelling_diagnostic_instrument_unavailable");
    expect(callPlannerModel).toHaveBeenCalledOnce();
  });
  it("source confirmation cannot replace the Planner's diagnostic decision", async () => {
    const input = await fixture(), draft = capture(input.packet);
    const callPlannerModel = vi.fn(async () => ({ draft: { ...draft, uncertainty: [{ kind: "ambiguous_word", pageNumber: 1, detail: "Confirm word identity." }] } }));
    await expect(runSpellingDiscoveryIntake(input, { callPlannerModel })).rejects.toThrow("confirmation_required");
    const confirmedCapture = { capture: { ...draft, diagnostic: { ...draft.diagnostic, reason: "Not the Planner's recorded reason." } }, reviewer: "lab-parent", approvedAt: "2026-09-09T12:00:00Z" };
    await expect(runSpellingDiscoveryIntake({ ...input, confirmedCapture } as never, { callPlannerModel })).rejects.toThrow("spelling_diagnostic_confirmation_changed");
    expect(callPlannerModel).toHaveBeenCalledOnce();
  });
});
