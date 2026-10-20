import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type EvaluationGateInput = {
  assignment: {
    assignmentId: string;
    grade: number;
    domain: string;
    concepts: string[];
    sourceEvidenceIds: string[];
    sourceQuestionTexts: string[];
    academicContract?: string;
  };
  childEvidence: Array<{ evidenceId: string; fact: string }>;
  excludedProfileFields?: unknown;
  viewport: { width: number; height: number };
};

type GateStage = "evaluation-planner" | "evaluation-architect" | "evaluation-engineer";

type GatePrompt = {
  stage: GateStage;
  request: string;
};

type UsageRecord = {
  call: number;
  stage: GateStage;
  model: string;
  status: "complete" | "failed";
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  stopReason?: string;
  error?: string;
};

type StructuredArtifact = Record<string, unknown>;

const ROOT = path.resolve(process.cwd());
const OUTPUT_ROOT = path.join(ROOT, "outputs", "math-creative-sandbox", "evaluation-design-gate");

const MODELS: Record<GateStage, string> = {
  "evaluation-planner": "claude-opus-5",
  "evaluation-architect": "claude-fable-5",
  "evaluation-engineer": "claude-opus-5",
};

const OUTPUT_LIMITS: Record<GateStage, number> = {
  "evaluation-planner": 10_000,
  "evaluation-architect": 14_000,
  "evaluation-engineer": 48_000,
};

const HISTORICAL_ACADEMIC_CONTRACT = `Teach and measure Grade 3 multiplication through fresh material:
- interpret multiplicative situations as number of equal groups and amount in each group;
- construct or read equal-group and array representations;
- connect the representation to a multiplication equation and product;
- distinguish what each factor counts;
- do not assess reading, spelling, typing speed, or pointer precision as mathematics.

Use factors from 1 to 10 and products at or below 100. The opening evaluation is independent evidence, not instruction and not proof of mastery.`;

const FROZEN_INPUT: EvaluationGateInput = {
  assignment: {
    assignmentId: "LAB-MATH-C",
    grade: 3,
    domain: "math",
    concepts: [
      "multiplication as equal groups",
      "number of groups and amount in each group",
      "arrays and multiplication equations",
      "factor meaning",
    ],
    sourceEvidenceIds: ["assignment:LAB-MATH-C:scope"],
    sourceQuestionTexts: ["The source assignment asks the learner to explain what each factor counts."],
    academicContract: HISTORICAL_ACADEMIC_CONTRACT,
  },
  childEvidence: [
    { evidenceId: "reina:age:2026-07", fact: "The child is currently nine years old." },
    { evidenceId: "reina:riddles:harder", fact: "She asked to continue difficult riddles and later requested harder riddles." },
    { evidenceId: "reina:riddles:logic", fact: "She noticed repeated riddles and questioned faulty riddle logic." },
    { evidenceId: "reina:riddles:scaffold", fact: "When stuck on a multi-step logic problem, she requested hints and continued after scaffolding." },
    { evidenceId: "reina:activity-feedback:small-sample", fact: "Small-sample child feedback favored clear examples, visible color, and an available hint." },
  ],
  viewport: { width: 1365, height: 768 },
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  const source = Buffer.isBuffer(value) || typeof value === "string" ? value : stable(value);
  return crypto.createHash("sha256").update(source).digest("hex");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  }[character]!));
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function factualInput(input: EvaluationGateInput): Omit<EvaluationGateInput, "excludedProfileFields"> {
  return {
    assignment: structuredClone(input.assignment),
    childEvidence: input.childEvidence.map((entry) => ({ ...entry })),
    viewport: { ...input.viewport },
  };
}

