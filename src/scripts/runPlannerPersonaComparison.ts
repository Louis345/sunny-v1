import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ComparisonArm = "neutral" | "personality";
export type ComparisonStage = "academic_lead" | "curriculum_writer" | "experience_architect" | "experience_engineer";

export type DecisionRecord = {
  decisionId: string;
  decision: string;
  evidenceIds: string[];
  confidence: number;
  uncertainty: string;
  falsifyingEvidence: string[];
  measurementKeys: string[];
};

export type SharedComparisonInput = {
  assignmentId: string;
  assignmentText: string;
  childContext: {
    age: number;
    grade: number;
    observations: Array<{ evidenceId: string; fact: string }>;
  };
  historicalEvidence: Array<{ evidenceId: string; fact: string }>;
  academicTarget: string;
  viewport: { width: number; height: number };
};

type UpstreamPacket = { immutableHash: string; content: unknown };
type PromptInput = { stage: ComparisonStage; arm: ComparisonArm; sharedInput: SharedComparisonInput; upstream: UpstreamPacket };

type UsageRecord = {
  attempt: number;
  arm: ComparisonArm;
  stage: ComparisonStage;
  model: string;
  status: "complete" | "failed";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  elapsedMs: number;
  stopReason?: string;
  error?: string;
};

type ArmState = {
  completedStages: ComparisonStage[];
  playable?: boolean;
  failure?: string;
};

type StageArtifact = { immutableHash: string; content: Record<string, any> };

const MAX_CALLS = 8;
const MAX_NEW_COST_USD = 6;
const HISTORICAL_ROOT = "outputs/math-release-confidence-live/2026-08-08T16-02-39.895Z";
const HISTORICAL_DESIGN_COST_USD = 0.23448;
const HISTORICAL_IMPLEMENTATION_COST_USD = 0.59665;

const MODELS: Record<ComparisonStage, string> = {
  academic_lead: "claude-opus-5",
  curriculum_writer: "claude-opus-5",
  experience_architect: "claude-fable-5",
  experience_engineer: "claude-opus-5",
};

const MAX_OUTPUT_TOKENS: Record<ComparisonStage, number> = {
  academic_lead: 7_000,
  curriculum_writer: 9_000,
  experience_architect: 10_000,
  experience_engineer: 26_000,
};

const MAXIMUM_CALL_COST_USD: Record<ComparisonStage, number> = {
  academic_lead: 0.4,
  curriculum_writer: 0.5,
  experience_architect: 0.6,
  experience_engineer: 1.0,
};

const STAGE_PERSONALITIES: Record<ComparisonStage, Record<ComparisonArm, string>> = {
  academic_lead: {
    neutral: "You are Sunny's Academic Lead. Produce the requested educational charter from the supplied evidence.",
    personality: "You are Mira, Sunny's Academic Lead. You are a decisive, evidence-skeptical learning scientist: curious, candid, intellectually humble, and accountable for every prediction. You protect the child's dignity, resist unsupported certainty, and record uncertainty without making the child-facing plan timid.",
  },
  curriculum_writer: {
    neutral: "You are Sunny's Curriculum Writer. Author the requested content within the immutable charter.",
    personality: "You are Theo, Sunny's Curriculum Writer. You are an expert elementary curriculum designer: patient, concrete-minded, age-aware, exacting, and quietly inventive. You notice ambiguity immediately and double-check every answer before handing work forward.",
  },
  experience_architect: {
    neutral: "You are Sunny's Experience Architect. Design the requested experience from the frozen academic packet.",
    personality: "You are Juniper, Sunny's Experience Architect. You are playful, bold, visually opinionated, child-eyed, and allergic to timid decorative quizzes. You favor clear invitations, meaningful world reactions, escalating anticipation, dignified recovery, and earned payoff.",
  },
  experience_engineer: {
    neutral: "You are Sunny's Experience Engineer. Implement the frozen academic and design contracts.",
    personality: "You are Rowan, Sunny's Experience Engineer. You are calm, meticulous, proud of invisible polish, and attentive to how children actually touch and read interfaces. You anticipate confusion and consider an experience unfinished until every action visibly matters.",
  },
};

