import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plan, learningProgram } from "./fixtures/adaptiveMathRelease";
import { createDiscoveryLearningCycle, completeDiscoveryEvaluation, recordDiscoveryAttempt, getMathGenerationStatus, hashDiscoveryContract, setMathGenerationPhase, updateMathGenerationNode, writeMathGenerationJob } from "../engine/adaptiveMathDiscovery";
import { getLearningCycle, projectLearningCycle, transitionLearningCycle } from "../engine/learningCycleRepository";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { askDirectMathPlanner, askMathExperienceDesigner, correctSavedDirectMathPlannerResponse, generateDirectArtifacts, repairDirectArtifact, runDirectBrowserSmokeCheck } from "../engine/directMathExperience";
import { DISCOVERY_VERIFIER_VERSION, recordEngineeringRepairEvidence, type JourneyCapture } from "../engine/discoveryVisualReview";
import { judgeChildFacingScreens } from "../engine/childFacingVisualGate";

vi.mock("../profiles/childChart", () => ({ getChildChart: () => ({
  identity: { displayName: "Lab" }, demographics: { age: 9, grade: 3 },
  learningProfile: { sessionStats: {} }, learningHistory: { constructs: {} },
  companion: { presetId: "elli", displayName: "Elli" }, decisionTrace: {},
}) }));
vi.mock("../engine/directMathExperience", async (original) => ({
  ...await original<typeof import("../engine/directMathExperience")>(),
  askDirectMathPlanner: vi.fn(() => { throw new Error("unexpected_paid_planner"); }),
  correctSavedDirectMathPlannerResponse: vi.fn(),
  askMathExperienceDesigner: vi.fn(() => { throw new Error("unexpected_paid_creator"); }),
  generateDirectArtifacts: vi.fn(), repairDirectArtifact: vi.fn(), runDirectBrowserSmokeCheck: vi.fn(),
}));
vi.mock("../engine/childFacingVisualGate", () => ({
  CHILD_FACING_VISUAL_GATE_VERSION: 3,
  selectVerifiedChildFacingCaptures: (captures: Array<{ viewport: string; kind: string }>) =>
    captures.filter(capture => capture.viewport === "sunny" && capture.kind !== "failure"),
  selectChildFacingJourneyScreens: (screenshots: string[]) => {
    const selected = screenshots.filter(file => file.includes("-sunny-item-") || file.includes("-sunny-completion"));
    return selected.length > 0 ? selected : screenshots;
  },
  judgeChildFacingScreens: vi.fn(),
}));

const confirmedAcademicCapture = (overrides: Partial<JourneyCapture> = {}): JourneyCapture => ({
  path: "activity-1-sunny-item-01.png",
  label: "activity-1-sunny-item-01",
  kind: "academic_item",
  viewport: "sunny",
  verifierVersion: DISCOVERY_VERIFIER_VERSION,
  expectedItemId: "item-01",
  observedItemId: "item-01",
  promptVisible: true,
  ...overrides,
});
const citedVisualReject = (observation: string, screen = 1) => ({
  decision: "reject" as const,
  observations: [observation],
  findings: [{ screen, claim: "visual_defect" as const, observation }],
});
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
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({
    passed: true,
    failures: [],
    screenshots: ["lab.png"],
    captures: [confirmedAcademicCapture({ path: "lab.png" })],
  });
  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });
  vi.mocked(repairDirectArtifact).mockImplementation(async ({ artifact, outputDir, authorizeTruncatedReplacement }) => {
    if (authorizeTruncatedReplacement) {
      fs.writeFileSync(
        path.join(outputDir, `${artifact.nodeId}-repair-replacement-authorization.json`),
        JSON.stringify({ nodeId: artifact.nodeId, reason: "saved_request_output_budget_exhausted" }),
      );
    }
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

it("resumes a saved Planner response after a contract fix without buying the plan again", async () => {
  const draft=path.join(rootDir,"src/context",childId,"homework/direct-drafts",homeworkId);
  fs.rmSync(path.join(draft,"math-learning-program.json"));
  const clockProgram=learningProgram(2);
  clockProgram.concept.conceptId="clock.minute_tick_count_from_12_by_fives";
  const responseFile=path.join(draft,"provider-diagnostics","targeted-planner-response.json");
  fs.mkdirSync(path.dirname(responseFile),{recursive:true});
  fs.writeFileSync(responseFile,JSON.stringify({
    model:"saved-planner",
    stopReason:"tool_use",
    usage:{input_tokens:1,output_tokens:1},
    content:[{type:"tool_use",name:"create_math_learning_program",input:clockProgram}],
  }));
  setMathGenerationPhase({rootDir,childId,homeworkId,phase:"needs_attention",error:"concept_id_contains_instance:clock.minute_tick_count_from_12_by_fives"});

  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);

  expect(askDirectMathPlanner).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(path.join(draft,"math-learning-program.json"),"utf8")).concept.conceptId)
    .toBe("clock.minute_tick_count_from_12_by_fives");
  expect(getMathGenerationStatus(childId,homeworkId,{rootDir})?.phase).toBe("board_ready");
});

