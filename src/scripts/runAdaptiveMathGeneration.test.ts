import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plan, learningProgram } from "./fixtures/adaptiveMathRelease";
import { createDiscoveryLearningCycle, completeDiscoveryEvaluation, recordDiscoveryAttempt, getMathGenerationStatus } from "../engine/adaptiveMathDiscovery";
import { getLearningCycle, projectLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { askMathExperienceDesigner, generateDirectArtifacts, repairDirectArtifact, runDirectBrowserSmokeCheck } from "../engine/directMathExperience";
import { recordEngineeringRepairEvidence } from "../engine/discoveryVisualReview";

vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({
  identity: { displayName: "Lab" }, demographics: { age: 9, grade: 3 },
  learningProfile: { sessionStats: {} }, learningHistory: { constructs: {} },
  companion: { presetId: "elli", displayName: "Elli" }, decisionTrace: {},
}) }));
vi.mock("../engine/directMathExperience", async (original) => ({
  ...await original<typeof import("../engine/directMathExperience")>(),
  askDirectMathPlanner: vi.fn(() => { throw new Error("unexpected_paid_planner"); }),
  askMathExperienceDesigner: vi.fn(() => { throw new Error("unexpected_paid_creator"); }),
  generateDirectArtifacts: vi.fn(), repairDirectArtifact: vi.fn(), runDirectBrowserSmokeCheck: vi.fn(),
}));
let rootDir: string;
const childId = "reina", homeworkId = "hw-worker-lab";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unit_test_external_network_forbidden"); }));
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-worker-test-"));
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  fs.mkdirSync(draft, { recursive: true });
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(draft, name), JSON.stringify(value));
  write("assignment-extraction.json", {version:3,fileHash:"lab-fingerprint",extraction:{ sourcePath: "lab.pdf", sourceKind: "text_assignment", mediaType: "text/plain", extractionMethod: "text", filename: "lab.pdf", fullText: "Equal groups", fileHash: "lab-fingerprint", pages: [], warnings: [] }});
  write("math-learning-program.json", learningProgram(2));
  write("design-packet.json", { version: 1, planId: "direct-plan-1" });
  write("designed-plan.json", plan(2));
  fs.writeFileSync(path.join(rootDir, "src/context", childId, "learning_profile.json"), '{"aiContentCatalog":[]}');
  const evaluation = {
    evaluationId: "discovery", title: "Lab Discovery", assignmentEvidenceIds: ["assignment:lab"],
    constructs: [{ constructId: "math.multiplication.equal_groups", prerequisiteIds: [] }],
    items: [{ itemId: "probe", constructId: "math.multiplication.equal_groups", prompt: "Count the groups", responseContract: { mode: "tap_selection" as const, representationId: "groups" }, correctAnswerContract: { acceptedValues: ["4"] }, difficultyBoundary: "four groups", exposureId: "probe", possibleConfounds: [], falsifyingEvidence: [], measurementKeys: [] }],
    artifact: { artifactId: "discovery", htmlPath: "/games/discovery.html", artworkPath: "/art.svg", contractHash: "contract", artifactHash: "html" },
  };
  write("discovery-contract.json", evaluation);
  createDiscoveryLearningCycle({ rootDir, childId, homeworkId, assignment: { title: "Lab", contentFingerprint: "lab-fingerprint", capturedEvidenceIds: ["assignment:lab"], targets: [] }, evaluation });
  recordDiscoveryAttempt({ rootDir, childId, homeworkId, attempt: { attemptId: "probe-response", itemId: "probe", attemptedValue: "4", supportEventIds: [], instrumentSignals: [], observedAt: "2026-09-01T10:00:00Z" } });
  completeDiscoveryEvaluation({ rootDir, childId, homeworkId, completedAt: "2026-09-01T10:01:00Z" });
  vi.mocked(generateDirectArtifacts).mockImplementation(async (input) => {
    const nodeId = input.nodeIds![0];
    const htmlPath = path.join(rootDir, `${nodeId}.html`);
    fs.writeFileSync(htmlPath, "<!doctype html><h1>Lab</h1><button>Answer</button>");
    return { artifacts: [{ childId, homeworkId, nodeId, title: nodeId, htmlPath, htmlHash: createHash("sha256").update(fs.readFileSync(htmlPath)).digest("hex"), artworkUrl: "/art.svg", creatorPrompt: "fixture", promptHash: "prompt", plannerModel: "mock", creatorModel: "mock" }], backgroundUrl: "/art.svg", questArtworkUrl: "/quest.svg", bossArtworkUrl: "/boss.svg", stats: { generatedNodeIds: [nodeId], reusedNodeIds: [], generatedImages: 0, reusedImages: 0, bonusDeferred: true } };
  });
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({ passed: true, failures: [], screenshots: ["lab.png"] });
  vi.mocked(repairDirectArtifact).mockImplementation(async ({ artifact }) => {
    fs.appendFileSync(artifact.htmlPath, "<!-- recorded repair -->");
    return { ...artifact, htmlHash: createHash("sha256").update(fs.readFileSync(artifact.htmlPath)).digest("hex") };
  });
});
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(rootDir, { recursive: true, force: true }); });

