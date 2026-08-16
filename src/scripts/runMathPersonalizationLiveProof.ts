import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  designAdaptiveProgressionExperience,
  generateAdaptiveProgressionActivityHtml,
  type ExperienceDesignArtifactV1,
} from "../engine/directMathExperience";
import {
  createLearningCycle,
  getLearningCycle,
  transitionLearningCycle,
  type CreateLearningCycleInput,
  type LearningCycleArtifactBinding,
  type LearningCycleNodeContract,
  type LearningCycleRecordV2,
} from "../engine/learningCycleRepository";
import {
  advanceCanonicalCycleFromEvidence,
  baselineQuestEvidenceEligibility,
  recordCanonicalNodeCompletion,
} from "../engine/learningCycleRuntime";

export const PERSONALIZATION_MAX_CALLS = 18;
// Eighteen successful calls plus at most nine zero-usage transport or billing
// failures. The successful-call and dollar caps remain independently binding.
export const PERSONALIZATION_MAX_ATTEMPTS = 27;
export const PERSONALIZATION_MAX_COST_USD = 12;
export const PERSONALIZATION_PROOF_CYCLE_CONTRACT_VERSION = 2;

type AcademicResult = {
  completed: true;
  accuracy: 1;
  targets: Array<{ target: string; attemptedValue: string }>;
};

type EngagementHistory = {
  funRating: number;
  replay: boolean;
  timeSpentMs: number;
  frustrationSignals: string[];
  postActivityAction: "back_to_map" | "replay_same";
  factualSummary: string;
};

export type PersonalizationBranchDefinition = {
  id: "visual-construction" | "fast-challenge" | "negative-uncertain";
  label: string;
  academicResult: AcademicResult;
  engagement: EngagementHistory;
};

const SHARED_ACADEMIC_RESULT: AcademicResult = {
  completed: true,
  accuracy: 1,
  targets: [
    { target: "math.multiplication.equal_groups", attemptedValue: "6 groups of 4 = 24" },
    { target: "math.multiplication.missing_factor", attemptedValue: "7" },
    { target: "math.multiplication.word_problem_interpretation", attemptedValue: "5 × 6 = 30" },
  ],
};

export const PERSONALIZATION_BRANCHES: PersonalizationBranchDefinition[] = [
  {
    id: "visual-construction",
    label: "Visual construction evidence",
    academicResult: structuredClone(SHARED_ACADEMIC_RESULT),
    engagement: {
      funRating: 5,
      replay: true,
      timeSpentMs: 96_000,
      frustrationSignals: [],
      postActivityAction: "replay_same",
      factualSummary: "Completed a construction/manipulation experience, explicitly rated it 5/5, and requested one replay.",
    },
  },
  {
    id: "fast-challenge",
    label: "Fast challenge evidence",
    academicResult: structuredClone(SHARED_ACADEMIC_RESULT),
    engagement: {
      funRating: 5,
      replay: false,
      timeSpentMs: 43_000,
      frustrationSignals: [],
      postActivityAction: "back_to_map",
      factualSummary: "Completed a paced challenge quickly, explicitly rated it 5/5, and returned to the map without replay.",
    },
  },
  {
    id: "negative-uncertain",
    label: "Negative or uncertain evidence",
    academicResult: structuredClone(SHARED_ACADEMIC_RESULT),
    engagement: {
      funRating: 1,
      replay: false,
      timeSpentMs: 142_000,
      frustrationSignals: ["confusion", "hesitation"],
      postActivityAction: "back_to_map",
      factualSummary: "Completed with correct unassisted mathematics, explicitly rated it 1/5, did not replay, and showed confusion and hesitation.",
    },
  },
];

type UsageRecord = {
  attempt: number;
  branchId: string;
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
  status: "complete" | "failed";
  error?: string;
};

type BranchResult = {
  id: string;
  label: string;
  startingHash: string;
  academicHash: string;
  questUsable: boolean;
  bossUsable: boolean;
  questDesign: ExperienceDesignArtifactV1;
  bossDesign: ExperienceDesignArtifactV1;
  questPath: string;
  bossPath: string;
  evidenceIds: string[];
  plannerDecisionIds: string[];
};

type ComparableBranch = Pick<BranchResult, "id" | "startingHash" | "academicHash" | "questUsable" | "bossUsable" | "questDesign" | "bossDesign">;