export function buildEvaluationGatePrompts(input: EvaluationGateInput): GatePrompt[] {
  const frozen = factualInput(input);
  const shared = JSON.stringify(frozen, null, 2);
  const planner = `You are Sunny's Academic Planner designing one independent opening evaluation for a Grade ${frozen.assignment.grade} child.

FROZEN ASSIGNMENT AND FACTUAL CHILD EVIDENCE:
${shared}

Create a compact evaluation contract that determines what the child already knows and where evidence is missing. Identify the target constructs and prerequisite chain. Author three to five fresh items. Do not copy or lightly rewrite source questions. Every item must preregister its construct, response contract, correct-answer contract, difficulty boundary, exposure identity, possibleConfounds, falsifyingEvidence, and measurement keys.

Use child evidence only as a hypothesis about presentation burden and engagement. Preserve uncertainty. The evaluation must collect independent evidence before teaching, hints, examples, or answer exposure. Prefer the lowest-friction response mode that preserves the mathematics. Do not choose a world, character, game type, visual style, named mechanic, sound, reward, or HTML. Do not declare mastery.`;

  const architect = `You are Juniper, Sunny's Experience Architect. You are playful, bold, visually opinionated, child-eyed, and allergic to decorative quizzes.

Use the frozen assignment and factual child evidence below as hypotheses, not durable preferences:
${shared}

You will receive an immutable academic evaluation contract; independently choose the experience persona, modality, world, interaction, pacing, stakes, recovery, visual language, motion, sound cues, and payoff that best let this child demonstrate what she knows. Make the first action understandable without a paragraph. Mathematics must visibly control the interaction. Preserve independent measurement: no worked example, hint, teaching, or answer reveal before the first committed response to an item. The child must never be trapped after an incorrect or ambiguous response. Do not change constructs, items, answers, difficulty boundaries, evidence rules, or the upstream hash. Return a structured design artifact, not HTML.`;

  const engineer = `You are Rowan, Sunny's Experience Engineer. Build one complete standalone interactive HTML evaluation from frozen academic and design artifacts.

Target viewport: ${frozen.viewport.width}×${frozen.viewport.height}. It must work with touch or mouse, require no keyboard, and never trap the child. Do not access parent application endpoints, cookies, localStorage, sessionStorage, IndexedDB, currency, or child state. Do not use browser speech synthesis or oscillator audio.

The activity must post these factual messages to window.parent:
- evaluation_ready with evaluationId and artifactId;
- evaluation_attempt after every committed response with itemId, constructId, result (correct, incorrect, assisted, unresolved, or instrument_ambiguous), assistance, exposure, responseMode, possibleConfounds, and attemptedValue;
- evaluation_friction when the interface, reading load, or response mode may have interfered;
- evaluation_complete with evaluationId, artifactId, completedItemIds, and elapsedMs.

An independent response means no instructional support before the child's first committed response to that item. Recovery may clarify controls or let the child continue, but must preserve assistance/exposure truth. The HTML must not declare mastery or make learning conclusions. It must never trap the child. Return one complete HTML document and nothing else.`;

  return [
    { stage: "evaluation-planner", request: planner },
    { stage: "evaluation-architect", request: architect },
    { stage: "evaluation-engineer", request: engineer },
  ];
}

export class EvaluationGateBudget {
  private calls = 0;

  constructor(private readonly ceiling: number) {
    if (!Number.isInteger(ceiling) || ceiling < 1) throw new Error("evaluation_gate_invalid_call_ceiling");
  }

  begin(_stage: GateStage): number {
    if (this.calls >= this.ceiling) throw new Error("evaluation_gate_call_ceiling_reached");
    this.calls += 1;
    return this.calls;
  }

  count(): number {
    return this.calls;
  }
}

export function resolveEvaluationGateOutput(root: string, runId: string): string {
  const base = path.resolve(root, "outputs", "math-creative-sandbox", "evaluation-design-gate");
  const resolved = path.resolve(base, runId);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error("evaluation_gate_output_escape");
  return resolved;
}

export function extractStandaloneEvaluationHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const complete = fenced.match(/<!doctype html[\s\S]*<\/html>/i) ?? fenced.match(/<html[\s\S]*<\/html>/i);
  if (!complete) throw new Error("evaluation_gate_complete_html_missing");
  return complete[0];
}

type EvaluationAttemptClassification =
  | "independent_correct"
  | "independent_incorrect"
  | "assisted_or_exposed"
  | "instrument_ambiguous";