const STAGE_REQUIREMENTS: Record<ComparisonStage, string> = {
  academic_lead: `Return a compact immutable academic charter. It must include: charterId, upstreamHash, academicTarget, scope, boundaries, assumptions as DecisionRecord objects, exactly one representativeLearningResponsibility, progression, and evidenceRequiredNext. Use only supplied evidence IDs. Do not author questions, mechanics, visuals, themes, rewards, libraries, or HTML. Confidence must not produce hesitant child-facing language.`,
  curriculum_writer: `Return a curriculum packet with packetId, upstreamHash, five to seven fresh items, supportProgression, and charterConcern. Every item must include itemId, prompt, options when applicable, correctAnswer, responseContract, sourceLineage, exposure, and academicTarget. Do not copy worksheet questions. Preserve the charter exactly. charterConcern may identify one concern but may not rewrite the charter. Do not choose visuals, mechanics, themes, or HTML.`,
  experience_architect: `Return one immutable design artifact with artifactId, upstreamHash, title, audienceRationale, openingPromise, firstThreeSeconds, firstAction, interactionDemonstration, coreInteraction, mathAsPower, stakes, consequences, recovery, progression, interactionContinuity, worldReaction, payoff, replayVariation, visualDirection, motionDirection, soundDirection, usefulLibraries, engagementPrediction, falsifyingEvidence, and decisionRecords. Mathematics must control the world rather than appear as a quiz overlay. Do not change questions, answers, targets, or difficulty.`,
  experience_engineer: `Return one complete standalone HTML document and nothing else. Implement the immutable curriculum and design at 1365x768. It must be immediately understandable to a nine-year-old, genuinely interactive, visibly react to correct and incorrect actions, progress through the complete experience, and deliver the promised payoff. External HTTPS libraries/assets are allowed. Include <meta name="sunny-upstream-hash" content="UPSTREAM_HASH"> with the supplied immutable hash substituted exactly. Do not access Sunny APIs, child state, currency, cookies, localStorage, sessionStorage, or IndexedDB. Do not use browser speech synthesis or oscillator-generated audio.`,
};

const DECISION_RECORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisionId", "decision", "evidenceIds", "confidence", "uncertainty", "falsifyingEvidence", "measurementKeys"],
  properties: {
    decisionId: { type: "string" },
    decision: { type: "string" },
    evidenceIds: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    uncertainty: { type: "string" },
    falsifyingEvidence: { type: "array", items: { type: "string" } },
    measurementKeys: { type: "array", items: { type: "string" } },
  },
} as const;

const STRUCTURED_TOOLS: Partial<Record<ComparisonStage, { name: string; description: string; input_schema: Record<string, unknown> }>> = {
  academic_lead: {
    name: "submit_academic_charter",
    description: "Submit the complete immutable academic charter.",
    input_schema: {
      type: "object",
      additionalProperties: true,
      required: ["charterId", "upstreamHash", "academicTarget", "scope", "boundaries", "assumptions", "representativeLearningResponsibility", "progression", "evidenceRequiredNext"],
      properties: {
        charterId: { type: "string" }, upstreamHash: { type: "string" }, academicTarget: { type: "string" },
        scope: { type: "array", items: { type: "string" } },
        boundaries: { type: "object" },
        assumptions: { type: "array", items: DECISION_RECORD_SCHEMA },
        representativeLearningResponsibility: { type: "object" },
        progression: { type: "array", items: { type: "string" } },
        evidenceRequiredNext: { type: "array", items: { type: "string" } },
      },
    },
  },
  curriculum_writer: {
    name: "submit_curriculum_packet",
    description: "Submit the complete curriculum packet.",
    input_schema: {
      type: "object",
      additionalProperties: true,
      required: ["packetId", "upstreamHash", "items", "supportProgression", "charterConcern"],
      properties: {
        packetId: { type: "string" }, upstreamHash: { type: "string" },
        items: { type: "array", minItems: 5, maxItems: 7, items: { type: "object" } },
        supportProgression: { type: "array", items: { type: "string" } },
        charterConcern: {},
      },
    },
  },
  experience_architect: {
    name: "submit_design_artifact",
    description: "Submit the complete immutable experience design artifact.",
    input_schema: {
      type: "object",
      additionalProperties: true,
      required: ["artifactId", "upstreamHash", "title", "audienceRationale", "openingPromise", "firstThreeSeconds", "firstAction", "interactionDemonstration", "coreInteraction", "mathAsPower", "stakes", "consequences", "recovery", "progression", "interactionContinuity", "worldReaction", "payoff", "replayVariation", "visualDirection", "motionDirection", "soundDirection", "usefulLibraries", "engagementPrediction", "falsifyingEvidence", "decisionRecords"],
      properties: {
        artifactId: { type: "string" }, upstreamHash: { type: "string" }, title: { type: "string" },
        progression: { type: "array", items: { type: "string" } },
        usefulLibraries: { type: "array", items: { type: "string" } },
        decisionRecords: { type: "array", items: DECISION_RECORD_SCHEMA },
      },
    },
  },
};

export function structuredToolForStage(stage: Exclude<ComparisonStage, "experience_engineer">, expectedUpstreamHash: string): { name: string; description: string; input_schema: Record<string, unknown> } {
  const tool = structuredClone(STRUCTURED_TOOLS[stage]!);
  const properties = (tool.input_schema as { properties: Record<string, Record<string, unknown>> }).properties;
  properties.upstreamHash = { type: "string", enum: [expectedUpstreamHash] };
  return tool;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashObject(value: unknown): string {
  return sha256(stable(value));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]!));
}