it("corrects a saved factual Planner contradiction without buying the original plan again", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  fs.rmSync(path.join(draft, "math-learning-program.json"));
  fs.rmSync(path.join(draft, "design-packet.json"));
  fs.rmSync(path.join(draft, "designed-plan.json"));
  const invalid = learningProgram(2);
  invalid.activities[0].items[0] = {
    id: "clock-checkpoint",
    prompt: "Short hand just past 3, long hand on 12. Build the written time.",
    lineage: { sourceEvidenceIds: ["attempt-clock"], exposure: "unseen", measurementRole: "fresh_checkpoint" },
    response: { mode: "construction", expectedState: { hour: 3, minutes: "00" }, successDescription: "3:00" },
  };
  const rawResponseFile = path.join(draft, "provider-diagnostics", "targeted-planner-response.json");
  fs.mkdirSync(path.dirname(rawResponseFile), { recursive: true });
  fs.writeFileSync(rawResponseFile, JSON.stringify({
    model: "saved-planner",
    stopReason: "tool_use",
    usage: {},
    content: [{ type: "tool_use", name: "create_math_learning_program", input: invalid }],
  }));
  vi.mocked(correctSavedDirectMathPlannerResponse).mockResolvedValue(learningProgram(2));
  vi.mocked(askMathExperienceDesigner).mockResolvedValue({
    packet: { version: 1, planId: "corrected-plan" } as never,
    plan: plan(2),
  });
  setMathGenerationPhase({ rootDir, childId, homeworkId, phase: "needs_attention", error: "math_item_clock_state_inconsistent:clock-checkpoint" });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(askDirectMathPlanner).not.toHaveBeenCalled();
  expect(correctSavedDirectMathPlannerResponse).toHaveBeenCalledTimes(1);
  expect(askMathExperienceDesigner).toHaveBeenCalledTimes(1);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
});

it("requires explicit authorization to resume an uncertain design without repeating Discovery or Planner", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const packet = JSON.parse(fs.readFileSync(path.join(draft, "design-packet.json"), "utf8"));
  const designedPlan = JSON.parse(fs.readFileSync(path.join(draft, "designed-plan.json"), "utf8"));
  fs.rmSync(path.join(draft, "design-packet.json"));
  fs.rmSync(path.join(draft, "designed-plan.json"));
  const receiptDir = path.join(draft, "provider-receipts");
  const requestHash = "a".repeat(64);
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, "targeted-design-1.stage.json"), JSON.stringify({ requestHash }));
  fs.writeFileSync(path.join(receiptDir, `${requestHash}.json`), JSON.stringify({ status: "outcome_uncertain" }));
  setMathGenerationPhase({
    rootDir,
    childId,
    homeworkId,
    phase: "needs_attention",
    error: "provider_outcome_uncertain:targeted-design-1",
  });
  vi.mocked(askMathExperienceDesigner).mockResolvedValue({ packet, plan: designedPlan });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(askMathExperienceDesigner).not.toHaveBeenCalled();
  expect(askDirectMathPlanner).not.toHaveBeenCalled();

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir, { retryUncertainProvider: true });
  expect(askMathExperienceDesigner).toHaveBeenCalledWith(expect.objectContaining({ retryUncertain: true }));
  expect(askDirectMathPlanner).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
});

it("does not let design retry authorization repurchase a missing Planner program", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  fs.rmSync(path.join(draft, "math-learning-program.json"));
  fs.rmSync(path.join(draft, "design-packet.json"));
  fs.rmSync(path.join(draft, "designed-plan.json"));
  setMathGenerationPhase({
    rootDir,
    childId,
    homeworkId,
    phase: "needs_attention",
    error: "provider_outcome_uncertain:targeted-design-1",
  });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir, { retryUncertainProvider: true });

  expect(askDirectMathPlanner).not.toHaveBeenCalled();
  expect(askMathExperienceDesigner).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("needs_attention");
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

