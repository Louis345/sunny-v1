import { describe, expect, it } from "vitest";
import { buildSpellingRecallItems, buildSpellingTargetedCycleInput } from "./learningCycleIngest";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
import type { LearningCycleRecordV2 } from "./learningCycleRepository";
import { attachSpellingDiscoveryEvidence, buildAssignmentPlannerPrompt } from "./assignmentPlanner";

function fixture() {
  const items = buildSpellingRecallItems({ homeworkId: "hw", words: ["night", "light"], evidenceIds: ["source"], measurementRole: "fresh_checkpoint" });
  const cycle = { childId: "lab", homeworkId: "hw", domain: "spelling", assignment: { title: "School words", contentFingerprint: "source", targets: ["night", "light"], capturedEvidenceIds: ["source"] }, observations: [{ observationId: "attempt-night", itemId: items[0].id }, { observationId: "attempt-light", itemId: items[1].id }], nodes: [{ role: "evaluation", evidenceContract: { spellingItems: Object.fromEntries(items.map(item => [item.id, item])) } }] } as unknown as LearningCycleRecordV2;
  const plan = { planId: "targeted:hw", childId: "lab", domain: "spelling", activeHomeworkId: "hw", nodePlan: [{ id: "practice", type: "word-radar", activityId: "word-radar", targets: ["light"], title: "Practice" }, { id: "check", type: "word-radar", activityId: "word-radar", targets: ["night", "light"], title: "Check", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } }], planTheory: { hypothesis: "Practice may improve the missed spelling.", supportCriteria: ["Recall improves"], reviseCriteria: ["Mixed"], falsifyCriteria: ["No change"] }, plannedMeasurements: [
    { id: "measure-practice", activityId: "word-radar", target: "light", evidenceType: "practice", supportCriteria: "Response captured", reviseCriteria: "Support needed", falsifyCriteria: "Instrument fails", spelling: { role: "practice", evidenceIds: ["attempt-light"], interventionNodeIds: [], reason: "Current gap", uncertainty: "One attempt", finalCheck: false, expectedAccuracy: { min: 0, max: 1 }, confidence: 0.5 } },
    { id: "measure-check", activityId: "word-radar", target: "both", evidenceType: "recall", supportCriteria: "Improvement", reviseCriteria: "Mixed", falsifyCriteria: "No change", spelling: { role: "fresh_checkpoint", evidenceIds: ["attempt-night", "attempt-light"], interventionNodeIds: ["practice"], reason: "Check both secure and targeted words", uncertainty: "Immediate performance only", finalCheck: true, expectedAccuracy: { min: 0.7, max: 1 }, confidence: 0.6 } },
  ] } as unknown as ActiveSessionPlan;
  for (const measurement of plan.plannedMeasurements!) measurement.spelling!.maxDelayDays = 7;
  return { cycle, plan };
}
describe("evidence-cited spelling targeted programs", () => {
  it("does not accept a math observation as academic support for a spelling decision", () => {
    const { cycle, plan } = fixture();
    plan.plannedMeasurements![0].spelling!.evidenceIds = ["math-observation"];
    expect(() => buildSpellingTargetedCycleInput({ cycle, plan, now: "2026-09-08T12:00:00Z", historicalEvidenceIds: ["math-observation"], historicalEvidence: [{ id: "math-observation", domain: "math" }] } as never)).toThrow("spelling_plan_evidence_invalid");
  });
  it("leaves Quest and Boss under their existing evidence gates instead of building them with baseline practice", () => {
    const { cycle, plan } = fixture();
    plan.nodePlan.push({ id: "quest", type: "quest", activityId: "quest", targets: ["night"], difficulty: 1, source: "chart_planner" } as never);
    const result = buildSpellingTargetedCycleInput({ cycle, plan, now: "2026-09-08T12:00:00Z" });
    expect(result.nodes.find(node => node.nodeId === "quest")?.state).toBe("locked");
    expect(result.academicPredictions).toHaveLength(2);
  });
  it("requires committed evidence and places facts and prior outcomes in the existing Planner packet", () => {
    const { cycle } = fixture();
    cycle.lifecycle = "evaluation_active";
    const packet = { childId: "lab", capturedHomework: {}, plannerInstruction: "Existing Planner", sourceDocument: {} };
    const chart = { learningCycle: cycle, learningHistory: { constructs: {}, recentDecisions: [{ decisionId: "prior", reason: "Mixed outcomes", evidenceIds: ["old"] }], pendingInterpretation: [] } };
    expect(() => attachSpellingDiscoveryEvidence(packet as never, chart as never)).toThrow("spelling_evidence_not_committed");
    cycle.lifecycle = "evidence_ready";
    cycle.observations = cycle.observations.map(row => ({ ...row, constructLinks: [], result: {}, assistance: { status: "unknown", scaffolds: [] }, exposure: "unknown", confounds: [], observedAt: "2026-09-08T12:00:00Z" }));
    const next = attachSpellingDiscoveryEvidence(packet as never, chart as never);
    expect(next.capturedHomework.words).toEqual(["night", "light"]);
    expect(next.discoveryEvidence?.history.recentDecisions[0].decisionId).toBe("prior");
    expect(next.discoveryEvidence?.observations.map(row => row.observationId)).toEqual(["attempt-night", "attempt-light"]);
    expect(next.plannerInstruction).toContain("plannedMeasurements.spelling");
    expect(next.plannerInstruction).toContain("maxDelayDays");
    expect(next.plannerInstruction).toContain("activityConfig");
    expect(next.plannerInstruction).toContain("schemaVersion");
    expect(next.plannerInstruction).toContain("requiresPerTargetResult");
    expect(next.plannerInstruction).toContain("concentrate practice on clean independent misses");
    expect(next.plannerInstruction).toContain("every selectable route must address every clean independent miss");
    expect(buildAssignmentPlannerPrompt(next)).not.toContain("exactly one mystery node");
    const priorPolicy = { ...packet, plannerInstruction: "Design two named learning routes. Size the spine before evidence." };
    expect(attachSpellingDiscoveryEvidence(priorPolicy as never, chart as never).plannerInstruction).not.toContain("Design two named learning routes");
  });
  it("preserves games while freezing checkpoint identity, prior exposure, and predictions", () => {
    const { cycle, plan } = fixture();
    const input = buildSpellingTargetedCycleInput({ cycle, plan, now: "2026-09-08T12:00:00Z" });
    expect(input.nodes.map(node => node.mechanic)).toEqual(["word-radar", "word-radar"]);
    expect(input.academicPredictions).toHaveLength(2);
    expect(input.academicPredictions?.every(p => p.evidenceLimit === "practice_only" && p.expectedMetric.key === "unassisted_recall_accuracy")).toBe(true);
    const checkpoint = Object.values(input.nodes[1].evidenceContract.spellingItems!);
    expect(checkpoint.map(item => item.word)).toEqual(["night", "light"]);
    expect(checkpoint.every(item => item.lineage.exposure === "practiced" && item.lineage.measurementRole === "fresh_checkpoint")).toBe(true);
    expect(checkpoint[1].lineage.sourceEvidenceIds).toContain("attempt-light");
  });
  it("rejects unknown citations, absent final coverage, and checkpoints before their intervention", () => {
    for (const change of [
      (plan: ActiveSessionPlan) => { plan.plannedMeasurements![0].spelling!.evidenceIds = ["invented"]; },
      (plan: ActiveSessionPlan) => { plan.nodePlan[1].targets = ["light"]; },
      (plan: ActiveSessionPlan) => { plan.nodePlan.reverse(); },
    ]) {
      const { cycle, plan } = fixture(); change(plan);
      expect(() => buildSpellingTargetedCycleInput({ cycle, plan, now: "2026-09-08T12:00:00Z" })).toThrow(/spelling_/);
    }
  });

  it("practices four evidenced gaps while the final check rechecks all ten assigned words", () => {
    const words = ["night", "light", "right", "sight", "might", "fight", "write", "knife", "wrong", "climb"];
    const missed = words.slice(6);
    const items = buildSpellingRecallItems({
      homeworkId: "hw-ten",
      words,
      evidenceIds: ["source-ten"],
      measurementRole: "fresh_checkpoint",
    });
    const observations = items.map((item, index) => ({
      observationId: `attempt-${index + 1}`,
      itemId: item.id,
      sourceId: "evaluation:hw-ten:discovery",
      constructLinks: [{ constructId: item.constructId, role: "primary", confidence: 1 }],
      result: { correct: index < 6, score: index < 6 ? 1 : 0 },
      assistance: { status: "unassisted", scaffolds: [] },
      exposure: "unseen",
      provenance: "independent_probe",
      observedAt: `2026-09-12T12:${String(index).padStart(2, "0")}:00Z`,
      confounds: ["response_mode:spelling_letters"],
    }));
    const cycle = {
      childId: "lab",
      homeworkId: "hw-ten",
      domain: "spelling",
      assignment: {
        title: "Ten school words",
        contentFingerprint: "source-ten",
        targets: words,
        capturedEvidenceIds: ["source-ten"],
      },
      observations,
      nodes: [{
        role: "evaluation",
        evidenceContract: { spellingItems: Object.fromEntries(items.map((item) => [item.id, item])) },
      }],
    } as unknown as LearningCycleRecordV2;
    const evidenceIds = observations.map((observation) => observation.observationId);
    const plan = {
      planId: "targeted:hw-ten",
      childId: "lab",
      domain: "spelling",
      activeHomeworkId: "hw-ten",
      nodePlan: [
        { id: "practice-four", type: "word-radar", activityId: "word-radar", targets: missed, title: "Practice Four" },
        { id: "check-ten", type: "word-radar", activityId: "word-radar", targets: words, title: "Check Ten", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } },
      ],
      plannedMeasurements: [
        { id: "measure-practice-four", activityId: "word-radar", target: missed.join(", "), evidenceType: "practice", supportCriteria: "Responses captured", reviseCriteria: "Support needed", falsifyCriteria: "Instrument fails", spelling: { role: "practice", evidenceIds, interventionNodeIds: [], reason: "Four clean independent misses", uncertainty: "One evaluation", finalCheck: false, expectedAccuracy: { min: 0.4, max: 0.8 }, confidence: 0.7, maxDelayDays: 7 } },
        { id: "measure-check-ten", activityId: "word-radar", target: words.join(", "), evidenceType: "recall", supportCriteria: "Recall holds", reviseCriteria: "Mixed", falsifyCriteria: "No transfer", spelling: { role: "fresh_checkpoint", evidenceIds, interventionNodeIds: ["practice-four"], reason: "Recheck gaps and initially secure words", uncertainty: "Immediate recall only", finalCheck: true, expectedAccuracy: { min: 0.7, max: 1 }, confidence: 0.65, maxDelayDays: 7 } },
      ],
    } as unknown as ActiveSessionPlan;

    const input = buildSpellingTargetedCycleInput({ cycle, plan, now: "2026-09-12T12:00:00Z" });
    const practiceWords = Object.values(input.nodes[0]!.evidenceContract.spellingItems!).map((item) => item.word);
    const finalWords = Object.values(input.nodes[1]!.evidenceContract.spellingItems!).map((item) => item.word);

    expect(practiceWords).toEqual(missed);
    expect(finalWords).toEqual(words);
    expect(finalWords.slice(0, 6)).toEqual(words.slice(0, 6));

    const unfocused = structuredClone(plan);
    unfocused.nodePlan[0]!.targets = words;
    expect(() => buildSpellingTargetedCycleInput({ cycle, plan: unfocused, now: "2026-09-12T12:00:00Z" }))
      .toThrow("spelling_plan_not_focused_on_independent_misses");

    const skipsOneMiss = structuredClone(plan);
    skipsOneMiss.nodePlan[0]!.targets = missed.slice(1);
    expect(() => buildSpellingTargetedCycleInput({ cycle, plan: skipsOneMiss, now: "2026-09-12T12:00:00Z" }))
      .toThrow(`spelling_plan_missed_word_unaddressed:${missed[0]}`);

    const bypassRoute = structuredClone(plan);
    bypassRoute.nodePlan.splice(1, 0, {
      id: "practice-secure",
      type: "word-radar",
      activityId: "word-radar",
      targets: words.slice(0, 6),
      title: "Practice Secure Words",
      difficulty: 1,
      source: "chart_planner",
    });
    bypassRoute.plannedMeasurements!.splice(1, 0, {
      id: "measure-practice-secure",
      activityId: "word-radar",
      target: words.slice(0, 6).join(", "),
      evidenceType: "practice",
      supportCriteria: "Responses captured",
      reviseCriteria: "Support needed",
      falsifyCriteria: "Instrument fails",
      spelling: { role: "practice", evidenceIds, interventionNodeIds: [], reason: "Alternative route", uncertainty: "One evaluation", finalCheck: false, expectedAccuracy: { min: 0.4, max: 0.8 }, confidence: 0.5, maxDelayDays: 7 },
    });
    bypassRoute.learningRoutes = [
      { id: "gap-route", label: "Gap Route", rationale: "Practice the four gaps.", nodeIds: ["practice-four"] },
      { id: "bypass-route", label: "Bypass Route", rationale: "This route wrongly skips every gap.", nodeIds: ["practice-secure"] },
    ];
    expect(() => buildSpellingTargetedCycleInput({ cycle, plan: bypassRoute, now: "2026-09-12T12:00:00Z" }))
      .toThrow(`spelling_plan_route_missed_word_unaddressed:bypass-route:${missed[0]}`);

    const checkpointBypass = structuredClone(plan);
    checkpointBypass.nodePlan.splice(1, 0, {
      id: "checkpoint-secure",
      type: "word-radar",
      activityId: "word-radar",
      targets: words.slice(0, 6),
      title: "Check Secure Words",
      difficulty: 1,
      source: "chart_planner",
      wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard", speakStyle: "option-a", showTimer: false, hideWordDuringResponse: true, requiresCapturedResponse: true },
    });
    checkpointBypass.plannedMeasurements!.splice(1, 0, {
      id: "measure-checkpoint-secure",
      activityId: "word-radar",
      target: words.slice(0, 6).join(", "),
      evidenceType: "recall",
      supportCriteria: "Recall holds",
      reviseCriteria: "Mixed evidence",
      falsifyCriteria: "Recall does not hold",
      spelling: { role: "fresh_checkpoint", evidenceIds, interventionNodeIds: [], reason: "Alternative route", uncertainty: "One evaluation", finalCheck: false, expectedAccuracy: { min: 0.4, max: 0.8 }, confidence: 0.5, maxDelayDays: 7 },
    });
    checkpointBypass.learningRoutes = [
      { id: "gap-route", label: "Gap Route", rationale: "Practice the four gaps.", nodeIds: ["practice-four"] },
      { id: "checkpoint-bypass", label: "Secure Check", rationale: "This route wrongly skips every gap.", nodeIds: ["checkpoint-secure"] },
    ];
    expect(() => buildSpellingTargetedCycleInput({ cycle, plan: checkpointBypass, now: "2026-09-12T12:00:00Z" }))
      .toThrow(`spelling_plan_route_missed_word_unaddressed:checkpoint-bypass:${missed[0]}`);
  });
});
