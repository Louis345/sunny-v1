import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { extractAssignmentSource } from "../engine/assignmentSourceExtraction";
import {
  askDirectMathPlanner,
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
  recordCanonicalNodeCompletion,
} from "../engine/learningCycleRuntime";
import {
  buildLongitudinalLearningHistory,
  interpretReturnedWorkBatch,
  recordConfirmedReturnedWork,
} from "../engine/longitudinalLearning";
import { getChildChart } from "../profiles/childChart";
import {
  cycleInput,
  loadManifest,
  priorHistoryIds,
  returnedWork,
  type ManifestRound,
} from "./runMathLongitudinalFixtureProof";

export const LIVE_PROOF_MAX_CALLS = 10;
// Nine successful calls, two pre-checkpoint transport failures, and one
// post-fix validation attempt. No further provider attempt is permitted.
export const LIVE_PROOF_MAX_ATTEMPTS = 12;
export const LIVE_PROOF_MAX_COST_USD = 15;

type UsageRecord = {
  call: number;
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
  status: "complete" | "failed";
  error?: string;
};

type PlayableArtifact = { usable: boolean; artifactPath: string };

type GatedPlayableInput = {
  longitudinalPassed: boolean;
  buildQuest: () => Promise<PlayableArtifact>;
  buildBoss: () => Promise<PlayableArtifact>;
};

export async function runGatedPlayableProof(input: GatedPlayableInput): Promise<
  | { status: "skipped"; reason: "longitudinal_gate_failed" }
  | { status: "incomplete"; reason: "quest_unusable" | "boss_unusable"; quest?: PlayableArtifact; boss?: PlayableArtifact }
  | { status: "complete"; quest: PlayableArtifact; boss: PlayableArtifact }
> {
  if (!input.longitudinalPassed) return { status: "skipped", reason: "longitudinal_gate_failed" };
  const quest = await input.buildQuest();
  if (!quest.usable) return { status: "incomplete", reason: "quest_unusable", quest };
  const boss = await input.buildBoss();
  if (!boss.usable) return { status: "incomplete", reason: "boss_unusable", quest, boss };
  return { status: "complete", quest, boss };
}

export function assertLiveProofBudget(input: { callCount: number; spentUsd: number; reserveUsd: number }): void {
  if (input.callCount >= LIVE_PROOF_MAX_CALLS) {
    throw new Error(`math_live_proof_call_cap:${input.callCount}/${LIVE_PROOF_MAX_CALLS}`);
  }
  if (input.spentUsd + input.reserveUsd > LIVE_PROOF_MAX_COST_USD) {
    throw new Error(`math_live_proof_cost_cap:${(input.spentUsd + input.reserveUsd).toFixed(4)}/${LIVE_PROOF_MAX_COST_USD.toFixed(2)}`);
  }
}

export function assertLiveProofAttemptBudget(attemptCount: number): void {
  if (attemptCount >= LIVE_PROOF_MAX_ATTEMPTS) {
    throw new Error(`math_live_proof_attempt_cap:${attemptCount}/${LIVE_PROOF_MAX_ATTEMPTS}`);
  }
}

export function isScopedLongitudinalReadiness(input: {
  roundTwoReadiness: string;
  roundThreeReadiness: string;
  roundThreeConstructs: string[];
  roundThreeReason: string;
}): boolean {
  if (input.roundTwoReadiness !== "not_yet_ready") return false;
  const includesUnresolvedFactorPairs = input.roundThreeConstructs.includes("math.multiplication.factor_pairs");
  if (input.roundThreeReadiness === "ready_independent") return !includesUnresolvedFactorPairs;
  if (input.roundThreeReadiness !== "ready_with_support") return false;
  return includesUnresolvedFactorPairs && /factor[_ -]?pairs?/i.test(input.roundThreeReason);
}

export function isPlayableProgressionReady(lifecycle: string): boolean {
  return lifecycle === "quest_generating" || lifecycle === "boss_generating";
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashFile(file: string): string {
  return sha256(fs.readFileSync(file));
}

function hashTree(root: string): string {
  if (!fs.existsSync(root)) return sha256("missing");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
    }
  };
  walk(root);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const opus = /opus/i.test(model);
  const fable = /fable/i.test(model);
  const inputRate = opus ? 5 : fable ? 6 : 3;
  const outputRate = opus ? 25 : fable ? 30 : 15;
  return inputTokens / 1_000_000 * inputRate + outputTokens / 1_000_000 * outputRate;
}