it("builds unfinished siblings when another node already needs attention", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const program = JSON.parse(fs.readFileSync(path.join(draft, "math-learning-program.json"), "utf8"));
  const design = JSON.parse(fs.readFileSync(path.join(draft, "design-packet.json"), "utf8"));
  writeMathGenerationJob({
    rootDir,
    childId,
    homeworkId,
    programHash: hashDiscoveryContract(program),
    designHash: hashDiscoveryContract(design),
    nodeIds: ["activity-1", "activity-2"],
  });
  updateMathGenerationNode({
    rootDir,
    childId,
    homeworkId,
    nodeId: "activity-1",
    status: "needs_attention",
    error: "bounded_attempts_exhausted",
  });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(generateDirectArtifacts).toHaveBeenCalledTimes(1);
  expect(generateDirectArtifacts).toHaveBeenCalledWith(expect.objectContaining({ nodeIds: ["activity-2"] }));
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ nodeId: "activity-1", status: "needs_attention" }),
    expect.objectContaining({ nodeId: "activity-2", status: "ready" }),
  ]));
});

it("does not publish a browser-invalid artifact", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({ passed: false, failures: ["control_clipped"], screenshots: ["failure.png"] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(runDirectBrowserSmokeCheck).toHaveBeenCalled();
  expect(getLearningCycle(childId, homeworkId, { rootDir })!.nodes.filter(n => n.role === "baseline").every(n => n.artifactBinding === null)).toBe(true);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).not.toBe("board_ready");
});

it("stops a matching-item prompt disagreement as verifier ambiguity without buying repair", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockImplementation(async ({ artifacts }) => artifacts[0]?.nodeId === "activity-1"
    ? {
        passed:false,
        failures:[
          'math_journey_checker_contract_ambiguity;item=item-02;reported=item-02;reportedPrompt="long reported prompt";frozenPrompt="short frozen prompt";renderedText="short frozen prompt"',
        ],
        screenshots:["activity-1-sunny-item-02.png"],
      }
    : { passed:true,failures:[],screenshots:["activity-2-sunny-item-01.png"] });

  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);

  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId,homeworkId,{rootDir})?.nodes.find(node=>node.nodeId==="activity-1"))
    .toMatchObject({status:"needs_attention",attemptCount:1,error:expect.stringContaining("targeted_verifier_contract_ambiguity")});
});

it("does not publish a child-visible artifact rejected by blind screenshot review", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({
    passed: true,
    failures: [],
    screenshots: [
      "node-generation-item-01-question.png",
      "node-generation-completion.png",
      "node-sunny-item-01-question.png",
      "node-sunny-completion.png",
    ],
    captures: [
      confirmedAcademicCapture({ path: "node-sunny-item-01-question.png" }),
      confirmedAcademicCapture({ path: "node-sunny-completion.png", kind: "completion", observedItemId: null, promptVisible: false }),
    ],
  });
  vi.mocked(judgeChildFacingScreens).mockResolvedValue(citedVisualReject("The clock hands visibly contradict the question."));

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(judgeChildFacingScreens).toHaveBeenCalledWith(expect.objectContaining({
    screenshotPaths: ["node-sunny-item-01-question.png", "node-sunny-completion.png"],
  }));
  expect(getLearningCycle(childId, homeworkId, { rootDir })!.nodes
    .filter(node => node.role === "baseline")
    .every(node => node.artifactBinding === null)).toBe(true);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).not.toBe("board_ready");
});

