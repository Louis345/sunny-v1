import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSIGNMENT_PLANNER_TOOL_NAME, assignmentPlannerToolJsonSchema, attachSpellingDiscoveryEvidence, buildAssignmentPlanningPacket, planAssignmentFromSourceWithTelemetry, resolveAssignmentPlannerModel } from "../engine/assignmentPlanner";
import { completeDiscoveryEvaluation, getMathGenerationStatus, hashDiscoveryContract, hasReceivedMathProviderStage, resolveAdaptiveMathDraftDir, runMathProviderStage, setMathGenerationPhase } from "../engine/adaptiveMathDiscovery";
import { readAssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import { getLearningCycle } from "../engine/learningCycleRepository";
import { recordSpellingDiscoveryAttempt } from "../engine/learningCycleRuntime";
import { getChildChart } from "../profiles/childChart";
import { generateBoardNodeImages } from "../engine/boardNodeImageGenerator";
import { runSpellingDiscoveryIntake } from "./ingestHomework";
import { runAdaptiveMathGeneration } from "./runAdaptiveMathGeneration";
import { recordedSpellingPlan, seedSpellingLab } from "./fixtures/spellingEvidenceFirst";

const transport = vi.hoisted(() => ({ create: vi.fn(), clients: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {
  messages = { create: transport.create };
  constructor(options: unknown) { transport.clients(options); }
} }));
vi.mock("../engine/boardNodeImageGenerator", () => ({ generateBoardNodeImages: vi.fn(async ({ plan }) => ({ plan })) }));

let rootDir: string;
beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-planner-raw-receipt-"));
  vi.stubEnv("SUNNY_CONTEXT_ROOT", path.join(rootDir, "src/context"));
  vi.stubEnv("ANTHROPIC_API_KEY", "recorded-transport-only");
  vi.stubGlobal("fetch", () => { throw new Error("test_forbids_network"); });
  transport.create.mockReset(); transport.clients.mockClear();
  vi.mocked(generateBoardNodeImages).mockClear();
});

