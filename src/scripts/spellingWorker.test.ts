import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { nativeSpellingInstrumentContract, runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { planAssignmentFromSourceWithTelemetry } from "../engine/assignmentPlanner";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { recordCanonicalNodeCompletion, recordSpellingDiscoveryAttempt, advanceCanonicalCycleFromEvidence } from "../engine/learningCycleRuntime";
import { completeDiscoveryEvaluation, getMathGenerationStatus } from "../engine/adaptiveMathDiscovery";
import { buildAdventureBoardFromActiveSessionPlan } from "../shared/adventureBoardFromPlan";
import { getChildChart } from "../profiles/childChart";
import { generateStoryImage } from "../utils/generateStoryImage";
import type { ActiveSessionPlan } from "../context/schemas/learningProfile";
vi.mock("../utils/generateStoryImage", () => ({ generateStoryImage: vi.fn() }));
vi.mock("../engine/assignmentPlanner", async original => ({ ...await original<typeof import("../engine/assignmentPlanner")>(), planAssignmentFromSourceWithTelemetry: vi.fn() }));
vi.mock("../engine/directMathExperience", async original => ({ ...await original<typeof import("../engine/directMathExperience")>(), askDirectMathPlanner: vi.fn(async () => { throw new Error("test_forbids_math_planner_for_spelling"); }) }));
const roots: string[] = [];
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });
describe("spelling in the production generation worker", () => {
  it("does not invalidate a frozen native instrument when only its board art changes", () => {
    const node = {
      id: "practice",
      type: "word-radar",
      activityId: "word-radar",
      title: "Practice",
      targets: ["night"],
      difficulty: 1,
      source: "chart_planner",
      thumbnailUrl: "/thumbnails/activities/word-radar.svg",
      thumbnailPrompt: "A radar station",
    } as ActiveSessionPlan["nodePlan"][number];
    const evidenceContract = { spellingItems: { night: { word: "night" } } };

    expect(nativeSpellingInstrumentContract(node, evidenceContract)).toEqual(
      nativeSpellingInstrumentContract({
        ...node,
        thumbnailUrl: "/generated/a-different-valid-presentation.jpeg",
        thumbnailPrompt: "A different visual direction",
      }, evidenceContract),
    );
  });

  it.each(["strong", "weak", "assisted", "incomplete"])("plans from %s committed evidence, publishes native games, and resumes without repeated calls", async scenario => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-08T11:00:00Z"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-spelling-worker-")); roots.push(rootDir);
    const childId = "lab-child", child = path.join(rootDir, "src/context", childId);
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(child, "learning_profile.json"), JSON.stringify({ childId, name: "Lab", age: 8, grade: 3, totalSessions: 0, sessionHistory: [], preferences: {}, strengths: [], challenges: [], notes: [], diagnoses: [], learningGoals: [] }));
    fs.writeFileSync(path.join(rootDir, "children.config.json"), JSON.stringify({ childProfiles: { [childId]: {} }, companions: { elli: { dopamineGames: [], faceCamera: { position: [0, 0, 1], target: [0, 0, 0] } } }, defaultCompanionId: "elli" }));
    const sourceFile = path.join(rootDir, "words.txt"); fs.writeFileSync(sourceFile, "Spelling\nnight\nlight");
    const { homeworkId } = await runSpellingDiscoveryIntake({ childId, rootDir, sourceFile }, { callPlannerModel: async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "School words", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }) });
    const opening = getLearningCycle(childId, homeworkId, { rootDir })!;
    expect(generateStoryImage).not.toHaveBeenCalled();
    const items = Object.values(opening.nodes[0].evidenceContract.spellingItems!);
    items.forEach((item, index) => recordSpellingDiscoveryAttempt({ childId, homeworkId, attempt: { attemptId: `observed-${index}`, itemId: item.id, attemptedValue: scenario === "incomplete" && index === 1 ? "" : scenario === "weak" && index === 1 ? "lite" : item.word, skipped: scenario === "incomplete" && index === 1, observedAt: "2026-09-08T10:00:00Z" }, support: { status: scenario === "assisted" ? "assisted" : "unassisted", scaffolds: scenario === "assisted" ? ["help"] : [] } }, { rootDir }));
    completeDiscoveryEvaluation({ childId, homeworkId, rootDir, completedAt: "2026-09-08T10:01:00Z" });
    const originalObservations = getLearningCycle(childId, homeworkId, { rootDir })!.observations;
    if (scenario === "incomplete") expect(originalObservations[1].result.correct).toBeUndefined();
    vi.mocked(planAssignmentFromSourceWithTelemetry).mockImplementation(async packet => {
      expect(packet.discoveryEvidence?.summary.coverage?.complete).toBe(true);
      const target = scenario === "weak" ? ["light"] : ["night", "light"];
      const nodePlan = [
        { id: "practice", type: "word-radar", activityId: "word-radar", title: scenario === "weak" ? "Targeted recall" : "Recheck uncertain or secure recall", targets: target, difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "partial_visual_recall", inputMode: "keyboard" } },
        { id: "check", type: "word-radar", activityId: "word-radar", title: "Fresh recall check", targets: ["night", "light"], difficulty: 1, source: "chart_planner", wordRadarConfig: { recallMode: "hidden_word_recall", inputMode: "keyboard" } },
      ];
      if (scenario === "strong") Object.assign(nodePlan[0], { type: "letter-rush", activityId: "letter-rush", activityConfig: { schemaVersion: 1, activityId: "letter-rush", mode: "read-and-race", topic: "School words", domain: "spelling", learningGoal: "Practice captured spelling", gradeBand: "early_elementary", scaffolds: { showWord: true, letterBank: true, allowRetryBeforeScore: true, companionHints: false }, words: target.map(text => ({ text })), evidencePolicy: { writesPracticeEvidence: true, writesMasteryEvidence: false, requiresPerTargetResult: true, allowedEvidence: ["practice"] } } });
      const plannedMeasurements = nodePlan.map(node => ({ id: `measure-${node.id}`, activityId: node.activityId, target: node.targets.join(","), evidenceType: "recall", supportCriteria: "Captured recall improves", reviseCriteria: "Mixed", falsifyCriteria: "No improvement", spelling: { role: node.id === "check" ? "fresh_checkpoint" : "practice", evidenceIds: ["observed-0", "observed-1"], interventionNodeIds: node.id === "check" ? ["practice"] : [], reason: scenario === "assisted" ? "Help limits inference" : "Current recall facts", uncertainty: "One occasion", expectedAccuracy: { min: 0.6, max: 1 }, confidence: 0.5, finalCheck: node.id === "check" } }));
      const activeSessionPlan = { planId: `targeted:${homeworkId}`, childId, activeHomeworkId: homeworkId, domain: "spelling", nodePlan, plannedMeasurements, planTheory: { hypothesis: "Recall may improve", evidenceSummary: ["observed-0", "observed-1"], intervention: "Selected practice", supportCriteria: ["Improvement"], reviseCriteria: ["Mixed"], falsifyCriteria: ["No improvement"] } };
      for (const measurement of plannedMeasurements) Object.assign(measurement.spelling, { maxDelayDays: 7 });
      const theme = {
        background: { type: "image", value: "/generated/adventure-board-demo/silent-letter-world.jpeg" },
        palette: { path: "#ffffff", completed: "#1f8f68", available: "#7c3aed", locked: "#aeb7c2", current: "#f59e0b", preview: "#d5dde5", text: "#ffffff", panel: "rgba(15, 23, 42, 0.84)" },
      } as const;
      return { output: { activeSessionPlan: { ...activeSessionPlan, adventureBoard: buildAdventureBoardFromActiveSessionPlan({ plan: activeSessionPlan as never, boardId: activeSessionPlan.planId, theme, title: "School words", companion: { id: "elli", name: "Elli" } }) }, plannedMeasurements, planTheory: activeSessionPlan.planTheory, generationRequests: [] }, telemetry: { model: "recorded-provider", latencyMs: 1 } } as never;
    });
    vi.stubEnv("GROK_API_KEY", "recorded-not-a-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    vi.mocked(generateStoryImage).mockImplementation(async () => {
      // Art is optional presentation; it must not delay playable native nodes.
      expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.every(node => node.status === "ready")).toBe(true);
      return "https://recorded.invalid/image";
    });
    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    expect(generateStoryImage).not.toHaveBeenCalled();
    const frozenFile = path.join(child, "homework/direct-drafts", homeworkId, "spelling-targeted-response.json");
    const frozenResult = JSON.parse(fs.readFileSync(frozenFile, "utf8")).result;
    expect(JSON.stringify(frozenResult)).not.toContain(`/generated/adventure-board/${childId}/`);
    const nativeConfig = path.join(child, "homework/direct-drafts", homeworkId, "native-instruments/practice.json");
    const originalNative = fs.readFileSync(nativeConfig, "utf8");
    fs.rmSync(nativeConfig);
    // This high-level Planner fixture tests missing-instrument recovery. Raw
    // response/derived-checkpoint recovery uses the real parser and mocked
    // transport in spellingPlannerReceipt.test.ts.
    await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
    expect(fs.readFileSync(nativeConfig, "utf8")).toBe(originalNative);
    expect(planAssignmentFromSourceWithTelemetry).toHaveBeenCalledOnce();
    expect(generateStoryImage).not.toHaveBeenCalled();
    const after = getLearningCycle(childId, homeworkId, { rootDir })!;
    expect(after.lifecycle).toBe("board_ready");
    expect(after.observations).toEqual(originalObservations);
    expect(after.nodes.find(node => node.role === "evaluation")?.state).toBe("completed");
    expect(after.academicPredictions).toHaveLength(2);
    const catalog = getChildChart(childId, { rootDir }).contentCatalog.items;
    expect(catalog.filter(item => item.homeworkId === homeworkId)).toHaveLength(2);
    expect(catalog.every(item => item.reuseStatus === "candidate" && item.domain === "spelling" && item.inputEvidence.activityEvidenceIds?.includes("observed-1"))).toBe(true);
    expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.every(node => node.status === "ready")).toBe(true);
    const projected = JSON.parse(fs.readFileSync(path.join(child, "plans/active_session_plan.json"), "utf8"));
    expect(projected.selectedDomain).toBe("spelling");
    expect(projected.current.adventureBoard.nodes.find((node: {id:string}) => node.id === "practice").thumbnailUrl)
      .toBe(scenario === "strong" ? "/thumbnails/activities/letter-rush.svg" : "/thumbnails/activities/word-radar.svg");
    expect(projected.current.nodePlan.find((node: {id:string}) => node.id === "practice").type).toBe(scenario === "strong" ? "letter-rush" : "word-radar");
    if (scenario === "strong") {
      const url = after.nodes.find(node => node.nodeId === "practice")!.artifactBinding!.activityConfigPath!;
      expect(url).toMatch(/^\/api\/activity-config\/lab-child\//);
      const engine = JSON.parse(fs.readFileSync(path.join(child, "homework/games", homeworkId, path.basename(url)), "utf8"));
      expect(engine.activityId).toBe("letter-rush");
      expect(engine.words.map((word: {id:string}) => word.id)).toEqual(Object.keys(after.nodes.find(node => node.nodeId === "practice")!.evidenceContract.spellingItems!));
    }
    const practiceItems = Object.values(after.nodes.find(node => node.nodeId === "practice")!.evidenceContract.spellingItems!);
    expect(() => recordCanonicalNodeCompletion({ childId, homeworkId, nodeId: "practice", sessionId: "duplicate-rows", result: { completed: true, accuracy: 1, timeSpent_ms: 100, targetResults: [practiceItems[0], practiceItems[0]].map(item => ({ target: item.id, correct: true, attemptedValue: item.word })) } }, { rootDir })).toThrow("learning_cycle_duplicate_item");
    recordCanonicalNodeCompletion({ childId, homeworkId, nodeId: "practice", sessionId: "practice-run", result: { completed: true, accuracy: 1, timeSpent_ms: 100, targetResults: practiceItems.map(item => ({ target: item.id, correct: true, attemptedValue: "wrong" })) } }, { rootDir });
    const practiceFacts = getLearningCycle(childId, homeworkId, { rootDir })!.observations.filter(row => practiceItems.some(item => item.id === row.itemId));
    expect(practiceFacts.every(row => row.result.correct === false && row.provenance === "practice")).toBe(true);
    const checkItems = Object.values(after.nodes.find(node => node.nodeId === "check")!.evidenceContract.spellingItems!);
    checkItems.forEach((item, index) => {
      recordSpellingDiscoveryAttempt({ childId, homeworkId, attempt: { attemptId: `check-${index}`, itemId: item.id, attemptedValue: item.word, observedAt: "2026-09-09T12:00:00Z" }, support: { status: "unassisted", scaffolds: [] } }, { rootDir });
      expect(getLearningCycle(childId, homeworkId, { rootDir })!.nodes.find(node => node.nodeId === "check")?.state).not.toBe("completed");
    });
    recordCanonicalNodeCompletion({ childId, homeworkId, nodeId: "check", sessionId: "check-run", result: { completed: true, accuracy: 0, timeSpent_ms: 100 } }, { rootDir });
    const decide = vi.fn(async (cycle: ReturnType<typeof getLearningCycle>) => ({ status: "inconclusive" as const, reason: "Immediate recall improved; delayed evidence is missing.", progressionAction: "await_calibration" as const, preserve: [], change: [], testNext: [], nextEvidenceRequired: ["Returned school work"], predictionEvaluationIds: cycle!.predictionEvaluations.map(row => row.evaluationId) }));
    const final = await advanceCanonicalCycleFromEvidence({ childId, homeworkId, decide }, { rootDir, now: new Date("2026-09-09T12:01:00Z") });
    expect(final.predictionEvaluations).toHaveLength(2);
    expect(final.predictionEvaluations.every(row => row.attribution === "observational_not_causal")).toBe(true);
    expect(final.observations.filter(row => row.observationId.startsWith("check-")).every(row => row.exposure === "previously_practiced" && row.provenance === "practice")).toBe(true);
  });
});
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