export function classifyEvaluationAttempt(attempt: Record<string, unknown>): EvaluationAttemptClassification {
  if (attempt.result === "instrument_ambiguous") return "instrument_ambiguous";
  const assistance = attempt.assistance;
  const assistanceLevel = typeof assistance === "string"
    ? assistance
    : assistance && typeof assistance === "object"
      ? String((assistance as Record<string, unknown>).level ?? "unknown")
      : "unknown";
  const independentResponse = !assistance || typeof assistance !== "object"
    ? true
    : (assistance as Record<string, unknown>).independentResponse !== false;
  const exposure = attempt.exposure;
  const exposureState = typeof exposure === "string"
    ? exposure
    : exposure && typeof exposure === "object"
      ? String((exposure as Record<string, unknown>).instructionalExposure ?? "unknown")
      : "unknown";
  const independent = assistanceLevel === "none"
    && independentResponse
    && (exposureState === "unseen" || exposureState.startsWith("none"));
  if (!independent) return "assisted_or_exposed";
  return attempt.result === "correct" ? "independent_correct" : "independent_incorrect";
}

export function renderEvaluationGateReport(input: {
  experienceRelativePath: string;
  evaluationContract: StructuredArtifact;
  designArtifact: StructuredArtifact;
  provenance: Record<string, unknown>;
}): string {
  const encoded = Buffer.from(JSON.stringify({
    evaluationContract: input.evaluationContract,
    designArtifact: input.designArtifact,
    provenance: input.provenance,
  })).toString("base64");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunny evaluation design gate</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef2fb;color:#15203b;font:16px system-ui}.hero{padding:24px 30px;background:linear-gradient(135deg,#17234a,#673ca2);color:#fff}.hero h1{margin:0 0 8px}.hero p{max-width:1000px;margin:0}.layout{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(340px,.75fr);gap:18px;padding:18px;max-width:1900px;margin:auto}.card{background:#fff;border-radius:18px;padding:16px;box-shadow:0 10px 28px #1d2a4d1a}.play iframe{width:100%;aspect-ratio:1365/768;border:2px solid #c4cde0;border-radius:14px;background:#0d1633}.play a{display:inline-block;margin-top:10px;font-weight:800;color:#5038ad}.status{padding:10px 12px;border-radius:12px;background:#eaf4ff;font-weight:750}.metric{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-bottom:1px solid #e2e7f0}.review label{display:block;margin:12px 0;font-weight:750}.review input[type=range]{width:65%;vertical-align:middle}.review textarea{display:block;width:100%;min-height:64px;margin-top:5px}.actions{display:flex;gap:8px;flex-wrap:wrap}button{border:0;border-radius:999px;padding:11px 16px;background:#543bb1;color:#fff;font-weight:850;cursor:pointer}button.secondary{background:#e7eaf4;color:#202b48}details{margin-top:12px}pre{white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto}.notice{background:#fff5d8;border-left:5px solid #e8ad18;padding:10px 14px;margin:12px 0}@media(max-width:1050px){.layout{grid-template-columns:1fr}}
</style></head><body><header class="hero"><h1>Independent evaluation design gate</h1><p>Play the evaluation as a child, then judge whether the instrument—not merely its artwork—produced trustworthy evidence.</p></header><main class="layout"><section class="card play"><div class="notice"><strong>Sandbox only:</strong> no child profile, mastery, currency, or Sunny state is written.</div><iframe id="experience" src="${escapeHtml(input.experienceRelativePath)}" title="Personalized independent math evaluation" allow="autoplay; fullscreen"></iframe><a href="${escapeHtml(input.experienceRelativePath)}" target="_blank">Open evaluation full size ↗</a></section><aside><section class="card"><h2>Factual session report</h2><p id="status" class="status">Waiting for the evaluation…</p><div class="metric"><span>Committed attempts</span><strong id="attempts">0</strong></div><div class="metric"><span>Independent correct</span><strong id="correct">0</strong></div><div class="metric"><span>Independent incorrect</span><strong id="incorrect">0</strong></div><div class="metric"><span>Assisted or exposed</span><strong id="assisted">0</strong></div><div class="metric"><span>Instrument ambiguity</span><strong id="ambiguous">0</strong></div><div class="metric"><span>Interface or reading friction</span><strong id="friction">0</strong></div><p><strong>Conceptual evidence</strong></p><div id="constructs">No attempts yet.</div><div class="actions"><button id="download">Download factual session report</button><button id="reset" class="secondary">Reset local report</button></div><details><summary>Raw factual events</summary><pre id="raw">[]</pre></details></section></aside><section class="card review"><h2>Evaluation quality review</h2><p>This scorecard judges whether Sunny learned something trustworthy about the child. It does not award mastery.</p><label>Was the first action understandable within ten seconds? <input data-score="firstAction" type="range" min="1" max="5" value="3"><output>3</output></label><label>Did success require the intended mathematics? <input data-score="academicValidity" type="range" min="1" max="5" value="3"><output>3</output></label><label>Was the reading and interaction burden appropriate? <input data-score="burden" type="range" min="1" max="5" value="3"><output>3</output></label><label>Could mistakes distinguish conceptual evidence from Interface or reading friction? <input data-score="diagnosticValue" type="range" min="1" max="5" value="3"><output>3</output></label><label>Would a nine-year-old continue without adult explanation? <input data-score="continuation" type="range" min="1" max="5" value="3"><output>3</output></label><label>What was confusing?<textarea id="confusing"></textarea></label><label>What did the evaluation genuinely reveal?<textarea id="revealed"></textarea></label><label>Should this instrument be reused, revised, or retired?<textarea id="decision"></textarea></label></section><section class="card"><h2>Frozen contracts and provenance</h2><details><summary>Show technical packet</summary><pre id="packet"></pre></details></section></main><script>
const packet=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))));const events=[];const allowed=new Set(['evaluation_ready','evaluation_attempt','evaluation_friction','evaluation_complete']);
function classifyAttempt(e){if(e.result==='instrument_ambiguous')return'instrument_ambiguous';const assistanceLevel=typeof e.assistance==='string'?e.assistance:(e.assistance?.level??'unknown');const independentResponse=typeof e.assistance==='object'?e.assistance.independentResponse!==false:true;const exposureState=typeof e.exposure==='string'?e.exposure:(e.exposure?.instructionalExposure??'unknown');const independent=assistanceLevel==='none'&&independentResponse&&(exposureState==='unseen'||String(exposureState).startsWith('none'));if(!independent)return'assisted_or_exposed';return e.result==='correct'?'independent_correct':'independent_incorrect';}
function summary(){const attempts=events.filter(e=>e.type==='evaluation_attempt');const classified=attempts.map(e=>({event:e,classification:classifyAttempt(e)}));const correct=classified.filter(e=>e.classification==='independent_correct').length;const incorrect=classified.filter(e=>e.classification==='independent_incorrect').length;const assisted=classified.filter(e=>e.classification==='assisted_or_exposed').length;const ambiguous=classified.filter(e=>e.classification==='instrument_ambiguous').length;const friction=events.filter(e=>e.type==='evaluation_friction').length;const byConstruct={};for(const entry of classified){const e=entry.event;const key=e.constructId||'unknown';byConstruct[key]??={correct:0,incorrect:0,assisted:0,ambiguous:0};if(entry.classification==='instrument_ambiguous')byConstruct[key].ambiguous++;else if(entry.classification==='assisted_or_exposed')byConstruct[key].assisted++;else if(entry.classification==='independent_correct')byConstruct[key].correct++;else byConstruct[key].incorrect++;}return{attempts:attempts.length,independentCorrect:correct,independentIncorrect:incorrect,assistedOrExposed:assisted,instrumentAmbiguous:ambiguous,frictionEvents:friction,byConstruct};}
function render(){const s=summary();document.getElementById('attempts').textContent=s.attempts;document.getElementById('correct').textContent=s.independentCorrect;document.getElementById('incorrect').textContent=s.independentIncorrect;document.getElementById('assisted').textContent=s.assistedOrExposed;document.getElementById('ambiguous').textContent=s.instrumentAmbiguous;document.getElementById('friction').textContent=s.frictionEvents;document.getElementById('constructs').innerHTML=Object.keys(s.byConstruct).length?Object.entries(s.byConstruct).map(([k,v])=>'<div class="metric"><span>'+k+'</span><strong>'+JSON.stringify(v)+'</strong></div>').join(''):'No attempts yet.';document.getElementById('raw').textContent=JSON.stringify(events,null,2);const complete=events.some(e=>e.type==='evaluation_complete');document.getElementById('status').textContent=complete?'Evaluation complete — review the instrument below.':s.attempts?'Evaluation active — '+s.attempts+' attempt(s) recorded.':'Waiting for the evaluation…';}
window.addEventListener('message',event=>{if(event.source!==document.getElementById('experience').contentWindow||!event.data||!allowed.has(event.data.type))return;events.push({...event.data,capturedAt:new Date().toISOString()});render();});
document.querySelectorAll('input[type=range]').forEach(i=>i.addEventListener('input',()=>i.nextElementSibling.value=i.value));document.getElementById('packet').textContent=JSON.stringify(packet,null,2);document.getElementById('reset').addEventListener('click',()=>{events.length=0;render();document.getElementById('experience').contentWindow.location.reload();});document.getElementById('download').addEventListener('click',()=>{const scores=Object.fromEntries([...document.querySelectorAll('[data-score]')].map(i=>[i.dataset.score,Number(i.value)]));const report={createdAt:new Date().toISOString(),summary:summary(),events:[...events],humanReview:{scores,confusing:document.getElementById('confusing').value,revealed:document.getElementById('revealed').value,decision:document.getElementById('decision').value},provenance:packet.provenance,evaluationId:packet.evaluationContract.evaluationId,artifactId:packet.designArtifact.artifactId,claim:'This is factual diagnostic evidence and human instrument review; it does not establish mastery or causation.'};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download='evaluation-session-report.json';a.click();URL.revokeObjectURL(a.href);});render();
</script></body></html>`;
}

function structuredSchema(stage: Exclude<GateStage, "evaluation-engineer">, upstreamHash: string): Record<string, unknown> {
  if (stage === "evaluation-planner") {
    return {
      type: "object", additionalProperties: true,
      required: ["evaluationId", "upstreamHash", "assignmentScope", "constructs", "instrumentHypothesis", "items", "completionRule", "evidenceRequiredNext"],
      properties: {
        evaluationId: { type: "string", minLength: 1 }, upstreamHash: { type: "string", enum: [upstreamHash] },
        assignmentScope: { type: "array", minItems: 1, items: { type: "string" } },
        constructs: { type: "array", minItems: 1, items: { type: "object" } },
        instrumentHypothesis: { type: "object" },
        items: { type: "array", minItems: 3, maxItems: 5, items: { type: "object" } },
        completionRule: { type: "object" }, evidenceRequiredNext: { type: "array", minItems: 1, items: { type: "string" } },
      },
    };
  }
  return {
    type: "object", additionalProperties: true,
    required: ["artifactId", "upstreamHash", "title", "experiencePersona", "audienceRationale", "openingPromise", "firstAction", "coreInteraction", "modality", "stakes", "recovery", "progression", "worldReaction", "payoff", "visualDirection", "motionDirection", "soundDirection", "instrumentRisks", "falsifyingEvidence"],
    properties: {
      artifactId: { type: "string", minLength: 1 }, upstreamHash: { type: "string", enum: [upstreamHash] },
      title: { type: "string", minLength: 1 }, experiencePersona: { type: "object" }, audienceRationale: { type: "object" },
      firstAction: { type: "string", minLength: 1 }, coreInteraction: { type: "object" }, modality: { type: "object" },
      progression: { type: "array", minItems: 1, items: { type: "string" } }, instrumentRisks: { type: "array", items: { type: "string" } }, falsifyingEvidence: { type: "array", items: { type: "string" } },
    },
  };
}

function toolInput(response: Anthropic.Messages.Message, toolName: string): StructuredArtifact {
  const block = response.content.find((item) => item.type === "tool_use" && item.name === toolName);
  if (!block || block.type !== "tool_use" || !block.input || typeof block.input !== "object" || Array.isArray(block.input)) {
    throw new Error(`evaluation_gate_structured_output_missing:${toolName}`);
  }
  return block.input as StructuredArtifact;
}

function responseText(response: Anthropic.Messages.Message): string {
  return response.content.filter((item) => item.type === "text")
    .map((item) => item.type === "text" ? item.text : "").join("\n");
}

class GateCalls {
  private readonly client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private readonly budget = new EvaluationGateBudget(3);
  readonly usage: UsageRecord[] = [];

  constructor(private readonly auditDir: string) {}

  async structured(stage: Exclude<GateStage, "evaluation-engineer">, request: string, upstreamHash: string): Promise<StructuredArtifact> {
    const call = this.budget.begin(stage);
    const model = MODELS[stage];
    const toolName = `submit_${stage.replaceAll("-", "_")}`;
    const params = {
      model,
      max_tokens: OUTPUT_LIMITS[stage],
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: `${request}\n\nReturn upstreamHash exactly as ${upstreamHash}.` }],
      tools: [{ name: toolName, description: `Submit the complete ${stage} artifact.`, input_schema: structuredSchema(stage, upstreamHash) }],
      tool_choice: { type: "tool", name: toolName },
    } as never;
    writeJson(path.join(this.auditDir, `call-${call}-${stage}-request.json`), params);
    const startedAt = Date.now();
    try {
      const response = await this.client.messages.create(params, { timeout: 600_000 });
      this.record(call, stage, model, response, startedAt);
      writeJson(path.join(this.auditDir, `call-${call}-${stage}-response.json`), response);
      const artifact = toolInput(response, toolName);
      if (artifact.upstreamHash !== upstreamHash) throw new Error(`${stage}:upstream_hash_changed`);
      return artifact;
    } catch (error) {
      this.recordFailure(call, stage, model, startedAt, error);
      throw error;
    }
  }

  async html(request: string): Promise<string> {
    const stage: GateStage = "evaluation-engineer";
    const call = this.budget.begin(stage);
    const model = MODELS[stage];
    const params = {
      model,
      max_tokens: OUTPUT_LIMITS[stage],
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      messages: [{ role: "user", content: request }],
    } as never;
    writeJson(path.join(this.auditDir, `call-${call}-${stage}-request.json`), params);
    const startedAt = Date.now();
    try {
      const response = await this.client.messages.stream(params, { timeout: 1_200_000 }).finalMessage();
      this.record(call, stage, model, response, startedAt);
      writeJson(path.join(this.auditDir, `call-${call}-${stage}-response.json`), response);
      const html = extractStandaloneEvaluationHtml(responseText(response));
      if (/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(\s*["'`]\/api\//i.test(html)) {
        throw new Error("evaluation_gate_experience_isolation_violation");
      }
      if (!/evaluation_attempt/i.test(html) || !/evaluation_complete/i.test(html)) {
        throw new Error("evaluation_gate_event_contract_missing");
      }
      return html;
    } catch (error) {
      this.recordFailure(call, stage, model, startedAt, error);
      throw error;
    }
  }

  private record(call: number, stage: GateStage, model: string, response: Anthropic.Messages.Message, startedAt: number): void {
    this.usage.push({
      call, stage, model, status: "complete", inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0, elapsedMs: Date.now() - startedAt,
      stopReason: response.stop_reason ?? "unknown",
    });
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }

  private recordFailure(call: number, stage: GateStage, model: string, startedAt: number, error: unknown): void {
    if (this.usage.some((entry) => entry.call === call)) return;
    const message = error instanceof Error ? error.message : String(error);
    this.usage.push({ call, stage, model, status: "failed", inputTokens: 0, outputTokens: 0, elapsedMs: Date.now() - startedAt, error: message });
    writeJson(path.join(this.auditDir, `call-${call}-${stage}-error.json`), { error: message });
    writeJson(path.join(this.auditDir, "usage.json"), this.usage);
  }
}