it.each([
  ["an unconfirmed screen", confirmedAcademicCapture({ kind: "unconfirmed", observedItemId: null, promptVisible: false }), { screen: 1, claim: "visual_defect", observation: "The prompt is missing." }],
  ["an older-verifier screen", confirmedAcademicCapture({ verifierVersion: 19 }), { screen: 1, claim: "visual_defect", observation: "The controls overlap." }],
  ["an uncited finding", confirmedAcademicCapture(), { screen: null, claim: "visual_defect", observation: "The controls overlap." }],
  ["a contradicted missing-content claim", confirmedAcademicCapture(), { screen: 1, claim: "content_missing", observation: "The prompt is missing." }],
] as const)("stops %s as needs-attention without buying a visual repair", async (_label, capture, finding) => {
  vi.mocked(runDirectBrowserSmokeCheck).mockImplementation(async ({ artifacts }) => ({
    passed: true,
    failures: [],
    screenshots: [String(capture.path).replace("activity-1", artifacts[0]!.nodeId)],
    captures: [{ ...capture, path: String(capture.path).replace("activity-1", artifacts[0]!.nodeId) }],
  }) as never);
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? { decision: "reject", observations: [finding.observation], findings: [finding] } as never
    : { decision: "approve", observations: [], findings: [] });
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const historyFile = path.join(draft, "provider-diagnostics", "activity-1-visual-review-history.jsonl");
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, `${JSON.stringify({ prior: true })}\n`);

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1"))
    .toMatchObject({ status: "needs_attention", attemptCount: 1 });
  expect(fs.readFileSync(historyFile, "utf8").trim().split("\n")).toHaveLength(2);
});

it("stops a browser harness failure as needs-attention without asking for review or repair", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({
    passed: false,
    failures: ["browserType.launch: Executable doesn't exist"],
    screenshots: [],
  });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(judgeChildFacingScreens).not.toHaveBeenCalled();
  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes[0])
    .toMatchObject({ status: "needs_attention", attemptCount: 1, error: expect.stringContaining("harness_failure") });
});

it("does not buy a blind review when the journey has no browser-confirmed academic screen", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockResolvedValue({
    passed: true,
    failures: [],
    screenshots: ["activity-1-sunny-unconfirmed-01.png"],
    captures: [confirmedAcademicCapture({
      path: "activity-1-sunny-unconfirmed-01.png",
      kind: "unconfirmed",
      observedItemId: null,
      promptVisible: false,
    })],
  });
  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(judgeChildFacingScreens).not.toHaveBeenCalled();
  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes[0])
    .toMatchObject({ status: "needs_attention", error: expect.stringContaining("no_browser_confirmed_academic_screen") });
});

it("repairs only a cited visual defect on a browser-confirmed academic screen", async () => {
  vi.mocked(runDirectBrowserSmokeCheck).mockImplementation(async ({ artifacts }) => ({
    passed: true,
    failures: [],
    screenshots: [`${artifacts[0]!.nodeId}-sunny-item-01.png`],
    captures: [{ ...confirmedAcademicCapture(), path: `${artifacts[0]!.nodeId}-sunny-item-01.png` }],
  }) as never);
  let firstReview = true;
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => {
    if (auditFile?.includes("activity-1") && firstReview) {
      firstReview = false;
      return {
        decision: "reject",
        observations: ["The two buttons overlap."],
        findings: [{ screen: 1, claim: "visual_defect", observation: "The two buttons overlap." }],
      };
    }
    return { decision: "approve", observations: [], findings: [] };
  });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).toHaveBeenCalledTimes(1);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1")?.status).toBe("ready");
});

it("does not reset a consumed visual repair when the visual gate version changes", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const build = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8"));
  const artifact = build.artifacts.find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const oldAttemptDir = path.join(draft, "provider-diagnostics", "visual-repair-v2", "activity-1", artifact.htmlHash.slice(0, 12));
  fs.mkdirSync(oldAttemptDir, { recursive: true });
  fs.writeFileSync(path.join(oldAttemptDir, "activity-1-visual-repair-attempt.json"), JSON.stringify({
    version: 1,
    gateVersion: 2,
    nodeId: "activity-1",
    inputHtmlHash: artifact.htmlHash,
    failures: ["child_visual_review:screen=1:The controls overlap."],
    status: "failed",
  }));
  const secondOldAttemptDir = path.join(draft, "provider-diagnostics", "visual-repair-v2", "activity-1", "second-attempt");
  fs.mkdirSync(secondOldAttemptDir, { recursive: true });
  fs.writeFileSync(path.join(secondOldAttemptDir, "activity-1-visual-repair-attempt.json"), JSON.stringify({
    version: 1,
    gateVersion: 2,
    nodeId: "activity-1",
    inputHtmlHash: "f".repeat(64),
    failures: ["child_visual_review:screen=1:The controls overlap."],
    status: "failed",
  }));
  const reportsFile = path.join(draft, "browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  reports["activity-1"] = {
    ...reports["activity-1"],
    passed: false,
    failures: ["child_visual_review:screen=1:The controls overlap."],
    visualReview: { repairAuthorized: true, attribution: { category: "generated_content_defect" } },
  };
  fs.writeFileSync(reportsFile, JSON.stringify(reports));
  updateMathGenerationNode({ rootDir, childId, homeworkId, nodeId: "activity-1", status: "needs_attention", artifactHash: artifact.htmlHash, error: "saved_visual_rejection" });
  vi.mocked(repairDirectArtifact).mockClear();

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).not.toHaveBeenCalled();
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