it("reports board design before nodes exist and saves a stopped phase on provider failure", async () => {
  const draft=path.join(rootDir,"src/context",childId,"homework/direct-drafts",homeworkId);
  fs.rmSync(path.join(draft,"design-packet.json"));
  fs.rmSync(path.join(draft,"designed-plan.json"));
  vi.mocked(askMathExperienceDesigner).mockImplementationOnce(async()=>{
    expect(getMathGenerationStatus(childId,homeworkId,{rootDir})?.phase).toBe("board_designing");
    throw new Error("recorded_provider_unavailable");
  });
  await expect(runAdaptiveMathGeneration(childId,homeworkId,rootDir)).rejects.toThrow("recorded_provider_unavailable");
  expect(getMathGenerationStatus(childId,homeworkId,{rootDir})).toMatchObject({phase:"needs_attention",error:"recorded_provider_unavailable",nodes:[]});
  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);
  expect(askMathExperienceDesigner).toHaveBeenCalledTimes(1);
  expect(generateDirectArtifacts).not.toHaveBeenCalled();
});

it("freezes predictions and binds the first verified node while a sibling fails", async () => {
  const build = vi.mocked(generateDirectArtifacts).getMockImplementation()!;
  vi.mocked(generateDirectArtifacts).mockImplementation(async (input) => {
    if (input.nodeIds![0] === "activity-2") {
      const cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
      expect(cycle.academicPredictions).toHaveLength(2);
      expect(cycle.nodes.find(n => n.nodeId === "activity-1")?.artifactBinding).not.toBeNull();
      expect(cycle.nodes.find(n => n.nodeId === "activity-1")?.evidenceContract.itemRoles).toEqual({ q1: "fresh_checkpoint" });
      throw new Error("sibling_offline");
    }
    return build(input);
  });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
  expect(cycle.academicPredictions).toHaveLength(2);
  expect(cycle.nodes.find(n => n.nodeId === "activity-1")?.artifactBinding?.validationStatus).toBe("passed");
  expect(runDirectBrowserSmokeCheck).toHaveBeenCalledTimes(1);
});

it("does not publish a browser-invalid artifact", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({ passed: false, failures: ["control_clipped"], screenshots: ["failure.png"] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(runDirectBrowserSmokeCheck).toHaveBeenCalled();
  expect(getLearningCycle(childId, homeworkId, { rootDir })!.nodes.filter(n => n.role === "baseline").every(n => n.artifactBinding === null)).toBe(true);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).not.toBe("board_ready");
});

it("does not trust a repair lesson from control-journey acceptance without frozen scoring proof", async () => {
  const build = vi.mocked(generateDirectArtifacts).getMockImplementation()!;
  let evidenceFile = "";
  vi.mocked(generateDirectArtifacts).mockImplementation(async input => {
    const result = await build(input); const artifact = result.artifacts[0]!;
    artifact.academicContractHash = "c".repeat(64); artifact.designArtifactHash = "d".repeat(64);
    evidenceFile = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId, "provider-diagnostics", `${artifact.nodeId}.engineering-repair.json`);
    recordEngineeringRepairEvidence({ file: evidenceFile, verifierVersion: 1, originalHash: "a".repeat(64), repairedHash: artifact.htmlHash!, academicHash: artifact.academicContractHash, designHash: artifact.designArtifactHash, issues: ["math_journey_control_not_actionable"], proposal: { features: ["svg_interaction"], cause: "missing_interaction_semantics", change: "add_interaction_semantics" }, inputTokens: 1, outputTokens: 1, latencyMs: 1, costUsd: 0 });
    return result;
  });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(JSON.parse(fs.readFileSync(evidenceFile, "utf8")).verification).toMatchObject({ scoring: false, contracts: false });
});

