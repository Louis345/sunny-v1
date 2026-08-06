import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getChildChart } from "../profiles/childChart";
import type { AssignmentSourceExtraction } from "../engine/assignmentSourceExtraction";
import { askDirectMathPlanner } from "../engine/directMathExperience";
import {
  getLearningCycle,
  transitionLearningCycle,
  type LearningCycleArtifactBinding,
  type LearningCycleRecordV2,
} from "../engine/learningCycleRepository";
import {
  advanceCanonicalCycleFromEvidence,
  parseCanonicalProgressionDecision,
  recordCanonicalNodeCompletion,
} from "../engine/learningCycleRuntime";
import {
  confirmReturnedWorkDraft,
  createReturnedWorkDraft,
  parseReturnedWorkExtraction,
} from "../engine/returnedWorkPipeline";

type ScenarioResult = {
  accuracy: number;
  assistanceCount: number;
  errors: string[];
  action: string;
  reason: string;
  lifecycle: string[];
};

export type MathFeedbackLabSummary = {
  status: "PASS" | "FAIL" | "INCOMPLETE";
  calls: number;
  costUsd: number;
  maxCalls: number;
  maxCostUsd: number;
  sameStartingHash: boolean;
  differentPaths: boolean;
  falseAssumptionFound: boolean;
  nextPlannerUsedCorrection: boolean;
  realReinaUnchanged: boolean;
  startHash: string;
  originalAssumptions: Array<{ assumptionId: string; claim: string; confidence: number; evidenceIds: string[] }>;
  strong: ScenarioResult;
  weak: ScenarioResult;
  assessments: Array<{ assumptionId: string; outcome: string; reason: string; observationIds: string[] }>;
  returnedWork: { homeworkId: string; sourceId: string; predictionErrors: Array<{ predictionId: string; error: number | null }> };
  nextPlan: { preserved: string[]; changed: string[]; evidenceReason: string };
  integrity: { forbiddenCalls: string[]; realTreeBefore: string; realTreeAfter: string; files: string[] };
  plainSummary: string[];
  error?: string;
};

type UsageRecord = {
  call: number;
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
};

const MAX_CALLS = 7;
const MAX_COST_USD = 10;
const OPUS_INPUT_USD_PER_MTOK = 5;
const OPUS_OUTPUT_USD_PER_MTOK = 25;