class MeteredAnthropic {
  private readonly real: Anthropic;
  private nextLabel = "unlabelled";
  readonly usage: UsageRecord[] = [];

  constructor(private readonly auditDir: string) {
    this.real = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const usageFile = path.join(auditDir, "usage.json");
    if (fs.existsSync(usageFile)) {
      this.usage.push(...JSON.parse(fs.readFileSync(usageFile, "utf8")) as UsageRecord[]);
    }
  }

  label(label: string): Anthropic {
    this.nextLabel = label;
    return this.client();
  }

  savedOrLive(label: string): Anthropic {
    const saved = fs.existsSync(this.auditDir)
      ? fs.readdirSync(this.auditDir).find((file) => file.includes(`-${label}-response.json`))
      : undefined;
    if (!saved) return this.label(label);
    const response = JSON.parse(fs.readFileSync(path.join(this.auditDir, saved), "utf8"));
    console.log(` 🎮 [math-live-proof] [provider-response] [reused] label=${label}`);
    return {
      messages: {
        create: async () => response,
      },
    } as unknown as Anthropic;
  }

  spent(): number {
    return this.usage.reduce((sum, item) => sum + item.costUsd, 0);
  }

  private begin(request: Record<string, unknown>, reserveUsd: number) {
    assertLiveProofAttemptBudget(this.usage.length);
    assertLiveProofBudget({
      callCount: this.usage.filter((item) => item.status === "complete").length,
      spentUsd: this.spent(),
      reserveUsd,
    });
    const call = this.usage.length + 1;
    const label = this.nextLabel.replace(/[^a-z0-9_-]+/gi, "-");
    writeJson(path.join(this.auditDir, `call-${call}-${label}-request.json`), request);
    return { call, label, started: Date.now(), model: String(request.model ?? "unknown") };
  }

  private finish(meta: ReturnType<MeteredAnthropic["begin"]>, response: any): void {
    const inputTokens = Number(response?.usage?.input_tokens ?? 0);
    const outputTokens = Number(response?.usage?.output_tokens ?? 0);
    this.usage.push({
      call: meta.call,
      label: meta.label,
      model: meta.model,
      inputTokens,
      outputTokens,
      costUsd: estimateCost(meta.model, inputTokens, outputTokens),
      elapsedMs: Date.now() - meta.started,
      status: "complete",
    });
    writeJson(path.join(this.auditDir, `call-${meta.call}-${meta.label}-response.json`), response);
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }

  private fail(meta: ReturnType<MeteredAnthropic["begin"]>, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.usage.push({
      call: meta.call,
      label: meta.label,
      model: meta.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      elapsedMs: Date.now() - meta.started,
      status: "failed",
      error: message,
    });
    writeJson(path.join(this.auditDir, `call-${meta.call}-${meta.label}-error.json`), { error: message });
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }

  private client(): Anthropic {
    const self = this;
    return {
      messages: {
        create: async (request: any, options?: any) => {
          const meta = self.begin(request, 1.5);
          try {
            const response = await self.real.messages.create(request, options);
            self.finish(meta, response);
            return response;
          } catch (error) {
            self.fail(meta, error);
            throw error;
          }
        },
        stream: (request: any, options?: any) => {
          const meta = self.begin(request, 2.5);
          const stream = self.real.messages.stream(request, options);
          const wrapped = {
            on: (event: string, listener: (...args: any[]) => void) => {
              stream.on(event as never, listener as never);
              return wrapped;
            },
            finalMessage: async () => {
              try {
                const response = await stream.finalMessage();
                self.finish(meta, response);
                return response;
              } catch (error) {
                self.fail(meta, error);
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

function writeSyntheticChart(rootDir: string, childId: string): void {
  const childDir = path.join(rootDir, "src", "context", childId);
  fs.mkdirSync(childDir, { recursive: true });
  writeJson(path.join(childDir, "child_profile.json"), {
    childId,
    identity: { displayName: "Lab Learner", ttsName: "Lab Learner" },
    demographics: { age: 9, grade: 3 },
    links: { learningProfile: "learning_profile.json" },
  });
  writeJson(path.join(childDir, "learning_profile.json"), {
    childId,
    rewardPreferences: { preferred: [] },
  });
}

function lastTheoryDecision(cycle: LearningCycleRecordV2) {
  return [...cycle.decisionHistory].reverse().find((item) => item.eventType === "theory_decided");
}

function finalization(rootDir: string, cycle: LearningCycleRecordV2, nodeId: string, choiceEventId: string, funRating: number): LearningCycleRecordV2 {
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, {
    type: "session_finalized",
    nodeId,
    choiceEventId,
    engagement: { postActivityAction: "back_to_map", funRating, completed: true, replayRequested: false },
  }, { rootDir });
}

function progressionNode(id: string, role: "baseline" | "quest" | "boss", state: "ready" | "locked"): LearningCycleNodeContract {
  return {
    nodeId: id,
    role,
    title: role === "baseline" ? "Festival Team Challenge" : role === "quest" ? "Quest" : "Boss",
    state,
    academicTarget: {
      domain: "math",
      skill: "multiplication transfer",
      targets: ["math.multiplication.equal_groups", "math.multiplication.missing_factor", "math.multiplication.word_problem_interpretation"],
    },
    algorithmOwner: role === "baseline" ? "retrieval-practice" : "mastery-gating",
    theoryId: "live-progression-theory",
    experimentId: `live-${role}`,
    mechanic: "AI-owned",
    theme: "AI-owned",
    openingScreen: { title: role === "baseline" ? "Festival Team Challenge" : role === "quest" ? "Quest" : "Boss", purpose: "Collect fresh evidence." },
    generationPrompt: null,
    artifactBinding: role === "baseline" ? {
      contentId: "live-baseline",
      artifactId: "live-baseline-artifact",
      localArtifactPath: "/lab/baseline.html",
      localArtworkPath: "/lab/baseline.png",
      contractFingerprint: "live-baseline-contract",
      validationStatus: "passed",
    } : null,
    artwork: { status: role === "baseline" ? "ready" : "placeholder", localPath: role === "baseline" ? "/lab/baseline.png" : null, prompt: null },
    sfxContract: ["interaction", "recovery", "progress", "completion"],
    companionContract: { events: ["help_requested"] },
    evidenceContract: { academic: true, engagement: true, companionObservations: true },
    evidenceIds: [],
  };
}

function progressionCycleInput(childId: string): CreateLearningCycleInput {
  return {
    childId,
    homeworkId: "hw-live-progression",
    domain: "math",
    assignment: {
      title: "Festival Team Challenge",
      contentFingerprint: "live-progression-assignment",
      capturedEvidenceIds: ["assignment:live-progression", "rating:round-a:4", "rating:round-b:3", "rating:round-c:5", "replay:round-c:1"],
      targets: ["math.multiplication.equal_groups", "math.multiplication.missing_factor", "math.multiplication.word_problem_interpretation"],
    },
    academicTheory: {
      theoryId: "live-progression-theory",
      revision: 1,
      hypothesis: "The learner can transfer equal-groups, missing-factor, and word-problem reasoning to fresh material.",
      supportCriteria: ["Fresh unassisted answers support transfer."],
      reviseCriteria: ["Errors reveal a scoped misconception."],
      falsifyCriteria: ["Repeated fresh independent errors contradict transfer."],
    },
    engagementTheory: null,
    assumptions: [{
      assumptionId: "live-progression-assumption",
      claim: "A mission with visible mathematical consequences may sustain engagement.",
      evidenceIds: ["rating:round-c:5", "replay:round-c:1"],
      confidence: 0.55,
      uncertainty: "The sample contains only three synthetic sessions.",
      createdAt: "2026-08-08T12:00:00.000Z",
      lockedAt: "2026-08-08T12:00:00.000Z",
    }],
    nodes: [progressionNode("baseline", "baseline", "ready"), progressionNode("quest", "quest", "locked"), progressionNode("boss", "boss", "locked")],
    academicPredictions: [{
      predictionId: "live-progression-prediction",
      theoryId: "live-progression-theory",
      constructId: "math.multiplication.transfer",
      context: "fresh unassisted baseline evidence",
      horizon: "next_session",
      expectedMetric: { key: "academic.accuracy", min: 0.7, max: 1 },
      predictedErrorPatterns: ["factor-pair overgeneralization"],
      confidence: 0.65,
      evidenceIds: ["assignment:live-progression"],
      intervention: "baseline learning program",
      evidenceLimit: "independent_performance",
      createdAt: "2026-08-08T12:00:00.000Z",
      lockedAt: "2026-08-08T12:00:00.000Z",
    }],
  };
}

function isUsableHtml(html: string): boolean {
  return /<!doctype html/i.test(html) && /<html/i.test(html) && /<script/i.test(html) && html.length > 4_000;
}

function bindArtifact(rootDir: string, cycle: LearningCycleRecordV2, node: LearningCycleNodeContract, file: string, artworkFile: string, design: ExperienceDesignArtifactV1): LearningCycleRecordV2 {
  const artifact: LearningCycleArtifactBinding = {
    contentId: `live-proof:${node.role}`,
    artifactId: design.artifactId,
    localArtifactPath: file,
    localArtworkPath: artworkFile,
    contractFingerprint: design.academicContractHash,
    validationStatus: "passed",
  };
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, { type: "artifact_bound", nodeId: node.nodeId, artifact }, { rootDir });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function reportHtml(summary: any): string {
  const rounds = summary.rounds.map((round: any) => `<tr><td>${escapeHtml(round.assignmentCode)}</td><td>${escapeHtml(round.assumptionOutcome)}</td><td>${escapeHtml(round.readiness)}</td><td>${escapeHtml(round.readinessConstructs.join(", "))}</td><td>${escapeHtml(round.reason)}</td></tr>`).join("");
  const usage = summary.usage.map((item: UsageRecord) => `<tr><td>${item.call}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.model)}</td><td>${item.inputTokens.toLocaleString()}</td><td>${item.outputTokens.toLocaleString()}</td><td>$${item.costUsd.toFixed(3)}</td><td>${Math.round(item.elapsedMs / 1000)}s</td></tr>`).join("");
  const quest = summary.playable?.questPath ? `<iframe src="${escapeHtml(summary.playable.questPath)}" title="Quest"></iframe>` : `<p>Quest was not generated: ${escapeHtml(summary.playable?.reason ?? "gate failed")}</p>`;
  const boss = summary.playable?.bossPath
    ? `<iframe src="${escapeHtml(summary.playable.bossPath)}" title="Boss"></iframe>`
    : `<p>Boss HTML was not delivered by the provider.${summary.playable?.bossDesignPath ? ` The frozen design is preserved at <code>${escapeHtml(summary.playable.bossDesignPath)}</code>.` : ""}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny live math release proof</title><style>
  :root{font-family:Inter,system-ui;color:#172033;background:#eef3fb}*{box-sizing:border-box}body{margin:0}.hero{background:linear-gradient(135deg,#13234b,#6741b8);color:white;padding:36px}.wrap{max-width:1280px;margin:auto;padding:24px}.badge{display:inline-block;padding:10px 18px;border-radius:999px;font-size:28px;font-weight:900;background:${summary.status === "PASS" ? "#b9f4d0;color:#095d34" : "#ffd4d4;color:#8f1e2c"}}section{background:white;border-radius:22px;padding:24px;margin:18px 0;box-shadow:0 9px 28px #1d315017}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px;border-bottom:1px solid #e4e9f2;vertical-align:top}.games{display:grid;grid-template-columns:1fr 1fr;gap:18px}iframe{width:100%;height:650px;border:2px solid #cbd6e6;border-radius:16px;background:white}.checks{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.check{background:#f4f6fb;border-radius:13px;padding:14px}code{word-break:break-all}@media(max-width:900px){.games,.checks{grid-template-columns:1fr}}
  </style></head><body><header class="hero"><div>SUNNY · LIVE MODEL RELEASE PROOF</div><h1>Longitudinal accountability → personalized Quest → Boss</h1><div class="badge">${escapeHtml(summary.status)}</div><p>${escapeHtml(summary.verdict)}</p></header><main class="wrap">
  <section><h2>Thirty-second verdict</h2><div class="checks"><div class="check">Correction reached next Planner<br><b>${summary.correctionReachedNextPlanner ? "Yes" : "No"}</b></div><div class="check">Readiness stayed scoped<br><b>${summary.scopedReadiness ? "Yes" : "No"}</b></div><div class="check">Ratings reached progression prompt<br><b>${summary.ratingsReachedProgression ? "Yes" : "No"}</b></div><div class="check">Quest and Boss playable<br><b>${summary.playable?.status === "complete" ? "Yes" : "No"}</b></div><div class="check">Real child data changed<br><b>${summary.realChildDataChanged ? "YES — FAILURE" : "No"}</b></div><div class="check">Cost<br><b>$${summary.costUsd.toFixed(2)} / $${LIVE_PROOF_MAX_COST_USD.toFixed(2)}</b></div></div></section>
  <section><h2>Three returned assignments</h2><table><thead><tr><th>Assignment</th><th>Assumption</th><th>Readiness</th><th>Scoped constructs</th><th>Planner reason</th></tr></thead><tbody>${rounds}</tbody></table></section>
  <section><h2>Playable proof</h2><p>Both experiences were designed from the frozen progression node, factual modal ratings/replay signals, and academic evidence. The iframes are raw saved HTML.</p><div class="games"><article><h3>Quest — unseen transfer</h3>${quest}</article><article><h3>Boss — unseen synthesis</h3>${boss}</article></div></section>
  <section><h2>Paid-call audit</h2><table><thead><tr><th>#</th><th>Purpose</th><th>Model</th><th>Input</th><th>Output</th><th>Cost</th><th>Time</th></tr></thead><tbody>${usage}</tbody></table><p><b>Total:</b> ${summary.usage.filter((item: UsageRecord) => item.status === "complete").length}/${LIVE_PROOF_MAX_CALLS} successful paid calls · ${summary.usage.length}/${LIVE_PROOF_MAX_ATTEMPTS} transport attempts · $${summary.costUsd.toFixed(3)}</p></section>
  <section><h2>Integrity</h2><p>Isolated root: <code>${escapeHtml(summary.rootDir)}</code></p><p>Reina/Ila hash before: <code>${escapeHtml(summary.realBefore)}</code><br>after: <code>${escapeHtml(summary.realAfter)}</code></p></section>
  </main></body></html>`;
}

async function buildProgressionArtifact(input: {
  role: "quest" | "boss";
  rootDir: string;
  outputDir: string;
  meter: MeteredAnthropic;
  architectModel: string;
  builderModel: string;
  childContext: unknown;
}): Promise<PlayableArtifact> {
  let cycle = getLearningCycle("live-proof-child", "hw-live-progression", { rootDir: input.rootDir });
  if (!cycle) throw new Error("live_progression_cycle_missing");
  const node = cycle.nodes.find((item) => item.role === input.role);
  if (!node || !node.generationPrompt) return { usable: false, artifactPath: "" };
  const roleDir = path.join(input.outputDir, input.role);
  fs.mkdirSync(roleDir, { recursive: true });
  const existingHtmlFile = path.join(roleDir, "experience.html");
  if (node.artifactBinding && fs.existsSync(existingHtmlFile)) {
    const existingHtml = fs.readFileSync(existingHtmlFile, "utf8");
    if (isUsableHtml(existingHtml)) {
      console.log(` 🎮 [math-live-proof] [${input.role}-artifact] [reused]`);
      return { usable: true, artifactPath: existingHtmlFile };
    }
  }
  const designFile = path.join(roleDir, "design-artifact.json");
  const design = fs.existsSync(designFile)
    ? JSON.parse(fs.readFileSync(designFile, "utf8")) as ExperienceDesignArtifactV1
    : await designAdaptiveProgressionExperience({
        cycle,
        node,
        childContext: input.childContext,
        client: input.meter.label(`${input.role}-design`),
        model: input.architectModel,
      });
  if (!fs.existsSync(designFile)) writeJson(designFile, design);
  const htmlFile = path.join(roleDir, "experience.html");
  const html = fs.existsSync(htmlFile)
    ? fs.readFileSync(htmlFile, "utf8")
    : await generateAdaptiveProgressionActivityHtml({
        cycle,
        node,
        childContext: input.childContext,
        designArtifact: design,
        client: input.meter.label(`${input.role}-implementation`),
        model: input.builderModel,
        partialHtmlFile: path.join(roleDir, "experience.partial.html"),
      });
  if (!fs.existsSync(htmlFile)) fs.writeFileSync(htmlFile, html, "utf8");
  if (!isUsableHtml(html)) return { usable: false, artifactPath: htmlFile };
  const artworkFile = path.join(roleDir, "provenance-placeholder.svg");
  if (!fs.existsSync(artworkFile)) {
    fs.writeFileSync(artworkFile, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#17233b"/><text x="32" y="38" text-anchor="middle" font-size="30" fill="#fff">${input.role === "quest" ? "Q" : "B"}</text></svg>`, "utf8");
  }
  cycle = bindArtifact(input.rootDir, cycle, node, htmlFile, artworkFile, design);

  if (input.role === "quest") {
    cycle = recordCanonicalNodeCompletion({
      childId: cycle.childId,
      homeworkId: cycle.homeworkId,
      sessionId: "live-proof-quest-session",
      nodeId: node.nodeId,
      result: {
        completed: true,
        accuracy: 1,
        timeSpent_ms: 75_000,
        targetResults: [
          { target: "math.multiplication.unseen_transfer.equal_groups", correct: true, attemptedValue: "6 groups of 4 = 24", scaffoldLevel: 0 },
          { target: "math.multiplication.unseen_transfer.missing_factor", correct: true, attemptedValue: "7", scaffoldLevel: 0 },
          { target: "math.multiplication.unseen_transfer.word_problem", correct: true, attemptedValue: "5 × 6 = 30", scaffoldLevel: 0 },
        ],
      },
    }, { rootDir: input.rootDir })!;
    cycle = finalization(input.rootDir, cycle, node.nodeId, "rating:quest:5", 5);
    cycle = await advanceCanonicalCycleFromEvidence({
      childId: cycle.childId,
      homeworkId: cycle.homeworkId,
      client: input.meter.label("quest-to-boss-decision"),
      model: process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5",
    }, { rootDir: input.rootDir });
    writeJson(path.join(input.outputDir, "quest-to-boss-cycle.json"), cycle);
  }
  return { usable: true, artifactPath: htmlFile };
}

export async function runMathLongitudinalLiveProof(input: { repoRoot: string; fixtureDir: string; outputDir: string }) {
  fs.mkdirSync(input.outputDir, { recursive: true });
  const auditDir = path.join(input.outputDir, "audit");
  const rootDir = path.join(input.outputDir, "isolated-context");
  const childId = "live-proof-child";
  writeSyntheticChart(rootDir, childId);
  const meter = new MeteredAnthropic(auditDir);
  const plannerModel = process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5";
  const architectModel = process.env.SUNNY_ARCHITECT_MODEL ?? "claude-fable-5";
  const builderModel = process.env.SUNNY_QUEST_BOSS_BUILDER_MODEL ?? "claude-opus-5";
  const realRoots = [path.join(input.repoRoot, "src/context/reina"), path.join(input.repoRoot, "src/context/ila")];
  const realBefore = sha256(realRoots.map(hashTree).join(":"));
  const manifest = loadManifest(input.fixtureDir);
  const rounds: any[] = [];
  let roundThreeProgram: unknown = null;

  try {
    for (const round of [...manifest.rounds].sort((a, b) => a.round - b.round)) {
      const originalFile = path.join(input.fixtureDir, round.original);
      const returnedFile = path.join(input.fixtureDir, round.returned);
      const originalHash = hashFile(originalFile);
      const returnedHash = hashFile(returnedFile);
      const homeworkId = `hw-${originalHash.slice(0, 16)}`;
      const prior = priorHistoryIds(childId, rootDir);

      if (round.round === 3) {
        const savedProgramFile = path.join(input.outputDir, "round-3-learning-program.json");
        if (fs.existsSync(savedProgramFile)) {
          roundThreeProgram = JSON.parse(fs.readFileSync(savedProgramFile, "utf8"));
          console.log(" 🎮 [math-live-proof] [round-3-program] [reused]");
        } else {
          const extraction = await extractAssignmentSource(originalFile);
          const chart = getChildChart(childId, { rootDir });
          const priorOutcomes = {
            longitudinalHistory: buildLongitudinalLearningHistory(childId, { rootDir }),
            factualEngagementEvents: manifest.rounds.filter((item) => item.round < 3).flatMap((item) => item.factualEngagementEvents),
          };
          roundThreeProgram = await askDirectMathPlanner({
            childId,
            chart,
            extraction,
            priorOutcomes,
            priorConceptIds: ["math.multiplication.equal_groups", "math.multiplication.missing_factor", "math.multiplication.word_problem_interpretation"],
            client: meter.label("round-3-next-planner"),
            model: plannerModel,
            rawResponseFile: path.join(input.outputDir, "round-3-planner-raw.json"),
            maxTokens: 22_000,
          });
          writeJson(savedProgramFile, roundThreeProgram);
        }
      }

      if (!getLearningCycle(childId, homeworkId, { rootDir })) {
        createLearningCycle(cycleInput(round, childId, homeworkId, originalHash, [...prior.decisions, ...prior.evaluations]), {
          rootDir,
          now: new Date(`2026-08-0${round.round}T12:00:00.000Z`),
        });
      }
      const returned = returnedWork(round, childId, homeworkId, returnedHash);
      let current = getLearningCycle(childId, homeworkId, { rootDir })!;
      if (!current.evidenceSources.some((source) => source.sourceId === returned.source.sourceId)) {
        current = recordConfirmedReturnedWork(returned, { rootDir, now: new Date(`2026-08-0${round.round}T15:00:00.000Z`) });
      }
      const existingDecision = current.decisionHistory.find((decision) => decision.eventType === "theory_decided"
        && decision.evidenceIds.some((id) => current.observations.some((observation) => observation.sourceId === returned.source.sourceId && observation.observationId === id)));
      const interpreted = existingDecision
        ? { cycle: current }
        : await interpretReturnedWorkBatch({
            childId,
            homeworkId,
            sourceId: returned.source.sourceId,
            rootDir,
            now: new Date(`2026-08-0${round.round}T15:01:00.000Z`),
            client: meter.savedOrLive(`round-${round.round}-returned-work-decision`),
            model: plannerModel,
          });
      const decision = lastTheoryDecision(interpreted.cycle);
      const assessment = decision?.assumptionAssessments?.[0];
      const readiness = decision?.readinessAssessment;
      rounds.push({
        round: round.round,
        assignmentCode: round.assignmentCode,
        homeworkId,
        decisionId: decision?.decisionId ?? "missing",
        assumptionOutcome: assessment?.outcome ?? "uncertain",
        readiness: readiness?.status ?? "missing",
        readinessConstructs: readiness?.scope.constructIds ?? [],
        reason: decision?.reason ?? "No decision",
        priorDecisionIds: prior.decisions,
        priorEvaluationIds: prior.evaluations,
      });
    }

    const correctionReachedNextPlanner = rounds[2]?.priorDecisionIds.includes(rounds[1]?.decisionId);
    const roundThreeRequest = fs.readdirSync(auditDir).find((file) => file.includes("round-3-next-planner-request"));
    const requestText = roundThreeRequest ? fs.readFileSync(path.join(auditDir, roundThreeRequest), "utf8") : "";
    const correctionVisibleInPrompt = Boolean(rounds[1]?.decisionId && requestText.includes(rounds[1].decisionId));
    const scopedReadiness = isScopedLongitudinalReadiness({
      roundTwoReadiness: rounds[1]?.readiness ?? "missing",
      roundThreeReadiness: rounds[2]?.readiness ?? "missing",
      roundThreeConstructs: rounds[2]?.readinessConstructs ?? [],
      roundThreeReason: rounds[2]?.reason ?? "",
    });
    const longitudinalPassed = Boolean(correctionReachedNextPlanner && correctionVisibleInPrompt && scopedReadiness && roundThreeProgram);

    if (!getLearningCycle(childId, "hw-live-progression", { rootDir })) {
      createLearningCycle(progressionCycleInput(childId), { rootDir, now: new Date("2026-08-08T12:00:00.000Z") });
    }
    let progressionCycle = getLearningCycle(childId, "hw-live-progression", { rootDir })!;
    if (progressionCycle.lifecycle === "baseline_ready") {
      progressionCycle = recordCanonicalNodeCompletion({
        childId,
        homeworkId: "hw-live-progression",
        sessionId: "live-proof-baseline-session",
        nodeId: "baseline",
        result: {
          completed: true,
          accuracy: 0.8,
          timeSpent_ms: 95_000,
          targetResults: [
            { target: "math.multiplication.equal_groups", correct: true, attemptedValue: "4 × 6 = 24", scaffoldLevel: 0 },
            { target: "math.multiplication.missing_factor", correct: true, attemptedValue: "7", scaffoldLevel: 0 },
            { target: "math.multiplication.word_problem_interpretation", correct: true, attemptedValue: "5 groups", scaffoldLevel: 0 },
            { target: "math.multiplication.factor_pairs", correct: false, attemptedValue: "only one pair", scaffoldLevel: 0 },
          ],
        },
      }, { rootDir })!;
      progressionCycle = finalization(rootDir, progressionCycle, "baseline", "rating:baseline:5", 5);
      progressionCycle = await advanceCanonicalCycleFromEvidence({
        childId,
        homeworkId: "hw-live-progression",
        client: meter.label("baseline-to-quest-decision"),
        model: plannerModel,
      }, { rootDir });
      writeJson(path.join(input.outputDir, "baseline-to-quest-cycle.json"), progressionCycle);
    }

    const childContext = {
      child: { age: 9, grade: 3 },
      factualSessionEvidence: {
        priorRatings: manifest.rounds.flatMap((round) => round.factualEngagementEvents),
        baselineRating: 5,
        baselineReplayRequested: false,
        academicObservations: progressionCycle.observations,
      },
      evidenceInterpretation: "These are factual observations with small samples, not durable preferences or creative commands.",
    };

    const playable = await runGatedPlayableProof({
      longitudinalPassed: longitudinalPassed && isPlayableProgressionReady(progressionCycle.lifecycle),
      buildQuest: () => buildProgressionArtifact({ role: "quest", rootDir, outputDir: input.outputDir, meter, architectModel, builderModel, childContext }),
      buildBoss: () => buildProgressionArtifact({ role: "boss", rootDir, outputDir: input.outputDir, meter, architectModel, builderModel, childContext }),
    });

    const baselineRequest = fs.readdirSync(auditDir).find((file) => file.includes("baseline-to-quest-decision-request"));
    const baselineRequestText = baselineRequest ? fs.readFileSync(path.join(auditDir, baselineRequest), "utf8") : "";
    const ratingsReachedProgression = baselineRequestText.includes("rating:baseline:5") && baselineRequestText.includes("fun rating 5/5");
    const realAfter = sha256(realRoots.map(hashTree).join(":"));
    const realChildDataChanged = realBefore !== realAfter;
    const status = longitudinalPassed && playable.status === "complete" && ratingsReachedProgression && !realChildDataChanged ? "PASS" : "FAIL";
    const summary = {
      status,
      verdict: status === "PASS"
        ? "Live Planner decisions carried the contradiction forward, kept readiness scoped, and produced playable Quest and Boss experiences from academic plus explicit engagement evidence."
        : "At least one live-model accountability or playable-content gate failed; inspect the cited decisions and raw call audit before shipping.",
      rounds,
      correctionReachedNextPlanner,
      correctionVisibleInPrompt,
      scopedReadiness,
      ratingsReachedProgression,
      playable: {
        ...playable,
        ...(playable.status === "complete" ? {
          questPath: path.relative(input.outputDir, playable.quest.artifactPath),
          bossPath: path.relative(input.outputDir, playable.boss.artifactPath),
        } : {}),
      },
      usage: meter.usage,
      costUsd: meter.spent(),
      rootDir,
      realBefore,
      realAfter,
      realChildDataChanged,
    };
    writeJson(path.join(input.outputDir, "summary.json"), summary);
    fs.writeFileSync(path.join(input.outputDir, "report.html"), reportHtml(summary), "utf8");
    return summary;
  } catch (error) {
    const realAfter = sha256(realRoots.map(hashTree).join(":"));
    const lastProviderFailure = [...meter.usage].reverse().find((item) => item.status === "failed");
    const failureReason = lastProviderFailure?.error ?? (error instanceof Error ? error.message : String(error));
    const questFile = path.join(input.outputDir, "quest", "experience.html");
    const bossDesignFile = path.join(input.outputDir, "boss", "design-artifact.json");
    const summary = {
      status: "INCOMPLETE",
      verdict: failureReason,
      rounds,
      correctionReachedNextPlanner: false,
      scopedReadiness: false,
      ratingsReachedProgression: false,
      playable: {
        status: "incomplete",
        reason: "provider_or_contract_failure",
        ...(fs.existsSync(questFile) ? { questPath: path.relative(input.outputDir, questFile) } : {}),
        ...(fs.existsSync(bossDesignFile) ? { bossDesignPath: path.relative(input.outputDir, bossDesignFile) } : {}),
      },
      usage: meter.usage,
      costUsd: meter.spent(),
      rootDir,
      realBefore,
      realAfter,
      realChildDataChanged: realBefore !== realAfter,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    writeJson(path.join(input.outputDir, "summary.json"), summary);
    fs.writeFileSync(path.join(input.outputDir, "report.html"), reportHtml(summary), "utf8");
    return summary;
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const fixtureDir = path.join(repoRoot, "output", "pdf", "math-release-confidence");
  const outputDir = process.env.SUNNY_LIVE_PROOF_OUTPUT_DIR
    ? path.resolve(process.env.SUNNY_LIVE_PROOF_OUTPUT_DIR)
    : path.join(repoRoot, "outputs", "math-release-confidence-live", new Date().toISOString().replaceAll(":", "-"));
  console.log(` 🎮 [math-live-proof] [start] output=${outputDir}`);
  const summary = await runMathLongitudinalLiveProof({ repoRoot, fixtureDir, outputDir });
  console.log(` 🎮 [math-live-proof] [${String(summary.status).toLowerCase()}] calls=${summary.usage.filter((item: UsageRecord) => item.status === "complete").length}/${LIVE_PROOF_MAX_CALLS} attempts=${summary.usage.length}/${LIVE_PROOF_MAX_ATTEMPTS} cost=$${summary.costUsd.toFixed(2)} report=${path.join(outputDir, "report.html")}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1]?.endsWith("runMathLongitudinalLiveProof.ts")) {
  void main().catch((error) => {
    console.error(` 🎮 [math-live-proof] [fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