describe("Planner-authored spelling node titles survive the real parser", () => {
  it("publishes a normal multi-node program with distinct authored titles and resumes from raw receipt", async () => {
    const f = await fixture(); transport.create.mockResolvedValue(structuredClone(f.message));
    const before = getLearningCycle(f.childId, f.homeworkId, f)!;
    await f.worker();
    const cycle = getLearningCycle(f.childId, f.homeworkId, f)!;
    expect(cycle.nodes.filter(node => node.role !== "evaluation").map(node => ({ id: node.nodeId, title: node.title }))).toEqual([
      // The saved Planner response still contains a Quest placeholder; contract 21 keeps it off the board.
      { id: "practice", title: "Word workshop" }, { id: "check", title: "Recall check" },
    ]);
    expect(cycle.observations).toEqual(before.observations);
    expect(cycle.academicPredictions).toHaveLength(2);
    expect(getMathGenerationStatus(f.childId, f.homeworkId, f)?.phase).toBe("board_ready");
    const checkpoint = path.join(f.draftDir, "spelling-targeted-response.json");
    const saved = fs.readFileSync(checkpoint, "utf8"); fs.rmSync(checkpoint);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await f.worker();
    expect(fs.readFileSync(checkpoint, "utf8")).toBe(saved);
    expect(getLearningCycle(f.childId, f.homeworkId, f)!.academicPredictions).toEqual(cycle.academicPredictions);
    expect(transport.create).toHaveBeenCalledOnce();
  });

  it.each([
    "spelling_board_presentation_missing_nodes:shared-check",
    "spelling_board_publication_rejected:choice_experiment_metadata_missing:shared-check-options",
  ])("revalidates a saved board after local publication failure %s without another Planner call", async (savedError) => {
    const f = await fixture();
    transport.create.mockResolvedValue(structuredClone(f.message));
    await f.worker();
    const savedResponse = fs.readFileSync(path.join(f.draftDir, "spelling-targeted-response.json"), "utf8");
    const jobFile = path.join(f.draftDir, "adaptive-generation-job.json");
    const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
    job.phase = "needs_attention";
    job.error = savedError;
    job.nodes = job.nodes.map((node: Record<string, unknown>) => ({
      ...node,
      status: node.status === "evidence_locked" ? "evidence_locked" : "preparing",
    }));
    fs.writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`, "utf8");

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await f.worker();

    expect(getMathGenerationStatus(f.childId, f.homeworkId, f)?.phase).toBe("board_ready");
    expect(fs.readFileSync(path.join(f.draftDir, "spelling-targeted-response.json"), "utf8")).toBe(savedResponse);
    expect(transport.create).toHaveBeenCalledOnce();
  });

  it("requires an authored title in the targeted spelling tool contract but preserves legacy optional titles", async () => {
    const f = await fixture();
    const schema = assignmentPlannerToolJsonSchema(true, f.packet.activityCatalog) as any;
    const node = schema.properties.activeSessionPlan.properties.nodePlan.items;
    expect(node.properties.title).toMatchObject({ type: "string", minLength: 1 });
    expect(node.required).toContain("title");
    expect(node.properties.activityId.enum).toEqual(f.packet.activityCatalog.filter(card => card.launchable).map(card => card.activityId));
    const legacy = assignmentPlannerToolJsonSchema(false) as any;
    expect(legacy.properties.activeSessionPlan.properties.nodePlan.items.required).not.toContain("title");
    expect(legacy.properties.activeSessionPlan.properties.nodePlan.items.properties.title).toBeUndefined();
  });

  it("rejects a missing targeted title locally without losing the raw message or buying another response", async () => {
    const f = await fixture();
    delete f.message.content[1].input!.activeSessionPlan.nodePlan[0].title;
    transport.create.mockResolvedValue(structuredClone(f.message));
    await expect(f.run()).rejects.toThrow("Node practice is missing its Planner-authored title");
    expect(f.readReceipt()).toMatchObject({ status: "received", response: { message: f.message } });
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(f.run()).rejects.toThrow("Node practice is missing its Planner-authored title");
    expect(transport.create).toHaveBeenCalledOnce();
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(rootDir, { recursive: true, force: true }); });

async function fixture() {
  const childId = "lab-child", sourceFile = seedSpellingLab(rootDir);
  const { homeworkId } = await runSpellingDiscoveryIntake({ rootDir, childId, sourceFile }, {
    callPlannerModel: async (packet: Parameters<typeof recordedSpellingDiagnostic>[0]) => ({ draft: { diagnostic: recordedSpellingDiagnostic(packet), title: "Recorded school words", words: ["night", "light"].map(word => ({ word, pageNumber: 1 })), uncertainty: [] } }),
  });
  const scope = { rootDir, childId, homeworkId };
  const opening = getLearningCycle(childId, homeworkId, scope)!;
  Object.values(opening.nodes[0].evidenceContract.spellingItems!).forEach((item, index) => recordSpellingDiscoveryAttempt({ childId, homeworkId,
    attempt: { attemptId: `observed-${index}`, itemId: item.id, attemptedValue: index ? "lite" : item.word, observedAt: "2026-09-09T10:00:00Z" },
    support: { status: "unassisted", scaffolds: [] },
  }, scope));
  completeDiscoveryEvaluation({ ...scope, completedAt: "2026-09-09T10:01:00Z" });
  const draftDir = resolveAdaptiveMathDraftDir(childId, homeworkId, scope);
  const chart = getChildChart(childId, scope);
  const packet = attachSpellingDiscoveryEvidence(buildAssignmentPlanningPacket({ childId, childChart: chart, extraction: readAssignmentSourceExtraction(path.join(draftDir, "assignment-extraction.json")) }), chart);
  fs.writeFileSync(path.join(draftDir, "spelling-targeted-request.json"), JSON.stringify(packet));
  const output = JSON.parse(JSON.stringify(recordedSpellingPlan(packet, rootDir))) as ReturnType<typeof recordedSpellingPlan>;
  const rawDraft = structuredClone(output);
  delete rawDraft.activeSessionPlan.learningRoutes;
  const message = { id: "recorded-message-identity", type: "message", role: "assistant", model: resolveAssignmentPlannerModel(), stop_reason: "tool_use", stop_sequence: null,
    content: [{ type: "text", text: "Recorded test response, not live inference." }, { type: "tool_use", id: "recorded-tool-identity", name: ASSIGNMENT_PLANNER_TOOL_NAME, input: rawDraft }],
    usage: { input_tokens: 123, output_tokens: 45, cache_read_input_tokens: 6, cache_creation_input_tokens: 7 },
  };
  const providerReceipt = { draftDir, stage: "spelling-targeted-planner" };
  const receiptFile = path.join(draftDir, "provider-receipts", `${hashDiscoveryContract({ provider: "anthropic", request: packet })}.json`);
  const readReceipt = () => JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  const run = () => planAssignmentFromSourceWithTelemetry(packet, { providerReceipt });
  const worker = () => runAdaptiveMathGeneration(childId, homeworkId, rootDir);
  return { ...scope, packet, output, message, providerReceipt, receiptFile, readReceipt, run, worker, draftDir };
}

// The live run received a response but the outer validated-result receipt never
// saved it. Higher-level Planner mocks bypassed the failing parser/validator.
describe("spelling Planner raw-response durability", () => {
  it("asks the same Planner to restore a missing measurement before the cycle builder sees the plan", async () => {
    // Human catch: the live Planner added a Visual Explainer node without its
    // matching measurement. The prompt described the rule, but the relationship
    // validator checked only measurements that happened to exist. The provider
    // logs therefore looked successful until the later cycle builder stopped.
    const f = await fixture();
    const missingMeasurement = structuredClone(f.message);
    missingMeasurement.id = "recorded-missing-measurement";
    missingMeasurement.content[1].input!.plannedMeasurements =
      missingMeasurement.content[1].input!.plannedMeasurements.filter(
        (measurement) => measurement.id !== "measure-practice",
      );
    const corrected = structuredClone(f.message);
    corrected.id = "recorded-missing-measurement-correction";
    transport.create
      .mockResolvedValueOnce(missingMeasurement)
      .mockResolvedValueOnce(corrected);

    const result = await f.run();

    expect(result.output.plannedMeasurements.some((measurement) => measurement.id === "measure-practice")).toBe(true);
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("planner_missing_measurement");
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("measure-practice");
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-2-missing-measurement")).toBe(true);
  });

  it("permits one measurement-only follow-up when an older generic correction still omitted a node measurement", async () => {
    // Live migration invariant: Reina's original response needed the existing
    // generic correction, whose saved result still omitted the Visual Explainer
    // measurement. Preserve both receipts and allow exactly one newer,
    // measurement-only correction rather than regenerating the plan.
    const f = await fixture();
    const genericInvalid = structuredClone(f.message);
    genericInvalid.id = "recorded-generic-invalid";
    genericInvalid.content[1].input!.plannedMeasurements[0].spelling!.evidenceIds = ["invented-evidence-id"];
    const correctedButMissing = structuredClone(f.message);
    correctedButMissing.id = "recorded-corrected-but-missing";
    correctedButMissing.content[1].input!.plannedMeasurements =
      correctedButMissing.content[1].input!.plannedMeasurements.filter(
        (measurement) => measurement.id !== "measure-practice",
      );
    const finalCorrection = structuredClone(f.message);
    finalCorrection.id = "recorded-final-measurement-correction";
    transport.create
      .mockResolvedValueOnce(genericInvalid)
      .mockResolvedValueOnce(correctedButMissing)
      .mockResolvedValueOnce(finalCorrection);

    const result = await f.run();

    expect(result.output.plannedMeasurements.some((measurement) => measurement.id === "measure-practice")).toBe(true);
    expect(transport.create).toHaveBeenCalledTimes(3);
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-1")).toBe(true);
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-2-missing-measurement")).toBe(true);
    expect(JSON.stringify(transport.create.mock.calls[2]?.[0])).toContain("planner_missing_measurement");
  });

  it("asks the same Planner once to correct invalid targeted tool input, then reuses both paid receipts", async () => {
    const f = await fixture();
    const invalid = structuredClone(f.message);
    invalid.content[1].input!.plannedMeasurements[0].spelling!.evidenceIds = ["invented-evidence-id"];
    invalid.content[1].input!.plannedMeasurements.at(-1)!.spelling!.evidenceIds = [];
    invalid.content[1].input!.plannedMeasurements[0].spelling!.interventionNodeIds = ["check"];
    const corrected = structuredClone(f.message);
    corrected.id = "recorded-schema-correction";
    transport.create
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(corrected);

    const first = await f.run();
    expect(first.output.plannedMeasurements[0].spelling?.evidenceIds).toEqual(["observed-0", "observed-1"]);
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("planner_baseline_intervention_lineage_invalid");
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("planner_unknown_evidence_id");
    expect(f.readReceipt()).toMatchObject({ status: "received", response: { message: invalid } });
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-1")).toBe(true);

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const resumed = await f.run();
    expect(resumed.output).toEqual(first.output);
    expect(transport.create).toHaveBeenCalledTimes(2);
  });

  it("corrects an invented spelling target before the cycle builder rejects the board", async () => {
    // Human catch: the rebuilt Ila board used `reward` as the target of a
    // mystery break. The assignment contains no such spelling word, but the
    // Planner relationship gate checked evidence lineage without checking node
    // targets, so the paid correction completed before the cycle builder found
    // the defect.
    const f = await fixture();
    const inventedTarget = structuredClone(f.message);
    inventedTarget.id = "recorded-invented-target";
    inventedTarget.content[1].input!.activeSessionPlan.nodePlan[0].targets = ["reward"];
    const corrected = structuredClone(f.message);
    corrected.id = "recorded-invented-target-correction";
    transport.create
      .mockResolvedValueOnce(inventedTarget)
      .mockResolvedValueOnce(corrected);

    const result = await f.run();

    expect(result.output.activeSessionPlan.nodePlan[0].targets)
      .toEqual(f.output.activeSessionPlan.nodePlan[0].targets);
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("planner_unknown_spelling_target");
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("reward");
  });

  it("repairs one schema-invalid targeted Planner correction with one final bounded request", async () => {
    const f = await fixture();
    const invalid = structuredClone(f.message);
    invalid.content[1].input!.plannedMeasurements[0].spelling!.evidenceIds = [];
    const stillInvalid = structuredClone(invalid);
    stillInvalid.id = "recorded-invalid-schema-correction";
    const repaired = structuredClone(f.message);
    repaired.id = "recorded-repaired-schema-correction";
    transport.create
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(stillInvalid)
      .mockResolvedValueOnce(repaired);

    await expect(f.run()).rejects.toThrow("word_radar_capability_mismatch");
    expect(transport.create).toHaveBeenCalledTimes(3);
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-1")).toBe(true);
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-3-schema")).toBe(true);
  });

  it("stops after the final bounded schema correction remains invalid", async () => {
    const f = await fixture();
    const invalid = structuredClone(f.message);
    invalid.content[1].input!.plannedMeasurements[0].spelling!.evidenceIds = [];
    const stillInvalid = structuredClone(invalid);
    stillInvalid.id = "recorded-still-invalid-schema-correction";
    const finalInvalid = structuredClone(invalid);
    finalInvalid.id = "recorded-final-invalid-schema-correction";
    transport.create
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(stillInvalid)
      .mockResolvedValueOnce(finalInvalid);

    await expect(f.run()).rejects.toThrow("assignment_planner_tool_invalid");
    expect(transport.create).toHaveBeenCalledTimes(3);
  });

  it("corrects a schema-valid checkpoint-before-intervention plan once before checkpointing it", async () => {
    const f = await fixture();
    const relationshipInvalid = structuredClone(f.message);
    relationshipInvalid.id = "recorded-relationship-invalid";
    relationshipInvalid.content[1].input!.plannedMeasurements[1].spelling!.interventionNodeIds = ["quest"];
    const corrected = structuredClone(f.message);
    corrected.id = "recorded-relationship-correction";
    transport.create
      .mockResolvedValueOnce(relationshipInvalid)
      .mockResolvedValueOnce(corrected);

    await f.worker();
    expect(getMathGenerationStatus(f.childId, f.homeworkId, f)?.phase).toBe("board_ready");
    expect(fs.existsSync(path.join(f.draftDir, "spelling-targeted-response.json"))).toBe(true);
    expect(f.readReceipt()).toMatchObject({ status: "received", response: { message: relationshipInvalid } });
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-1")).toBe(true);
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(transport.create.mock.calls[1]?.[0])).toContain("planner_checkpoint_intervention_not_prior");

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await f.worker();
    expect(transport.create).toHaveBeenCalledTimes(2);
  });

  it("stops after one relationship-invalid correction without saving a targeted checkpoint", async () => {
    const f = await fixture();
    const invalid = structuredClone(f.message);
    invalid.id = "recorded-relationship-invalid";
    invalid.content[1].input!.plannedMeasurements[1].spelling!.interventionNodeIds = ["quest"];
    const stillInvalid = structuredClone(invalid);
    stillInvalid.id = "recorded-relationship-invalid-correction";
    transport.create
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(stillInvalid);

    await expect(f.run()).rejects.toThrow("assignment_planner_relationship_invalid");
    expect(transport.create).toHaveBeenCalledTimes(2);
    expect(hasReceivedMathProviderStage(f.draftDir, "spelling-targeted-planner-tool-correction-v3-1")).toBe(true);
    expect(fs.existsSync(path.join(f.draftDir, "spelling-targeted-response.json"))).toBe(false);
  });

  it.each(["missing tool", "unknown activity", "renderer mismatch"])("saves the entire received message before %s rejection and revalidates without a call", async failure => {
    const f = await fixture();
    if (failure === "missing tool") f.message.content = [f.message.content[0]];
    if (failure === "unknown activity") f.message.content[1].input!.activeSessionPlan.nodePlan[0].activityId = "clock-game";
    if (failure === "renderer mismatch") f.message.content[1].input!.activeSessionPlan.nodePlan[0].type = "wordle";
    transport.create.mockResolvedValue(structuredClone(f.message));
    const before = getLearningCycle(f.childId, f.homeworkId, f);
    const error = await f.run().catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("provider_outcome_uncertain");
    if (failure === "unknown activity") expect(String(error)).toContain("Node practice references unknown activity clock-game");
    if (failure === "renderer mismatch") expect(String(error)).toContain("Node practice activity word-radar cannot launch renderer wordle");
    expect(f.readReceipt()).toMatchObject({ status: "received", response: { message: f.message } });
    const bytes = fs.readFileSync(f.receiptFile, "utf8");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(f.run()).rejects.toThrow((error as Error).message);
    expect(transport.create).toHaveBeenCalledOnce();
    expect(fs.readFileSync(f.receiptFile, "utf8")).toBe(bytes);
    expect(getLearningCycle(f.childId, f.homeworkId, f)).toEqual(before);
  });

  it("records a deterministic worker validation failure, keeps facts, and supports explicit local revalidation", async () => {
    const f = await fixture();
    f.message.content[1].input!.activeSessionPlan.nodePlan[0].activityId = "clock-game";
    transport.create.mockResolvedValue(structuredClone(f.message));
    const before = getLearningCycle(f.childId, f.homeworkId, f)!;
    await expect(f.worker()).rejects.toThrow("assignment_planner_validation_failed:unknown_activity_id");
    expect(getMathGenerationStatus(f.childId, f.homeworkId, f)).toMatchObject({ phase: "needs_attention", error: expect.stringContaining("Node practice references unknown activity clock-game") });
    expect(f.readReceipt()).toMatchObject({ status: "received", response: { message: f.message } });
    expect(generateBoardNodeImages).not.toHaveBeenCalled();
    expect(getLearningCycle(f.childId, f.homeworkId, f)!.observations).toEqual(before.observations);
    expect(getLearningCycle(f.childId, f.homeworkId, f)!.academicPredictions).toEqual(before.academicPredictions);
    await f.worker(); // needs_attention is not an automatic retry loop.
    setMathGenerationPhase({ ...f, phase: "targeted_planning" }); // Explicit test-only operational resume.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(f.worker()).rejects.toThrow("assignment_planner_validation_failed:unknown_activity_id");
    expect(transport.create).toHaveBeenCalledOnce();
  });

  it("resumes from raw receipt after the derived checkpoint is lost, preserving usage and frozen results", async () => {
    const f = await fixture();
    // Keep the intervention and its checkpoint together: a clean miss may not
    // be rechecked without first being addressed by the saved plan.
    transport.create.mockResolvedValue(structuredClone(f.message));
    await f.worker();
    const checkpoint = path.join(f.draftDir, "spelling-targeted-response.json");
    const original = fs.readFileSync(checkpoint, "utf8");
    const saved = JSON.parse(original);
    expect(saved.result.telemetry.usage).toMatchObject({ inputTokens: 123, outputTokens: 45, totalTokens: 168 });
    expect(f.readReceipt()).toMatchObject({ status: "received", response: { message: f.message } });
    const cycle = getLearningCycle(f.childId, f.homeworkId, f)!;
    fs.rmSync(checkpoint);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await f.worker();
    expect(fs.readFileSync(checkpoint, "utf8")).toBe(original);
    expect(transport.create).toHaveBeenCalledOnce();
    expect(transport.clients).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    expect(getLearningCycle(f.childId, f.homeworkId, f)!.observations).toEqual(cycle.observations);
    expect(getLearningCycle(f.childId, f.homeworkId, f)!.academicPredictions).toEqual(cycle.academicPredictions);
    expect(getMathGenerationStatus(f.childId, f.homeworkId, f)?.phase).toBe("board_ready");
  });

  it.each(["provider receipt", "validated checkpoint"])("preserves an existing completed legacy %s without provider work", async kind => {
    const f = await fixture();
    const result = { output: f.output, telemetry: { model: "recorded-legacy", latencyMs: 17 } };
    const createdAt = "2026-09-09T10:02:00.000Z";
    const checkpoint = path.join(f.draftDir, "spelling-targeted-response.json");
    if (kind === "provider receipt") await runMathProviderStage({ ...f.providerReceipt, model: resolveAssignmentPlannerModel(), request: f.packet, execute: async () => ({ result, createdAt }) });
    else fs.writeFileSync(checkpoint, JSON.stringify({ result, createdAt, requestHash: hashDiscoveryContract(f.packet), outputHash: hashDiscoveryContract(result) }));
    const preservedFile = kind === "provider receipt" ? f.receiptFile : checkpoint;
    const original = fs.readFileSync(preservedFile, "utf8");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await f.worker();
    expect(transport.create).not.toHaveBeenCalled();
    expect(fs.readFileSync(preservedFile, "utf8")).toBe(original);
    expect(JSON.parse(fs.readFileSync(checkpoint, "utf8"))).toMatchObject({ createdAt, result });
    expect(getMathGenerationStatus(f.childId, f.homeworkId, f)?.phase).toBe("board_ready");
  });

  it("never silently retries an existing in-flight receipt", async () => {
    const f = await fixture();
    await expect(runMathProviderStage({ ...f.providerReceipt, model: resolveAssignmentPlannerModel(), request: f.packet, execute: async () => { throw new Error("recorded_connection_lost"); } })).rejects.toThrow("provider_outcome_uncertain");
    const original = fs.readFileSync(f.receiptFile, "utf8");
    await expect(f.run()).rejects.toThrow("provider_outcome_uncertain");
    expect(transport.create).not.toHaveBeenCalled();
    expect(fs.readFileSync(f.receiptFile, "utf8")).toBe(original);
  });

  it("records transport uncertainty and makes no second request", async () => {
    const f = await fixture(); transport.create.mockRejectedValue(new Error("recorded_connection_lost"));
    await expect(f.run()).rejects.toThrow("provider_outcome_uncertain");
    expect(f.readReceipt().status).toBe("outcome_uncertain");
    await expect(f.run()).rejects.toThrow("provider_outcome_uncertain");
    expect(transport.create).toHaveBeenCalledOnce();
  });
});
import { recordedSpellingDiagnostic } from "./fixtures/spellingEvidenceFirst";