export async function runEvaluationDesignGate(): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY_missing");
  const runId = new Date().toISOString().replaceAll(":", "-");
  const outputDir = resolveEvaluationGateOutput(ROOT, runId);
  const auditDir = path.join(outputDir, "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  const frozen = factualInput(FROZEN_INPUT);
  const frozenHash = hash(frozen);
  writeJson(path.join(outputDir, "shared-input.json"), { ...frozen, frozenHash });
  const prompts = buildEvaluationGatePrompts(FROZEN_INPUT);
  const calls = new GateCalls(auditDir);

  console.log(` 🎮 [evaluation-design-gate] [planner] [running] assignment=${frozen.assignment.assignmentId}`);
  const evaluationContract = await calls.structured("evaluation-planner", prompts[0]!.request, frozenHash);
  const evaluationHash = hash(evaluationContract);
  writeJson(path.join(outputDir, "evaluation-contract.json"), { ...evaluationContract, evaluationHash });
  console.log(` 🎮 [evaluation-design-gate] [planner] [saved] hash=${evaluationHash.slice(0, 12)}`);

  console.log(" 🎮 [evaluation-design-gate] [architect] [running]");
  const designRequest = `${prompts[1]!.request}\n\nIMMUTABLE EVALUATION CONTRACT (hash ${evaluationHash}):\n${JSON.stringify(evaluationContract, null, 2)}`;
  const designArtifact = await calls.structured("evaluation-architect", designRequest, evaluationHash);
  const designHash = hash(designArtifact);
  writeJson(path.join(outputDir, "design-artifact.json"), { ...designArtifact, designHash });
  console.log(` 🎮 [evaluation-design-gate] [architect] [saved] hash=${designHash.slice(0, 12)}`);

  console.log(" 🎮 [evaluation-design-gate] [engineer] [running]");
  const engineerRequest = `${prompts[2]!.request}\n\nIMMUTABLE EVALUATION CONTRACT (hash ${evaluationHash}):\n${JSON.stringify(evaluationContract, null, 2)}\n\nIMMUTABLE DESIGN ARTIFACT (hash ${designHash}):\n${JSON.stringify(designArtifact, null, 2)}`;
  const html = await calls.html(engineerRequest);
  fs.writeFileSync(path.join(outputDir, "experience.html"), html, "utf8");
  const htmlHash = hash(html);
  console.log(` 🎮 [evaluation-design-gate] [engineer] [saved] hash=${htmlHash.slice(0, 12)}`);

  const provenance = {
    calls: calls.usage.length,
    models: MODELS,
    usage: calls.usage,
    estimatedCostUsd: null,
    note: "Token usage is authoritative. Dollar cost is left unavailable because no current model-rate configuration was supplied.",
    frozenInputHash: frozenHash,
    evaluationHash,
    designHash,
    htmlHash,
    writesToChildState: false,
  };
  writeJson(path.join(outputDir, "summary.json"), {
    status: "READY_FOR_HUMAN_EVALUATION_REVIEW",
    assignmentId: frozen.assignment.assignmentId,
    ...provenance,
    acceptanceQuestion: "Did this instrument produce trustworthy evidence about what the child independently knows?",
  });
  fs.writeFileSync(path.join(outputDir, "report.html"), renderEvaluationGateReport({
    experienceRelativePath: "experience.html",
    evaluationContract,
    designArtifact,
    provenance,
  }), "utf8");
  console.log(` 🎮 [evaluation-design-gate] [complete] [ready-for-human-review] report=${path.join(outputDir, "report.html")}`);
  return outputDir;
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedFile) {
  runEvaluationDesignGate().catch((error) => {
    console.error(` 🎮 [evaluation-design-gate] [failed] reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