it("routes one explicitly authorized truncated-repair replacement only to the named node", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const draft = path.join(rootDir,"src/context",childId,"homework/direct-drafts",homeworkId);
  const diagnostics = path.join(draft,"provider-diagnostics");
  const receipts = path.join(diagnostics,"provider-receipts");
  fs.mkdirSync(receipts,{recursive:true});
  fs.writeFileSync(path.join(diagnostics,"activity-1-repair-request.json"),JSON.stringify({
    model:"gpt-5.6",input:[],max_output_tokens:8000,reasoning:{effort:"high"},stream:true,store:false,
  }));
  const oldHash = "a".repeat(64);
  fs.writeFileSync(path.join(receipts,"activity-1-repair.stage.json"),JSON.stringify({requestHash:oldHash}));
  fs.writeFileSync(path.join(receipts,`${oldHash}.json`),JSON.stringify({
    status:"received",model:"gpt-5.6",response:{stopReason:"max_output_tokens",inputTokens:10,outputTokens:8000,reasoningTokens:7900,visibleTextCharacters:400},
  }));
  const reportsFile = path.join(draft,"browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile,"utf8"));
  reports["activity-1"] = {...reports["activity-1"],passed:false,failures:["math_control_clipped_or_obscured"],screenshots:["lab.png"]};
  fs.writeFileSync(reportsFile,JSON.stringify(reports));
  const savedArtifactHash = getMathGenerationStatus(childId,homeworkId,{rootDir})!.nodes.find(node=>node.nodeId==="activity-1")!.artifactHash;
  updateMathGenerationNode({rootDir,childId,homeworkId,nodeId:"activity-1",status:"needs_attention",artifactHash:savedArtifactHash,error:"board_repair_harness_failure:output_budget_exhausted"});
  vi.mocked(repairDirectArtifact).mockClear();

  await runAdaptiveMathGeneration(childId,homeworkId,rootDir);
  expect(repairDirectArtifact).not.toHaveBeenCalled();

  await runAdaptiveMathGeneration(childId,homeworkId,rootDir,{authorizeTruncatedRepairReplacementNodeId:"activity-1"});
  expect(repairDirectArtifact).toHaveBeenCalledTimes(1);
  expect(repairDirectArtifact).toHaveBeenCalledWith(expect.objectContaining({
    authorizeTruncatedReplacement:true,
    artifact:expect.objectContaining({nodeId:"activity-1"}),
  }));
  await runAdaptiveMathGeneration(childId,homeworkId,rootDir,{authorizeTruncatedRepairReplacementNodeId:"activity-1"});
  expect(repairDirectArtifact).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(path.join(receipts,`${oldHash}.json`),"utf8")).toContain('"max_output_tokens"');
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

it("resumes a needs-attention job when saved artifacts require a newer verifier", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const reportsFile = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId, "browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  reports["activity-1"] = { ...reports["activity-1"], passed: false, failures: ["old_verifier_false_negative"], verifierVersion: 0 };
  fs.writeFileSync(reportsFile, JSON.stringify(reports));
  setMathGenerationPhase({ rootDir, childId, homeworkId, phase: "needs_attention", error: "targeted_browser_verification_failed:activity-1" });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(runDirectBrowserSmokeCheck).toHaveBeenCalledTimes(3);
  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
});

it("resumes an interrupted visual review without rebuilding the saved activity", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const build = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8"));
  const artifact = build.artifacts.find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const auditFile = path.join(draft, "provider-diagnostics", `activity-1-visual-v3-${artifact.htmlHash.slice(0, 12)}.json`);
  fs.mkdirSync(path.dirname(auditFile), { recursive: true });
  fs.writeFileSync(auditFile, JSON.stringify({
    version: 3,
    requestHash: "interrupted-review",
    status: "in_flight",
    attempts: [{ attempt: 1, startedAt: "2026-09-20T12:00:00.000Z", status: "in_flight" }],
  }));
  updateMathGenerationNode({
    rootDir,
    childId,
    homeworkId,
    nodeId: "activity-1",
    status: "needs_attention",
    artifactHash: artifact.htmlHash,
    error: `child_visual_review_in_flight:${auditFile}`,
  });
  vi.mocked(judgeChildFacingScreens).mockClear();

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir, { retryUncertainProvider: true });

  expect(vi.mocked(judgeChildFacingScreens).mock.calls
    .filter(([input]) => input.auditFile?.includes("activity-1-visual-v3-")).length).toBe(1);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(repairDirectArtifact).not.toHaveBeenCalled();
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1"))
    .toMatchObject({ status: "ready", artifactHash: artifact.htmlHash });
});