it("finishes canonical publication and resumes without generating again", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  let cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
  expect(cycle.lifecycle).toBe("board_ready");
  expect(projectLearningCycle(cycle).activeSessionPlan.nodePlan.filter(n => n.type === "generated-baseline" && n.id !== "discovery").every(n => n.gameHtmlPath)).toBe(true);
  const file = path.join(rootDir, "src/context", childId, "homework/cycles", `${homeworkId}.json`);
  cycle.nodes.find(n => n.nodeId === "activity-1")!.artifactBinding = null;
  cycle.nodes.find(n => n.nodeId === "activity-1")!.state = "generating";
  fs.writeFileSync(file, JSON.stringify(cycle));
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getLearningCycle(childId, homeworkId, { rootDir })!.nodes.find(n => n.nodeId === "activity-1")?.artifactBinding).not.toBeNull();
});

it("keeps completed Discovery in history without inserting it into the targeted map on publication or reload", async () => {
  const before = getLearningCycle(childId, homeworkId, { rootDir })!;
  expect(projectLearningCycle(before).adventureBoard.nodes.some(n => n.id === "discovery")).toBe(true);
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const cycle = getLearningCycle(childId, homeworkId, { rootDir })!;
  for (const missingHash of ["programHash", "designHash"] as const) {
    const incompleteContracts = structuredClone(cycle);
    delete incompleteContracts.adaptiveGeneration![missingHash];
    expect(projectLearningCycle(incompleteContracts).adventureBoard.nodes.some(n => n.id === "discovery")).toBe(true);
  }
  const presentation = JSON.parse(fs.readFileSync(path.join(rootDir, "src/context", childId, "plans/active_session_plan.json"), "utf8")).current;
  // Include a stale presentation from before this fix: reloading must not restore the extra node.
  const discovery = projectLearningCycle(before).adventureBoard.nodes.find(n => n.id === "discovery")!;
  presentation.adventureBoard.nodes.push(discovery);
  presentation.adventureBoard.edges.push({ id: "stale-discovery-edge", from: "start", to: "discovery", state: "completed" });
  for (const presentationPlan of [undefined, presentation]) {
    const projected = projectLearningCycle(cycle, { presentationPlan });
    expect(projected.activeSessionPlan.nodePlan.some(n => n.id === "discovery")).toBe(true);
    expect(projected.adventureBoard.nodes.some(n => n.id === "discovery")).toBe(false);
    expect(projected.adventureBoard.edges.some(e => e.from === "discovery" || e.to === "discovery")).toBe(false);
    expect(projected.adventureBoard.nodes.filter(n => n.kind === "activity").map(n => n.id).sort()).toEqual(["activity-1", "activity-2"]);
  }
  expect(cycle.nodes.find(n => n.nodeId === "discovery")).toEqual(before.nodes.find(n => n.nodeId === "discovery"));
  expect(cycle.observations).toEqual(before.observations);
  expect(fetch).not.toHaveBeenCalled();
});

it("replaying Discovery completion after publication cannot reset the board or its evidence timestamp", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const before = getLearningCycle(childId, homeworkId, { rootDir })!;
  const summaryFile = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId, "discovery-evidence-summary.json");
  const summary = fs.readFileSync(summaryFile, "utf8");
  const replay = completeDiscoveryEvaluation({ rootDir, childId, homeworkId, completedAt: "2026-09-02T10:01:00Z" });
  expect(replay).toEqual(before);
  expect(fs.readFileSync(summaryFile, "utf8")).toBe(summary);
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getLearningCycle(childId, homeworkId, { rootDir })?.lifecycle).toBe("board_ready");
});

it("records a stopped job when saved source extraction is missing before planning", async () => {
  fs.rmSync(path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId, "assignment-extraction.json"));
  await expect(runAdaptiveMathGeneration(childId, homeworkId, rootDir)).rejects.toThrow();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })).toMatchObject({ phase: "needs_attention", error: expect.any(String), nodes: [] });
  expect(askMathExperienceDesigner).not.toHaveBeenCalled();
  expect(generateDirectArtifacts).not.toHaveBeenCalled();
});

