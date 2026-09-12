import fs from "node:fs";
import path from "node:path";
import { getChildChart } from "../../profiles/childChart";
import { hydrateAssignmentPlannerOutputFromDraft } from "../../engine/assignmentPlanner";
import type { AssignmentPlanningPacket, AssignmentPlannerOutput, SpellingIntake } from "../../engine/assignmentPlanner";
import { COMPANION_DEFAULTS } from "../../shared/companionTypes";

export function seedSpellingLab(rootDir: string, words = ["night", "light"], companionVrmUrl = ""): string {
  const child = path.join(rootDir, "src/context/lab-child"); fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(child, "learning_profile.json"), JSON.stringify({ childId: "lab-child", name: "Lab", age: 8, grade: 3, totalSessions: 0, sessionHistory: [], preferences: {}, strengths: [], challenges: [], notes: [], diagnoses: [], learningGoals: [] }));
  fs.writeFileSync(path.join(rootDir, "children.config.json"), JSON.stringify({ childProfiles: { "lab-child": {} }, companions: { elli: { ...COMPANION_DEFAULTS, vrmUrl: companionVrmUrl, dopamineGames: [], faceCamera: { position: [0, 0, 1], target: [0, 0, 0] } } }, defaultCompanionId: "elli" }));
  const source = path.join(rootDir, "school-words.txt"); fs.writeFileSync(source, `School spelling: ${words.join(", ")}`); return source;
}

/** Recorded provider decision, not a production fallback or live-model quality claim. */
export function recordedSpellingDiagnostic(packet: { sourceDocument: { fileHash: string } }): NonNullable<SpellingIntake["diagnostic"]> {
  return { action: "select", activityId: "word-radar", modeId: "independent_spelling_discovery",
    reason: "Capture letters after the whole-word stimulus without showing spelling.", evidenceIds: [`assignment:${packet.sourceDocument.fileHash}`],
    uncertainty: ["This occasion cannot establish delayed retention; device is unobserved."], nextEvidenceNeeded: ["Verify audible stimulus and successful response capture for all assigned words."] };
}

export function recordedSpellingPlan(packet: AssignmentPlanningPacket, rootDir: string): AssignmentPlannerOutput {
  if (!packet.discoveryEvidence?.observations.length) throw new Error("fixture_requires_committed_evidence");
  const chart = getChildChart(packet.childId, { rootDir });
  const evidenceIds = packet.discoveryEvidence.observations.map(row => row.observationId);
  const nodePlan = [
    { id: "practice", type: "word-radar", activityId: "word-radar", title: "Word workshop", targets: ["light"], difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "visible_read", inputMode: "keyboard", showTimer: false } },
    { id: "check", type: "word-radar", activityId: "word-radar", title: "Recall check", targets: ["night", "light"], difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard", showTimer: false } },
    { id: "quest", type: "quest", activityId: "quest", title: "Quest", targets: ["night", "light"], difficulty: 1, source: "chart_planner" },
  ];
  const plannedMeasurements = nodePlan.slice(0, 2).map(node => ({ id: `measure-${node.id}`, activityId: node.activityId, target: node.targets.join(","), evidenceType: "recall", supportCriteria: "Unassisted capture improves", reviseCriteria: "Mixed evidence", falsifyCriteria: "No improvement", spelling: { role: node.id === "check" ? "fresh_checkpoint" : "practice", evidenceIds, interventionNodeIds: node.id === "check" ? ["practice"] : [], reason: "Current mixed recall evidence", uncertainty: "One occasion does not establish retention", expectedAccuracy: { min: 0.5, max: 1 }, confidence: 0.5, maxDelayDays: 7, finalCheck: node.id === "check" } }));
  const plan = { planId: `targeted:${chart.learningCycle!.homeworkId}`, childId: packet.childId, domain: "spelling", activeHomeworkId: chart.learningCycle!.homeworkId, nodePlan, plannedMeasurements, planTheory: { hypothesis: "Practice may support the uncertain word", evidenceSummary: evidenceIds, intervention: "Visible practice followed by unassisted recall", supportCriteria: ["Recall improves"], reviseCriteria: ["Mixed"], falsifyCriteria: ["No change"] } };
  return hydrateAssignmentPlannerOutputFromDraft({ activeSessionPlan: plan, plannedMeasurements, planTheory: plan.planTheory, generationRequests: [], reviewQuestions: [] } as never, packet);
}