it("gives a current visual rejection one separately tracked repair after generic attempts are exhausted", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  fs.writeFileSync(path.join(draft, "math-learning-program.json"), JSON.stringify(learningProgram(2)));
  fs.writeFileSync(path.join(draft, "designed-plan.json"), JSON.stringify(plan(2)));
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The completion screen contradicts its progress and has no Finish action.")
    : { decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes[0]).toMatchObject({ status: "needs_attention", attemptCount: 2 });
  expect(repairDirectArtifact).toHaveBeenCalledTimes(1);

  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).toHaveBeenCalledTimes(2);
  expect(vi.mocked(repairDirectArtifact).mock.calls[1]?.[0].outputDir).toContain("visual-repair-v3/activity-1");
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
  const finalArtifact = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8")).artifacts
    .find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const finalBinding = getLearningCycle(childId, homeworkId, { rootDir })?.nodes
    .find(node => node.nodeId === "activity-1")?.artifactBinding;
  expect(finalBinding?.creativeProvenance?.generatedHtmlHash).toBe(finalArtifact.htmlHash);
  expect(finalBinding?.validationProof?.htmlHash).toBe(finalArtifact.htmlHash);
});

it("uses one final visual follow-up on the verified repaired artifact, then stops", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  fs.writeFileSync(path.join(draft, "math-learning-program.json"), JSON.stringify(learningProgram(2)));
  fs.writeFileSync(path.join(draft, "designed-plan.json"), JSON.stringify(plan(2)));
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The completion screen contradicts its progress and has no Finish action.")
    : { decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(repairDirectArtifact).toHaveBeenCalledTimes(3);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("needs_attention");
  const firstRejectedRepair = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8")).artifacts
    .find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  expect(firstRejectedRepair.htmlHash).not.toBeUndefined();

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  expect(repairDirectArtifact).toHaveBeenCalledTimes(3);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("needs_attention");

  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).toHaveBeenCalledTimes(3);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("needs_attention");
});

it("publishes a final visual follow-up only after the repaired journey passes", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  fs.writeFileSync(path.join(draft, "math-learning-program.json"), JSON.stringify(learningProgram(2)));
  fs.writeFileSync(path.join(draft, "designed-plan.json"), JSON.stringify(plan(2)));
  let activityOneReviews = 0;
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => {
    if (!auditFile?.includes("activity-1")) return { decision: "approve", observations: [] };
    activityOneReviews += 1;
    return activityOneReviews < 4
      ? citedVisualReject(`Residual visual defect ${activityOneReviews}`)
      : { decision: "approve", observations: [] };
  });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).toHaveBeenCalledTimes(3);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
});

it("reapplies a saved visual repair after a patch-parser upgrade without another provider build", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The completion wording contradicts the visible state.")
    : { decision: "approve", observations: [] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const artifact = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8")).artifacts
    .find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const attemptDir = path.join(draft, "provider-diagnostics", "visual-repair-v3", "activity-1", artifact.htmlHash.slice(0, 12));
  fs.mkdirSync(attemptDir, { recursive: true });
  fs.writeFileSync(path.join(attemptDir, "activity-1-visual-repair-attempt.json"), JSON.stringify({
    version: 1,
    patchParserVersion: 1,
    gateVersion: 3,
    nodeId: "activity-1",
    inputHtmlHash: artifact.htmlHash,
    failures: ["child_visual_review:The completion wording contradicts the visible state."],
    status: "failed",
    error: "discovery_repair_patch_old_text_missing:7",
  }));
  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).toHaveBeenCalledTimes(2);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1")?.status).toBe("ready");
});