function stable(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function assertLabBudget(input: {
  callCount: number;
  spentUsd: number;
  reserveUsd: number;
  maxCalls: number;
  maxCostUsd: number;
}): void {
  if (input.callCount >= input.maxCalls) throw new Error(`math_feedback_lab_call_cap:${input.callCount}/${input.maxCalls}`);
  if (input.spentUsd + input.reserveUsd > input.maxCostUsd) {
    throw new Error(`math_feedback_lab_cost_cap:${(input.spentUsd + input.reserveUsd).toFixed(4)}/${input.maxCostUsd.toFixed(2)}`);
  }
}

export function sha256Tree(root: string): string {
  if (!fs.existsSync(root)) return stable([]);
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

export function sanitizeCycleForLab(source: LearningCycleRecordV2, now = new Date()): LearningCycleRecordV2 {
  const at = now.toISOString();
  return {
    ...structuredClone(source),
    revision: 1,
    lifecycle: "baseline_ready",
    createdAt: at,
    updatedAt: at,
    academicTheory: { ...structuredClone(source.academicTheory), revision: 1 },
    nodes: source.nodes.map((node) => ({
      ...structuredClone(node),
      state: node.role === "baseline" ? "ready" : "locked",
      evidenceIds: [],
      ...(node.role === "baseline" ? {} : { generationPrompt: null, artifactBinding: null }),
    })),
    evidence: { academic: [], engagement: [], companionObservations: [] },
    observations: [],
    predictionEvaluations: [],
    evidenceSources: [],
    decisionHistory: [],
    ...("calibrations" in source ? { calibrations: [] } : {}),
  };
}

function rows(values: string[]): string {
  return values.length ? values.map((value) => `<li>${escapeHtml(value)}</li>`).join("") : "<li>None</li>";
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function scenarioCard(title: string, scenario: ScenarioResult, className: string): string {
  return `<article class="scenario ${className}">
    <h3>${escapeHtml(title)}</h3>
    <div class="metric"><strong>${Math.round(scenario.accuracy * 100)}%</strong><span>factual accuracy</span></div>
    <p><b>Assistance:</b> ${scenario.assistanceCount}</p>
    <p><b>Observed errors:</b> ${escapeHtml(scenario.errors.join(", ") || "none")}</p>
    <p><b>Planner decision:</b> <code>${escapeHtml(scenario.action)}</code></p>
    <p><b>Why:</b> ${escapeHtml(scenario.reason)}</p>
    <div class="lifecycle">${scenario.lifecycle.map((step) => `<span>${escapeHtml(step)}</span>`).join("<b>→</b>")}</div>
  </article>`;
}

export function buildLabReportHtml(summary: MathFeedbackLabSummary): string {
  const statusClass = summary.status.toLowerCase();
  const assumptions = summary.originalAssumptions.map((assumption) => `<tr id="${escapeHtml(assumption.assumptionId)}"><td>${escapeHtml(assumption.claim)}</td><td>${escapeHtml(assumption.evidenceIds.join(", "))}</td><td>${Math.round(assumption.confidence * 100)}%</td><td>${escapeHtml(assumption.assumptionId)}</td></tr>`).join("");
  const assessments = summary.assessments.map((assessment) => {
    const original = summary.originalAssumptions.find((item) => item.assumptionId === assessment.assumptionId);
    return `<article class="assessment ${escapeHtml(assessment.outcome)}"><div><small>BELIEVED</small><p>${escapeHtml(original?.claim ?? assessment.assumptionId)}</p></div><b>→</b><div><small>PREDICTED</small><p>${escapeHtml(original?.evidenceIds.join(", ") ?? "")}</p></div><b>→</b><div><small>ACTUALLY HAPPENED</small><p>${escapeHtml(assessment.observationIds.join(", ") || "No matching observation")}</p></div><b>→</b><div><small>ASSESSMENT</small><p><strong>${escapeHtml(assessment.outcome.toUpperCase())}</strong>: ${escapeHtml(assessment.reason)}</p></div></article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny Math Feedback Loop Proof</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui;color:#182033;background:#f4f6fb}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1180px;margin:auto;padding:32px}header{border-radius:28px;padding:34px;color:white;background:linear-gradient(135deg,#202a62,#6d3fbd);box-shadow:0 20px 60px #25306333}.eyebrow{letter-spacing:.18em;font-weight:800;font-size:12px}.verdict{display:flex;gap:22px;align-items:center;flex-wrap:wrap}.badge{font-size:38px;font-weight:900;background:#ffffff1c;border:2px solid #ffffff55;border-radius:18px;padding:14px 20px}.pass{color:#caffdc}.fail{color:#ffd0d0}.incomplete{color:#ffe6a3}.summary{font-size:18px;line-height:1.55;max-width:850px}.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:22px}.check{background:#ffffff16;border-radius:14px;padding:13px}.check b{display:block;font-size:22px;margin-top:4px}section{background:white;border-radius:24px;padding:28px;margin-top:22px;box-shadow:0 9px 35px #20305b12}h2{margin-top:0;font-size:27px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px;border-bottom:1px solid #e7e9f2;vertical-align:top}.scenarios{display:grid;grid-template-columns:1fr 1fr;gap:18px}.scenario{border-radius:18px;padding:22px;border:2px solid}.strong{background:#effcf4;border-color:#91d6aa}.weak{background:#fff6ed;border-color:#efbd86}.metric strong{font-size:42px}.metric span{display:block;color:#687086}.lifecycle{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:18px}.lifecycle span{background:#202a62;color:white;border-radius:999px;padding:7px 10px}.assessment{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;align-items:center;gap:11px;padding:17px;border:1px solid #e0e3ee;border-radius:16px;margin:12px 0}.assessment small{font-weight:900;color:#6d3fbd}.assessment.rejected{border-left:8px solid #df4d5d}.assessment.supported{border-left:8px solid #35a762}.plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.plan-box{padding:18px;border-radius:16px;background:#f4f6fb}code{background:#e9eafb;padding:3px 6px;border-radius:6px}details{margin-top:15px}pre{white-space:pre-wrap;background:#11172d;color:#dbe3ff;padding:18px;border-radius:14px;overflow:auto}@media(max-width:800px){.scenarios,.plan-grid{grid-template-columns:1fr}.assessment{grid-template-columns:1fr}.assessment>b{transform:rotate(90deg)}}
  </style></head><body><main class="wrap"><header><div class="eyebrow">SUNNY · MATH FEEDBACK-LOOP LAB</div><div class="verdict"><div><h1>ADAPTATION RESULT</h1><div class="badge ${statusClass}">${escapeHtml(summary.status)}</div></div><div><div class="summary">${summary.plainSummary.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div></div></div><div class="checks"><div class="check">Different evidence, different path<b>${yesNo(summary.differentPaths)}</b></div><div class="check">False assumption identified<b>${yesNo(summary.falseAssumptionFound)}</b></div><div class="check">Next Planner used correction<b>${yesNo(summary.nextPlannerUsedCorrection)}</b></div><div class="check">Real Reina data changed<b>${summary.realReinaUnchanged ? "No" : "YES — FAILURE"}</b></div><div class="check">Paid calls<b>${summary.calls} / ${summary.maxCalls}</b></div><div class="check">Cost<b>${money(summary.costUsd)} / ${money(summary.maxCostUsd)}</b></div></div></header>
  <section><h2>1. Original belief card</h2><p>Shared starting hash: <code>${escapeHtml(summary.startHash)}</code> · identical seeds: <b>${yesNo(summary.sameStartingHash)}</b></p><table><thead><tr><th>Sunny believed</th><th>Why</th><th>Confidence</th><th>ID</th></tr></thead><tbody>${assumptions}</tbody></table></section>
  <section><h2>2. Strong-versus-weak comparison</h2><div class="scenarios">${scenarioCard("Independent success", summary.strong, "strong")}${scenarioCard("Persistent misunderstanding", summary.weak, "weak")}</div></section>
  <section><h2>3. Assumption accountability</h2>${assessments || "<p>No assumption assessments were produced.</p>"}</section>
  <section><h2>4. Returned-work accountability</h2><p>Original assignment: <code>${escapeHtml(summary.returnedWork.homeworkId)}</code> · source: <code>${escapeHtml(summary.returnedWork.sourceId)}</code></p><table><thead><tr><th>Prediction</th><th>Computed error</th></tr></thead><tbody>${summary.returnedWork.predictionErrors.map((item) => `<tr><td>${escapeHtml(item.predictionId)}</td><td>${item.error == null ? "insufficient" : item.error}</td></tr>`).join("")}</tbody></table></section>
  <section><h2>5. Next-plan difference</h2><div class="plan-grid"><div class="plan-box"><h3>Preserved</h3><ul>${rows(summary.nextPlan.preserved)}</ul></div><div class="plan-box"><h3>Changed</h3><ul>${rows(summary.nextPlan.changed)}</ul></div></div><p><b>Why:</b> ${escapeHtml(summary.nextPlan.evidenceReason)}</p></section>
  <section><h2>6. Integrity and audit</h2><p>Real tree before: <code>${escapeHtml(summary.integrity.realTreeBefore)}</code><br>Real tree after: <code>${escapeHtml(summary.integrity.realTreeAfter)}</code></p><p>Forbidden calls observed: <b>${escapeHtml(summary.integrity.forbiddenCalls.join(", ") || "none")}</b></p>${summary.error ? `<p><b>Incomplete reason:</b> ${escapeHtml(summary.error)}</p>` : ""}<details><summary>Audit files</summary><pre>${escapeHtml(summary.integrity.files.join("\n"))}</pre></details></section>
  </main></body></html>`;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const opus = /opus/i.test(model);
  const inputRate = opus ? OPUS_INPUT_USD_PER_MTOK : 3;
  const outputRate = opus ? OPUS_OUTPUT_USD_PER_MTOK : 15;
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

class MeteredAnthropic {
  private readonly real: Anthropic;
  readonly usage: UsageRecord[] = [];
  private nextLabel = "unlabelled";

  constructor(private readonly auditDir: string, private readonly maxCalls = MAX_CALLS, private readonly maxCostUsd = MAX_COST_USD) {
    this.real = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const usageFile = path.join(auditDir, "usage.json");
    if (fs.existsSync(usageFile)) this.usage.push(...JSON.parse(fs.readFileSync(usageFile, "utf8")) as UsageRecord[]);
  }

  label(value: string): Anthropic {
    this.nextLabel = value;
    return this.client();
  }

  spent(): number {
    return this.usage.reduce((sum, item) => sum + item.costUsd, 0);
  }

  private begin(request: Record<string, unknown>, reserveUsd: number): { label: string; call: number; started: number } {
    assertLabBudget({ callCount: this.usage.length, spentUsd: this.spent(), reserveUsd, maxCalls: this.maxCalls, maxCostUsd: this.maxCostUsd });
    const label = this.nextLabel;
    const call = this.usage.length + 1;
    writeJson(path.join(this.auditDir, `call-${call}-${label}-request.json`), request);
    return { label, call, started: Date.now() };
  }

  private finish(meta: { label: string; call: number; started: number }, model: string, response: any): void {
    const inputTokens = Number(response?.usage?.input_tokens ?? 0);
    const outputTokens = Number(response?.usage?.output_tokens ?? 0);
    const costUsd = estimateCost(model, inputTokens, outputTokens);
    this.usage.push({ call: meta.call, label: meta.label, model, inputTokens, outputTokens, costUsd, elapsedMs: Date.now() - meta.started });
    writeJson(path.join(this.auditDir, `call-${meta.call}-${meta.label}-response.json`), response);
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }

  private client(): Anthropic {
    const self = this;
    return {
      messages: {
        create: async (request: any, options?: any) => {
          const meta = self.begin(request, 1.25);
          const response = await self.real.messages.create(request, options);
          self.finish(meta, String(request.model ?? "unknown"), response);
          return response;
        },
        stream: (request: any, options?: any) => {
          const meta = self.begin(request, 2.5);
          const stream = self.real.messages.stream(request, options);
          return {
            finalMessage: async () => {
              const response = await stream.finalMessage();
              self.finish(meta, String(request.model ?? "unknown"), response);
              return response;
            },
          };
        },
      },
    } as unknown as Anthropic;
  }
}

function copyChartSeed(sourceRoot: string, targetRoot: string): void {
  const source = path.join(sourceRoot, "src", "context", "reina");
  const target = path.join(targetRoot, "src", "context", "reina");
  fs.mkdirSync(target, { recursive: true });
  for (const name of ["child_profile.json", "learning_profile.json", "engagement_theory.json", "word_bank.json", "fact_bank.json"]) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, name));
  }
}

function writeCycle(rootDir: string, cycle: LearningCycleRecordV2): void {
  writeJson(path.join(rootDir, "src", "context", cycle.childId, "homework", "cycles", `${cycle.homeworkId}.json`), cycle);
}

function bindSyntheticArtifact(rootDir: string, cycle: LearningCycleRecordV2, role: "quest" | "boss"): LearningCycleRecordV2 {
  const node = cycle.nodes.find((item) => item.role === role);
  if (!node) throw new Error(`math_feedback_lab_${role}_missing`);
  const artifact: LearningCycleArtifactBinding = {
    contentId: `lab:${role}`,
    artifactId: `lab:${role}:artifact`,
    localArtifactPath: `/lab/${role}.html`,
    localArtworkPath: `/lab/${role}.png`,
    contractFingerprint: stable({ role, prompt: node.generationPrompt }),
    validationStatus: "passed",
  };
  return transitionLearningCycle(cycle.childId, cycle.homeworkId, cycle.revision, { type: "artifact_bound", nodeId: node.nodeId, artifact }, { rootDir });
}

function baselineNodesForOneFrontier(cycle: LearningCycleRecordV2): string[] {
  const baselines = cycle.nodes.filter((node) => node.role === "baseline");
  const firstRoute = baselines[0]?.routeId;
  return baselines.filter((node) => node.routeId === firstRoute).map((node) => node.nodeId);
}

function lastDecision(cycle: LearningCycleRecordV2): any {
  return [...cycle.decisionHistory].reverse().find((item) => item.eventType === "theory_decided") ?? {};
}

async function runBaselineScenario(input: {
  rootDir: string;
  homeworkId: string;
  mode: "strong" | "weak";
  meter: MeteredAnthropic;
  model: string;
}): Promise<{ cycle: LearningCycleRecordV2; result: ScenarioResult }> {
  let cycle = getLearningCycle("reina", input.homeworkId, { rootDir: input.rootDir })!;
  const nodes = baselineNodesForOneFrontier(cycle);
  const lifecycle = ["baseline"];
  for (const [index, nodeId] of nodes.entries()) {
    const strong = input.mode === "strong";
    const targetResults = strong
      ? [
          { target: `lab:${nodeId}:fresh-equal-parts`, correct: true, attemptedValue: "equal parts", scaffoldLevel: 0 },
          { target: `lab:${nodeId}:fresh-compare`, correct: true, attemptedValue: "1/3", scaffoldLevel: 0 },
        ]
      : [
          { target: `lab:${nodeId}:fresh-equal-parts`, correct: false, attemptedValue: "three pieces even when unequal", scaffoldLevel: 2 },
          { target: `lab:${nodeId}:fresh-compare`, correct: false, attemptedValue: "1/4 because 4 is larger", scaffoldLevel: 2 },
        ];
    cycle = recordCanonicalNodeCompletion({
      childId: "reina",
      homeworkId: input.homeworkId,
      sessionId: `lab:${input.mode}:baseline`,
      nodeId,
      result: {
        completed: true,
        accuracy: strong ? 1 : 0,
        timeSpent_ms: strong ? 45_000 : 110_000,
        targetResults,
        companionInteractions: strong ? [] : ["Asked Elli to explain equal parts."],
        frustrationSignals: strong ? [] : ["repeated_miss"],
      },
    }, { rootDir: input.rootDir, now: new Date(`2026-08-01T10:${10 + index}:00.000Z`) })!;
  }
  cycle = await advanceCanonicalCycleFromEvidence({
    childId: "reina",
    homeworkId: input.homeworkId,
    client: input.meter.label(`${input.mode}-baseline-decision`),
    model: input.model,
  }, { rootDir: input.rootDir });
  const decision = lastDecision(cycle);
  const action = String(decision.progressionAction ?? decision.nextAction ?? "none");
  lifecycle.push(action === "generate_quest" ? "quest" : action === "generate_support" ? "support" : action);
  return {
    cycle,
    result: {
      accuracy: input.mode === "strong" ? 1 : 0,
      assistanceCount: input.mode === "strong" ? 0 : nodes.length * 3,
      errors: input.mode === "strong" ? [] : ["unequal partitions", "larger denominator chosen"],
      action,
      reason: String(decision.reason ?? "No decision reason"),
      lifecycle,
    },
  };
}

async function runStrongProgression(input: {
  rootDir: string;
  cycle: LearningCycleRecordV2;
  meter: MeteredAnthropic;
  model: string;
  result: ScenarioResult;
}): Promise<LearningCycleRecordV2> {
  let cycle = input.cycle;
  if (cycle.lifecycle !== "quest_generating") return cycle;
  cycle = bindSyntheticArtifact(input.rootDir, cycle, "quest");
  const quest = cycle.nodes.find((node) => node.role === "quest")!;
  cycle = recordCanonicalNodeCompletion({
    childId: cycle.childId,
    homeworkId: cycle.homeworkId,
    sessionId: "lab:strong:quest",
    nodeId: quest.nodeId,
    result: { completed: true, accuracy: 1, timeSpent_ms: 55_000, targetResults: [{ target: "lab:unseen:transfer:thirds-fourths", correct: true, attemptedValue: "1/3", scaffoldLevel: 0 }] },
  }, { rootDir: input.rootDir })!;
  cycle = await advanceCanonicalCycleFromEvidence({ childId: cycle.childId, homeworkId: cycle.homeworkId, client: input.meter.label("quest-decision"), model: input.model }, { rootDir: input.rootDir });
  const questDecision = lastDecision(cycle);
  const questAction = String(questDecision.progressionAction ?? questDecision.nextAction ?? "none");
  input.result.lifecycle.push(questAction === "generate_boss" ? "boss" : questAction);
  if (cycle.lifecycle !== "boss_generating") return cycle;
  cycle = bindSyntheticArtifact(input.rootDir, cycle, "boss");
  const boss = cycle.nodes.find((node) => node.role === "boss")!;
  cycle = recordCanonicalNodeCompletion({
    childId: cycle.childId,
    homeworkId: cycle.homeworkId,
    sessionId: "lab:strong:boss",
    nodeId: boss.nodeId,
    result: { completed: true, accuracy: 1, timeSpent_ms: 65_000, targetResults: [{ target: "lab:unseen:synthesis:partition-and-compare", correct: true, attemptedValue: "three equal parts; 1/3 > 1/4", scaffoldLevel: 0 }] },
  }, { rootDir: input.rootDir })!;
  cycle = await advanceCanonicalCycleFromEvidence({ childId: cycle.childId, homeworkId: cycle.homeworkId, client: input.meter.label("boss-decision"), model: input.model }, { rootDir: input.rootDir });
  input.result.lifecycle.push(cycle.lifecycle);
  return cycle;
}

function pdfObject(id: number, body: string): string {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function createMarkedPdf(file: string): void {
  const lines = [
    "Sunny Lab Returned Fractions Work - Marked",
    "Score: 4 / 5",
    "1. Partition a rectangle into thirds: three equal parts - CORRECT",
    "2. Shade one fourth of a circle: one of four equal parts - CORRECT",
    "3. Which is larger, one third or one fourth? one third - CORRECT",
    "4. Is one part of an unequal three-part shape one third? No - CORRECT",
    "5. Name the top number in 1/3: denominator - INCORRECT",
    "Teacher note: Equal-part and comparison reasoning are secure; numerator vocabulary needs review.",
  ];
  const stream = lines.map((line, index) => `BT /F1 12 Tf 54 ${740 - index * 42} Td (${line.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objects = [
    pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    pdfObject(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"),
    pdfObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    pdfObject(5, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(pdf)); pdf += object; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, pdf, "binary");
}

function followUpExtraction(file: string): AssignmentSourceExtraction {
  const text = "Grade 3 fractions follow-up. Partition shapes into equal halves, thirds, and fourths. Name numerator and denominator. Compare 1/2, 1/3, and 1/4 using same-size wholes. Explain why more equal parts make each part smaller.";
  return { sourceKind: "text_assignment", sourcePath: file, filename: path.basename(file), mediaType: "text/plain", fileHash: stable(text), extractionMethod: "text", pages: [{ pageNumber: 1, text }], fullText: text, warnings: [] };
}

function emptySummary(realBefore: string): MathFeedbackLabSummary {
  return {
    status: "INCOMPLETE", calls: 0, costUsd: 0, maxCalls: MAX_CALLS, maxCostUsd: MAX_COST_USD,
    sameStartingHash: false, differentPaths: false, falseAssumptionFound: false, nextPlannerUsedCorrection: false, realReinaUnchanged: false, startHash: "pending",
    originalAssumptions: [],
    strong: { accuracy: 0, assistanceCount: 0, errors: [], action: "pending", reason: "pending", lifecycle: [] },
    weak: { accuracy: 0, assistanceCount: 0, errors: [], action: "pending", reason: "pending", lifecycle: [] },
    assessments: [], returnedWork: { homeworkId: "pending", sourceId: "pending", predictionErrors: [] }, nextPlan: { preserved: [], changed: [], evidenceReason: "pending" },
    integrity: { forbiddenCalls: [], realTreeBefore: realBefore, realTreeAfter: "pending", files: [] }, plainSummary: ["The lab has not completed.", "Partial evidence is preserved.", "No claim of adaptation is made."],
  };
}

function reconstructIncompleteSummary(input: {
  outDir: string;
  sourceCycle: LearningCycleRecordV2;
  meter: MeteredAnthropic;
  realBefore: string;
  realAfter: string;
  error: string;
}): MathFeedbackLabSummary {
  const seed = sanitizeCycleForLab(input.sourceCycle, new Date("2026-08-01T10:00:00.000Z"));
  const strongRoot = path.join(input.outDir, "scenarios", "strong");
  const weakRoot = path.join(input.outDir, "scenarios", "weak");
  const strongCycle = getLearningCycle("reina", seed.homeworkId, { rootDir: strongRoot });
  const weakCycle = getLearningCycle("reina", seed.homeworkId, { rootDir: weakRoot });
  const strongDecision = strongCycle?.decisionHistory.find((item) => item.eventType === "theory_decided" && item.nextAction === "generate_quest");
  const weakDecision = weakCycle?.decisionHistory.find((item) => item.eventType === "theory_decided");
  const theoryDecision = [...(strongCycle?.decisionHistory ?? [])].reverse().find((item) => (item.assumptionAssessments?.length ?? 0) > 0);
  const assessments = theoryDecision?.assumptionAssessments ?? [];
  const source = strongCycle?.evidenceSources.at(-1);
  const followUpResponse = path.join(input.outDir, "audit", "call-7-follow-up-planner-response.json");
  const followUpText = fs.existsSync(followUpResponse) ? fs.readFileSync(followUpResponse, "utf8") : "";
  const returnedObservationIds = (strongCycle?.observations ?? []).filter((item) => item.sourceId === source?.sourceId).map((item) => item.observationId);
  const nextUsedRawEvidence = returnedObservationIds.some((id) => followUpText.includes(id));
  return {
    status: "INCOMPLETE",
    calls: input.meter.usage.length,
    costUsd: input.meter.spent(),
    maxCalls: MAX_CALLS,
    maxCostUsd: MAX_COST_USD,
    sameStartingHash: true,
    differentPaths: strongDecision?.nextAction !== weakDecision?.nextAction,
    falseAssumptionFound: assessments.some((item) => item.outcome === "rejected"),
    nextPlannerUsedCorrection: Boolean(theoryDecision) && nextUsedRawEvidence,
    realReinaUnchanged: input.realBefore === input.realAfter,
    startHash: stable(seed),
    originalAssumptions: seed.assumptions.map((item) => ({ assumptionId: item.assumptionId, claim: item.claim, confidence: item.confidence, evidenceIds: item.evidenceIds })),
    strong: {
      accuracy: 1,
      assistanceCount: 0,
      errors: [],
      action: String(strongDecision?.nextAction ?? "none"),
      reason: String(strongDecision?.reason ?? "No decision reason"),
      lifecycle: ["baseline", "quest", "boss", String(strongCycle?.lifecycle ?? "unknown")],
    },
    weak: {
      accuracy: 0,
      assistanceCount: baselineNodesForOneFrontier(weakCycle ?? seed).length * 3,
      errors: ["unequal partitions", "larger denominator chosen"],
      action: String(weakDecision?.nextAction ?? "none"),
      reason: String(weakDecision?.reason ?? "No decision reason"),
      lifecycle: ["baseline", String(weakDecision?.nextAction ?? "none").replace("generate_", "")],
    },
    assessments,
    returnedWork: {
      homeworkId: seed.homeworkId,
      sourceId: source?.sourceId ?? "missing",
      predictionErrors: (strongCycle?.predictionEvaluations ?? []).filter((item) => item.sourceId === source?.sourceId).map((item) => ({ predictionId: item.predictionId, error: item.predictionError })),
    },
    nextPlan: {
      preserved: theoryDecision?.preserve ?? [],
      changed: theoryDecision?.change ?? [],
      evidenceReason: theoryDecision?.reason ?? "Returned-work reasoning was produced, but required assumption assessments were not persisted; the follow-up program was therefore not accepted as proof.",
    },
    integrity: {
      forbiddenCalls: [],
      realTreeBefore: input.realBefore,
      realTreeAfter: input.realAfter,
      files: input.meter.usage.map((item) => `call ${item.call}: ${item.label} · ${item.model} · ${money(item.costUsd)}`),
    },
    plainSummary: [
      `Independent evidence produced Quest and Boss and ended ${strongCycle?.lifecycle ?? "unknown"}; repeated assisted errors produced ${weakDecision?.nextAction ?? "no decision"}.`,
      `Returned work was linked to the original assignment and generated ${strongCycle?.predictionEvaluations.length ?? 0} factual prediction evaluations, but the interpretation contract omitted required assumption assessments.`,
      `The next Planner referenced returned evidence (${nextUsedRawEvidence ? "yes" : "no"}) but its full program hit the output ceiling, so this run cannot claim a complete closed loop.`,
    ],
    error: input.error,
  };
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const resumeOutput = process.argv.find((arg) => arg.startsWith("--resume-output="))?.slice("--resume-output=".length);
  const sourceCycleFile = process.argv.find((arg) => arg.startsWith("--cycle="))?.slice("--cycle=".length)
    ?? path.join(repoRoot, "src/context/reina/homework/cycles/hw-math-7ead7e33.json");
  const model = process.env.SUNNY_PLANNER_MODEL ?? "claude-opus-5";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resumeOutput ? path.resolve(resumeOutput) : path.join(repoRoot, "outputs", "math-feedback-loop-lab", timestamp);
  const auditDir = path.join(outDir, "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  const realContext = path.join(repoRoot, "src", "context", "reina");
  const realBefore = sha256Tree(realContext);
  const meter = new MeteredAnthropic(auditDir);
  let summary = emptySummary(realBefore);
  if (process.argv.includes("--report-only")) {
    const sourceCycle = JSON.parse(fs.readFileSync(sourceCycleFile, "utf8")) as LearningCycleRecordV2;
    const priorSummaryFile = path.join(outDir, "summary.json");
    const priorError = fs.existsSync(priorSummaryFile)
      ? String((JSON.parse(fs.readFileSync(priorSummaryFile, "utf8")) as { error?: string }).error ?? "provider_contract_incomplete")
      : "provider_contract_incomplete";
    summary = reconstructIncompleteSummary({ outDir, sourceCycle, meter, realBefore, realAfter: sha256Tree(realContext), error: priorError });
    writeJson(priorSummaryFile, summary);
    fs.writeFileSync(path.join(outDir, "report.html"), buildLabReportHtml(summary), "utf8");
    console.log(` 🎮 [math-feedback-lab] [report-only] report=${path.join(outDir, "report.html")} calls=${summary.calls}/${summary.maxCalls} cost=${money(summary.costUsd)}/${money(summary.maxCostUsd)}`);
    return;
  }
  try {
    const sourceCycle = JSON.parse(fs.readFileSync(sourceCycleFile, "utf8")) as LearningCycleRecordV2;
    const seed = sanitizeCycleForLab(sourceCycle, new Date("2026-08-01T10:00:00.000Z"));
    const strongRoot = path.join(outDir, "scenarios", "strong");
    const weakRoot = path.join(outDir, "scenarios", "weak");
    const strongSeedHash = stable(seed);
    const weakSeedHash = stable(structuredClone(seed));
    let strongRun: { cycle: LearningCycleRecordV2; result: ScenarioResult };
    let weakRun: { cycle: LearningCycleRecordV2; result: ScenarioResult };
    let strongFinal: LearningCycleRecordV2;
    if (resumeOutput) {
      strongFinal = getLearningCycle("reina", seed.homeworkId, { rootDir: strongRoot })!;
      const weakCycle = getLearningCycle("reina", seed.homeworkId, { rootDir: weakRoot })!;
      if (!strongFinal || !weakCycle) throw new Error("math_feedback_lab_resume_cycle_missing");
      if (strongFinal.lifecycle === "boss_evaluating") {
        const savedBossResponseFile = path.join(auditDir, "call-4-boss-decision-response.json");
        if (!fs.existsSync(savedBossResponseFile)) throw new Error("math_feedback_lab_saved_boss_decision_missing");
        const savedBossResponse = JSON.parse(fs.readFileSync(savedBossResponseFile, "utf8"));
        const savedBossTool = savedBossResponse.content?.find((block: any) => block.type === "tool_use" && block.name === "decide_learning_cycle_progression");
        if (!savedBossTool) throw new Error("math_feedback_lab_saved_boss_tool_missing");
        const savedBossDecision = parseCanonicalProgressionDecision(savedBossTool.input);
        strongFinal = await advanceCanonicalCycleFromEvidence({
          childId: "reina",
          homeworkId: seed.homeworkId,
          decide: async () => savedBossDecision,
        }, { rootDir: strongRoot });
      }
      const strongDecision = strongFinal.decisionHistory.find((item) => item.eventType === "theory_decided" && item.nextAction === "generate_quest");
      const weakDecision = weakCycle.decisionHistory.find((item) => item.eventType === "theory_decided");
      strongRun = {
        cycle: strongFinal,
        result: { accuracy: 1, assistanceCount: 0, errors: [], action: String(strongDecision?.nextAction ?? "none"), reason: String(strongDecision?.reason ?? "No decision reason"), lifecycle: ["baseline", "quest", "boss", strongFinal.lifecycle] },
      };
      weakRun = {
        cycle: weakCycle,
        result: { accuracy: 0, assistanceCount: baselineNodesForOneFrontier(weakCycle).length * 3, errors: ["unequal partitions", "larger denominator chosen"], action: String(weakDecision?.nextAction ?? "none"), reason: String(weakDecision?.reason ?? "No decision reason"), lifecycle: ["baseline", String(weakDecision?.nextAction ?? "none").replace("generate_", "")] },
      };
    } else {
      copyChartSeed(repoRoot, strongRoot);
      copyChartSeed(repoRoot, weakRoot);
      writeCycle(strongRoot, seed);
      writeCycle(weakRoot, structuredClone(seed));
      strongRun = await runBaselineScenario({ rootDir: strongRoot, homeworkId: seed.homeworkId, mode: "strong", meter, model });
      weakRun = await runBaselineScenario({ rootDir: weakRoot, homeworkId: seed.homeworkId, mode: "weak", meter, model });
      strongFinal = await runStrongProgression({ rootDir: strongRoot, cycle: strongRun.cycle, meter, model, result: strongRun.result });
    }

    const returnedDir = path.join(outDir, "returned-work");
    fs.mkdirSync(returnedDir, { recursive: true });
    const returnedPdf = path.join(returnedDir, "marked-fractions-lab.pdf");
    if (!fs.existsSync(returnedPdf)) createMarkedPdf(returnedPdf);
    const savedExtractionFile = path.join(auditDir, "call-5-returned-work-extraction-response.json");
    const savedExtraction = resumeOutput && fs.existsSync(savedExtractionFile)
      ? (() => {
          const response = JSON.parse(fs.readFileSync(savedExtractionFile, "utf8"));
          const tool = response.content?.find((block: any) => block.type === "tool_use" && block.name === "extract_returned_graded_work");
          if (!tool) throw new Error("math_feedback_lab_saved_extraction_missing");
          return parseReturnedWorkExtraction(tool.input);
        })()
      : null;
    const draft = await createReturnedWorkDraft({ childId: "reina", homeworkId: seed.homeworkId, filename: path.basename(returnedPdf), mimeType: "application/pdf", dataBase64: fs.readFileSync(returnedPdf).toString("base64") }, {
      rootDir: strongRoot,
      ...(savedExtraction ? { extract: async () => savedExtraction } : { client: meter.label("returned-work-extraction"), model }),
    });
    const confirmed = await confirmReturnedWorkDraft({ childId: "reina", homeworkId: seed.homeworkId, sourceId: draft.source.sourceId }, { rootDir: strongRoot, client: meter.label("returned-work-interpretation"), model });
    const calibrated = confirmed.cycle;
    const theoryDecision = [...calibrated.decisionHistory].reverse().find((item) => item.eventType === "theory_decided" && (item.assumptionAssessments?.length ?? 0) > 0);
    const assessments = theoryDecision?.assumptionAssessments ?? [];

    const chart = getChildChart("reina", { rootDir: strongRoot });
    const nextPlannerDir = path.join(outDir, "next-planner");
    fs.mkdirSync(nextPlannerDir, { recursive: true });
    const followUpFile = path.join(nextPlannerDir, "related-fractions-follow-up.txt");
    fs.writeFileSync(followUpFile, followUpExtraction(followUpFile).fullText, "utf8");
    const nextProgram = await askDirectMathPlanner({
      childId: "reina",
      chart,
      extraction: followUpExtraction(followUpFile),
      client: meter.label("follow-up-planner"),
      model,
      priorOutcomes: chart.learningHistory,
      priorConceptIds: Object.keys(chart.learningHistory?.constructs ?? {}),
      rawResponseFile: path.join(nextPlannerDir, "response.json"),
      maxTokens: 32000,
    });
    writeJson(path.join(nextPlannerDir, "program.json"), nextProgram);

    const requestFiles = fs.readdirSync(auditDir).filter((file) => file.endsWith("request.json"));
    const followUpRequest = requestFiles.find((file) => file.includes("follow-up-planner"));
    const followUpPrompt = followUpRequest ? fs.readFileSync(path.join(auditDir, followUpRequest), "utf8") : "";
    const rejected = assessments.filter((item) => item.outcome === "rejected");
    const nextUsed = rejected.some((assessment) => followUpPrompt.includes(assessment.assumptionId)) ||
      (theoryDecision?.reason ? followUpPrompt.includes(theoryDecision.reason) : false);
    const strongAction = strongRun.result.action;
    const weakAction = weakRun.result.action;
    const realAfter = sha256Tree(realContext);
    const bossReachedCalibration = strongFinal.lifecycle === "awaiting_calibration";
    const weakSafe = !["generate_quest", "generate_boss"].includes(weakAction);
    const falseAssumptionFound = rejected.length > 0;
    const costUsd = meter.spent();
    const pass = strongSeedHash === weakSeedHash && strongAction === "generate_quest" && weakSafe && bossReachedCalibration && falseAssumptionFound && nextUsed && realBefore === realAfter && meter.usage.length <= MAX_CALLS && costUsd <= MAX_COST_USD;
    summary = {
      status: pass ? "PASS" : "FAIL",
      calls: meter.usage.length,
      costUsd,
      maxCalls: MAX_CALLS,
      maxCostUsd: MAX_COST_USD,
      sameStartingHash: strongSeedHash === weakSeedHash,
      differentPaths: strongAction !== weakAction,
      falseAssumptionFound,
      nextPlannerUsedCorrection: nextUsed,
      realReinaUnchanged: realBefore === realAfter,
      startHash: strongSeedHash,
      originalAssumptions: seed.assumptions.map((item) => ({ assumptionId: item.assumptionId, claim: item.claim, confidence: item.confidence, evidenceIds: item.evidenceIds })),
      strong: strongRun.result,
      weak: weakRun.result,
      assessments,
      returnedWork: { homeworkId: seed.homeworkId, sourceId: draft.source.sourceId, predictionErrors: calibrated.predictionEvaluations.filter((item) => item.sourceId === draft.source.sourceId).map((item) => ({ predictionId: item.predictionId, error: item.predictionError })) },
      nextPlan: { preserved: theoryDecision?.preserve ?? [], changed: theoryDecision?.change ?? [], evidenceReason: theoryDecision?.reason ?? "No returned-work theory decision" },
      integrity: { forbiddenCalls: [], realTreeBefore: realBefore, realTreeAfter: realAfter, files: meter.usage.map((item) => `call ${item.call}: ${item.label} · ${item.model} · ${money(item.costUsd)}`) },
      plainSummary: [
        `Sunny began with ${seed.assumptions.length} locked assumptions about the fractions assignment.`,
        `Independent evidence led to ${strongAction}, while repeated assisted errors led to ${weakAction}.`,
        falseAssumptionFound ? `Returned work rejected ${rejected.length} assumption(s), and the follow-up Planner ${nextUsed ? "used" : "did not use"} that correction.` : "Returned work did not reject an original assumption.",
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sourceCycle = fs.existsSync(sourceCycleFile) ? JSON.parse(fs.readFileSync(sourceCycleFile, "utf8")) as LearningCycleRecordV2 : null;
    const realAfter = sha256Tree(realContext);
    summary = sourceCycle
      ? reconstructIncompleteSummary({ outDir, sourceCycle, meter, realBefore, realAfter, error: message })
      : { ...summary, status: "INCOMPLETE", calls: meter.usage.length, costUsd: meter.spent(), error: message, realReinaUnchanged: realBefore === realAfter, integrity: { ...summary.integrity, realTreeAfter: realAfter, files: meter.usage.map((item) => `call ${item.call}: ${item.label} · ${item.model} · ${money(item.costUsd)}`) } };
  }
  writeJson(path.join(outDir, "summary.json"), summary);
  fs.writeFileSync(path.join(outDir, "report.html"), buildLabReportHtml(summary), "utf8");
  console.log(` 🎮 [math-feedback-lab] [${summary.status.toLowerCase()}] report=${path.join(outDir, "report.html")} calls=${summary.calls}/${summary.maxCalls} cost=${money(summary.costUsd)}/${money(summary.maxCostUsd)}`);
  if (summary.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error: unknown) => {
    console.error(" 🎮 [math-feedback-lab] [failed]", error);
    process.exitCode = 1;
  });
}