const STRUCTURAL_DESIGN_FIELDS = [
  "firstAction",
  "interactionDemonstration",
  "coreInteraction",
  "mathAsPower",
  "stakes",
  "consequences",
  "recovery",
  "progression",
  "interactionContinuity",
  "worldReaction",
  "payoff",
  "replayVariation",
  "motionDirection",
] as const;

function normalized(value: unknown): string {
  return JSON.stringify(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function compareDesignArtifacts(left: Record<string, unknown>, right: Record<string, unknown>): {
  meaningfullyDifferent: boolean;
  structuralDifferences: string[];
} {
  const structuralDifferences = STRUCTURAL_DESIGN_FIELDS.filter((field) => normalized(left[field]) !== normalized(right[field]));
  return { meaningfullyDifferent: structuralDifferences.length >= 4, structuralDifferences };
}

export function evaluatePersonalizationProof(input: {
  branches: ComparableBranch[];
  weakHighRatingBlocked: boolean;
  realChildDataChanged: boolean;
}): { status: "PASS" | "FAIL"; reasons: string[]; comparisons: Array<{ role: "quest" | "boss"; left: string; right: string; structuralDifferences: string[] }> } {
  const reasons: string[] = [];
  if (input.branches.length !== 3) reasons.push("three_branches_required");
  if (new Set(input.branches.map((branch) => branch.startingHash)).size !== 1) reasons.push("starting_hashes_differ");
  if (new Set(input.branches.map((branch) => branch.academicHash)).size !== 1) reasons.push("academic_truth_differed");
  if (input.branches.some((branch) => !branch.questUsable || !branch.bossUsable)) reasons.push("playable_artifact_missing");
  if (!input.weakHighRatingBlocked) reasons.push("high_rating_overrode_weak_academics");
  if (input.realChildDataChanged) reasons.push("real_child_data_changed");

  const comparisons: Array<{ role: "quest" | "boss"; left: string; right: string; structuralDifferences: string[] }> = [];
  for (let leftIndex = 0; leftIndex < input.branches.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < input.branches.length; rightIndex += 1) {
      const left = input.branches[leftIndex]!;
      const right = input.branches[rightIndex]!;
      for (const role of ["quest", "boss"] as const) {
        const comparison = compareDesignArtifacts(left[`${role}Design`], right[`${role}Design`]);
        comparisons.push({ role, left: left.id, right: right.id, structuralDifferences: comparison.structuralDifferences });
        if (!comparison.meaningfullyDifferent) reasons.push(`${role}_not_structurally_different:${left.id}:${right.id}`);
      }
    }
  }
  return { status: reasons.length === 0 ? "PASS" : "FAIL", reasons, comparisons };
}

export function shouldRecordQuestCompletion(lifecycle: string): boolean {
  return lifecycle === "quest_generating" || lifecycle === "quest_ready";
}

export function shouldRecordFinalization(finalizations: Array<{ choiceEventId: string }>, choiceEventId: string): boolean {
  return !finalizations.some((item) => item.choiceEventId === choiceEventId);
}

export function shouldRebuildIsolatedProofCycle(existingVersion: number | undefined): boolean {
  return existingVersion !== PERSONALIZATION_PROOF_CYCLE_CONTRACT_VERSION;
}

export function assertPersonalizationAttemptBudget(attemptCount: number): void {
  if (attemptCount >= PERSONALIZATION_MAX_ATTEMPTS) throw new Error(`personalization_attempt_cap:${attemptCount}`);
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function heldConstantAcademicSignature(cycle: Pick<LearningCycleRecordV2, "assignment" | "academicTheory" | "academicPredictions" | "observations"> | Record<string, any>): string {
  const initialPredictions = (cycle.academicPredictions ?? []).filter((item: { predictionId?: string }) =>
    item.predictionId === "personalization-proof-prediction"
  );
  const observations = (cycle.observations ?? []).map((item: any) => ({
    itemId: item.itemId,
    constructLinks: item.constructLinks,
    result: item.result,
    assistance: item.assistance,
    exposure: item.exposure,
    provenance: item.provenance,
    confounds: item.confounds,
  }));
  return sha256(JSON.stringify({ assignment: cycle.assignment, theory: cycle.academicTheory, predictions: initialPredictions, observations }));
}

function hashTree(root: string): string {
  if (!fs.existsSync(root)) return sha256("missing");
  const hash = crypto.createHash("sha256");
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        hash.update(path.relative(root, file));
        hash.update(fs.readFileSync(file));
      }
    }
  };
  walk(root);
  return hash.digest("hex");
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const inputRate = /fable/i.test(model) ? 6 : /opus/i.test(model) ? 5 : 3;
  const outputRate = /fable/i.test(model) ? 30 : /opus/i.test(model) ? 25 : 15;
  return inputTokens / 1_000_000 * inputRate + outputTokens / 1_000_000 * outputRate;
}