/** Production-shaped recorded Planner output for the ten-word adaptation browser proof. */
export function recordedAdaptiveSpellingPlan(packet: AssignmentPlanningPacket, rootDir: string): AssignmentPlannerOutput {
  if (!packet.discoveryEvidence?.observations.length) throw new Error("fixture_requires_committed_evidence");
  const chart = getChildChart(packet.childId, { rootDir });
  const evidenceIds = packet.discoveryEvidence.observations.map((row) => row.observationId);
  const summary = packet.discoveryEvidence.summary as {
    spellingTargets?: Array<{ word: string; independentCorrect: number; independentIncorrect: number }>;
  };
  const words = packet.capturedHomework.words;
  const misses = (summary.spellingTargets ?? [])
    .filter((target) => target.independentIncorrect > 0 && target.independentCorrect === 0)
    .map((target) => target.word);
  if (!misses.length || misses.length >= words.length) throw new Error("fixture_requires_mixed_spelling_evidence");
  const practiceIds = ["spelling-practice", "sound-and-spell", "wheel-challenge", "recall-practice", "letter-rush"];
  const nodePlan = [
    { id: practiceIds[0], type: "word-radar", activityId: "word-radar", title: "Spelling Practice", targets: misses, difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "visible_read", inputMode: "keyboard", showTimer: false } },
    { id: practiceIds[1], type: "spell-check", activityId: "spell-check", title: "Sound and Spell", targets: misses, difficulty: 1, source: "chart_planner" },
    { id: practiceIds[2], type: "wheel-of-fortune", activityId: "wheel-of-fortune", title: "Wheel Challenge", targets: misses, difficulty: 1, source: "chart_planner" },
    { id: practiceIds[3], type: "word-radar", activityId: "word-radar", title: "Recall Practice", targets: misses, difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "visible_read", inputMode: "keyboard", showTimer: false } },
    { id: practiceIds[4], type: "letter-rush", activityId: "letter-rush", title: "Letter Rush", targets: misses, difficulty: 1, source: "chart_planner", activityConfig: {
      schemaVersion: 1, activityId: "letter-rush", mode: "read-and-race", topic: "Current spelling gaps", domain: "spelling", learningGoal: "Practice the words missed during independent Discovery", gradeBand: "early_elementary",
      scaffolds: { showWord: true, letterBank: true, allowRetryBeforeScore: true, companionHints: false },
      words: misses.map((text) => ({ text })),
      evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] },
    } },
    { id: "recall-checkpoint", type: "word-radar", activityId: "word-radar", title: "Recall Checkpoint", targets: words, difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard", showTimer: false } },
    { id: "quest", type: "quest", activityId: "quest", title: "Word Quest", targets: words, difficulty: 1, source: "chart_planner" },
    { id: "boss", type: "boss", activityId: "boss", title: "Boss Gate", targets: words, difficulty: 1, source: "chart_planner" },
  ];
  const plannedMeasurements = nodePlan.slice(0, 6).map((node) => ({
    id: `measure-${node.id}`,
    activityId: node.activityId,
    target: node.targets.join(","),
    evidenceType: node.id === "recall-checkpoint" ? "fresh_recall" : "practice",
    supportCriteria: "Canonical target responses are captured",
    reviseCriteria: "Evidence is mixed or assisted",
    falsifyCriteria: "Independent recall does not improve",
    spelling: {
      role: node.id === "recall-checkpoint" ? "fresh_checkpoint" : "practice",
      evidenceIds,
      interventionNodeIds: node.id === "recall-checkpoint" ? practiceIds : [],
      reason: node.id === "recall-checkpoint" ? "Recheck all assigned words after targeted practice" : "Address the clean independent misses through a distinct practice mechanic",
      uncertainty: "One immediate occasion does not establish retention or causation",
      expectedAccuracy: { min: 0.5, max: 1 },
      confidence: 0.5,
      maxDelayDays: 7,
      finalCheck: node.id === "recall-checkpoint",
    },
  }));
  const planTheory = { hypothesis: "Practice focused on the four clean misses may improve immediate independent recall.", evidenceSummary: evidenceIds, intervention: "Two child-choice practice routes followed by a shared fresh checkpoint.", supportCriteria: ["Fresh recall improves"], reviseCriteria: ["Evidence is mixed or confounded"], falsifyCriteria: ["Fresh recall does not improve"] };
  const plan = {
    planId: `targeted:${chart.learningCycle!.homeworkId}`,
    childId: packet.childId,
    domain: "spelling",
    activeHomeworkId: chart.learningCycle!.homeworkId,
    nodePlan,
    learningRoutes: [
      { id: "build-route", label: "Build It", rationale: "Practice the same four gaps with careful construction and a wheel reward.", nodeIds: practiceIds.slice(0, 3) },
      { id: "speed-route", label: "Speed It", rationale: "Practice the same four gaps through recall and faster letter play.", nodeIds: practiceIds.slice(3) },
    ],
    plannedMeasurements,
    planTheory,
  };
  return hydrateAssignmentPlannerOutputFromDraft({ activeSessionPlan: plan, plannedMeasurements, planTheory, generationRequests: [], reviewQuestions: [] } as never, packet);
}