it("uses the second bounded build attempt to repair a rejected candidate", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValueOnce({passed:false,failures:["missing_completion"],screenshots:[]});
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(getMathGenerationStatus(childId, homeworkId, {rootDir})?.nodes[0].status).toBe("ready");
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(getMathGenerationStatus(childId, homeworkId, {rootDir})?.phase).toBe("board_ready");
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(repairDirectArtifact).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/runAdaptiveMathGeneration.ts"), "utf8");
  expect(source).toContain("repairDirectArtifact");
  expect(source).not.toContain("forceNodeIds: [nodeId]");
});

it("reverifies an old rejection before deciding to buy a repair", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const reportsFile=path.join(rootDir,"src/context",childId,"homework/direct-drafts",homeworkId,"browser-verification.json");
  const reports=JSON.parse(fs.readFileSync(reportsFile,"utf8")); reports["activity-1"]={...reports["activity-1"],passed:false,failures:["old_wrong_protocol"],verifierVersion:0};
  fs.writeFileSync(reportsFile,JSON.stringify(reports));
  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);
  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId,homeworkId,{rootDir})?.phase).toBe("board_ready");
});


it("preserves the child decision boundary when a sibling finishes later", async () => {
  const generate = vi.mocked(generateDirectArtifacts).getMockImplementation()!;
  vi.mocked(generateDirectArtifacts).mockImplementation(async input => {
    if (input.nodeIds![0] === "activity-2") {
      const cycle = getLearningCycle(childId, homeworkId, {rootDir})!;
      transitionLearningCycle(childId, homeworkId, cycle.revision, {type:"instrument_observed",nodeId:"activity-1",observations:[],academicEvidence:[],engagementEvidence:[],companionObservations:[]}, {rootDir});
      expect(getLearningCycle(childId, homeworkId, {rootDir})!.lifecycle).toBe("baseline_evaluating");
    }
    return generate(input);
  });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(getLearningCycle(childId, homeworkId, {rootDir})!.lifecycle).toBe("baseline_evaluating");
  expect(getLearningCycle(childId, homeworkId, {rootDir})!.nodes.find(node=>node.nodeId==="activity-1")!.state).toBe("completed");
});

it("preserves Planner support added while the original sibling is building", async () => {
  const generate = vi.mocked(generateDirectArtifacts).getMockImplementation()!;
  vi.mocked(generateDirectArtifacts).mockImplementation(async input => {
    if (input.nodeIds![0] === "activity-2") {
      let cycle = getLearningCycle(childId, homeworkId, {rootDir})!;
      cycle = transitionLearningCycle(childId, homeworkId, cycle.revision, {type:"instrument_observed",nodeId:"activity-1",observations:[],academicEvidence:[{evidenceId:"lab:miss",summary:"needs support"}],engagementEvidence:[],companionObservations:[]}, {rootDir});
      transitionLearningCycle(childId, homeworkId, cycle.revision, {type:"theory_decided",decision:{status:"revised",reason:"Needs support",nextAction:"Generate support",evidenceIds:["lab:miss"],predictionEvaluationIds:[],preserve:[],change:[],testNext:[],nextEvidenceRequired:[],progressionAction:"generate_support",nextInstrument:{nodeId:"support-lab",title:"Support",academicTarget:"math.multiplication.equal_groups",mechanic:"tap",theme:"lab",openingPurpose:"Support",creatorPrompt:"Use the measured miss"}}}, {rootDir});
    }
    return generate(input);
  });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(getLearningCycle(childId, homeworkId, {rootDir})!.nodes.some(node=>node.nodeId==="support-lab")).toBe(true);
  expect(getLearningCycle(childId, homeworkId, {rootDir})!.lifecycle).toBe("baseline_generating");
});

it("refreshes canonical proof when the verifier version changes without regenerating", async () => {
  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);
  const file=path.join(rootDir,"src/context",childId,"homework/cycles",homeworkId+".json");
  const cycle=getLearningCycle(childId,homeworkId,{rootDir})!;
  cycle.nodes.find(n=>n.nodeId==="activity-1")!.artifactBinding!.validationProof!.verifierVersion=0;
  fs.writeFileSync(file,JSON.stringify(cycle));
  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);
  expect(getLearningCycle(childId,homeworkId,{rootDir})!.nodes.find(n=>n.nodeId==="activity-1")!.artifactBinding!.validationProof!.verifierVersion).toBeGreaterThan(0);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
});

it("preserves the targeted Planner response for failure diagnosis and restart safety", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/scripts/runAdaptiveMathGeneration.ts"), "utf8");
  expect(source).toContain('rawResponseFile: path.join(draft, "provider-diagnostics", "targeted-planner-response.json")');
});