class ProofMeter {
  readonly usage: UsageRecord[] = [];
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly auditDir: string) {
    const usageFile = path.join(auditDir, "usage.json");
    if (fs.existsSync(usageFile)) this.usage.push(...JSON.parse(fs.readFileSync(usageFile, "utf8")) as UsageRecord[]);
  }

  spent(): number {
    return this.usage.reduce((sum, item) => sum + item.costUsd, 0);
  }

  client(branchId: string, label: string): Anthropic {
    const saved = this.savedResponse(branchId, label);
    if (saved) {
      console.log(` 🎮 [personalization-proof] [provider-response] [reused] branch=${branchId} label=${label}`);
      return {
        messages: {
          create: async () => saved,
          stream: () => ({ on: () => undefined, finalMessage: async () => saved }),
        },
      } as unknown as Anthropic;
    }
    return this.liveClient(branchId, label);
  }

  private safe(value: string): string {
    return value.replace(/[^a-z0-9_-]+/gi, "-");
  }

  private savedResponse(branchId: string, label: string): any | null {
    if (!fs.existsSync(this.auditDir)) return null;
    const suffix = `-${this.safe(branchId)}-${this.safe(label)}-response.json`;
    const file = fs.readdirSync(this.auditDir).find((candidate) => candidate.endsWith(suffix));
    return file ? JSON.parse(fs.readFileSync(path.join(this.auditDir, file), "utf8")) : null;
  }

  private begin(branchId: string, label: string, request: Record<string, unknown>) {
    assertPersonalizationAttemptBudget(this.usage.length);
    if (this.usage.filter((item) => item.status === "complete").length >= PERSONALIZATION_MAX_CALLS) throw new Error(`personalization_call_cap:${PERSONALIZATION_MAX_CALLS}`);
    if (this.spent() >= PERSONALIZATION_MAX_COST_USD) throw new Error(`personalization_cost_cap:${this.spent().toFixed(3)}`);
    const attempt = this.usage.length + 1;
    const prefix = `call-${String(attempt).padStart(2, "0")}-${this.safe(branchId)}-${this.safe(label)}`;
    writeJson(path.join(this.auditDir, `${prefix}-request.json`), request);
    return { attempt, prefix, branchId, label, model: String(request.model ?? "unknown"), startedAt: Date.now() };
  }

  private finish(meta: ReturnType<ProofMeter["begin"]>, response: any): void {
    const inputTokens = Number(response?.usage?.input_tokens ?? 0);
    const outputTokens = Number(response?.usage?.output_tokens ?? 0);
    this.usage.push({
      attempt: meta.attempt,
      branchId: meta.branchId,
      label: meta.label,
      model: meta.model,
      inputTokens,
      outputTokens,
      costUsd: estimateCost(meta.model, inputTokens, outputTokens),
      elapsedMs: Date.now() - meta.startedAt,
      status: "complete",
    });
    writeJson(path.join(this.auditDir, `${meta.prefix}-response.json`), response);
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }

  private fail(meta: ReturnType<ProofMeter["begin"]>, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.usage.push({ attempt: meta.attempt, branchId: meta.branchId, label: meta.label, model: meta.model, inputTokens: 0, outputTokens: 0, costUsd: 0, elapsedMs: Date.now() - meta.startedAt, status: "failed", error: message });
    writeJson(path.join(this.auditDir, `${meta.prefix}-error.json`), { error: message });
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }

  private liveClient(branchId: string, label: string): Anthropic {
    return {
      messages: {
        create: async (request: any, options?: any) => {
          const meta = this.begin(branchId, label, request);
          try {
            const response = await this.anthropic.messages.create(request, options);
            this.finish(meta, response);
            return response;
          } catch (error) {
            this.fail(meta, error);
            throw error;
          }
        },
        stream: (request: any, options?: any) => {
          const meta = this.begin(branchId, label, request);
          const stream = this.anthropic.messages.stream(request, options);
          const wrapped = {
            on: (event: string, listener: (...args: any[]) => void) => {
              stream.on(event as never, listener as never);
              return wrapped;
            },
            finalMessage: async () => {
              try {
                const response = await stream.finalMessage();
                this.finish(meta, response);
                return response;
              } catch (error) {
                this.fail(meta, error);
                throw error;
              }
            },
          };
          return wrapped;
        },
      },
    } as unknown as Anthropic;
  }
}