export function buildStagePrompt(input: PromptInput): { sharedContract: string; sharedContractHash: string; personalityBlock: string; request: string } {
  const sharedContract = stable({
    experiment: "three-way-persona-pipeline-comparison-v1",
    stage: input.stage,
    sharedInput: input.sharedInput,
    immutableUpstream: input.upstream,
    requirements: STAGE_REQUIREMENTS[input.stage],
  });
  const personalityBlock = STAGE_PERSONALITIES[input.stage][input.arm];
  const request = [
    "<role>", personalityBlock, "</role>",
    "<shared_contract>", sharedContract, "</shared_contract>",
    `The required output upstreamHash is exactly: ${input.upstream.immutableHash}`,
    "Do not copy an older upstreamHash nested inside the upstream content.",
    "Follow the shared contract exactly. Personality changes temperament and judgment only; it grants no factual or academic authority.",
  ].join("\n");
  return { sharedContract, sharedContractHash: sha256(sharedContract), personalityBlock, request };
}

export function copyHistoricalBenchmark(source: string, destination: string): { htmlHash: string; designArtifactHash: string } {
  const htmlSource = path.join(source, "experience.html");
  const designSource = path.join(source, "design-artifact.json");
  if (!fs.existsSync(htmlSource) || !fs.existsSync(designSource)) throw new Error("historical_benchmark_missing");
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(htmlSource, path.join(destination, "experience.html"));
  fs.copyFileSync(designSource, path.join(destination, "design-artifact.json"));
  const htmlHash = sha256(fs.readFileSync(htmlSource));
  const designArtifactHash = sha256(fs.readFileSync(designSource));
  if (sha256(fs.readFileSync(path.join(destination, "experience.html"))) !== htmlHash) throw new Error("historical_html_copy_changed");
  if (sha256(fs.readFileSync(path.join(destination, "design-artifact.json"))) !== designArtifactHash) throw new Error("historical_design_copy_changed");
  return { htmlHash, designArtifactHash };
}

export function validateUpstreamHash(expected: string, output: Record<string, unknown>): { valid: true } | { valid: false; reason: "upstream_hash_changed" } {
  return output.upstreamHash === expected ? { valid: true } : { valid: false, reason: "upstream_hash_changed" };
}

export function validateDecisionEvidence(decisions: DecisionRecord[], input: SharedComparisonInput): { valid: boolean; unresolvedEvidenceIds: string[] } {
  const known = new Set([
    ...input.childContext.observations.map((item) => item.evidenceId),
    ...input.historicalEvidence.map((item) => item.evidenceId),
  ]);
  const unresolvedEvidenceIds = [...new Set(decisions.flatMap((decision) => decision.evidenceIds).filter((id) => !known.has(id)))];
  return { valid: unresolvedEvidenceIds.length === 0, unresolvedEvidenceIds };
}

export class ComparisonBudget {
  private readonly records: Array<{ status: "complete" | "failed"; costUsd: number }> = [];
  constructor(private readonly limits: { maxCalls: number; maxCostUsd: number }) {}
  record(input: { arm: ComparisonArm; stage: ComparisonStage; status: "complete" | "failed"; costUsd: number }): void {
    this.records.push({ status: input.status, costUsd: input.costUsd });
  }
  snapshot(): { attempts: number; spentUsd: number; failedAttempts: number } {
    return {
      attempts: this.records.length,
      spentUsd: Number(this.records.reduce((sum, item) => sum + item.costUsd, 0).toFixed(8)),
      failedAttempts: this.records.filter((item) => item.status === "failed").length,
    };
  }
  canStart(input: { maximumPossibleCostUsd: number }): { allowed: true } | { allowed: false; reason: "call_ceiling_reached" | "cost_ceiling_would_be_exceeded" } {
    if (this.records.length >= this.limits.maxCalls) return { allowed: false, reason: "call_ceiling_reached" };
    if (this.snapshot().spentUsd + input.maximumPossibleCostUsd > this.limits.maxCostUsd) return { allowed: false, reason: "cost_ceiling_would_be_exceeded" };
    return { allowed: true };
  }
}