it("removes a previously ready artifact from play when a newer visual review rejects it", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const reportsFile = path.join(draft, "browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  reports["activity-1"] = { ...reports["activity-1"], verifierVersion: 0 };
  fs.writeFileSync(reportsFile, JSON.stringify(reports));
  setMathGenerationPhase({ rootDir, childId, homeworkId, phase: "needs_attention", error: "new_visual_gate" });
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The activity ends without a visible way to continue.")
    : { decision: "approve", observations: [] });
  vi.mocked(repairDirectArtifact).mockRejectedValueOnce(new Error("repair_offline"));

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1")?.status).toBe("needs_attention");
  expect(getLearningCycle(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1")).toMatchObject({
    state: "blocked",
    artifactBinding: null,
  });
});

it("removes a Ready artifact from play when its saved HTML bytes change", async () => {
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  const build = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8"));
  const artifact = build.artifacts.find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  fs.appendFileSync(artifact.htmlPath, "<!-- unexpected mutation -->");
  const reportsFile = path.join(draft, "browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  reports["activity-1"] = { ...reports["activity-1"], verifierVersion: 0 };
  fs.writeFileSync(reportsFile, JSON.stringify(reports));
  setMathGenerationPhase({ rootDir, childId, homeworkId, phase: "needs_attention", error: "revalidate_saved_artifact" });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1")?.status).toBe("needs_attention");
  expect(getLearningCycle(childId, homeworkId, { rootDir })?.nodes.find(node => node.nodeId === "activity-1")).toMatchObject({
    state: "blocked",
    artifactBinding: null,
  });
});

it("resumes a started visual repair without purchasing another generic build", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The activity ends without a visible way to continue.")
    : { decision: "approve", observations: [] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  const artifact = JSON.parse(fs.readFileSync(path.join(draft, "candidate-build-v3.json"), "utf8")).artifacts
    .find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const attemptDir = path.join(draft, "provider-diagnostics", "visual-repair-v3", "activity-1", artifact.htmlHash.slice(0, 12));
  fs.mkdirSync(attemptDir, { recursive: true });
  fs.writeFileSync(path.join(attemptDir, "activity-1-visual-repair-attempt.json"), JSON.stringify({
    version: 1,
    gateVersion: 3,
    nodeId: "activity-1",
    inputHtmlHash: artifact.htmlHash,
    failures: ["child_visual_review:The activity ends without a visible way to continue."],
    status: "started",
  }));
  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(repairDirectArtifact).toHaveBeenCalledTimes(2);
  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
  expect(JSON.parse(fs.readFileSync(path.join(attemptDir, "activity-1-visual-repair-attempt.json"), "utf8"))).toMatchObject({
    status: "verified",
    inputHtmlHash: artifact.htmlHash,
  });
});

it("finishes publication after a crash left a provider-completed repair with passing proof", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The completion state has no visible way to continue.")
    : { decision: "approve", observations: [] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  const buildFile = path.join(draft, "candidate-build-v3.json");
  const build = JSON.parse(fs.readFileSync(buildFile, "utf8"));
  const artifact = build.artifacts.find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const inputHash = artifact.htmlHash;
  const attemptDir = path.join(draft, "provider-diagnostics", "visual-repair-v3", "activity-1", inputHash.slice(0, 12));
  fs.mkdirSync(attemptDir, { recursive: true });
  fs.writeFileSync(path.join(attemptDir, "activity-1-visual-original.html"), fs.readFileSync(artifact.htmlPath));
  fs.appendFileSync(artifact.htmlPath, "<!-- provider completed before crash -->");
  const outputHash = createHash("sha256").update(fs.readFileSync(artifact.htmlPath)).digest("hex");
  const reportsFile = path.join(draft, "browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  reports["activity-1"] = {
    passed: true,
    failures: [],
    screenshots: ["lab.png"],
    htmlHash: outputHash,
    verifierVersion: 10,
    verification: { runtime: true, scoring: true, contracts: true },
  };
  fs.writeFileSync(reportsFile, JSON.stringify(reports));
  const attemptFile = path.join(attemptDir, "activity-1-visual-repair-attempt.json");
  fs.writeFileSync(attemptFile, JSON.stringify({
    version: 1,
    gateVersion: 3,
    nodeId: "activity-1",
    inputHtmlHash: inputHash,
    outputHtmlHash: outputHash,
    failures: ["child_visual_review:The completion state has no visible way to continue."],
    status: "provider_completed",
  }));
  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  expect(generateDirectArtifacts).toHaveBeenCalledTimes(2);
  expect(getMathGenerationStatus(childId, homeworkId, { rootDir })?.phase).toBe("board_ready");
  expect(JSON.parse(fs.readFileSync(attemptFile, "utf8"))).toMatchObject({ status: "verified", inputHtmlHash: inputHash });
  const published = JSON.parse(fs.readFileSync(buildFile, "utf8")).artifacts
    .find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const binding = getLearningCycle(childId, homeworkId, { rootDir })?.nodes
    .find(node => node.nodeId === "activity-1")?.artifactBinding;
  expect(binding?.creativeProvenance?.generatedHtmlHash).toBe(published.htmlHash);
  expect(binding?.validationProof?.htmlHash).toBe(published.htmlHash);
});

it("restores an original proof matching the original bytes when resumed repair publication fails", async () => {
  const draft = path.join(rootDir, "src/context", childId, "homework/direct-drafts", homeworkId);
  vi.mocked(judgeChildFacingScreens).mockImplementation(async ({ auditFile }) => auditFile?.includes("activity-1")
    ? citedVisualReject("The completion state has no visible way to continue.")
    : { decision: "approve", observations: [] });
  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  const buildFile = path.join(draft, "candidate-build-v3.json");
  const build = JSON.parse(fs.readFileSync(buildFile, "utf8"));
  const artifact = build.artifacts.find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const inputHash = artifact.htmlHash;
  const originalHtml = fs.readFileSync(artifact.htmlPath, "utf8");
  const reportsFile = path.join(draft, "browser-verification.json");
  const reports = JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  const originalReport = structuredClone(reports["activity-1"]);
  const attemptDir = path.join(draft, "provider-diagnostics", "visual-repair-v3", "activity-1", inputHash.slice(0, 12));
  fs.mkdirSync(attemptDir, { recursive: true });
  fs.writeFileSync(path.join(attemptDir, "activity-1-visual-original.html"), originalHtml);
  fs.appendFileSync(artifact.htmlPath, "<!-- provider completed before crash -->");
  const outputHash = createHash("sha256").update(fs.readFileSync(artifact.htmlPath)).digest("hex");
  reports["activity-1"] = {
    passed: true,
    failures: [],
    screenshots: ["lab.png"],
    htmlHash: outputHash,
    verifierVersion: 10,
    verification: { runtime: true, scoring: true, contracts: true },
  };
  fs.writeFileSync(reportsFile, JSON.stringify(reports));
  const attemptFile = path.join(attemptDir, "activity-1-visual-repair-attempt.json");
  fs.writeFileSync(attemptFile, JSON.stringify({
    version: 1,
    gateVersion: 3,
    nodeId: "activity-1",
    inputHtmlHash: inputHash,
    outputHtmlHash: outputHash,
    failures: originalReport.failures,
    status: "provider_completed",
  }));
  const cycleFile = path.join(rootDir, "src/context", childId, "homework/cycles", `${homeworkId}.json`);
  const cycle = JSON.parse(fs.readFileSync(cycleFile, "utf8"));
  const activityOne = cycle.nodes.find((node: { nodeId: string }) => node.nodeId === "activity-1");
  const activityTwo = cycle.nodes.find((node: { nodeId: string }) => node.nodeId === "activity-2");
  activityOne.state = "completed";
  activityOne.artifactBinding = structuredClone(activityTwo.artifactBinding);
  fs.writeFileSync(cycleFile, JSON.stringify(cycle));
  vi.mocked(judgeChildFacingScreens).mockResolvedValue({ decision: "approve", observations: [] });

  await runAdaptiveMathGeneration(childId, homeworkId, rootDir);

  const restoredBuild = JSON.parse(fs.readFileSync(buildFile, "utf8"));
  const restoredArtifact = restoredBuild.artifacts.find((candidate: { nodeId: string }) => candidate.nodeId === "activity-1");
  const restoredReport = JSON.parse(fs.readFileSync(reportsFile, "utf8"))["activity-1"];
  expect(restoredArtifact.htmlHash).toBe(inputHash);
  expect(createHash("sha256").update(fs.readFileSync(artifact.htmlPath)).digest("hex")).toBe(inputHash);
  expect(restoredReport).toMatchObject({ htmlHash: inputHash, passed: false, failures: originalReport.failures });
  expect(JSON.parse(fs.readFileSync(attemptFile, "utf8"))).toMatchObject({ status: "failed" });
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
  expect(source).toContain('const rawPlannerResponseFile = path.join(draft, "provider-diagnostics", "targeted-planner-response.json")');
  expect(source).toContain("rawResponseFile: rawPlannerResponseFile");
});