function writeSyntheticChart(rootDir: string): void {
  const childDir = path.join(rootDir, "src/context/personalization-proof-child");
  fs.mkdirSync(childDir, { recursive: true });
  writeJson(path.join(childDir, "child_profile.json"), {
    childId: "personalization-proof-child",
    identity: { displayName: "Lab Learner", ttsName: "Lab Learner" },
    demographics: { age: 9, grade: 3 },
    links: { learningProfile: "learning_profile.json" },
  });
  writeJson(path.join(childDir, "learning_profile.json"), { childId: "personalization-proof-child", rewardPreferences: { preferred: [] } });
}

function node(id: "baseline" | "quest" | "boss", state: "ready" | "locked"): LearningCycleNodeContract {
  const role = id;
  return {
    nodeId: id,
    role,
    title: role === "baseline" ? "Festival Team Challenge" : role === "quest" ? "Quest" : "Boss",
    state,
    academicTarget: { domain: "math", skill: "multiplication transfer", targets: SHARED_ACADEMIC_RESULT.targets.map((item) => item.target) },
    algorithmOwner: role === "baseline" ? "retrieval-practice" : "mastery-gating",
    theoryId: "personalization-proof-theory",
    experimentId: `personalization-${role}`,
    mechanic: "AI-owned",
    theme: "AI-owned",
    openingScreen: { title: role === "baseline" ? "Festival Team Challenge" : role === "quest" ? "Quest" : "Boss", purpose: "Collect fresh evidence." },
    generationPrompt: null,
    artifactBinding: role === "baseline" ? { contentId: "proof-baseline", artifactId: "proof-baseline-artifact", localArtifactPath: "/lab/baseline.html", localArtworkPath: "/lab/baseline.svg", contractFingerprint: "proof-baseline-contract", validationStatus: "passed" } : null,
    artwork: { status: role === "baseline" ? "ready" : "placeholder", localPath: role === "baseline" ? "/lab/baseline.svg" : null, prompt: null },
    sfxContract: ["interaction", "recovery", "progress", "completion"],
    companionContract: { events: ["help_requested"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

function cycleInput(): CreateLearningCycleInput {
  return {
    childId: "personalization-proof-child",
    homeworkId: "hw-personalization-proof",
    domain: "math",
    assignment: {
      title: "Festival Team Challenge",
      contentFingerprint: "personalization-proof-assignment",
      capturedEvidenceIds: ["assignment:personalization-proof"],
      targets: SHARED_ACADEMIC_RESULT.targets.map((item) => item.target),
    },
    academicTheory: {
      theoryId: "personalization-proof-theory",
      revision: 1,
      hypothesis: "The learner can transfer multiplication reasoning to fresh material.",
      supportCriteria: ["Fresh unassisted answers support transfer."],
      reviseCriteria: ["Errors reveal a scoped misconception."],
      falsifyCriteria: ["Repeated fresh independent errors contradict transfer."],
    },
    engagementTheory: null,
    assumptions: [{ assumptionId: "personalization-proof-assumption", claim: "Presentation may influence voluntary continuation.", evidenceIds: ["assignment:personalization-proof"], confidence: 0.3, uncertainty: "No branch evidence has been observed yet.", createdAt: "2026-08-08T12:00:00.000Z", lockedAt: "2026-08-08T12:00:00.000Z" }],
    nodes: [node("baseline", "ready"), node("quest", "locked"), node("boss", "locked")],
    academicPredictions: [{
      predictionId: "personalization-proof-prediction",
      theoryId: "personalization-proof-theory",
      constructId: "math.multiplication.transfer",
      context: "fresh unassisted baseline evidence",
      horizon: "next_session",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 1 },
      predictedErrorPatterns: ["factor-pair overgeneralization"],
      confidence: 0.65,
      evidenceIds: ["assignment:personalization-proof"],
      intervention: "baseline learning program",
      evidenceLimit: "independent_performance",
      createdAt: "2026-08-08T12:00:00.000Z",
      lockedAt: "2026-08-08T12:00:00.000Z",
    }],
  };
}

function cycleFile(rootDir: string): string {
  return path.join(rootDir, "src/context/personalization-proof-child/homework/cycles/hw-personalization-proof.json");
}

function academicHash(cycle: LearningCycleRecordV2): string {
  return heldConstantAcademicSignature(cycle);
}

function isUsableHtml(html: string): boolean {
  return /<!doctype html/i.test(html) && /<html/i.test(html) && /<script/i.test(html) && html.length > 4_000;
}

function finalization(rootDir: string, cycle: LearningCycleRecordV2, nodeId: string, branch: PersonalizationBranchDefinition): LearningCycleRecordV2 {
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
    type: "session_finalized",
    nodeId,
    choiceEventId: `${branch.id}:${nodeId}:rating`,
    engagement: { postActivityAction: branch.engagement.postActivityAction, funRating: branch.engagement.funRating, completed: true, replayRequested: branch.engagement.replay },
  }, { rootDir, now: new Date("2026-08-08T12:05:00.000Z") });
}

function bindArtifact(rootDir: string, cycle: LearningCycleRecordV2, nodeContract: LearningCycleNodeContract, htmlFile: string, design: ExperienceDesignArtifactV1): LearningCycleRecordV2 {
  const artworkFile = path.join(path.dirname(htmlFile), "provenance-placeholder.svg");
  if (!fs.existsSync(artworkFile)) fs.writeFileSync(artworkFile, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#17233b"/></svg>`, "utf8");
  const artifact: LearningCycleArtifactBinding = { contentId: `personalization-proof:${nodeContract.role}`, artifactId: design.artifactId, localArtifactPath: htmlFile, localArtworkPath: artworkFile, contractFingerprint: design.academicContractHash, validationStatus: "passed" };
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, { type: "artifact_bound", nodeId: nodeContract.nodeId, artifact }, { rootDir });
}

async function buildRole(input: { branch: PersonalizationBranchDefinition; role: "quest" | "boss"; rootDir: string; branchDir: string; meter: ProofMeter; architectModel: string; builderModel: string }): Promise<{ design: ExperienceDesignArtifactV1; htmlFile: string; usable: boolean }> {
  let cycle = getLearningCycle("personalization-proof-child", "hw-personalization-proof", { rootDir: input.rootDir })!;
  const nodeContract = cycle.nodes.find((candidate) => candidate.role === input.role);
  if (!nodeContract?.generationPrompt) throw new Error(`${input.branch.id}:${input.role}_generation_prompt_missing`);
  const roleDir = path.join(input.branchDir, input.role);
  fs.mkdirSync(roleDir, { recursive: true });
  const designFile = path.join(roleDir, "design-artifact.json");
  const design = fs.existsSync(designFile)
    ? JSON.parse(fs.readFileSync(designFile, "utf8")) as ExperienceDesignArtifactV1
    : await designAdaptiveProgressionExperience({ cycle, node: nodeContract, childContext: { branchEvidence: input.branch.engagement }, client: input.meter.client(input.branch.id, `${input.role}-design`), model: input.architectModel });
  if (!fs.existsSync(designFile)) writeJson(designFile, design);
  const htmlFile = path.join(roleDir, "experience.html");
  const html = fs.existsSync(htmlFile)
    ? fs.readFileSync(htmlFile, "utf8")
    : await generateAdaptiveProgressionActivityHtml({ cycle, node: nodeContract, childContext: { branchEvidence: input.branch.engagement }, designArtifact: design, client: input.meter.client(input.branch.id, `${input.role}-implementation`), model: input.builderModel, partialHtmlFile: path.join(roleDir, "experience.partial.html") });
  if (!fs.existsSync(htmlFile)) fs.writeFileSync(htmlFile, html, "utf8");
  const usable = isUsableHtml(html);
  if (usable && !nodeContract.artifactBinding) cycle = bindArtifact(input.rootDir, cycle, nodeContract, htmlFile, design);
  return { design, htmlFile, usable };
}

async function runBranch(input: { branch: PersonalizationBranchDefinition; baseRoot: string; outputDir: string; meter: ProofMeter; plannerModel: string; architectModel: string; builderModel: string }): Promise<BranchResult> {
  const branchDir = path.join(input.outputDir, "personalization", input.branch.id);
  const rootDir = path.join(branchDir, "isolated-context");
  const contractFile = path.join(branchDir, "isolated-cycle-contract.json");
  const existingContract = fs.existsSync(contractFile)
    ? JSON.parse(fs.readFileSync(contractFile, "utf8")) as { version?: number }
    : {};
  if (shouldRebuildIsolatedProofCycle(existingContract.version)) {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.cpSync(input.baseRoot, rootDir, { recursive: true });
    writeJson(contractFile, { version: PERSONALIZATION_PROOF_CYCLE_CONTRACT_VERSION });
  } else if (!fs.existsSync(rootDir)) {
    fs.cpSync(input.baseRoot, rootDir, { recursive: true });
  }
  const startingHash = sha256(fs.readFileSync(cycleFile(input.baseRoot)));
  let cycle = getLearningCycle("personalization-proof-child", "hw-personalization-proof", { rootDir })!;

  if (cycle.lifecycle === "baseline_ready") {
    cycle = recordCanonicalNodeCompletion({ childId: cycle.childId, homeworkId: cycle.homeworkId, sessionId: "shared-baseline-session", nodeId: "baseline", result: {
      completed: true,
      accuracy: input.branch.academicResult.accuracy,
      timeSpent_ms: input.branch.engagement.timeSpentMs,
      replay: input.branch.engagement.replay,
      frustrationSignals: input.branch.engagement.frustrationSignals,
      targetResults: input.branch.academicResult.targets.map((target) => ({ ...target, correct: true, scaffoldLevel: 0 })),
    } }, { rootDir, now: new Date("2026-08-08T12:04:00.000Z") })!;
    cycle = finalization(rootDir, cycle, "baseline", input.branch);
  }
  const baselineAcademicHash = academicHash(cycle);
  if (cycle.lifecycle === "baseline_evaluating") {
    cycle = await advanceCanonicalCycleFromEvidence({ childId: cycle.childId, homeworkId: cycle.homeworkId, client: input.meter.client(input.branch.id, "baseline-to-quest-decision"), model: input.plannerModel }, { rootDir });
  }
  if (cycle.lifecycle !== "quest_generating" && cycle.lifecycle !== "quest_ready" && cycle.lifecycle !== "quest_evaluating" && cycle.lifecycle !== "boss_generating" && cycle.lifecycle !== "boss_ready") {
    throw new Error(`${input.branch.id}:planner_did_not_choose_quest:${cycle.lifecycle}`);
  }

  const quest = await buildRole({ ...input, role: "quest", rootDir, branchDir });
  cycle = getLearningCycle(cycle.childId, cycle.homeworkId, { rootDir })!;
  if (shouldRecordQuestCompletion(cycle.lifecycle) && quest.usable) {
    const questNode = cycle.nodes.find((candidate) => candidate.role === "quest")!;
    cycle = recordCanonicalNodeCompletion({ childId: cycle.childId, homeworkId: cycle.homeworkId, sessionId: "shared-quest-session", nodeId: questNode.nodeId, result: {
      completed: true,
      accuracy: 1,
      timeSpent_ms: input.branch.engagement.timeSpentMs,
      replay: input.branch.engagement.replay,
      frustrationSignals: input.branch.engagement.frustrationSignals,
      targetResults: input.branch.academicResult.targets.map((target) => ({ target: `unseen.${target.target}`, attemptedValue: target.attemptedValue, correct: true, scaffoldLevel: 0 })),
    } }, { rootDir, now: new Date("2026-08-08T12:10:00.000Z") })!;
    cycle = finalization(rootDir, cycle, questNode.nodeId, input.branch);
  }
  if (cycle.lifecycle === "quest_evaluating") {
    cycle = await advanceCanonicalCycleFromEvidence({ childId: cycle.childId, homeworkId: cycle.homeworkId, client: input.meter.client(input.branch.id, "quest-to-boss-decision"), model: input.plannerModel }, { rootDir });
  }
  if (cycle.lifecycle !== "boss_generating" && cycle.lifecycle !== "boss_ready") throw new Error(`${input.branch.id}:planner_did_not_choose_boss:${cycle.lifecycle}`);
  const boss = await buildRole({ ...input, role: "boss", rootDir, branchDir });
  cycle = getLearningCycle(cycle.childId, cycle.homeworkId, { rootDir })!;
  writeJson(path.join(branchDir, "factual-events.json"), { engagement: input.branch.engagement, academicResult: input.branch.academicResult, evidence: cycle.evidence, observations: cycle.observations, sessionFinalizations: cycle.sessionFinalizations });
  return {
    id: input.branch.id,
    label: input.branch.label,
    startingHash,
    academicHash: baselineAcademicHash,
    questUsable: quest.usable,
    bossUsable: boss.usable,
    questDesign: quest.design,
    bossDesign: boss.design,
    questPath: path.relative(input.outputDir, quest.htmlFile),
    bossPath: path.relative(input.outputDir, boss.htmlFile),
    evidenceIds: [...cycle.evidence.academic, ...cycle.evidence.engagement].map((item) => item.evidenceId),
    plannerDecisionIds: cycle.decisionHistory.map((item) => item.decisionId),
  };
}

function weakHighRatingBoundary(baseRoot: string, outputDir: string): boolean {
  const rootDir = path.join(outputDir, "audit/weak-high-rating-boundary");
  if (!fs.existsSync(rootDir)) fs.cpSync(baseRoot, rootDir, { recursive: true });
  let cycle = getLearningCycle("personalization-proof-child", "hw-personalization-proof", { rootDir })!;
  cycle = recordCanonicalNodeCompletion({ childId: cycle.childId, homeworkId: cycle.homeworkId, sessionId: "weak-high-rating", nodeId: "baseline", result: { completed: true, accuracy: 0, timeSpent_ms: 60_000, targetResults: SHARED_ACADEMIC_RESULT.targets.map((target) => ({ ...target, correct: false, scaffoldLevel: 0 })) } }, { rootDir, now: new Date("2026-08-08T12:04:00.000Z") })!;
  if (shouldRecordFinalization(cycle.sessionFinalizations, "weak-high-rating:5")) {
    cycle = transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, { type: "session_finalized", nodeId: "baseline", choiceEventId: "weak-high-rating:5", engagement: { postActivityAction: "back_to_map", funRating: 5, completed: true, replayRequested: false } }, { rootDir, now: new Date("2026-08-08T12:05:00.000Z") });
  }
  return !baselineQuestEvidenceEligibility(cycle).eligible;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function reportHtml(summary: any): string {
  const cards = summary.branches.map((branch: BranchResult) => `<section><h2>${escapeHtml(branch.label)}</h2><p><b>Factual history:</b> ${escapeHtml(PERSONALIZATION_BRANCHES.find((item) => item.id === branch.id)?.engagement.factualSummary)}</p><div class="games"><article><h3>Quest</h3><iframe src="${escapeHtml(branch.questPath)}"></iframe></article><article><h3>Boss</h3><iframe src="${escapeHtml(branch.bossPath)}"></iframe></article></div><details><summary>Design artifacts and evidence IDs</summary><pre>${escapeHtml(JSON.stringify({ quest: branch.questDesign, boss: branch.bossDesign, evidenceIds: branch.evidenceIds, plannerDecisionIds: branch.plannerDecisionIds }, null, 2))}</pre></details></section>`).join("");
  const comparisons = summary.comparisons.map((item: any) => `<tr><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.left)} ↔ ${escapeHtml(item.right)}</td><td>${escapeHtml(item.structuralDifferences.join(", "))}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny Quest/Boss personalization proof</title><style>:root{font-family:Inter,system-ui;color:#172033;background:#edf2fb}*{box-sizing:border-box}body{margin:0}.hero{padding:38px;background:linear-gradient(135deg,#111f48,#713fb0);color:white}.wrap{max-width:1500px;margin:auto;padding:24px}section{background:white;border-radius:22px;padding:24px;margin:20px 0;box-shadow:0 10px 30px #17305a18}.status{display:inline-block;border-radius:999px;padding:10px 18px;background:${summary.status === "PASS" ? "#baf1cc;color:#075d33" : "#ffd0d0;color:#8b1d2d"};font-size:28px;font-weight:900}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{padding:14px;border-radius:14px;background:#f3f6fb}.games{display:grid;grid-template-columns:1fr 1fr;gap:18px}iframe{width:100%;height:620px;border:2px solid #cad5e8;border-radius:16px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e7f0}pre{white-space:pre-wrap;word-break:break-word}.note{background:#fff5d8;border-left:5px solid #e9a400;padding:14px}@media(max-width:900px){.games,.metrics{grid-template-columns:1fr}}</style></head><body><header class="hero"><h1>Same mathematics. Three engagement histories.</h1><div class="status">${escapeHtml(summary.status)}</div><p>This is a production Planner → Fable → Opus comparison. Human judgment remains the final taste authority.</p></header><main class="wrap"><section><h2>Thirty-second verdict</h2><div class="metrics"><div class="metric">Identical starting cycle<br><b>${summary.identicalStart ? "Yes" : "No"}</b></div><div class="metric">Academic truth unchanged<br><b>${summary.identicalAcademics ? "Yes" : "No"}</b></div><div class="metric">All Quest/Boss playable<br><b>${summary.allPlayable ? "Yes" : "No"}</b></div><div class="metric">Weak + high rating blocked<br><b>${summary.weakHighRatingBlocked ? "Yes" : "No"}</b></div><div class="metric">Real child data changed<br><b>${summary.realChildDataChanged ? "YES — FAILURE" : "No"}</b></div><div class="metric">Calls<br><b>${summary.usage.filter((item: UsageRecord) => item.status === "complete").length}/${PERSONALIZATION_MAX_CALLS}</b></div><div class="metric">Cost<br><b>$${summary.costUsd.toFixed(2)} / $${PERSONALIZATION_MAX_COST_USD.toFixed(2)}</b></div></div>${summary.reasons.length ? `<p class="note">Mechanical failures: ${escapeHtml(summary.reasons.join(", "))}</p>` : `<p class="note">Mechanical checks passed. You still decide whether the visible differences are genuinely better and child-appropriate.</p>`}</section><section><h2>Structural comparison</h2><table><thead><tr><th>Role</th><th>Branches</th><th>Changed experiential fields</th></tr></thead><tbody>${comparisons}</tbody></table></section>${cards}</main></body></html>`;
}

export async function runMathPersonalizationLiveProof(input: { repoRoot: string; outputDir: string }) {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const baseRoot = path.join(input.outputDir, "audit/base-context");
  if (!fs.existsSync(cycleFile(baseRoot))) {
    writeSyntheticChart(baseRoot);
    createLearningCycle(cycleInput(), { rootDir: baseRoot, now: new Date("2026-08-08T12:00:00.000Z") });
  }
  const realRoots = [path.join(input.repoRoot, "src/context/reina"), path.join(input.repoRoot, "src/context/ila")];
  const realBefore = sha256(realRoots.map(hashTree).join(":"));
  const meter = new ProofMeter(path.join(input.outputDir, "audit/provider"));
  const plannerModel = process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5";
  const architectModel = process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5";
  const builderModel = process.env.SUNNY_QUEST_BOSS_BUILDER_MODEL ?? "claude-opus-5";
  const weakHighRatingBlocked = weakHighRatingBoundary(baseRoot, input.outputDir);
  let branches: BranchResult[] = [];
  let providerError: string | null = null;
  try {
    branches = await Promise.all(PERSONALIZATION_BRANCHES.map((branch) => runBranch({ branch, baseRoot, outputDir: input.outputDir, meter, plannerModel, architectModel, builderModel })));
  } catch (error) {
    providerError = error instanceof Error ? error.message : String(error);
  }
  const realAfter = sha256(realRoots.map(hashTree).join(":"));
  const realChildDataChanged = realBefore !== realAfter;
  const evaluation = branches.length === 3
    ? evaluatePersonalizationProof({ branches, weakHighRatingBlocked, realChildDataChanged })
    : { status: "FAIL" as const, reasons: [providerError ?? "incomplete_branches"], comparisons: [] };
  const status = providerError ? "INCOMPLETE" : evaluation.status;
  const summary = {
    status,
    reasons: evaluation.reasons,
    providerError,
    branches,
    comparisons: evaluation.comparisons,
    identicalStart: branches.length === 3 && new Set(branches.map((branch) => branch.startingHash)).size === 1,
    identicalAcademics: branches.length === 3 && new Set(branches.map((branch) => branch.academicHash)).size === 1,
    allPlayable: branches.length === 3 && branches.every((branch) => branch.questUsable && branch.bossUsable),
    weakHighRatingBlocked,
    realBefore,
    realAfter,
    realChildDataChanged,
    usage: meter.usage,
    costUsd: meter.spent(),
    outputDir: input.outputDir,
  };
  writeJson(path.join(input.outputDir, "summary.json"), summary);
  fs.writeFileSync(path.join(input.outputDir, "report.html"), reportHtml(summary), "utf8");
  console.log(` 🎮 [personalization-proof] [complete] status=${status} cost=$${summary.costUsd.toFixed(3)} report=${path.join(input.outputDir, "report.html")}`);
  return summary;
}

if (process.argv[1]?.endsWith("runMathPersonalizationLiveProof.ts")) {
  const repoRoot = process.cwd();
  const outputDir = process.env.SUNNY_PERSONALIZATION_PROOF_OUTPUT ?? path.join(repoRoot, "outputs/math-personalization-live", new Date().toISOString().replaceAll(":", "-"));
  runMathPersonalizationLiveProof({ repoRoot, outputDir }).then((summary) => {
    if (summary.status !== "PASS") process.exitCode = 1;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