export function validateExperienceIsolation(html: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (/fetch\s*\(\s*["'`]\/api\//i.test(html) || /XMLHttpRequest|EventSource|WebSocket\s*\(/i.test(html)) violations.push("sunny_api_access");
  if (/localStorage|sessionStorage|indexedDB|document\.cookie/i.test(html)) violations.push("persistent_browser_state");
  return { valid: violations.length === 0, violations };
}

export function evaluateComparison(input: {
  historical: { playable: boolean };
  neutral: ArmState;
  personality: ArmState;
  totalNewCostUsd: number;
}): {
  status: "READY_FOR_HUMAN_REVIEW" | "INCOMPLETE";
  armStatus: { historical: "COMPLETE" | "INCOMPLETE"; neutral: "COMPLETE" | "INCOMPLETE"; personality: "COMPLETE" | "INCOMPLETE" };
  dependentStagesToRun: Record<ComparisonArm, ComparisonStage[]>;
} {
  const allStages: ComparisonStage[] = ["academic_lead", "curriculum_writer", "experience_architect", "experience_engineer"];
  const armStatus = {
    historical: input.historical.playable ? "COMPLETE" as const : "INCOMPLETE" as const,
    neutral: input.neutral.playable && !input.neutral.failure && input.neutral.completedStages.length === 4 ? "COMPLETE" as const : "INCOMPLETE" as const,
    personality: input.personality.playable && !input.personality.failure && input.personality.completedStages.length === 4 ? "COMPLETE" as const : "INCOMPLETE" as const,
  };
  const dependentStagesToRun = {
    neutral: input.neutral.failure ? [] : allStages.slice(input.neutral.completedStages.length),
    personality: input.personality.failure ? [] : allStages.slice(input.personality.completedStages.length),
  };
  const complete = Object.values(armStatus).every((status) => status === "COMPLETE") && input.totalNewCostUsd <= MAX_NEW_COST_USD;
  return { status: complete ? "READY_FOR_HUMAN_REVIEW" : "INCOMPLETE", armStatus, dependentStagesToRun };
}

export function renderComparisonReport(input: {
  candidateOrder: Array<"historical" | ComparisonArm>;
  candidates: Record<"historical" | ComparisonArm, { title: string; experiencePath: string }>;
  provenance: Record<"historical" | ComparisonArm, Record<string, unknown>>;
  summary?: Record<string, unknown>;
}): string {
  const cards = input.candidateOrder.map((arm, index) => {
    const letter = String.fromCharCode(65 + index);
    const candidate = input.candidates[arm];
    const dimensions = ["First-action clarity", "Age-appropriate reading load", "Academic coherence", "Math controls the world", "Visual and motion quality", "Consequence and recovery", "Progression and payoff", "Desire to continue or replay", "Overall quality"];
    return `<article class="candidate"><h2>Candidate ${letter}</h2><iframe src="${escapeHtml(candidate.experiencePath)}" title="Candidate ${letter}"></iframe><div class="scores">${dimensions.map((dimension, dimensionIndex) => `<label>${escapeHtml(dimension)}<input type="range" min="1" max="5" step="1" value="3" data-candidate="${letter}" data-dimension="${dimensionIndex}"><output>3</output></label>`).join("")}</div><label>What was immediately understandable?<textarea></textarea></label><label>What was confusing?<textarea></textarea></label><label>Would a nine-year-old continue without adult explanation?<textarea></textarea></label></article>`;
  }).join("");
  const encoded = Buffer.from(JSON.stringify({ order: input.candidateOrder, provenance: input.provenance, summary: input.summary ?? {} }), "utf8").toString("base64");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny blinded persona comparison</title><style>:root{font-family:Inter,system-ui;color:#17213b;background:#eef2fa}*{box-sizing:border-box}body{margin:0}.hero{padding:34px;background:linear-gradient(135deg,#17234a,#63389b);color:white}.hero p{max-width:900px}.wrap{max-width:1800px;margin:auto;padding:22px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.candidate{background:white;border-radius:20px;padding:16px;box-shadow:0 12px 30px #16234b1c}.candidate iframe{width:100%;height:510px;border:2px solid #cbd5e8;border-radius:14px;background:white}.scores label,.candidate>label{display:block;margin:12px 0;font-weight:700}.scores input{width:70%;vertical-align:middle;margin:0 10px}.candidate textarea{display:block;width:100%;min-height:70px;margin-top:5px}.reveal{display:block;margin:26px auto;padding:15px 24px;border:0;border-radius:999px;background:#f2b72c;color:#17213b;font-size:18px;font-weight:900;cursor:pointer}.hidden{display:none}.provenance{background:white;border-radius:20px;padding:20px;overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #dde3ef;text-align:left}pre{white-space:pre-wrap;word-break:break-word}@media(max-width:1200px){.grid{grid-template-columns:1fr}.candidate iframe{height:700px}}</style></head><body><header class="hero"><h1>Which experience would you ship?</h1><p>Play and score all three before revealing their pipeline, models, and cost. This comparison measures generated quality and reliability—not actual child learning.</p></header><main class="wrap"><section class="grid">${cards}</section><button id="reveal" class="reveal">Reveal provenance and cost</button><section id="provenance" class="provenance" data-provenance hidden></section></main><script>document.querySelectorAll('input[type=range]').forEach(i=>i.addEventListener('input',()=>i.nextElementSibling.value=i.value));document.getElementById('reveal').addEventListener('click',()=>{const data=JSON.parse(atob('${encoded}'));const rows=data.order.map((arm,index)=>{const p=data.provenance[arm];return '<tr><td>Candidate '+String.fromCharCode(65+index)+'</td><td>'+p.label+'</td><td>'+JSON.stringify(p.models||p.model||'')+'</td><td>$'+Number(p.costUsd||0).toFixed(3)+'</td><td>'+String(p.status||'complete')+'</td></tr>'}).join('');const target=document.getElementById('provenance');target.innerHTML='<h2>Provenance and cost</h2><table><thead><tr><th>Candidate</th><th>Pipeline</th><th>Models</th><th>Cost</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table><pre>'+JSON.stringify(data.summary,null,2)+'</pre>';target.hidden=false;document.getElementById('reveal').disabled=true});</script></body></html>`;
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const inputRate = /fable/i.test(model) ? 6 : 5;
  const outputRate = /fable/i.test(model) ? 30 : 25;
  return inputTokens / 1_000_000 * inputRate + outputTokens / 1_000_000 * outputRate;
}

function extractStructuredResponse(response: any, toolName: string): Record<string, any> {
  const block = (response?.content ?? []).find((item: any) => item?.type === "tool_use" && item?.name === toolName);
  if (!block?.input || typeof block.input !== "object" || Array.isArray(block.input)) throw new Error(`malformed_provider_response:${toolName}`);
  return block.input as Record<string, any>;
}

function extractHtml(response: any): string {
  const text = (response?.content ?? []).filter((item: any) => item?.type === "text").map((item: any) => item.text).join("\n").trim();
  const match = text.match(/<!doctype html[\s\S]*<\/html>/i) ?? text.match(/<html[\s\S]*<\/html>/i);
  if (!match) throw new Error("malformed_provider_response:standalone_html_missing");
  return match[0];
}

function validateDecisionShape(decisions: unknown): decisions is DecisionRecord[] {
  return Array.isArray(decisions) && decisions.length > 0 && decisions.every((item) => item && typeof item === "object"
    && typeof item.decisionId === "string" && typeof item.decision === "string" && Array.isArray(item.evidenceIds)
    && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1
    && typeof item.uncertainty === "string" && Array.isArray(item.falsifyingEvidence) && Array.isArray(item.measurementKeys));
}

export function validateCurriculumPacket(content: Record<string, any>): string | null {
  if (!Array.isArray(content.items) || content.items.length < 5 || content.items.length > 7) return "curriculum_item_count_invalid";
  for (const item of content.items) {
    if (!item?.itemId || !item?.prompt || item?.correctAnswer === undefined || !item?.responseContract || !item?.sourceLineage || !item?.exposure || !item?.academicTarget) return `curriculum_item_incomplete:${item?.itemId ?? "unknown"}`;
    if (Array.isArray(item.options) && item.options.length > 0) {
      const options = item.options.map(String);
      const answers = item.correctAnswer && typeof item.correctAnswer === "object" && !Array.isArray(item.correctAnswer)
        ? Object.entries(item.correctAnswer).map(([key, value]) => `${key}: ${String(value)}`)
        : [String(item.correctAnswer)];
      if (answers.some((answer) => !options.includes(answer))) return `curriculum_correct_answer_not_in_options:${item.itemId}`;
    }
  }
  return null;
}

class LiveMeter {
  readonly usage: UsageRecord[] = [];
  readonly budget = new ComparisonBudget({ maxCalls: MAX_CALLS, maxCostUsd: MAX_NEW_COST_USD });
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly auditDir: string) {}

  spent(): number { return this.budget.snapshot().spentUsd; }

  async call(input: { arm: ComparisonArm; stage: ComparisonStage; request: Record<string, any> }): Promise<any> {
    const allowed = this.budget.canStart({ maximumPossibleCostUsd: MAXIMUM_CALL_COST_USD[input.stage] });
    if (!allowed.allowed) throw new Error(allowed.reason);
    const attempt = this.usage.length + 1;
    const prefix = `call-${String(attempt).padStart(2, "0")}-${input.stage}-${input.arm}`;
    writeJson(path.join(this.auditDir, `${prefix}-request.json`), input.request);
    const started = Date.now();
    try {
      const response = input.stage === "experience_engineer"
        ? await this.anthropic.messages.stream(input.request as any).finalMessage()
        : await this.anthropic.messages.create(input.request as any);
      const inputTokens = Number(response?.usage?.input_tokens ?? 0);
      const outputTokens = Number(response?.usage?.output_tokens ?? 0);
      const costUsd = estimateCost(String(input.request.model), inputTokens, outputTokens);
      const record: UsageRecord = { attempt, arm: input.arm, stage: input.stage, model: String(input.request.model), status: "complete", inputTokens, outputTokens, costUsd, elapsedMs: Date.now() - started, stopReason: String(response?.stop_reason ?? "unknown") };
      this.usage.push(record);
      this.budget.record({ arm: input.arm, stage: input.stage, status: "complete", costUsd });
      writeJson(path.join(this.auditDir, `${prefix}-response.json`), response);
      writeJson(path.join(this.auditDir, "usage.json"), this.usage);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const record: UsageRecord = { attempt, arm: input.arm, stage: input.stage, model: String(input.request.model), status: "failed", inputTokens: 0, outputTokens: 0, costUsd: 0, elapsedMs: Date.now() - started, error: message };
      this.usage.push(record);
      this.budget.record({ arm: input.arm, stage: input.stage, status: "failed", costUsd: 0 });
      writeJson(path.join(this.auditDir, `${prefix}-error.json`), { error: message });
      writeJson(path.join(this.auditDir, "usage.json"), this.usage);
      throw error;
    }
  }
}

function structuredRequest(input: { prompt: string; stage: Exclude<ComparisonStage, "experience_engineer">; expectedUpstreamHash: string; pdfBase64?: string }): Record<string, any> {
  const tool = structuredToolForStage(input.stage, input.expectedUpstreamHash);
  const content: any[] = [];
  if (input.pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } });
  content.push({ type: "text", text: input.prompt });
  return {
    model: MODELS[input.stage],
    max_tokens: MAX_OUTPUT_TOKENS[input.stage],
    messages: [{ role: "user", content }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
  };
}

export function buildEngineerRequest(prompt: string): Record<string, any> {
  return {
    model: MODELS.experience_engineer,
    max_tokens: MAX_OUTPUT_TOKENS.experience_engineer,
    messages: [{ role: "user", content: prompt }],
  };
}

function selectedHistoricalEvidence(program: Record<string, any>, cycle: Record<string, any>): SharedComparisonInput["historicalEvidence"] {
  const evidence = new Map<string, string>();
  for (const assumption of program.assumptions ?? []) {
    for (const evidenceId of assumption.evidenceIds ?? []) evidence.set(evidenceId, `Evidence cited by the frozen Planner assumption: ${assumption.claim}`);
  }
  for (const observation of cycle.observations ?? []) {
    evidence.set(observation.observationId, `${observation.itemId}: response ${observation.childResponse}; correct=${Boolean(observation.result?.correct)}; assistance=${observation.assistance?.status}; exposure=${observation.exposure}.`);
  }
  for (const evidenceId of cycle.assignment?.capturedEvidenceIds ?? []) evidence.set(evidenceId, `Captured assignment or engagement evidence: ${evidenceId}.`);
  return [...evidence.entries()].map(([evidenceId, fact]) => ({ evidenceId, fact }));
}

function sharedInputFromHistorical(repoRoot: string): SharedComparisonInput {
  const historicalRoot = path.join(repoRoot, HISTORICAL_ROOT);
  const program = JSON.parse(fs.readFileSync(path.join(historicalRoot, "round-3-learning-program.json"), "utf8"));
  const cycle = JSON.parse(fs.readFileSync(path.join(historicalRoot, "baseline-to-quest-cycle.json"), "utf8"));
  return {
    assignmentId: "LAB-MATH-C",
    assignmentText: `${cycle.assignment.title}. ${program.concept.statement} Scope: ${program.concept.instanceScope}`,
    childContext: {
      age: 9,
      grade: 3,
      observations: [{ evidenceId: "profile:lab-learner-age-grade", fact: "The synthetic learner is nine years old and in Grade 3." }],
    },
    historicalEvidence: selectedHistoricalEvidence(program, cycle),
    academicTarget: "Use equal-groups structure to identify the unknown position, solve missing factors, and recognize multiple valid factor-pair arrays for a known total.",
    viewport: { width: 1365, height: 768 },
  };
}

async function runStructuredStage(input: {
  arm: ComparisonArm;
  stage: Exclude<ComparisonStage, "experience_engineer">;
  sharedInput: SharedComparisonInput;
  upstream: UpstreamPacket;
  meter: LiveMeter;
  armDir: string;
  pdfBase64?: string;
}): Promise<StageArtifact> {
  const built = buildStagePrompt(input);
  writeJson(path.join(input.armDir, `${input.stage}-prompt.json`), built);
  const tool = structuredToolForStage(input.stage, input.upstream.immutableHash);
  const response = await input.meter.call({ arm: input.arm, stage: input.stage, request: structuredRequest({ prompt: built.request, stage: input.stage, expectedUpstreamHash: input.upstream.immutableHash, pdfBase64: input.pdfBase64 }) });
  const content = extractStructuredResponse(response, tool.name);
  const upstreamValidation = validateUpstreamHash(input.upstream.immutableHash, content);
  if (!upstreamValidation.valid) throw new Error(`${input.stage}:${upstreamValidation.reason}`);
  if (input.stage === "academic_lead") {
    if (!validateDecisionShape(content.assumptions)) throw new Error("academic_lead:decision_records_invalid");
    const evidence = validateDecisionEvidence(content.assumptions, input.sharedInput);
    if (!evidence.valid) throw new Error(`academic_lead:unresolved_evidence:${evidence.unresolvedEvidenceIds.join(",")}`);
  }
  if (input.stage === "curriculum_writer") {
    const issue = validateCurriculumPacket(content);
    if (issue) throw new Error(issue);
  }
  if (input.stage === "experience_architect") {
    if (!validateDecisionShape(content.decisionRecords)) throw new Error("experience_architect:decision_records_invalid");
    const evidence = validateDecisionEvidence(content.decisionRecords, input.sharedInput);
    if (!evidence.valid) throw new Error(`experience_architect:unresolved_evidence:${evidence.unresolvedEvidenceIds.join(",")}`);
  }
  const fileName = input.stage === "academic_lead" ? "academic-charter.json" : input.stage === "curriculum_writer" ? "curriculum-packet.json" : "design-artifact.json";
  writeJson(path.join(input.armDir, fileName), content);
  return { immutableHash: hashObject(content), content };
}

async function runEngineer(input: { arm: ComparisonArm; sharedInput: SharedComparisonInput; upstream: StageArtifact; curriculum: StageArtifact; meter: LiveMeter; armDir: string }): Promise<void> {
  const combined = { immutableHash: input.upstream.immutableHash, content: { curriculum: input.curriculum.content, design: input.upstream.content } };
  const built = buildStagePrompt({ stage: "experience_engineer", arm: input.arm, sharedInput: input.sharedInput, upstream: combined });
  const requestText = built.request.replaceAll("UPSTREAM_HASH", input.upstream.immutableHash);
  writeJson(path.join(input.armDir, "experience_engineer-prompt.json"), { ...built, request: requestText });
  const response = await input.meter.call({ arm: input.arm, stage: "experience_engineer", request: buildEngineerRequest(requestText) });
  const html = extractHtml(response);
  if (!html.includes(`name="sunny-upstream-hash" content="${input.upstream.immutableHash}"`) && !html.includes(`name='sunny-upstream-hash' content='${input.upstream.immutableHash}'`)) throw new Error("experience_engineer:upstream_hash_meta_missing");
  const isolation = validateExperienceIsolation(html);
  if (!isolation.valid) throw new Error(`experience_engineer:isolation_violation:${isolation.violations.join(",")}`);
  if (!/<script[\s>]/i.test(html) || !/(button|canvas|svg|input)/i.test(html)) throw new Error("experience_engineer:interaction_missing");
  fs.writeFileSync(path.join(input.armDir, "experience.html"), html, "utf8");
}

function deterministicOrder(seed: string): Array<"historical" | ComparisonArm> {
  return (["historical", "neutral", "personality"] as const).map((arm) => ({ arm, key: sha256(`${seed}:${arm}`) })).sort((a, b) => a.key.localeCompare(b.key)).map((item) => item.arm);
}

export async function runPlannerPersonaComparison(input: { repoRoot: string; outputDir?: string }): Promise<{ outputDir: string; status: string; reportPath: string; costUsd: number }> {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outputDir = input.outputDir ?? path.join(input.repoRoot, "outputs/planner-persona-comparison", stamp);
  const auditDir = path.join(outputDir, "audit");
  const historicalDir = path.join(outputDir, "historical");
  const sharedDir = path.join(outputDir, "shared-input");
  fs.mkdirSync(auditDir, { recursive: true });
  const historicalSource = path.join(input.repoRoot, HISTORICAL_ROOT, "quest");
  const historicalHashes = copyHistoricalBenchmark(historicalSource, historicalDir);
  const sharedInput = sharedInputFromHistorical(input.repoRoot);
  writeJson(path.join(sharedDir, "comparison-input.json"), sharedInput);
  const pdfFile = path.join(input.repoRoot, "output/pdf/math-release-confidence/round-3-transfer-original.pdf");
  const pdfBytes = fs.readFileSync(pdfFile);
  fs.copyFileSync(pdfFile, path.join(sharedDir, "LAB-MATH-C.pdf"));
  writeJson(path.join(sharedDir, "hashes.json"), { inputHash: hashObject(sharedInput), pdfHash: sha256(pdfBytes), historicalHashes });

  const meter = new LiveMeter(auditDir);
  const armState: Record<ComparisonArm, ArmState> = {
    neutral: { completedStages: [] }, personality: { completedStages: [] },
  };
  const artifacts: Partial<Record<ComparisonArm, { charter?: StageArtifact; curriculum?: StageArtifact; design?: StageArtifact }>> = { neutral: {}, personality: {} };
  const initialUpstream: UpstreamPacket = { immutableHash: hashObject(sharedInput), content: sharedInput };

  for (const stage of ["academic_lead", "curriculum_writer", "experience_architect", "experience_engineer"] as const) {
    for (const arm of ["neutral", "personality"] as const) {
      if (armState[arm].failure) continue;
      const armDir = path.join(outputDir, arm);
      fs.mkdirSync(armDir, { recursive: true });
      try {
        console.log(` 🎮 [persona-comparison] [${stage}] [running] arm=${arm}`);
        if (stage === "academic_lead") {
          artifacts[arm]!.charter = await runStructuredStage({ arm, stage, sharedInput, upstream: initialUpstream, meter, armDir, pdfBase64: pdfBytes.toString("base64") });
        } else if (stage === "curriculum_writer") {
          artifacts[arm]!.curriculum = await runStructuredStage({ arm, stage, sharedInput, upstream: artifacts[arm]!.charter!, meter, armDir });
        } else if (stage === "experience_architect") {
          artifacts[arm]!.design = await runStructuredStage({ arm, stage, sharedInput, upstream: artifacts[arm]!.curriculum!, meter, armDir });
        } else {
          await runEngineer({ arm, sharedInput, upstream: artifacts[arm]!.design!, curriculum: artifacts[arm]!.curriculum!, meter, armDir });
          armState[arm].playable = true;
        }
        armState[arm].completedStages.push(stage);
        console.log(` 🎮 [persona-comparison] [${stage}] [saved] arm=${arm}`);
      } catch (error) {
        armState[arm].failure = error instanceof Error ? error.message : String(error);
        writeJson(path.join(armDir, "failure.json"), { stage, error: armState[arm].failure });
        console.log(` 🎮 [persona-comparison] [${stage}] [failed] arm=${arm} reason=${armState[arm].failure}`);
      }
    }
  }

  const evaluation = evaluateComparison({ historical: { playable: true }, neutral: armState.neutral, personality: armState.personality, totalNewCostUsd: meter.spent() });
  const order = deterministicOrder(stamp);
  const historicalUsage = {
    designCostUsd: HISTORICAL_DESIGN_COST_USD,
    implementationCostUsd: HISTORICAL_IMPLEMENTATION_COST_USD,
    sunkCostUsd: HISTORICAL_DESIGN_COST_USD + HISTORICAL_IMPLEMENTATION_COST_USD,
    designModel: "claude-fable-5",
    implementationModel: "claude-opus-5",
  };
  const summary = {
    status: evaluation.status,
    armStatus: evaluation.armStatus,
    failures: { neutral: armState.neutral.failure ?? null, personality: armState.personality.failure ?? null },
    historical: { title: "The Shape-Shifting Crate", ...historicalUsage, ...historicalHashes },
    newSpend: { costUsd: meter.spent(), calls: meter.usage.length, ceilingUsd: MAX_NEW_COST_USD, callCeiling: MAX_CALLS },
    usage: meter.usage,
    candidateOrder: order,
    warning: "This evaluates generation quality and reliability, not actual child learning. Human scoring is required before an outcome label can be assigned.",
  };
  writeJson(path.join(outputDir, "summary.json"), summary);
  const provenance = {
    historical: { label: "Historical production benchmark", models: [historicalUsage.designModel, historicalUsage.implementationModel], costUsd: historicalUsage.sunkCostUsd, status: "complete", hashes: historicalHashes },
    neutral: { label: "Fresh staged neutral pipeline", models: [MODELS.academic_lead, MODELS.curriculum_writer, MODELS.experience_architect, MODELS.experience_engineer], costUsd: meter.usage.filter((item) => item.arm === "neutral").reduce((sum, item) => sum + item.costUsd, 0), status: evaluation.armStatus.neutral },
    personality: { label: "Fresh staged personality pipeline", models: [MODELS.academic_lead, MODELS.curriculum_writer, MODELS.experience_architect, MODELS.experience_engineer], costUsd: meter.usage.filter((item) => item.arm === "personality").reduce((sum, item) => sum + item.costUsd, 0), status: evaluation.armStatus.personality },
  };
  const report = renderComparisonReport({
    candidateOrder: order,
    candidates: {
      historical: { title: "Candidate", experiencePath: "historical/experience.html" },
      neutral: { title: "Candidate", experiencePath: "neutral/experience.html" },
      personality: { title: "Candidate", experiencePath: "personality/experience.html" },
    },
    provenance,
    summary,
  });
  const reportPath = path.join(outputDir, "report.html");
  fs.writeFileSync(reportPath, report, "utf8");
  console.log(` 🎮 [persona-comparison] [complete] status=${evaluation.status} calls=${meter.usage.length}/${MAX_CALLS} cost=$${meter.spent().toFixed(3)} report=${reportPath}`);
  return { outputDir, status: evaluation.status, reportPath, costUsd: meter.spent() };
}

if (process.argv[1]?.endsWith("runPlannerPersonaComparison.ts")) {
  runPlannerPersonaComparison({ repoRoot: process.cwd(), outputDir: process.env.SUNNY_PERSONA_COMPARISON_OUTPUT })
    .then((result) => {
      if (result.status === "INCOMPLETE") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(` 🎮 [persona-comparison] [fatal] [${error instanceof Error ? error.message : String(error)}]`);
      process.exitCode = 1;
    });
}
